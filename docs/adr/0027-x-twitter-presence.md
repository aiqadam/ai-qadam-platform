# ADR-0027: X (Twitter) presence — yes, no, or scope

## Status
Accepted, 2026-05-21

> Accepted by Viktor (PM) on 2026-05-21 via the [decision-batch process](../02-business-processes/decision-batch-process.md). Zero ongoing recurring spend — Option D requires a one-time ~1-day engineering integration with F-S5.4 social cards; subsequent auto-post traffic costs nothing per X's free tier. Squat-prevent the handle immediately as a separate HUMAN one-off step.

## Context

Per project-essentials, AI Qadam's current social surfaces are Telegram group + LinkedIn (manually solo by Viktor) + web. No X (Twitter) presence today.

X is dominant globally for AI / ML engineer conversations (~70% of the global AI community has an active X account; conference recaps, paper threads, and tooling announcements compete primarily on X). In Central Asia, however, X is a niche channel — Telegram + LinkedIn dominate engineer reach. Russian-language AI conversations on X are dwarfed by Habr + Telegram. UZ + KZ government had periodic X blocks in past years; reliability is uneven.

The decision is whether the **operator effort** of maintaining an X presence is justified given the **regional ROI**. AI Qadam has a competing decision about LinkedIn cadence (no ADR yet; we know it's load-bearing) so the X budget effectively trades against LinkedIn growth.

Constraints:
- Solo operator (Viktor) on social today. Adding X means either reducing LinkedIn time or hiring/onboarding a social-media operator (we don't have budget for the latter).
- X's recent API + visibility changes make organic reach unreliable for organizations under ~5k followers.
- Per ADR-0033, social broadcast is not the platform asset — community is. X serves the funnel, not the product.

## Options

### Option A — No X presence
Stay Telegram + LinkedIn + web.

- **Pros:** zero new operator load; LinkedIn-dominant Central Asia matches our presence; no X reliability risk.
- **Cons:** miss the global AI engineer surface where event teasers, hackathon launches, and speaker spotlights perform best; potentially lose international speaker recruiting funnel.

### Option B — Active X account with daily presence
`@aiqadam` (or per-country `@aiqadam_uz`, etc.) with 3–5 posts/day, threads, quote-tweets of community talks.

- **Pros:** strong international visibility; speaker recruiting funnel benefits; SEO halo.
- **Cons:** requires a real social-media operator (Viktor cannot sustain this with COO + Vibe Code work); cost ~USD 10k/year for a part-time SMM; organic reach unreliable post-2024 algo changes.

### Option C — Passive X presence — claimed handle, monthly post, no engagement
Claim `@aiqadam` (squat-prevention). Post 1–2× per month: major hackathon launches, speaker spotlights, country activations. No daily engagement.

- **Pros:** squat-prevention (someone else can't impersonate); a discoverable surface for international researchers searching X for the handle; ~30 min/month operator load.
- **Cons:** sparse cadence reads as "this account is dead" to anyone who lands there; arguably worse than no presence.

### Option D — Event-driven X bursts via auto-posting
Claim `@aiqadam`. Each event publication auto-posts an event-card thread + day-of-event live thread + recap. No daily engagement; the social card pipeline (F-S5.4) does the heavy lifting. Operator burden ≈ 0 per event (the cards are already generated for OG image purposes).

- **Pros:** event-relevant content cadence (~3–5 posts per event × 1–2 events/month × N countries = 6–20 posts/month); no daily engagement requirement; algorithm-friendly (real content, not scheduled drips); pairs with F-S5.4 social cards we're shipping anyway.
- **Cons:** still requires a one-time setup cost for the X API integration (~1 day eng) and continued account-health work (occasional reply-to-mention, no DM monitoring).

## Recommendation

**Option D (event-driven X bursts via auto-posting)** with these scope guards:

- One handle: `@aiqadam` (no per-country handles; reduces operator surface count and matches the cross-country signal).
- Auto-post triggers (per [marketing playbook §14 cadence](../02-business-processes/marketing-and-pr-playbook.md)): T-14 event-announce thread, T-2 reminder thread, T+1 recap thread with speaker quote-cards, T+3 speaker-spotlight thread per speaker.
- Threads use the same F-S5.4 social-card image-pair we generate for OG/Twitter image; no separate content workflow.
- Replies + DMs: NOT monitored (account bio links to Telegram for actual conversation).
- Quarterly review: subscriber count, impression count, click-through to events. Kill criteria: ≤ 50 followers + ≤ 5% CTR on event-card threads after 12 months → drop to Option C (passive holding).
- Squat-prevention: claim the handle immediately even if Option D ships later.

## Consequences

- One-time engineering cost: ~1 day to wire `X-api-tweet` to the F-S1.1a publication-broadcast flow + the F-S5.4 social-card pipeline.
- Ongoing operator cost: ~5 min/month to review the kill-criteria dashboard.
- Reach hypothesis: Year-1 = 200-500 followers (organic from events + Viktor's existing network); Year-2 = 1,500-3,000 (if Central Asia AI scene gets traction). Not the primary funnel; the marginal speaker recruit per year would justify the eng cost alone.
- We do not commit to "X marketing" as a discipline. We commit to syndicating our event flow onto X with zero incremental operator load.
- If we kill the channel: handle stays claimed + bio points to Telegram. No reputation cost.

## References

- [ADR-0026 — Telegram channel](./0026-telegram-channel.md) (Proposed) — primary social surface for CA reach
- [ADR-0033 — Community member graph](./0033-community-member-graph.md) — social is funnel, community is asset
- [`marketing-and-pr-playbook.md` §11](../02-business-processes/marketing-and-pr-playbook.md) — social channel mix
- [`marketing-and-pr-playbook.md` §14](../02-business-processes/marketing-and-pr-playbook.md) — per-event cadence
- [`community-platform-roadmap.md` §7 Sprint 5.4](../01-business/community-platform-roadmap.md) — social-card generation feature (the dependency)
