---
code: FR-EVT-003
name: Event discovery — list, search, and filter
status: Shipped
module: Events (EVT)
phase: Phase 1 (V1) / Rebuild Phase 1 (V2, Shipped)
---

## Description

Members and public visitors can browse upcoming and past events on `/events`. The list supports format filtering, free-text search, and timeline vs. grid view toggle. All filtering is server-side for performance and SEO.

## Users

Public / Members.

## Functional scope

1. **Route** — `/events` (SSR, `prerender=false`). Country-scoped: shows events for the current subdomain's country.
2. **Tabs** — "Upcoming" (events where `ends_at > now`) and "Past" (events where `ends_at < now`). Default: Upcoming.
3. **Format filter** — Filter by event format: all / meetup / workshop / hackathon / conference / online. Passed as a query param `?format=...`.
4. **Free-text search** — `?q=...` (max 80 chars), performs `_icontains` search on event `title`. Applied server-side in Directus.
5. **View toggle** — Grid view (cards) vs. timeline view (grouped by month). Default: grid. Toggle state persisted in the session or URL.
6. **Event card** — Shows: hero image thumbnail, format chip, title, date, venue name, registration count / capacity indicator.
7. **Events timeline (past)** — Past events grouped by month, sorted `-starts_at`. Shows "No past events yet" empty state.
8. **Lead capture** — `LeadCaptureForm` is shown on the events list page for unsigned visitors.
9. **SEO** — Per-country sitemap includes all published event URLs. Events list has canonical tag, description meta, and OG tags.

## Acceptance criteria

- [ ] Visiting `/events` on `uz.aiqadam.org` shows only Uzbekistan events.
- [ ] Selecting "Workshop" format shows only workshop-format events.
- [ ] Searching for a word in an event title returns only matching events.
- [ ] Searching for more than 80 characters in `?q=` is either truncated or returns a 400 error.
- [ ] The past tab shows events in reverse chronological order, grouped by month.
- [ ] The grid/timeline toggle persists during the session.
- [ ] The page loads under 2 seconds on 4G (Tashkent baseline).

## Notes

- Shipped in V1 and in V2 (RB-P1 milestone, confirmed in web-next-workplan.md and web-v1-feature-surface.md coverage matrix).
- Events fetched server-side via `lib/cms.ts → fetchUpcomingEvents / fetchPastEvents` using Directus public read. No authentication required.
