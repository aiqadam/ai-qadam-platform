---
code: FR-GAM-003
name: Leaderboard
status: Shipped
module: Gamification (GAM)
phase: Phase 1 (V1) / Rebuild Phase 1 (V2, Shipped)
---

## Description

The leaderboard ranks members by points within a country and time window. It is accessible to everyone (public) and updates in near real-time after check-ins. Temporary accounts are excluded.

## Users

Public / Members.

## Functional scope

1. **Route** — `/leaderboard` (SSR, `prerender=false`). Country-scoped to the current subdomain.
2. **Time windows** — `?window=all` (all time, default) / `?window=year` (current calendar year) / `?window=quarter` (current calendar quarter). Query param controls the leaderboard computation period.
3. **API** — `GET /v1/leaderboard?window=all&limit=50` — returns ranked list of `{ rank, handle, displayName, avatarInitials, pointsTotal, badgeCount, eventsAttended }`. Excludes `is_temporary=true` users.
4. **Podium** — Top 3 members displayed with special styling (1st/2nd/3rd place podium visual).
5. **Ranked table** — Remaining members below the podium in a ranked table. Clickable handles link to `/u/[handle]`.
6. **Self-row highlight** — The signed-in user's row is highlighted in the table (identified from `window.__AIQADAM_AUTH__` without requiring a separate API call).
7. **Caching** — Leaderboard is computed on read, cached in Redis for 60 seconds to avoid repeated heavy queries at the same time.
8. **Pagination** — Default limit 50; paginatable via `?cursor=...`.

## Acceptance criteria

- [ ] `/leaderboard` on `uz.aiqadam.org` shows only Uzbekistan members.
- [ ] Switching `?window=year` shows rankings based only on points earned in the current year.
- [ ] The top 3 members are shown in the podium with correct ranks.
- [ ] A signed-in user's row is highlighted; unsigned visitors see no highlight.
- [ ] Temporary accounts (`is_temporary=true`) do not appear in the leaderboard.
- [ ] The page loads under 2 seconds; subsequent loads within 60 seconds are served from cache.
- [ ] After a check-in awards points, the leaderboard reflects the updated ranking within 60 seconds.
- [ ] Clicking a member's handle navigates to their `/u/[handle]` page.

## Notes

- V2 (web-next): shipped in RB-P1 (Rebuild Phase 1). The `Leaderboard.astro` block exists in web-next.
- Cache invalidation: the 60-second TTL is sufficient for Phase 1. If leaderboard becomes more critical, consider invalidation on each check-in event.
