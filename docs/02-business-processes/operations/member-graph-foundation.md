# Runbook — Member graph foundation (F-S3.0)

This runbook covers operating + extending the community member graph
defined in [ADR-0033](../../adr/0033-community-member-graph.md) Part 1
and shipped in F-S3.0.

## What this is

The member graph is the canonical platform data model: members ↔ events
↔ skills ↔ employers ↔ interests ↔ consents. Every operator cabinet
(F-S3.2 → F-S3.6) and every future product (hackathons, HRtech, edtech,
paid premium, mentorship) reads it.

## Where the data lives

- **Engine:** Directus 11 at `cms.aiqadam.org` (Coolify service
  `aiqadam-directus`).
- **Schema bootstrap:** [`infrastructure/directus/bootstrap.sh`](../../../infrastructure/directus/bootstrap.sh)
  — append-only, idempotent. The F-S3.0 block is marked with a
  banner: `# F-S3.0 — Community member graph foundation (per ADR-0033 Part 1)`.
- **Flows bootstrap:** [`infrastructure/directus/flows-bootstrap.sh`](../../../infrastructure/directus/flows-bootstrap.sh)
  — the trailing block retires the three Twenty-sync flows from any
  environment that still has them.

## Collections added (10)

| Collection | Purpose | Key relations |
|---|---|---|
| `companies` | Org primitive (sponsor / employer / product partner — independent flags) | `country` → countries |
| `member_skills` | One row per (member, skill_tag); event-verifiable | `member` → directus_users, `verified_by_event` → events |
| `member_employments` | Employment history; per-employment `share_with_sponsors` | `member` → directus_users, `employer` → companies |
| `member_interests` | Topic × intent (looking_for_job, willing_to_speak, …) | `member` → directus_users |
| `member_consents` | Per-purpose consent ledger (events/marketing/research/recruiting/sponsor_share/content/paid_premium) | `member` → directus_users |
| `member_connections` | Social-graph edges (co-attended, hackathon teammates, mentor pair) | `member_a` + `member_b` → directus_users, `context_event` → events |
| `cohorts` | Saved Directus filter against members; feeds dispatcher + partner_audiences | `created_by` → directus_users |
| `partner_audiences` | Partner ↔ cohort entitlement (THE consent-chain enforcement primitive) | `partner` → companies, `cohort` → cohorts, `granted_by` → directus_users |
| `event_outcomes` | Denormalised post-event rollup (1 row per event) | `event` → events (unique) |
| `event_followups` | Per-event followup checklist (retrospective / thank_you_sent / recap_posted / sponsor_report_delivered) | `event` → events |

## Fields added to existing collections

- `directus_users`: `job_title`, `employer` (FK companies), `seniority`
  enum, `industry_tags` (json), `is_student` bool, `bio_md`, `appear_in_directory` bool
- `events`: `visibility` enum (public/cohort/invite_only),
  `audience_cohort` (FK cohorts), `price_usd` decimal, `capacity_band` enum
- `event_types`: three new rows seeded — `closed`, `paid`,
  `course_session` (extends the existing meetup/workshop/hackathon/
  conference/online taxonomy)

## How to re-run bootstrap

```bash
DIRECTUS_URL=https://cms.aiqadam.org \
DIRECTUS_TOKEN=$(cat /tmp/aiqadam-secrets-DIRECTUS_TOKEN) \
bash infrastructure/directus/bootstrap.sh
```

The first run after F-S3.0 created all new collections + fields +
relations; every subsequent run prints only `✓ … (exists)` lines for
the F-S3.0 block.

## Critical consent-chain rule

**Sponsors NEVER touch raw `directus_users` rows.** Every sponsor read
goes through `partner_audiences`:

```
sponsor (companies.is_sponsor=true)
  → partner_audiences (partner, cohort, purpose, expires_at)
    → cohorts.filter_query
      → directus_users (cohort-aggregated count / Metabase view)
```

