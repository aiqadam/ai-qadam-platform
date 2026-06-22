# ADR-0028: First paid spend — when, on what, what we're testing

## Status
Deferred, 2026-05-21 — on the [business-process gap list](../02-business-processes/business-process-gaps.md)

> Reviewed by Viktor (PM) on 2026-05-21 via the [decision-batch process](../02-business-processes/decision-batch-process.md). Decision: **defer**, not accept. Reason: any paid spend (Options B/C/D) requires recurring budget that isn't authorized at this stage. **Operating reality stays Option A (no paid spend Year-1; organic only)** until sponsor revenue stabilizes enough to fund test campaigns from real platform revenue. Logged in [`docs/02-business-processes/business-process-gaps.md`](../02-business-processes/business-process-gaps.md) with the trigger conditions for revisit. Paid-channel CAPABILITY (campaign landing pages + UTM scheme + Plausible attribution) still ships per [community-platform-roadmap §7 Sprint 5.9](../01-business/community-platform-roadmap.md); only the SPEND decision is deferred.

## Context

[`marketing-and-pr-playbook.md` §4.3](../02-business-processes/marketing-and-pr-playbook.md#43-paid-channels-capability-built-deployment-deferred) commits to paid-channel capability being built but explicitly defers the **first paid spend** decision: "no spend planned without ADR". This is that ADR.

Today AI Qadam's growth is fully organic: existing Telegram group + LinkedIn + word of mouth + the event ladder. Sprint 5.9 ships campaign landing pages — the technical machinery to support paid spend. The question this ADR answers: **when does the first paid dollar go out, and on what.**

Constraints:
- Not VC-funded; first paid spend comes out of sponsor revenue (or out of Viktor's pocket — which has been the case for some initial costs but is not sustainable).
- AI Qadam is community-as-platform per ADR-0033. The product is the audience graph. Paid spend that "buys eyeballs" without converting them to engaged community members is wasted money and a brand-trust risk.
- Per ADR-0024 phasing, we don't expect to need paid traffic for product surfaces (hackathons, edtech, etc.) until the community-state gates open.

## Options

### Option A — No paid spend Year-1; organic only
Stay organic until Year-2 at minimum.

- **Pros:** zero spend; tests that the organic loop scales; preserves the "we don't need paid ads" community signal.
- **Cons:** Year-1 growth ceiling may be too low to give country leads enough event volume to retain their motivation; we may miss a regional window if a competitor moves first.

### Option B — Small experimental paid spend in Year-1 on event-day registration only
Promote individual events (not the platform) via paid LinkedIn ads + Telegram-promoted-post + Yandex.Direct in the 5–7 days before each event. Budget: USD 50–150 per event.

- **Pros:** measurable per-event ROI; doesn't promote "the platform" (which feels marketing-y), promotes the actual experience members come for; aligns with ADR-0033 community-first signal; tests the funnel without committing brand budget.
- **Cons:** doesn't build a brand awareness compound effect; spend is event-by-event so harder to track aggregate ROI; risk of "we ran an ad and only 3 people came from it".

### Option C — Brand-awareness campaign Year-1
Run a multi-week LinkedIn + Telegram + Yandex.Direct campaign about AI Qadam itself ("Central Asia's AI engineering community"). Budget: USD 2,000–5,000 over 8 weeks.

- **Pros:** builds compound brand recognition; supports the future paid-product launches; sets a "we invest in being known" signal.
- **Cons:** large spend for unclear ROI; brand-awareness campaigns are notoriously hard to attribute; risks looking marketing-y to the engineer audience we're trying to attract; cuts into runway for Country Lead compensation.

### Option D — Hybrid: small event-day spend Year-1 + brand campaign tied to first hackathon launch (Phase ζ)
Year-1: Option B (event-day spend, USD 50-150 per event). Phase-ζ.1 hackathon launch (ADR-0024): Option C (brand-awareness campaign tied to the hackathon, USD 2,000-5,000 — sponsored by the hackathon's enterprise sponsor where possible).

- **Pros:** event-day spend is measurable + low-risk; brand campaign waits until there's a flagship product to point at; hackathon sponsor co-funds the campaign so platform CAC is bounded.
- **Cons:** delays brand-awareness investment ~6 months; depends on hackathon sponsor co-funding.

## Recommendation

**Option D (hybrid: event-day spend Year-1 + Phase-ζ.1 hackathon brand campaign)** with these specifics:

### Year-1 event-day spend

- Budget: USD 50-150 per event, country lead approves per event.
- Channels per country:
  - UZ: LinkedIn (Sponsored Updates targeting tech roles + Tashkent), Yandex.Direct (`AI meetup Tashkent` exact match), Telegram promoted posts in 2–3 relevant CA tech groups (cost ≈ USD 15-30 per group per week).
  - KZ: LinkedIn + Yandex.Direct + Telegram (similar mix).
  - TJ: Telegram only initially; LinkedIn audience too thin.
- Attribution: every paid surface uses the per-event UTM scheme (per [marketing playbook §16](../02-business-processes/marketing-and-pr-playbook.md)); event registration count attributable to `utm_medium=paid` is the per-event success metric.
- Kill criteria per event: if paid attributed registrations < 5 AND CPA > USD 50, that country's paid budget for the next event is halved. Two consecutive failures = pause paid for that country.
- Total Year-1 event-day spend ceiling: USD 1,500 (10 events × ~USD 150) per country = USD 4,500 across 3 countries.

### Phase-ζ.1 hackathon brand campaign (~Month 6 per ADR-0024)

- Budget: USD 3,000-5,000 (subject to sponsor co-fund).
- Sponsor co-fund commitment is a prerequisite — sponsor pays ≥ 50%, AI Qadam pays the rest.
- Campaign goal: hackathon registration (proxy: brand awareness boost is a secondary outcome).
- Kill criteria: if at week 4 of 8 the campaign is under 30% of registration target, redirect remaining budget into event-day spend on the hackathon's regional kickoff events.

### What we are NOT doing

- No platform-level brand campaign without a flagship product to point at (Year-1).
- No Google Ads / Meta Ads at this stage (channel-mix returns lower than LinkedIn + Yandex.Direct in CA per industry data).
- No influencer-marketing spend until we've run organic creator partnerships (per [marketing playbook §11 partnerships](../02-business-processes/marketing-and-pr-playbook.md)).

## Consequences

- Year-1 paid spend ceiling: ~USD 4,500 (event-day only). Comes out of sponsor revenue.
- Year-2 (Phase ζ.1): ~USD 5,000 incremental for the hackathon brand campaign, ≥50% sponsor co-funded.
- The kill-criteria-per-event discipline keeps us honest. Two failed countries means we pause not retry harder.
- Brand awareness compound effect is deferred to Phase ζ — accepted trade-off for runway preservation.
- This ADR does NOT cover paid-product launch marketing (Phase ζ.3 HRtech, ζ.4 paid premium, etc.); each gets its own go/no-go ADR per product.

## References

- [ADR-0022 — Country-lead compensation](./0022-country-lead-compensation.md) (Proposed) — paid spend competes with this budget line
- [ADR-0024 — Future revenue phasing](./0024-future-revenue-phasing.md) (Proposed) — Phase ζ.1 hackathon is the brand-campaign trigger
- [`marketing-and-pr-playbook.md` §4.3](../02-business-processes/marketing-and-pr-playbook.md#43-paid-channels-capability-built-deployment-deferred) — paid-channel capability + deferral
- [`marketing-and-pr-playbook.md` §16](../02-business-processes/marketing-and-pr-playbook.md) — UTM + attribution scheme
- [`community-platform-roadmap.md` §7 Sprint 5.9](../01-business/community-platform-roadmap.md) — campaign landing pages (the technical capability)
