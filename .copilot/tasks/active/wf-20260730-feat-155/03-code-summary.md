# Code Summary — FR-EVT-004 (Event detail page gap-closure)

Workflow: `wf-20260730-feat-155` · Agent: CodeDeveloper

## Requirement Implemented

FR-EVT-004 gap-closure in `apps/web-next` (V2): lifecycle-adaptive tabs
(upcoming/live/finished/forum via SSR-only `?tab=` routing), venue/map
block, Finished-tab photo gallery, recap + inline recording players,
Live-tab livestream panel, fetch-level visibility gating
(`members_only`/`invite_only`), a real 404 (not a 302) for not-found OR
wrong-country events (AC-8), and the dynamic OG card image route
(AC-7). Followed `02-impact-analysis.md` precisely — no deviations from
its recommended design decisions (fetchEvent → `cms.ts`; `isGated` via
`Astro.locals.auth?.me`; SSR `?tab=` tabs, not `kit/Tabs.tsx`; `fetchEvent`
returns `ApiEvent | null` with country-check folded in).

## Files Changed

| File | Change Type | Description |
|---|---|---|
| `apps/web-next/src/lib/types.ts` | modify | Added `latitude`, `longitude`, `mapUrl`, `recapMd`, `livestreamUrl`, `updatedAt` to `ApiEvent`; added new `EventPhoto` interface. |
| `apps/web-next/src/lib/cms.ts` | modify | Added `fetchEvent(req, id)` (reads Directus `/items/events/:id` directly — no NestJS route exists), `countryFromHost(host)`, `toApiEvent`, `CmsEventRow`, external-links/coord normalization helpers, and `fetchEventPhotos(eventId)`. All ported from V1's `apps/web/src/lib/cms.ts` with V2's own `directusBase()`/`get()` helpers reused instead of V1's module-level `BASE`. |
| `apps/web-next/src/lib/api-ssr.ts` | modify | Removed the dead `fetchEvent` (was calling nonexistent `GET /v1/events/:id` on `apps/api`). `fetchUpcomingEvents`/`fetchActiveEvents`/etc. untouched. |
| `apps/web-next/src/lib/api-ssr.test.ts` | modify | Removed the stale `fetchEvent` local-mirror helper + its `describe` block (was testing the deleted Nest-API code path); left a pointer comment to `lib/cms.ts`'s new coverage. |
| `apps/web-next/src/lib/video-embed.ts` | create | New pure-function module: `recordingEmbedSrc(url)` (YouTube/Vimeo → nocookie-embed URL detector, ported from V1's inline helper) and `splitRecordings(materials)` (extracts embeddable `recording`-kind materials out of the general materials list). Extracted to a standalone module per the impact analysis's suggestion — easily unit-testable, no Astro frontmatter coupling. |
| `apps/web-next/src/lib/og-template.tsx` | create | Verbatim port of V1's Satori JSX OG-card template, importing `ApiEvent`/`EventSpeaker` from web-next's `./types` instead of V1's `./api`. |
| `apps/web-next/src/lib/og-fonts.ts` | create | Verbatim port of V1's Geist-TTF loader (resolves via `require.resolve('geist/font/sans')`). |
| `apps/web-next/src/pages/events/[id]/og-card.png.ts` | create | New Satori+resvg PNG route, ported from V1 almost as-is, pointed at web-next's `cms.ts::fetchEvent`/`fetchEventSpeakers`. Independently re-checks `visibilityScope !== 'public'` → 404 (no session exists at scrape time; not unified with the page's `isGated`). |
| `apps/web-next/src/blocks/customer/EventDetail.astro` | modify | Added `activeTab`/`tabHref` props, the lifecycle tab strip (`VALID_TABS` export, SSR `<a href>` links, `role="tablist"`/`role="tab"`), and named slots (`venue-map`, default, `live`, `finished`, `forum`) so the page composes tab-specific blocks without this block importing them. Upcoming-tab content (date/venue/about/agenda/links) is gated to `activeTab === 'upcoming'` inside the block. |
| `apps/web-next/src/blocks/customer/VenueMap.astro` | create | OSM iframe (renders when both `latitude`/`longitude` present) + Google/Yandex deep-links (coords-first, address-fallback) + optional operator `mapUrl` click-through. Ported from V1's inline `mapEmbedSrc`/`externalMaps` logic. |
| `apps/web-next/src/blocks/customer/EventPhotoGallery.astro` | create | Finished-tab photo grid from `EventPhoto[]`, ported from V1's photos section. |
| `apps/web-next/src/blocks/customer/EventRecap.astro` | create | Finished-tab recap markdown (via existing `MarkdownBody`) + inline recording players (16:9 iframe embeds), ported from V1. |
| `apps/web-next/src/blocks/customer/LivestreamPanel.astro` | create | Live-tab: embeddable livestream (iframe), click-through Join button (non-embeddable provider), or empty state — ported from V1, using the shared `recordingEmbedSrc()` from `lib/video-embed.ts`. |
| `apps/web-next/src/blocks/customer/index.ts` | modify | Added barrel exports for `EventPhotoGallery`, `EventRecap`, `LivestreamPanel`, `VenueMap`. |
| `apps/web-next/src/pages/events/[id].astro` | modify | Full rewrite of the frontmatter + template: real 404 via `new Response(null, { status: 404 })` on `fetchEvent` miss (folds not-found/unpublished/wrong-country into one `null`, matching the idiomatic V2 404 pattern already used by `survey.astro`); `isGated` via `Astro.locals.auth?.me == null` gating every sub-fetch (`Promise.all` skipped entirely, all five arrays `[]`, when gated); lifecycle tab default derived from `now` vs `startsAt`/`endsAt`; `?tab=` routing via `tabHref`; wires `VenueMap`/`LivestreamPanel`/`EventRecap`+`EventPhotoGallery`/`ForumThread` into `EventDetail`'s named slots; dynamic OG-card `ogImage` wired into `PageHead` for public events only, cache-busted by `event.updatedAt`. |
| `apps/web-next/src/locales/en.json` | modify | Added missing `event_detail` keys: `address`, `view_map`, `map_title`, `open_google_maps`, `open_yandex_maps`, `tabs_label`, `tab_upcoming`/`tab_live`/`tab_finished`/`tab_forum`, `tab_live_empty_title`/`_body`, `livestream_title`/`livestream_join_body`/`_cta`, `tab_finished_empty_title`/`_body`, `recap`, `recordings`, `photos`, `photo_alt_fallback`, `members_only_title`/`_body`. Copy matches V1's `apps/web/src/locales/en.json`. |
| `apps/web-next/src/locales/ru.json` | modify | Same key set as `en.json`, Russian copy matching V1's `apps/web/src/locales/ru.json`. |
| `apps/web-next/package.json` | modify | Added `satori: ^0.28.2`, `@resvg/resvg-js: ^2.6.2`, `geist: ^1.7.2` (versions match `apps/web/package.json`). |
| `pnpm-lock.yaml` | modify | Regenerated via `pnpm install --no-frozen-lockfile` after the `package.json` dependency additions (3 packages added: `satori`, `@resvg/resvg-js`, `geist`). Root install had pre-existing unrelated peer-dep warnings (`vite`/`esbuild` in `apps/storybook`, `@zxing/browser` in `apps/web-next`) — neither touched by this change. |

