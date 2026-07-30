---
code: FR-EVT-004
name: Event detail page
status: Implemented
module: Events (EVT)
phase: Phase 1 (V1) / Rebuild Phase 1 (V2, Implemented)
github_issue: https://github.com/aiqadam/ai-qadam-platform/issues/130
business_process: [BP-UAT-010]
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

- [x] An upcoming event page shows the registration sidebar, agenda, speakers, and sponsors.
- [x] A finished event page shows the recap section, recordings, and photos gallery.
- [x] A live event (between `starts_at` and `ends_at`) shows the livestream embed when `livestream_url` is set and the "Live" chip.
- [x] A `members_only` event shows a sign-in prompt to unsigned visitors instead of full content.
- [ ] The forum Q&A allows a signed-in member to post a question; it appears immediately (optimistic prepend). **(no E2E coverage — see Notes)**
- [x] The venue block shows an OSM map and working deep-links to Google Maps and Yandex Maps.
- [x] The OG card image at `/events/[id]/og-card.png` renders with event title and date.
- [x] Accessing an event from a different country (e.g., a KZ event via `uz.aiqadam.org`) returns 404.

## Notes

- **V2 status (updated 2026-07-30, `wf-20260730-feat-155` — gap-closure shipped):**
  `apps/web-next/src/pages/events/[id].astro` now implements the full
  functional scope: lifecycle-adaptive tabs (upcoming/live/finished/forum via
  SSR `?tab=` routing), venue/map block (`VenueMap.astro`), Finished-tab
  photos gallery (`EventPhotoGallery.astro`) and recap + inline recording
  players (`EventRecap.astro`), Live-tab livestream panel
  (`LivestreamPanel.astro`), fetch-level visibility gating
  (`members_only`/`invite_only`, gated via `Astro.locals.auth?.me`, never a
  render-level hide), a real byte-identical 404 (not the old 302) for
  not-found/unpublished/wrong-country events, and the dynamic OG card route
  (`pages/events/[id]/og-card.png.ts`, Satori + `@resvg/resvg-js` + Geist,
  ported from V1). `fetchEvent` now lives in `apps/web-next/src/lib/cms.ts`
  (reads Directus directly, matching V1 and every sibling V2 fetcher) — the
  old `lib/api-ssr.ts::fetchEvent` that pointed at a nonexistent `GET
  /v1/events/:id` NestJS route was removed. See `03-code-summary.md` in this
  workflow's task folder for the full file list and design decisions.
- The visibility-gating logic (`isGated` based on `visibility_scope`) is now
  ported to V2 as a fetch-level gate (verified by SecurityReviewer: the
  `Promise.all` of sub-fetches is skipped entirely when gated, not merely
  hidden in the template).
- OG card generation lives in `lib/og-template.tsx` + `lib/og-fonts.ts` +
  `pages/events/[id]/og-card.png.ts` (now present in both V1 `apps/web` and
  V2 `apps/web-next`).

### Known gaps (not blocking `Implemented` status, tracked for follow-up)

- **AC-5 (forum posting) has no E2E coverage.** TestDesigner/TestRunner's own
  test plan and results for this workflow only exercise AC-7/AC-8 (og-card,
  404) end-to-end automatically; AC-1/2/3/4 were spot-checked manually (tab
  rendering, `?tab=` SSR routing, gate rendering) rather than covered by a
  passing automated E2E scenario, and AC-5 (posting a question, optimistic
  prepend) was not exercised at all this workflow — neither automated nor
  manual. The forum posting *feature itself* predates this workflow (`Forum
  tab` UI + `POST /v1/events/:id/questions` already existed going in); this
  gap-closure did not touch that write path. Left unchecked above rather than
  marked verified-by-this-workflow. A follow-up should add a
  `smoke-event-forum-posting.spec.ts` E2E scenario.