The F-S3.5 sponsor cabinet enforces this in API code; no Metabase view
or Directus permission should bypass it. Audit per record via
`audit_events` once that collection lands (Sprint 2.5).

## Sponsor PII boundary — concrete don'ts

- ❌ No Directus permission policy giving `sponsor_rep` role read access
  to `directus_users.*` raw fields.
- ❌ No API endpoint returning member rows filtered by sponsor
  (`/v1/sponsors/[id]/members`).
- ❌ No CSV download of raw member rows from sponsor cabinet.
- ✅ Cohort-aggregated counts (e.g. "247 members in your entitled
  cohort, 38% senior+, 22% in fintech industry").
- ✅ Aggregated CSAT / NPS post-event.
- ✅ Dispatcher-mediated outbound messaging scoped to the entitled
  cohort (sponsor never sees individual emails).

## Operator workflow placement

Per ADR-0033 Part 2 + feedback-operators-never-touch-directus-admin:
operators do NOT edit member-graph collections in Directus admin. They
work in the cabinets:

| Cabinet | URL | Reads / writes |
|---|---|---|
| Member directory + cohort builder (F-S3.2) | `/workspace/members` | reads directus_users + member_*; writes cohorts |
| Announcement composer (F-S3.3) | `/workspace/announce` | reads cohorts; writes interactions |
| Event control panel (F-S3.4) | `/workspace/events/[id]` | reads events + registrations; writes event_followups + event_outcomes |
| Partner / sponsor view (F-S3.5) | `/workspace/partners/[id]` | reads cohort-aggregated (via partner_audiences); never raw |
| Member self-service (F-S3.6) | `/me/profile` | member writes own directus_users + member_skills/employments/interests/consents |

Directus admin keeps the `engineer` chip on the workspace launcher
card (engineers only; covers schema edits + ad-hoc data fixes).

## When the graph slows down (Phase ζ)

Schema-sprawl mitigation per ADR-0033:

- New product = new namespaced prefix (`hack_*`, `edu_*`, `hr_*`,
  `paid_*`, `mentor_*`) + a cabinet.
- Quarterly schema review (PM + Viktor) before any new namespace.
- Move heavy edits to API + custom cabinet pages once member count
  exceeds 10k (Directus admin perf degrades; cabinets stay fast).

## When something breaks

| Symptom | Where to look | First action |
|---|---|---|
| Cohort `member_count_cached` stale | (cron job F-S3.2 will own this) | Re-evaluate manually via `GET /items/directus_users?filter=<cohort.filter_query>&aggregate[count]=*` |
| Sponsor cabinet showing 0 members | `partner_audiences` for this partner; cohort `filter_query` | Confirm partner_audience row exists + not expired; confirm cohort matches members |
| New collection / field that needs to ship | Extend `bootstrap.sh` append-only; add `ensure()` call; verify idempotency twice against prod | Open a new vertical PR per [docs/05-other/agent-prompts.md](../../05-other/agent-prompts.md) §2 template |
| Member consent revocation needs to propagate | Insert a new `member_consents` row with `revoked_at = now()` (most-recent-row-wins semantics) | Don't UPDATE old rows |

## Related

- [ADR-0033 — Community member graph](../../adr/0033-community-member-graph.md) — the spec this implements
- [ADR-0032 — Operator tools must SSO or embed](../../adr/0032-operator-tools-must-sso-or-embed.md) — the rule that drives "cabinets, not Directus admin"
- [docs/04-development/architecture/migration-to-directus-centric.md](../../04-development/architecture/migration-to-directus-centric.md) — why Directus is the entity store
- [docs/04-development/architecture/interaction-architecture.md](../../04-development/architecture/interaction-architecture.md) — dispatcher that consumes `cohorts`
- [`infrastructure/directus/bootstrap.sh`](../../../infrastructure/directus/bootstrap.sh) — the source of truth for the schema
