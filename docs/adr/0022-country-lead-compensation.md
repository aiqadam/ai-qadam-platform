# ADR-0022: Country-lead compensation model

## Status
Proposed, 2026-05-21

> Drafted by Agent-Docs per [`docs/community-platform-roadmap.md` §7 Sprint 0.12](../community-platform-roadmap.md). PM flips to Accepted via the [decision-batch process](../decision-batch-process.md). **Gates Sprint 4** (country provisioning) — no country lead can be onboarded without an accepted compensation model.

## Context

[`community-platform-roadmap.md` §10](../community-platform-roadmap.md) names "compensation model for country leads" as one of the open blocking decisions. Today, country leads are volunteer community members. As we expand to Kazakhstan + Tajikistan (and beyond), the role grows from "host one meetup per month" into a multi-hour-per-week commitment: sponsor outreach, speaker recruitment, member moderation, CSAT loop, quarterly board reporting.

[`marketing-and-pr-playbook.md` §3.5](../marketing-and-pr-playbook.md#35-sponsorship-tiers) establishes Bronze/Silver/Gold/Platinum sponsor revenue. ADR-0023 (invoicing) and ADR-0024 (future revenue) are the upstream and downstream decisions; this ADR sits in the middle.

Constraints:

- We are not VC-funded; every recurring expense is a real bet.
- AI Qadam is community-as-platform per [ADR-0033](./0033-community-member-graph.md) — the audience graph is the asset. Country leads are not "salespeople"; they're trusted community operators. Compensation must not corrupt that relationship into a transactional one.
- Central Asia legal landscape: each country has its own contractor / freelance / employment rules. Tax + currency handling is non-trivial.
- The Community Volunteering Board (governance actor per [project-essentials](../../.claude/projects/-home-drukker-aiqadam/memory/project_essentials.md)) needs to see + sign off on compensation to keep the trust line clean.

## Options

### Option A — Pure volunteer (status quo)
Country leads remain unpaid; recognition through brand association, leadership exposure, network access. Sponsor revenue flows to platform operations only.

- **Pros:** zero recurring expense; aligns with "community, not sales" framing; trust line stays simple.
- **Cons:** scales only to leads who can afford to volunteer multi-hour-weekly. Class-filters the candidate pool to people with discretionary time. Burnout risk: nobody owns "the unsexy work" (CSAT chasing, sponsor admin) because there's no obligation. Will not survive past KZ + TJ in honest reality.

### Option B — Per-event stipend
Country lead receives a fixed stipend per event they ship to spec (e.g. $200 per event meeting the F-S2.4 quality bar: ≥ 75% attendance conversion, CSAT ≥ 4.2, sponsor digest delivered, recap posted). Paid quarterly in arrears.

- **Pros:** ties compensation to deliverable not hours; quality bar is already in the platform's instrumentation; predictable cost per event.
- **Cons:** creates "gaming the metric" risk (operator runs more shallow events to hit count); doesn't compensate for the non-event work (sponsor onboarding, community moderation, board reporting).

### Option C — Revenue share on country's sponsor pool
Country lead receives a fixed percentage (e.g. 20%) of sponsor revenue attributed to their country (per [marketing playbook §3.5](../marketing-and-pr-playbook.md#35-sponsorship-tiers) cohort + per Sprint-3.5 partner cabinet metrics). Paid quarterly.

- **Pros:** aligned incentive — lead cares about real sponsor outcomes, not vanity metrics; scales with community value; sponsor LTV is the rate-limiter, which is the right one.
- **Cons:** introduces the sales-motion failure mode AI Qadam is explicitly avoiding (per [feedback-community-graph-not-CRM](../../.claude/projects/-home-drukker-aiqadam/memory/feedback_community_graph_not_crm.md)). Leads start to optimize sponsor pipeline over community health. Country with no big sponsors starves the lead even if community is thriving.

### Option D — Hybrid: small monthly retainer + per-event bonus + capped revenue share
Country lead receives a low monthly retainer (e.g. $150/mo — covers domain phone, transit, basic acknowledgement) + a per-event bonus ($100 per event meeting spec) + a *capped* revenue share (10% of sponsor revenue, capped at 2× the retainer per quarter). Approved per country by the Community Volunteering Board.

- **Pros:** retainer eliminates the "I can't afford to volunteer" filter; per-event bonus rewards delivery; capped revenue share gives upside without flipping the relationship to sales. Cap keeps total cost bounded + predictable.
- **Cons:** more accounting overhead (three line items per lead instead of one); cap formula needs annual review as community matures.

## Recommendation

**Option D (hybrid)** as the starting model. Specifically:

- Monthly retainer: USD 150-equivalent in local currency, paid monthly. Adjust per country cost-of-living index annually.
- Per-event bonus: USD 100-equivalent per event meeting the F-S2.4 quality bar (attendance ≥ 70%, CSAT ≥ 4.0, recap posted within 7 days, sponsor digest delivered within 30 days).
- Revenue share: 10% of country's attributed sponsor revenue (Bronze→Platinum tier amounts per playbook §3.5), capped at USD 300/quarter.
- Total ceiling per lead per year: ~USD 4,200 (retainer) + ~USD 1,200 (12 events at $100) + ~USD 1,200 (capped revenue share) = ~USD 6,600 + currency conversion + tax.
- Approved by Community Volunteering Board on a per-country basis at activation time; reviewed annually.
- Paid via local-currency bank transfer or Wise — never crypto, never platform-internal tokens. Receipt + invoice required (ties to ADR-0023).

## Consequences

- Sprint 4 (country provisioning) unblocks once this is Accepted.
- Annual platform recurring expense at KZ + TJ + UZ activation: ~USD 20,000/year before Wise/conversion fees. At 5 countries: ~USD 33,000/year. Bounded.
- Recruiting a country lead becomes "we offer fair compensation for the work" not "we offer volunteer experience" — opens the candidate pool past the unpaid-hours filter.
- The 10%-capped revenue share keeps lead motivation aligned with sponsor outcomes without tipping into sales-motion behavior.
- Tax + payroll handling becomes a real ops cost. Recommend a per-country accountant retainer (separate from the lead retainer) for tax filing assistance.
- The Volunteering Board's role becomes more material: they approve compensation, they review annually, they adjudicate disputes.

## References

- [ADR-0023 — Sponsor invoicing](./0023-sponsor-invoicing.md) (Proposed) — flow that produces the revenue base of Option D
- [ADR-0024 — Future revenue phasing](./0024-future-revenue-phasing.md) (Proposed) — when paid products on the member graph turn on additional revenue streams
- [ADR-0033 — Community member graph](./0033-community-member-graph.md) — sponsor revenue model + sponsor PII boundary that constrains lead access
- [`marketing-and-pr-playbook.md` §3.5](../marketing-and-pr-playbook.md#35-sponsorship-tiers) — Bronze/Silver/Gold/Platinum tier amounts (revenue base)
- [`community-platform-roadmap.md` §7 Sprint 4](../community-platform-roadmap.md) — the sprint this ADR gates
- [`community-platform-roadmap.md` §10](../community-platform-roadmap.md) — original "open decisions" list