## Key Design Decisions

1. **`fetchEvent` does the country check internally, not the page.** The
   impact analysis flagged this as an open call (R-3: tagged-union
   result vs. `ApiEvent | null` + page-side re-check). I chose a third,
   simpler variant: keep `fetchEvent(req, id): Promise<ApiEvent | null>`
   (matching every sibling fetcher's convention) but have it resolve
   `countryFromHost(req.headers.get('host'))` **inside** the function
   and fold "wrong country" into the same `null` as "not found" —
   exactly mirroring V1's own `fetchEvent`. This avoids a second,
   duplicated `countryFromHost` call at the page level (which the
   R-3-recommended shape would have required) and avoids leaving the
   `req` parameter unused (an initial draft without the internal check
   left `req` dead, flagged by `astro check` as a warning — fixed by
   giving `req` real work to do). The page now just does
   `if (!event) return new Response(null, { status: 404 })`.
2. **404 via `new Response(null, { status: 404 })`**, matching the
   existing idiom in `apps/web-next/src/pages/events/[id]/survey.astro`
   (`return new Response('No survey attached...', { status: 404 })`) —
   confirmed this is the established V2 pattern before choosing it, per
   the impact analysis's explicit instruction to check.
3. **`isGated` short-circuits the entire `Promise.all`, not per-fetch
   ternaries.** V1's pattern is `isGated ? [] : await fetchX()` repeated
   five times; V2's version destructures a single ternary returning
   either five `[]` literals or one `Promise.all([...])`, so there is
   exactly one gate check controlling all five fetches — same net
   effect (R-1: no gated sub-fetch ever executes), slightly less
   repetition. Confirmed via reading the built page frontmatter that no
   fetch call sits outside that ternary.
4. **`EventDetail.astro` keeps the Upcoming-tab content inline** (not
   extracted to its own sibling block) since it's this block's own
   original content (hero/date/venue/about/agenda/links), just now
   gated behind `activeTab === 'upcoming'`. New tab bodies (venue-map,
   live, finished, forum) are composed via **named slots** rather than
   props-with-JSX, following the exact convention already established
   by the existing default `sidebar` slot in this same file — this
   keeps `EventDetail.astro` from importing any of the new blocks
   directly (data-in/element-out discipline preserved).
5. **`recordingEmbedSrc` + `splitRecordings` extracted to
   `lib/video-embed.ts`** (new, no Astro-frontmatter coupling) rather
   than left inline in the page, per the impact analysis's suggestion
   that this pure function is easily unit-testable once extracted.
   TestDesigner can target this file directly.
6. **`Fragment slot="finished"`** used to pass two sibling blocks
   (`EventRecap` + `EventPhotoGallery`) into one named slot when
   `hasFinishedContent` is true; the empty-state `<div slot="finished">`
   is a separate top-level element when it's false. Astro supports
   multiple same-named-slot children from independent top-level
   elements (already the working pattern for `slot="sidebar"` in this
   same file with two siblings) — `Fragment` is Astro's documented
   mechanism for grouping more than one element under one slot name
   without an extra wrapper `<div>`.
7. **OG card `ogImage` wiring added to the page** even though not
   explicitly one of the 11 enumerated tasks, because AC-7 ("The OG
   card image at `/events/[id]/og-card.png` renders...") implies the
   page actually links to it, and `PageHead.astro` already had an
   `ogImage` prop built for exactly this purpose. Kept the
   `isPubliclyShareable` guard (skip linking it for gated events) so a
   non-public event's page never points at a URL its own og-card route
   will 404 on.

## Architecture Rule Compliance

- **Module boundaries**: no NestJS/DB/shared-types files touched (confirmed
  by `git status` — only `apps/web-next/**` + `package.json`/`pnpm-lock.yaml`
  changed, per the impact analysis's "code-only gap" classification).
- **Tenant scoping**: `fetchEvent` filters by `countryFromHost(host)`
  internally; no cross-tenant leak possible (wrong-country → same 404
  as not-found).
- **No cross-schema queries**: all new/modified fetchers read Directus
  directly via the existing `get<T>()`/`directusBase()` helpers already
  in `lib/cms.ts` — no new query patterns introduced.
- **No `any`**: verified via `astro check` (0 errors) — all new files
  use explicit interfaces (`CmsEventRow`, `CmsEventPhotoRow`,
  `RecordingMaterial`, etc.), no `any` casts.
- **Auth at controller level / server-verified signal**: `isGated` uses
  `Astro.locals.auth?.me != null` (V2's middleware-populated,
  verified-refresh-token signal), NOT V1's raw cookie-presence sniff —
  confirmed per R-2's explicit checklist item.
- **No inline `style=`**: initial `EventPhotoGallery.astro` draft used
  `style={{ aspectRatio: '4 / 3' }}`; caught during self-review and
  replaced with the Tailwind `aspect-[4/3]` utility class before
  finishing, per ADR-0038 §Locks #1 / standards.md Part VIII design-system
  tokens section.
- **Design tokens**: all new blocks use only existing Tailwind utility
  classes already used elsewhere in this file set (`border-border`,
  `text-muted-foreground`, `bg-card`, `bg-primary`, etc.) — no raw hex,
  no new tokens introduced.
- **Icon policy**: no new icons added (kept the existing `↗` arrow glyph
  convention already used by `MaterialsList`/`SponsorWall`/`ShareButtons`
  for external links, consistent with the rest of this file set — no
  Lucide icon was warranted for this gap-closure scope).

## Formatter Check

`pnpm biome check .` (run from `apps/web-next/`): **177 files checked,
0 errors.** 2 pre-existing warnings surfaced (`AsyncSelect.tsx`,
`TgBroadcastComposer.tsx` — both unrelated `biome-ignore` suppression
comments with no effect), neither in a file this workflow touched.

## Known Limitations

- **JSON-LD `Event` schema** (FR-EVT-004 functional-scope item 10,
  `og:type=event`) was NOT added to the page — the impact analysis's
  11 enumerated tasks did not include it, and it's separable from the
  AC-1..AC-8 acceptance criteria list (none of which mention JSON-LD
  explicitly). Flagging so a follow-up can pick it up if the business
  process actually requires it; V1's page does emit it
  (`apps/web/src/pages/events/[id].astro` lines ~117-155) if a future
  workflow wants to port it.
- **Hero image background** — `EventDetail.astro`'s existing header
  comment (kept as-is) already notes hero-image-as-background-CSS is
  deferred to a follow-up; this workflow did not touch that, consistent
  with it being out of the 11 enumerated tasks.
- **No new test files were written**, per instructions — TestDesigner
  owns `lib/cms.test.ts` (fetchEvent/fetchEventPhotos coverage) and any
  new coverage for `lib/video-embed.ts`. Existing test suite (943 tests,
  36 files) passes unchanged.

## Retry 2 fix — AC-8 404 body was leaking the requested path via Astro's default error page (2026-07-30)

TestRunner (`07-test-results.md`) found a real, confirmed, security-relevant
bug via live HTTP/E2E testing that neither my original source-level self-check
nor SecurityReviewer's read could have caught: `apps/web-next/src/pages/events/[id].astro`'s
`if (!event) return new Response(null, { status: 404 });` (line ~68) is
correct *at the application-code level* (it genuinely makes zero distinction
between not-found/unpublished/wrong-country), but in the real Astro
node-adapter runtime, a `null`/empty-bodied 404 response gets replaced by
Astro's own built-in default error page — which echoes the **original
requested URL path** into the body (`<pre>Path: {url.pathname}</pre>`-style).
Two different nonexistent/wrong-country event ids therefore produced two
different 404 bodies (each echoing its own requested path), breaking AC-8's
explicit byte-identical-404 requirement and reopening a country-enumeration
side channel.

**Fix applied**: changed the 404 response body from `null` to the literal
constant string `'not_found'` — matching the exact convention already used
by the sibling route `apps/web-next/src/pages/events/[id]/og-card.png.ts`
(`new Response('not_found', { status: 404 })`), which TestRunner had already
confirmed empirically returns genuinely byte-identical 404s because a
non-null body gives Astro's node adapter no reason to substitute its default
error page. Only this one response construction changed; no other line in
the file was touched. Added a doc comment above the `if (!event)` block
explaining why the body must be a real constant string, referencing this
workflow/attempt for future readers.

**Empirical verification performed** (not just a compile check, per the
task's explicit instruction):
1. `pnpm --filter @aiqadam/web-next typecheck` → 0 errors, 0 warnings, 41
   pre-existing hints (identical to TestRunner's attempt-1 baseline).
2. `pnpm biome check .` (repo-wide, matching TestRunner's own method since
   biome's glob matcher treats the bracketed `[id].astro` filename as a
   character class and silently matches 0 files when passed directly as a
   path arg — confirmed this is a pre-existing biome/shell quirk, not new):
   84 errors, all attributable to the same pre-existing, untracked,
   gitignored `apps/e2e/uat-results/` trace bundle TestRunner already
   documented; 1 pre-existing warning (`AsyncSelect.tsx:251`, unrelated,
   untouched). Zero errors/warnings in `apps/web-next/src/pages/events/[id].astro`
   itself (confirmed via targeted grep over the full-repo output).
3. Built `apps/web-next` locally (`INTERNAL_DIRECTUS_URL=http://localhost:8200
   pnpm --filter @aiqadam/web-next build`) — succeeded (`Server built in
   1.85s` / `Complete!`; the same known Windows-only libuv teardown
   assertion crash on process exit that TestRunner already logged as
   unrelated to build correctness recurred here too, `dist/` fully
   populated afterward).
4. Started the built server (`node ./dist/server/entry.mjs`, port 4322)
   against the already-running local Directus container and curl'd two
   different genuinely-nonexistent event ids directly:
   - Both returned `HTTP/1.1 404 Not Found`, `content-type:
     text/plain;charset=UTF-8`, body `not_found` (9 bytes) — confirmed
     byte-identical via `diff` and `xxd` hex comparison of the two response
     bodies.
   - Additionally tested the wrong-country case directly (real published
     UZ event `454474ca-de0d-4cb1-834c-06269c68b426` requested with `Host:
     kz.aiqadam.org`) against a genuinely-nonexistent id on the same host —
     both returned the identical `404` / `not_found` response, confirming
     AC-8's core security property (not-found and wrong-country are
     indistinguishable) now holds at the actual HTTP layer, not just in the
     application source.
   - Stopped the test server afterward (no lingering process left running).

No other files were changed for this retry — single-line-class fix as
instructed.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "FR-EVT-004 gap-closure implemented in apps/web-next per the impact analysis's file-by-file plan: fetchEvent/fetchEventPhotos moved to cms.ts reading Directus directly (dead Nest route removed from api-ssr.ts + stale test block removed); ApiEvent/EventPhoto types extended; lifecycle tabs (SSR ?tab= routing, not kit/Tabs.tsx); fetch-level isGated using Astro.locals.auth?.me; real 404 for not-found/wrong-country; venue/map, photo gallery, recap+recordings, and livestream blocks created and wired via named slots; OG card route + og-template.tsx + og-fonts.ts ported, satori/@resvg/resvg-js/geist added to package.json and pnpm install run; missing event_detail i18n keys added to both locales; barrel exports updated. typecheck: 0 errors. biome check: 0 errors (177 files, 2 pre-existing unrelated warnings). build: succeeds. existing test suite: 943/943 passing, unchanged. RETRY 2 (this attempt): fixed the AC-8 404-body leak TestRunner found via live HTTP/E2E testing — apps/web-next/src/pages/events/[id].astro's `new Response(null, {status: 404})` let Astro's node-adapter runtime substitute its own path-echoing default error page for the not-found/wrong-country case, breaking AC-8's byte-identical-404 requirement. Changed to `new Response('not_found', {status: 404})`, matching the sibling og-card.png.ts route's already-correct literal-string-body convention. Verified empirically (not just compiled): typecheck clean (0 errors, matches baseline), biome clean on the changed file (repo-wide run shows the same 84 pre-existing uat-results/-only errors and 1 unrelated pre-existing warning TestRunner already documented), and — critically — built + started apps/web-next locally against the local Directus container and curl'd two different nonexistent event ids plus a wrong-country real-event request, confirming via diff/xxd that all three now return byte-identical `404 Not Found` / `not_found` (9-byte) responses. No other files touched."
  findings: []
```
