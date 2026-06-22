---
code: FR-EVT-004
name: Event detail page
status: In Progress
module: Events (EVT)
phase: Phase 1 (V1) / Rebuild Phase 1 (V2, In Progress)
---

## Description

The event detail page (`/events/[id]`) is the richest page on the platform. It presents everything about a specific event: hero image, venue details with map, agenda, speaker cards, materials, photos, sponsors, and a forum (Q&A). It adapts to the event's lifecycle state (upcoming / live / finished) and respects visibility gating.

## Users

Public / Members.

## Functional scope

1. **Route** — `/events/[id]` (SSR, `prerender=false`). Returns `404` if event not found, not published, or belongs to a different country.
2. **Lifecycle tabs** — Content adapts based on event state:
   - **Upcoming** — Registration sidebar, agenda, speaker list, sponsor row.
   - **Live** — Live indicator chip, livestream embed (if `livestream_url` set), agenda (current item highlighted), registration sidebar (check-in mode).
   - **Finished** — Recap section (`recap_md`), recording links, photos gallery, post-event materials. Registration sidebar replaced by "You attended" state.
   - **Forum tab** — Persistent Q&A: members can post questions (max 2000 chars) which appear in reverse-chronological order. Pinned questions float to top.
3. **Venue block** — Venue name, address, embedded OpenStreetMap iframe, deep-links to Google Maps and Yandex Maps.
4. **Registration sidebar** — Sticky aside with: date/time, venue, capacity counter (if capped), and CTA. States: Register / Join waitlist / You're registered / Leave waitlist / Cancel (see FR-REG-001). Includes referral + UTM attribution capture.
5. **Speakers section** — Cards per speaker: photo (Directus asset), name, role/company, talk title. Only confirmed/accepted speakers shown (`status in ['accepted', 'confirmed']`).
6. **Materials section** — Links to slides, recording, GitHub, paper. External URLs and Directus-hosted assets.
7. **Photos gallery** — Grid of event photos (from `event_photos` collection). Shown on the Finished tab only.
8. **Sponsors** — Logos with tier labels in the sidebar or below the fold.
9. **Visibility gating** — `members_only` events: full content shown only to signed-in members; public visitors see a teaser + sign-in prompt. `invite_only` events: additionally require explicit invite.
10. **SEO** — `JSON-LD Event` schema, `og:type=event`, per-event dynamic OG card image at `/events/[id]/og-card.png` (cache-busted by `date_updated`).

## Acceptance criteria

- [ ] An upcoming event page shows the registration sidebar, agenda, speakers, and sponsors.
- [ ] A finished event page shows the recap section, recordings, and photos gallery.
- [ ] A live event (between `starts_at` and `ends_at`) shows the livestream embed when `livestream_url` is set and the "Live" chip.
- [ ] A `members_only` event shows a sign-in prompt to unsigned visitors instead of full content.
- [ ] The forum Q&A allows a signed-in member to post a question; it appears immediately (optimistic prepend).
- [ ] The venue block shows an OSM map and working deep-links to Google Maps and Yandex Maps.
- [ ] The OG card image at `/events/[id]/og-card.png` renders with event title and date.
- [ ] Accessing an event from a different country (e.g., a KZ event via `uz.aiqadam.org`) returns 404.

## Notes

- V2 status: `pages/events/[id].astro` exists with speakers/materials/sponsors/forum, but **photos, recap/livestream embed, and map are not yet ported** (deferred per web-next block header). This is the `In Progress` status.
- The visibility-gating logic (`isGated` based on `visibility_scope`) must be ported to V2; V1 gates all sub-fetches; V2 currently fetches unconditionally.
- OG card generation lives in `lib/og-template.tsx` + `lib/og-fonts.ts` + `pages/events/[id]/og-card.png.ts`.
