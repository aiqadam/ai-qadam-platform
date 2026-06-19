# Operator playbook: Sponsor onboarding

**Audience:** Viktor (COO) + country leads in the sponsor pipeline.
**When to use:** when a sponsor candidate has signaled intent + a sponsor-tier decision is in scope.
**Frequency:** per sponsor; ~5-15 new sponsors per year at current scale.

## Outcome

A new sponsor lands in Directus as `companies WHERE is_sponsor=true AND status=active`, with the right tier per [marketing playbook §3.5](../marketing-and-pr-playbook.md), an entitled `partner_audiences` row matching their tier, an invoice issued (Phase 1 manual per ADR-0023), payment recorded in `sponsor_contributions`, and their `/workspace/partners/[id]` cabinet user provisioned.

## Inputs

- Sponsor candidate identified (could be inbound — they reached out; or outbound — operator outreach from the marketing playbook §10 sponsor kit)
- Intro call done; tier interest confirmed
- AI Qadam's metrics one-pager ready (attendance, CSAT, member graph snapshot)
- Country lead aligned (per the country variant this sponsor is targeting)

## Steps

1. **Send the sponsor kit** ([marketing playbook §10](../marketing-and-pr-playbook.md)): tier overview, attendance metrics one-pager, sample recap, sample quarterly digest (per F-S3.8 once shipped).
2. **Pitch call.** 30-60 min. Walk through what they get per tier; surface the sponsor PII boundary explicitly ("you'll see aggregated cohort analytics, never raw member lists" — sets expectations early so it's not a surprise later).
3. **Tier agreement.** Bronze / Silver / Gold / Platinum per marketing playbook §3.5. Country scope: per country OR cross-country (Platinum gets cross-country).
4. **Activate in Directus:**
   - Create the `companies` row: `name`, `slug`, `country`, `is_sponsor = true`, optional `is_employer` / `is_product_partner` flags, `status = active`, `logo` upload (or path under `apps/web/public/brand/sponsors/` per ADR-0025 Tier 1 if a logo is truly load-bearing).
   - Until F-S3.5 ships its sponsor cabinet: also create the existing-shape `sponsors` row (PR #78) as the cabinet-display alias.
5. **Provision their cabinet user.**
   - Operator (Viktor) creates an Authentik account for the sponsor contact + adds them to the `sponsor_rep_<slug>` group (per ADR-0021 once accepted; placeholder until then).
   - Set `companies.rep_user` to the new account.
6. **Grant entitled cohorts.** Per tier + scope (NEVER raw member access). For each entitled cohort:
   - Create the `cohorts` row if it doesn't exist (operator builds via the F-S3.2 Member directory cabinet)
   - Create the `partner_audiences` row: `partner = <companies.id>`, `cohort = <cohorts.id>`, `purpose` per use case (event_invite / job_posting / research_invite / sponsor_analytics), `expires_at` = end of the sponsor's tier-year.
7. **Invoice + record payment** per [ADR-0023](../../adr/0023-sponsor-invoicing.md) Phase 1:
   - Draft invoice from the Google Doc template (per country, with local VAT + bank details)
   - Send via email
   - On payment: create `sponsor_contributions` row with `status = paid`, `paid_at`, `payment_method` (bank transfer / Wise / etc.), `amount`, `currency`
8. **Brief their entitled cohort visibility.** Walk them through `/workspace/partners/[id]` once it's their account; show how to read the aggregated metrics; explicitly note what they can't see (per ADR-0033 sponsor PII boundary).
9. **Add to per-event sponsor list.** For each upcoming event in their scope, attach the sponsor's tier to the event metadata (TBD F-S3.4 cabinet UX; until then, in the event description).

## Templates

**Tier-overview email (Bronze→Platinum) lives at:** [marketing playbook §3.5](../marketing-and-pr-playbook.md).

**Sponsor activation confirmation:**

```
Subject: AI Qadam — sponsorship activated, {tier} tier

{sponsor contact name},

Confirmed: your {tier} sponsorship is active through {tier_end_date}.
The {tier} package gives you:

  - {entitlement 1 — e.g. logo placement at all events in country X}
  - {entitlement 2 — e.g. presenting speaker slot at one event per quarter}
  - {entitlement 3 — e.g. quarterly digest with cohort analytics}
  - {entitlement 4 — e.g. announcement composer access to your
    entitled cohort, sent via the AI Qadam dispatcher}

Cabinet access: you'll get an email from Authentik to set your
password. Your cabinet is at https://aiqadam.org/workspace/partners/{slug}
(or workspace.aiqadam.org/partners/{slug} once that subdomain
provisions).

What you can see vs. can't:

  ✅ Aggregated cohort metrics for your entitled audience (X members
     with these consents granted, segmented by seniority / industry /
     country, refreshed daily)
  ✅ Per-event participation metrics for events you sponsor
  ✅ Recap content + quote cards you can syndicate

  ❌ Individual member email addresses or contact info — ever, by
     design (per our community-platform thesis + member consent
     architecture)

Invoice attached; payment instructions in the PDF.

Looking forward to the partnership,

{operator name}
```

## Anti-patterns

- ❌ **Promising attendee contact info.** Per ADR-0033 sponsor PII boundary. The community-as-platform thesis depends on members trusting that their data doesn't leak through sponsor channels. Better to lose a sponsor than the trust.
- ❌ **Letting a sponsor over-influence speaker selection.** Per `speaker-outreach.md` anti-patterns. Sponsors RECOMMEND; the operator DECIDES.
- ❌ **Skipping the explicit "what you can vs can't see" line during the pitch.** Set expectations early; surprises later become trust-debt.
- ❌ **Creating the `partner_audiences` row without a real cohort.** A row with an empty cohort = visible "0 members" snapshot to the sponsor. Build the cohort + verify the count before granting.
- ❌ **Forgetting to set `partner_audiences.expires_at`.** Without an expiry, the entitlement persists forever; if the sponsor doesn't renew, you have to remember to revoke manually.

## Country variants

| Country | Notes |
|---|---|
| UZ | Major sponsors today + foreseeable: Uzum Lab, Yandex.Cloud regional, Beeline Uzbekistan, EPAM. Russian-first communication. |
| KZ | Sponsor base wider: Kaspi Lab, Alem, Astana Hub members. Russian + English mix. |
| TJ | Smaller universe; international NGOs + regional offices most common. Russian + English. |

## Done criteria

- [ ] `companies` row created with `is_sponsor=true` + correct tier
- [ ] Cabinet user provisioned in Authentik + linked via `companies.rep_user`
- [ ] At least one `partner_audiences` row created with explicit `expires_at`
- [ ] Invoice issued + recorded in `sponsor_contributions`
- [ ] Sponsor briefed on the PII boundary explicitly
- [ ] No promises were made that violate ADR-0033

## Related

- [ADR-0033](../../adr/0033-community-member-graph.md) — sponsor PII boundary + partner_audiences model
- [ADR-0023](../../adr/0023-sponsor-invoicing.md) — invoicing flow (Phase 1 manual)
- [`marketing-and-pr-playbook.md` §3.5](../marketing-and-pr-playbook.md) — tier amounts + entitlements
- F-S3.5 partner cabinet — the cabinet sponsors interact with (gated on F-S3.2 + S2.4 Metabase)
- F-S3.8 quarterly sponsor digest — auto-generated; consumes the cohort + `event_outcomes` rollup
