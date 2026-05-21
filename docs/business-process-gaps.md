# Business-process gaps

> **What this file is.** A live list of decisions that have been *reviewed* but not *accepted* because they require recurring spend or new hires that aren't authorized at the current stage. Each entry has a **trigger** — the concrete condition that, when it fires, brings the gap back to the PM decision-batch for a re-review with the option to accept.
>
> **What this file is NOT.** It is not a backlog of features to build. It is not a wishlist. It is not a venting board. Each gap is a real platform need that we are *consciously deferring* because the cost can't be justified yet — and we want a trail showing we knew, we paused, we'll come back.
>
> **How an entry leaves the list.** Either (a) the trigger fires and the underlying ADR is brought back to a decision-batch where it is Accepted (close the gap entry with the date + PR# that accepted it), or (b) the decision changes and we explicitly *kill* the gap (close with reasoning).
>
> **Owner.** PM (Viktor) reviews this list at the same weekly cadence as the decision-batch ([decision-batch-process.md](./decision-batch-process.md)).

---

## Active gaps

### G-1 — Country-lead compensation

- **Underlying ADR:** [ADR-0022](./adr/0022-country-lead-compensation.md) (Deferred 2026-05-21)
- **What the gap is:** AI Qadam pays country leads nothing today. The role is multi-hour-per-week (sponsor outreach, speaker recruitment, member moderation, CSAT, board reporting). At UZ scale this survives on Binali's existing community trust. **It will not survive at KZ + TJ activation** without compensation — operator burnout + class-filtering of candidates to people who can afford to volunteer are both real risks named in the ADR.
- **What we're doing in the meantime:** Operating Option A from the ADR (pure volunteer). Sprint 4 (country provisioning) is gated on this gap being closed before any country lead beyond UZ is onboarded — the [country-lead-activation.md runbook](./runbooks/country-lead-activation.md) explicitly references ADR-0022 as a pre-condition.
- **Trigger to revisit:** EITHER (a) sustained sponsor revenue ≥ USD 15,000/year across the platform (≈ 2× Bronze + 1× Silver tier per [marketing playbook §3.5](./marketing-and-pr-playbook.md)), OR (b) a country-lead candidate is identified for KZ or TJ who clearly cannot commit ≥ 10 hr/week without compensation. Whichever fires first. The hybrid recommendation in the ADR (retainer + per-event bonus + capped revenue share) is the default option to reconsider; alternative options remain on the table.
- **Closure criteria:** ADR-0022 reaches a follow-on Accepted decision via the decision-batch process; entry is closed with the accepting PR number + date.

### G-2 — First paid marketing spend

- **Underlying ADR:** [ADR-0028](./adr/0028-first-paid-spend.md) (Deferred 2026-05-21)
- **What the gap is:** AI Qadam runs zero paid acquisition today. Per the ADR analysis: organic growth alone has a Year-1 ceiling that may starve country leads of event volume (which threatens their motivation) and risks losing the regional first-mover window if a competitor moves first. Capability is built (campaign landing pages, UTM attribution, Plausible per-channel cohorts) — only the spend itself is paused.
- **What we're doing in the meantime:** Organic-only (Telegram group + LinkedIn + word of mouth + event ladder). Country leads run events without paid promo support.
- **Trigger to revisit:** EITHER (a) sponsor revenue stabilizes at ≥ USD 8,000/year for two consecutive quarters (i.e., a real platform revenue line that can fund test spend without dipping into Viktor's pocket), OR (b) an event registration count drops below an unhealthy threshold for two consecutive events in a country (the country lead reports this; trigger value depends on the country baseline). The recommended option in the ADR (event-day spend USD 50-150 per event, kill-criteria-per-event) is the default to reconsider.
- **Closure criteria:** ADR-0028 reaches a follow-on Accepted decision; entry is closed with the accepting PR number + date.

### G-3 — Paid Russian-language editor

- **Underlying half-decision:** [ADR-0029](./adr/0029-russian-voice-owner.md) was Accepted with override to Option C (community pool, zero cash). The paid-editor half of the original recommended Option D (USD 500-700/month part-time contractor for strategic-surface review) is the deferred half. The community pool covers event-volume content but leaves Russian voice quality on strategic surfaces (UX guidelines, marketing playbook, operator playbook, brand-asset captions) dependent on Viktor + community-volunteer review.
- **What we're doing in the meantime:** Community pool only. Viktor reviews strategic Russian-language surfaces personally; community pool rotates per event. Quality measurable via member surveys; not yet a confirmed gap until a real quality drop surfaces.
- **Trigger to revisit:** Either (a) member feedback on Russian-language surfaces drops measurably (CSAT mention specifically; or a member explicitly flags inconsistent register on a strategic surface), OR (b) the community pool can't keep up with volume (e.g., a recap stays unposted for > 7 days because no community editor was available three consecutive times), OR (c) revenue allows it without trading off another higher-priority spend.
- **Closure criteria:** ADR-0029 revisited via decision-batch; the paid-editor half is either Accepted (close G-3) or rejected as permanently unnecessary (close G-3 with that reasoning).

---

## How to add a gap

When a decision-batch defers an ADR with zero-cost-or-defer framing:

1. Update the ADR's Status block to `Deferred, <date> — on the [business-process gap list](../business-process-gaps.md)` with a one-paragraph note explaining why + the trigger to revisit.
2. Add an entry to this file under "Active gaps" using the G-N format. Required fields: underlying ADR link + Deferred date, what the gap is, what we're doing in the meantime, the concrete trigger to revisit, the closure criteria.
3. If the gap blocks a sprint or feature, update that sprint's row in [`community-platform-roadmap.md` §7](./community-platform-roadmap.md) + the open-decisions list in §10 to reference the gap.
4. Mention the new gap in the next [decision-batch-process.md](./decision-batch-process.md) PM review so it's visible.

---

## Closed gaps (history)

*(Empty on day one. Each closed entry should record: G-N, ADR, date closed, PR# that accepted the underlying ADR or the reasoning if killed without acceptance.)*