- **`invite_only` currently behaves identically to `members_only`.** Per the
  Directus schema's own design, `invite_only` events are "accessible only via
  direct link share" — there is no additional invite-token/allow-list check
  layered on top of the `members_only` gate in this implementation. This is
  not a bug relative to the schema's documented intent, but it means the
  functional-scope line 9 language ("`invite_only` events: additionally
  require explicit invite") is not literally implemented as a distinct
  mechanism today — worth an explicit product decision if a stronger
  per-invite check is actually wanted later.
- **`apps/api` has no public `GET /v1/events` listing route.** This is a
  pre-existing gap unrelated to this FR (which only covers the *detail*
  page), but it limited this workflow's E2E coverage depth: the events
  *listing* page has no discoverable links for the E2E spec's discovery step
  to find, so 8 of 14 lifecycle/gating E2E scenarios fall back to
  `test.skip` rather than running fully automated. Recommended follow-up:
  add the missing public listing route so future `/events/[id]` E2E suites
  don't need manual spot-checks for lifecycle tabs and the `members_only`
  gate.
- **JSON-LD `Event` schema / `og:type=event`** (functional-scope item 10) was
  not added in this workflow — out of the 11 enumerated implementation tasks
  and not referenced by any of the 8 ACs. V1's page already emits this; a
  future pass can port it if needed.

### Architectural findings from requirement validation (2026-07-30, wf-20260730-feat-155)

- **`business_process`: only `BP-UAT-010` (Event registration flow) matches** —
  it's the only registered BP-UAT touching this page's surface (the
  registration sidebar/CTA). No BP-UAT script covers the forum Q&A, photos
  gallery, lifecycle tabs, venue/map, or OG card in isolation — this is a
  genuine registry gap, not an oversight in this pass. Flagging for a future
  `ISS-UAT-COV-*` follow-up rather than inventing a code per protocol.md
  guidance.
- **`fetchEvent` route gap (blocking, needs a decision before CodeDeveloper starts).**
  V2's `apps/web-next/src/lib/api-ssr.ts::fetchEvent` calls `GET
  /v1/events/:id` on the NestJS API — but **no controller implementing that
  route exists anywhere in `apps/api/src`** (only `v1/workspace/events/:id`,
  an authenticated operator-only endpoint, and `v1/events/:id/questions`,
  write-only). By contrast, every *other* V2 event sub-fetcher
  (`fetchEventSpeakers`/`Materials`/`Sponsors`/`Questions` in
  `lib/cms.ts`) reads straight from Directus's public/anonymous policy —
  matching V1's pattern exactly (V1's own `fetchEvent` in `apps/web/src/lib/cms.ts`
  also reads Directus directly via `/items/events/:id`, never the Nest API).
  **Two viable paths, need a decision, not an assumption:**
  (a) add `fetchEvent` to `web-next/src/lib/cms.ts` reading Directus directly
  (consistent with every sibling fetcher and with V1), or
  (b) build the missing public `GET /v1/events/:id` Nest endpoint (new API
  surface, more work, but centralizes tenant-filtering logic in one place
  per the architecture doc's stated multi-tenancy model).
  Recommendation: (a), since it matches both V1 precedent and every other
  V2 sub-fetcher already in this same file — CodeDeveloper should treat this
  as the default unless told otherwise.
- **Country-mismatch 404 is a NEW behavior, not a port.** Neither V1 nor the
  current V2 page actually returns a 404 for a wrong-country or
  not-found event — both collapse "not found" and "country mismatch" into
  the same `null` return from `fetchEvent`, which the page turns into a
  **302 redirect to `/events`** (`apps/web/src/pages/events/[id].astro` line
  ~39, `apps/web-next/.../[id].astro` line ~44). V1's `fetchEvent` already
  does compute the mismatch (`body.data.country !== country` after
  resolving tenant via `countryFromHost(host)`, which reads the first
  label of the `Host` header, defaulting to `uz`) but discards the
  distinction before returning. AC-8 in this FR requires an actual `404`
  status, which means: **the page (or the fetch helper) must distinguish
  "not found" from "found but wrong tenant" and return a real 404 response
  for both** per the FR's own route description ("Returns 404 if event not
  found, not published, or belongs to a different country"). This is a
  behavior change beyond what either codebase does today — call it out
  explicitly in the PR description, don't silently fold it into "porting
  V1 forward."
- **`recapMd` / `livestreamUrl` are missing from V2's `ApiEvent` type**
  (`apps/web-next/src/lib/types.ts`). V1's Directus fetch already reads
  `recap_md` and `livestream_url` as real fields on the `events`
  collection (confirmed in `apps/web/src/lib/cms.ts`), distinct from the
  `externalLinks[].kind === 'livestream'` pill V2 currently has. Whichever
  path is chosen for the `fetchEvent` gap above, these two fields need to
  be added to `ApiEvent` and mapped from the same Directus columns V1
  already uses — do not conflate them with `externalLinks`.
- **`event_photos` has no V2 fetcher yet.** V1's `lib/cms.ts` has
  `fetchEventPhotos`; V2's `lib/cms.ts` has no equivalent. Needs porting
  alongside the other sub-fetchers, gated by `isGated` and shown Finished-tab
  only per functional scope item 7.
- **Lifecycle state derivation** (upcoming / live / finished) is computed
  client/server-side from `now` vs. `startsAt`/`endsAt` — confirmed by V1's
  precedent (`VALID_TABS` + tab default selection in
  `apps/web/src/pages/events/[id].astro`): `now < startsAt` → upcoming,
  `startsAt <= now <= endsAt` → live, `now > endsAt` → finished. No new
  event-status field is introduced; `status` (`draft`/`published`/`cancelled`)
  is orthogonal to lifecycle and already gates publish-visibility separately.
