# ADR-0036: Sponsor quarterly-digest rollups query Directus directly (Metabase-free path)

## Status
Proposed, 2026-05-23

## Context

[Sprint 3 §3.8](../01-business/community-platform-roadmap.md#sprint-3) calls for an auto-generated quarterly sponsor digest PDF — per-sponsor cohort analytics + co-marketing summary, mailed/downloadable on a quarterly cadence. The original spec planned this feature on top of Metabase queries against `bi.*` SQL views (architecture doc §8).

Two things have changed since that spec was written:

1. **S2.4 Metabase deploy is HUMAN-deferred** under the zero-recurring-spend filter ([business-process-gaps.md G-2](../02-business-processes/business-process-gaps.md)). The capability is needed; the operational decision to deploy it has been deferred until sponsor revenue stabilises. There is no committed date.
2. **F-S3.5-b ([PR #236](https://github.com/viktordrukker/aiqadam/pull/236))** shipped per-partner asset scoping on the sponsor cabinet using a direct Directus filter (no `bi.*` views, no Metabase). That precedent demonstrated that aggregate-only queries against Directus are tractable, performant enough for cabinet rendering, and respect the [ADR-0033 sponsor PII boundary](./0033-community-member-graph.md) by construction (Directus aggregate API never returns row-level data unless the caller selects it).

The quarterly digest is structurally similar to F-S3.5-b: aggregate counts grouped by cohort, scoped to one sponsor at a time, no member-row PII. There is no analytical complexity in the digest that requires a query engine beyond what Directus already exposes.

## Decision

**The sponsor quarterly-digest cron rolls up against Directus directly, not Metabase.**

Concretely:

- The cron service reads `partner_audiences` to find each sponsor's entitled cohorts.
- For each cohort, it issues 3–5 Directus aggregate calls (`?aggregate[count]=id&filter[…]`) to compute the quarter's event count, registration count, average CSAT, speaker count, and (optionally) top-N referrer countries.
- The cron service composes the rollup into a PDF via [`pdfkit`](https://pdfkit.org) (MIT-licensed pure JS — no native bindings, Alpine-safe).
- The PDF is uploaded to Directus files and recorded in two places: a new `sponsor_digests(sponsor, quarter_tag, asset_file_id, generated_at)` ledger collection for per-(sponsor, quarter) idempotency, and the existing `marketing_assets` collection with `category='quarterly-digest'`, `sponsor=<partner.id>`, `visibility='sponsors'`, `status='approved'` so the partner cabinet's existing kit_assets query (F-S3.5-b) surfaces it automatically.

This is **additive** to the original Sprint-3.8 spec, not a permanent replacement. The Directus-rollup path is straightforward to retain even after Metabase deploys: any future Metabase-backed digest variant (e.g. multi-quarter trend charts that need window functions) can read the same `sponsor_digests` ledger to skip already-generated rows.

## Consequences

### Positive

- **Sprint 3 closes to 9/9** without waiting on the Metabase decision. Zero new infrastructure.
- **Preserves the PII boundary** by construction. Directus `aggregate[count]` cannot return rows.
- **Reuses F-S3.5-b plumbing**: kit_assets in the partner cabinet already filters on `sponsor` + `status='approved'`, so quarterly digests appear in the cabinet the moment the cron runs. No cabinet UI change required.
- **Storage uses Directus files** — same path as marketing_assets uploads. No new bucket, no new credentials.

### Negative

- **Per-cohort fan-out**: a sponsor with 5 entitled cohorts triggers ~25 Directus aggregate calls per quarter. That's fine for a quarterly cron (runs once on the 5th day of each quarter; bounded by sponsor count × cohort count) but would not scale to a synchronous request-time call. The service is explicitly designed as a cron.
- **No window-function metrics in v1**: trends like "Q-over-Q growth" or "top-quartile cohorts" need either multiple sequential rollups or Metabase. v1 ships current-quarter snapshots only; cross-quarter analytics are a follow-up that pairs naturally with the eventual Metabase deploy.
- **PDF rendering takes ~200 ms per sponsor** (pdfkit benchmark). At 5–50 sponsors per quarter, total cron runtime is well under one minute.

## Alternatives considered

1. **Wait for Metabase deploy.** Rejected because Sprint 3 exit gate (digest generates for ≥1 sponsor) is otherwise indefinitely blocked, and the digest's data needs are too narrow to justify the wait.
2. **Build the digest with Satori (the OG-card pipeline from F-S5.4 #237).** Rejected because Satori produces SVG → PNG; PDF would require an extra svg2pdf step. The digest is data-dense (tables, headings) where pdfkit's layout primitives map cleanly; Satori's JSX-flexbox model is overkill.
3. **Generate as HTML email instead of PDF.** Rejected because the original spec calls for a downloadable artefact sponsors keep for their records; PDF is the artefact format sponsors expect.

## Migration path back to Metabase (if/when it deploys)

When Metabase deploys, no rewrite is required — the rollup service is independent of where the queries are issued from. A future PR can:

1. Add `digest_source` field on `sponsor_digests` (default `'directus'`); flip to `'metabase'` per sponsor or globally.
2. Add window-function metrics (Q-over-Q growth, cohort retention curves) to a new `SponsorDigestEnricher` service that runs alongside the existing rollup.
3. The PDF layout is the same; only the data layer changes.

## References

- [Sprint 3 §3.8](../01-business/community-platform-roadmap.md#sprint-3) — original spec
- [ADR-0033](./0033-community-member-graph.md) — sponsor PII boundary
- [ADR-0025](./0025-brand-asset-tooling.md) — marketing_assets visibility + approval workflow
- [PR #236](https://github.com/viktordrukker/aiqadam/pull/236) — F-S3.5-b precedent for direct-Directus aggregate queries on the sponsor cabinet
