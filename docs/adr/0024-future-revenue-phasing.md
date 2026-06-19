# ADR-0024: Future revenue phasing — when paid products on the member graph turn on

## Status
Accepted, 2026-05-21

> Accepted by Viktor (PM) on 2026-05-21 via the [decision-batch process](../02-business-processes/decision-batch-process.md). Informs Phase ζ product prioritization. Each phase gate (ζ.1 hackathons, ζ.2 paid workshops, ζ.3 HRtech, ζ.4 paid premium content, ζ.5 mentorship, ζ.6 sponsor talent-slice) remains its own go/no-go decision at gate-time — accepting the phasing model itself does not commit spend or hires on day one.

## Context

[ADR-0033](./0033-community-member-graph.md) commits AI Qadam to community-as-platform: the member graph is the asset, and future products (hackathons, HRtech / talent matching, edtech / paid cohorts, paid premium content, mentorship marketplace) spin off the graph. Each is a thin namespaced schema extension + a cabinet, not a separate business.

What ADR-0033 does NOT decide: **the order + timing** of those products. Each product has different audience-prerequisite (some need many members, some need many sponsors, some need both), different operator-effort to launch, different revenue model, different risk profile. Doing them all at once would fragment focus + dilute the community-first signal.

[`community-platform-roadmap.md` §10](../01-business/community-platform-roadmap.md) flags "future revenue" as an open decision. [`marketing-and-pr-playbook.md` §3.5](../02-business-processes/marketing-and-pr-playbook.md#35-sponsorship-tiers) treats sponsorship as the only revenue stream in active planning. Sponsor revenue alone caps the platform's economic ceiling at ~USD 75k–250k/year before we've maxed-out our regional sponsor pool.

Constraints:
- Sponsorship-only economics work for 2–3 years of community-first growth; they cap when we want to scale Country Leads + invest in product engineering. Need additional revenue streams to extend the runway past Year-3.
- Each new revenue stream introduces a new operator workflow + a new compliance surface + a new audience-trust risk. Pace matters.
- AI Qadam is community-first per ADR-0033. Any revenue stream that makes members feel like the product (rather than the audience) violates the thesis — explicit anti-pattern.

## Options

### Option A — Stay sponsor-only through Year-3; revisit after
Defer all paid products until sponsor revenue caps + community has 5,000+ active members.

- **Pros:** focus; no operator overload; trust line stays simple; member-first signal pure.
- **Cons:** ceiling-limits us; risks losing key country leads to better-paid opportunities if compensation can't scale.

### Option B — Turn on all paid products at once (Phase ζ "big bang")
Once core platform (Sprint 0–5) is solid, ship hackathon-paid-entries + edtech-paid-cohorts + paid-premium + HRtech-recruiting-fees + mentorship-paid in one Phase-ζ.

- **Pros:** maximum revenue ramp; tests all hypotheses simultaneously; one big PM push.
- **Cons:** operator overload; member-trust risk concentrated; integrate failure compounds; doesn't learn from each individual product.

### Option C — Sequenced phasing tied to community-state gates
Each paid product turns on when its specific community-state precondition is met. Sequenced over 24+ months. Each one has measurable "kill or scale" criteria after 2 quarters of operating data.

- **Pros:** each launch is small + learnable; community signals when a product is right; matches the community-as-platform thesis (community shapes the products, not vice versa).
- **Cons:** slower revenue ramp; more decision overhead per launch; requires honest measurement to enforce kill-criteria.

### Option D — Hybrid: hackathons + paid workshops near-term, the rest sequenced later
Pull two products to near-term (Phase ζ months 1–6) because they're high-leverage low-risk: hackathon entry fees (community is paying for an experience they already want) + paid premium workshops (members already pay for similar elsewhere). Sequence the others (HRtech / paid premium content / mentorship) across months 6–24 per Option C gates.

- **Pros:** material revenue inside Year-2; learns from two adjacent products before turning on the more delicate ones (HRtech especially — risk of feeling like the recruiting side of a job board); preserves member-first signal.
- **Cons:** still a real operator load doing two products simultaneously; needs honest discipline to NOT add the others before kill-or-scale data lands.

## Recommendation

**Option D (hybrid: hackathons + paid workshops near-term, others sequenced)** with these phase gates:

| Phase | Month | Product | Community-state gate | Revenue ceiling |
|---|---|---|---|---|
| ζ.1 | 6 | **Hackathon entry fees** (per [ADR-0033](./0033-community-member-graph.md) Future products) | ≥ 1 country has 200 active members; ≥ 1 enterprise sponsor co-funds prize pool | USD 2k–10k per hackathon |
| ζ.2 | 6–9 | **Paid premium workshops** (course_session event_type) | ≥ 1 country runs 4+ free workshops per quarter at CSAT ≥ 4.5; ≥ 1 instructor opts in to paid model | USD 5k–25k/year per country |
| ζ.3 | 12 | **HRtech recruiting fees** (employer pays per-hire from cohort with `member_consents.purpose=recruiting`) | ≥ 200 members with recruiting-consent across ≥ 1 country; ≥ 2 enterprise employers in active sponsor relationship | USD 10k–50k/year |
| ζ.4 | 12–18 | **Paid premium content / newsletter** (Listmonk-deployed; per playbook §6) | Free newsletter has ≥ 1,500 subscribers + ≥ 35% open rate | USD 5k–30k/year |
| ζ.5 | 18–24 | **Mentorship marketplace** (member-to-member; we take 10% transaction fee) | ≥ 50 members opted into `willing_to_mentor` + ≥ 50 members opted into `looking_for_mentor` | USD 5k–25k/year |
| ζ.6 | 24+ | **Sponsor talent-slice upgrade tier** (HRtech-adjacent revenue from sponsor side) | After ζ.3 + ζ.5 are operating | Variable |

**Kill-or-scale review per product:** at 6 months operating data, the Board reviews. Kill criteria: < 20% of community-state gate's projected revenue ceiling AND CSAT impact on free community drops > 0.3 points. Scale criteria: ≥ 50% of revenue ceiling AND CSAT stable.

**The member-first guardrail:** at any phase, the AGGREGATE paid-product revenue must be ≤ 60% of total platform revenue. Sponsor revenue stays ≥ 40% as the "we still serve the community first" signal. If a paid product is so successful it would push this ratio past 60%, we cap or slow that product, not raise the cap.

## Consequences

- Phase ζ.1 hackathon-entry feature lands ~6 months after Sprint 5 completes. Schema work fits within the F-S3.0 graph (hack_* namespace prefix already reserved per ADR-0033).
- Phase ζ.4 paid newsletter is the same operator surface as the free one — no new tool, just dispatch-cohort filtering on subscription status.
- Annual revenue projection (conservative): Year-2 USD 25k–50k from ζ.1–ζ.2; Year-3 USD 60k–150k including ζ.3–ζ.4; Year-4 USD 100k–250k+ including ζ.5–ζ.6. These add to sponsor revenue, not replace it.
- The 60% paid-product cap is the load-bearing trust mechanism. If we drift past it, we have stopped being a community platform and become a marketplace with a community attached.

## References

- [ADR-0022 — Country-lead compensation](./0022-country-lead-compensation.md) (Proposed) — pace of compensation scales with this revenue model
- [ADR-0023 — Sponsor invoicing](./0023-sponsor-invoicing.md) (Proposed) — sponsor-revenue flow this phasing builds on
- [ADR-0033 — Community member graph](./0033-community-member-graph.md) — namespace-prefix scheme + product-extension model
- [`marketing-and-pr-playbook.md` §3.5](../02-business-processes/marketing-and-pr-playbook.md#35-sponsorship-tiers) — sponsor tier amounts (the base)
- [`community-platform-roadmap.md` §7 Phase ζ](../01-business/community-platform-roadmap.md) — the phase ζ product list
