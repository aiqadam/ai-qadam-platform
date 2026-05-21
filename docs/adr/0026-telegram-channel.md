# ADR-0026: Telegram channel (presence beyond the group)

## Status
Accepted, 2026-05-21

> Accepted by Viktor (PM) on 2026-05-21 via the [decision-batch process](../decision-batch-process.md). Zero recurring spend — Telegram channels are free; cadence relies on country-lead time (volunteer per ADR-0022 status quo, until that ADR is revisited).

## Context

Per [project-essentials](../../.claude/projects/-home-drukker-aiqadam/memory/project_essentials.md), AI Qadam runs a Telegram **group** today (members chat with each other) but explicitly NOT a Telegram **channel** (broadcast-only, one-way operator → audience). [`marketing-and-pr-playbook.md`](../marketing-and-pr-playbook.md) documents Telegram as a primary funnel surface for Central Asia; not all members visit `aiqadam.org` regularly but ~80% open Telegram daily.

A channel is the broadcast complement to a group: one-way official announcements, event teasers, recap links, sponsor highlights. Groups don't show notifications by default for many members (muted-group is normalized); channels do.

The decision is **whether** to add a Telegram channel per country (or one global channel) given the operator cost + content cadence requirements. The Telegram bot (F-S5.5) is a separate decision; this ADR is about the broadcast channel.

Constraints:

- Per ADR-0033, AI Qadam is community-as-platform. Channels are broadcast-only — operators talk, members listen. The signal must stay "we're talking WITH you" not "we're talking AT you".
- Telegram channel = additional operator surface. Content cadence below threshold (e.g., 1 post per week) feels worse than no channel (announces our irrelevance).
- Telegram interactions don't currently flow into the member graph (no FK to `directus_users.telegram_id` yet; that's F-S5.5 territory).
- Cross-country fragmentation: a global channel means everyone gets KZ events when they're UZ-based. Per-country channels mean N operator surfaces.

## Options

### Option A — No channel (status quo)
Stay group-only.

- **Pros:** zero operator overhead; member-first signal pure.
- **Cons:** miss the ~40-50% of members who don't actively read group chat; under-leverage the highest-engagement surface in CA.

### Option B — Single global channel (`@aiqadam`)
One channel for cross-country announcements (platform-level news, hackathon launches, major sponsor news). Per-country events stay in groups.

- **Pros:** one operator surface; clear signal-distinction (channel = platform; group = local).
- **Cons:** under-serves country-specific event reach (which is the main use case); members in UZ get KZ event news as noise.

### Option C — Per-country channels (`@aiqadam_uz`, `@aiqadam_kz`, `@aiqadam_tj`)
One channel per country, mirroring the country home pages.

- **Pros:** country-relevant content per audience; matches the tenant model; can A/B per country.
- **Cons:** N operator surfaces (N = country count); cross-country members must subscribe to N; we need a content cadence per channel that doesn't feel sparse.

### Option D — Hybrid: per-country channels + a small cross-country one
Per-country channels for events + recaps (Option C primary). A small cross-country channel (Option B) for platform-level announcements only.

- **Pros:** country relevance + platform signal both served; operator cost contained because the cross-country channel posts ≤ 2× per month.
- **Cons:** maximum operator surface count; risk that cross-country channel atrophies if cadence falls below threshold.

## Recommendation

**Option C (per-country channels)** initially. Specifically:

- Launch `@aiqadam_uz` first, aligned with the UZ country home page.
- Country lead (the F-S4.3 onboarding wizard adds this) owns the channel posting cadence: 2–4 posts/week minimum.
- Content mix (per [marketing playbook §14](../marketing-and-pr-playbook.md)): T-7 event teaser, T-2 event reminder, T+1 event recap, T+3 speaker quote, occasional sponsor highlight (per F-S3.5 cabinet entitlement, never raw member rows).
- Group continues to exist alongside; group = conversation, channel = broadcast.
- Members are invited to subscribe at the bottom of the event-confirmation email; bot v0 (F-S5.5) when shipped can deep-link the subscribe action.
- KZ + TJ channels launch when their country lead is onboarded + their event cadence supports 2+ posts/week.
- Defer the cross-country channel (Option D variant) until ≥ 3 active country channels exist and there are real cross-country announcements to make (hackathons, platform-wide changes).

## Consequences

- Operator cost: ~30 min/week per country lead for channel posting (often re-purposed content from the events workflow).
- Reach: estimated ~2–3× the group's effective notification reach (channel notifications default-on for subscribers).
- Cross-country fragmentation accepted as a feature, not a bug — members opt into the countries they care about.
- Channel content does NOT replace the email digest (when that ships per playbook §6); the two surfaces serve different audiences (Telegram active, email retention).
- Per-country channels mean per-country growth metrics (subscriber count, post engagement); Plausible doesn't track Telegram, so we add a simple monthly export from Telegram's analytics into the country dashboard (F-S2.4 follow-up).

## References

- [ADR-0027 — X (Twitter) presence](./0027-x-twitter-presence.md) (Proposed) — sibling decision for a different channel
- [ADR-0033 — Community member graph](./0033-community-member-graph.md) — partner_audiences governs sponsor inclusion in channel posts
- [`marketing-and-pr-playbook.md` §11](../marketing-and-pr-playbook.md) — Telegram in the funnel
- [`community-platform-roadmap.md` §7 Sprint 5.5](../community-platform-roadmap.md) — Telegram bot v0 (separate feature)
- [`community-platform-roadmap.md` §7 Sprint 4](../community-platform-roadmap.md) — country onboarding (where new-country-channel goes live)
