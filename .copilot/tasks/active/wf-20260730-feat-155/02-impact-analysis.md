# Impact Analysis — FR-EVT-004 (Event detail page gap-closure)

Workflow: `wf-20260730-feat-155` · Agent: ImpactAnalyzer

## Validated Requirement

**FEAT-EVT-004** — `/events/[id]` gap-closure. V2 (`apps/web-next`) ships
speakers/materials/sponsors/forum only; missing: lifecycle-adaptive tabs
(upcoming/live/finished), photos gallery, recap/livestream embed, venue+map
block, visibility gating (`members_only`/`invite_only`), country-mismatch/
not-found 404, and the OG card image route. RequirementAnalyst resolved 3
blocking ambiguities (see `01-requirement-validation.md`), all independently
re-verified against the current tree below — no discrepancies found.

## Verification of RequirementAnalyst's Findings

All five claims checked directly against source, confirmed accurate:

1. **`fetchEvent` route gap** — confirmed. `apps/web-next/src/lib/api-ssr.ts`
   line 74-84 calls `GET /v1/events/${id}` on `apps/api`. Grepped
   `apps/api/src` for any controller matching `v1/events/:id` (public,
   read) — none exists. V1's own `fetchEvent`
   (`apps/web/src/lib/cms.ts` line 774-790) reads Directus directly and
   is the only `fetchEvent` implementation that actually works end-to-end
   today. Recommendation adopted as-is: **add `fetchEvent` to
   `apps/web-next/src/lib/cms.ts`**, matching V1 precedent and every
   sibling V2 fetcher (`fetchEventSpeakers`/`Materials`/`Sponsors`/`Questions`)
   already in that same file.
2. **AC-8 (404) is new behavior** — confirmed. Both `apps/web/src/pages/events/[id].astro`
   line 38-40 and `apps/web-next/src/pages/events/[id].astro` line 43-45
   do `if (!event) return Astro.redirect('/events', 302)`. Neither
   distinguishes not-found from wrong-country.
3. **`recapMd`/`livestreamUrl` missing from V2's `ApiEvent`** — confirmed.
   `apps/web-next/src/lib/types.ts` lines 17-41: no `recapMd`,
   `livestreamUrl`, `latitude`, `longitude`, or `updatedAt` fields. V1's
   equivalent (`apps/web/src/lib/api.ts` lines 14-61) has all of them.
4. **`event_photos` has no V2 fetcher** — confirmed. `apps/web-next/src/lib/cms.ts`
   (740 lines) has no `fetchEventPhotos`/`EventPhoto` anywhere. V1's
   `apps/web/src/lib/cms.ts` lines 948-995 has the full implementation.
5. **Lifecycle derivation** — confirmed against `apps/web/src/pages/events/[id].astro`
   lines 245-250 (`now >= endsAtMs ? 'finished' : now >= startsAtMs ? 'live' : 'upcoming'`).

## Additional findings from this pass (not yet surfaced)

- **`satori`, `@resvg/resvg-js`, and `geist` are NOT in `apps/web-next/package.json`.**
  V1's `apps/web/package.json` has all three (`satori: ^0.28.2`,
  `@resvg/resvg-js: ^2.6.2`, `geist: ^1.7.2`); web-next's dependency list
  (checked in full) has neither. The OG card route cannot be built
  without adding these three packages to `apps/web-next/package.json`
  and running `pnpm install` — this is a real `pnpm`-workspace change,
  not just new source files. Per CLAUDE.md, CodeDeveloper (or whoever
  runs the install) uses `pnpm`, not `npm`/`yarn`.
- **V2 already has a server-verified auth signal that is architecturally
  *better* than V1's gating check — use it, don't port V1's version.**
  V1's `isGated` (`apps/web/src/pages/events/[id].astro` line 45-46) uses
  `Astro.cookies.get('aiqadam-refresh')?.value !== undefined` — a raw
  cookie-presence sniff, not a verified session. V2's
  `apps/web-next/src/blocks/common/AppNav.astro` line 30 (and
  `apps/web-next/src/env.d.ts`) show the established V2 pattern:
  `Astro.locals.auth?.me != null`, populated by `middleware.ts` from a
  **verified** refresh-token exchange, explicitly built to fix a race
  where cookie-presence and actual session state disagreed
  (`ISS-USR-REDIRECT-001` context in that file). CodeDeveloper should
  gate `isGated` on `Astro.locals.auth?.me != null`, not reimplement
  V1's cookie sniff — this is a straight improvement, same effort.
- **V2's `Tabs` kit (`apps/web-next/src/kit/Tabs.tsx`) is a client-side
  Radix component (`'use client'`) — do NOT use it for the lifecycle
  tab strip.** V1's tab pattern (`VALID_TABS` + `?tab=` query param +
  server-computed `activeTab` + plain `<a>` links, `apps/web/src/pages/events/[id].astro`
  lines 32, 236-255, 327-338) is SSR-only, deep-linkable, and needs zero
  client JS — consistent with this page's `prerender = false` SSR model
  and ADR-0038's Astro-pages-for-content-heavy-surfaces principle.
  Forcing the Radix `Tabs` kit here would add an unnecessary client
  island and lose deep-linkability unless significant extra plumbing is
  built. Recommend porting V1's link-based tab strip pattern into the
  `EventDetail.astro` block (or a new sibling block), not `kit/Tabs`.
- **`api-ssr.test.ts` has a `fetchEvent` describe block that will go
  stale/misleading once `fetchEvent` moves to `cms.ts`.**
  `apps/web-next/src/lib/api-ssr.test.ts` lines 180-193 and 569-618
  locally re-implement a narrow `fetchEvent` (5-field `ApiEvent`, calling
  `/v1/events/:id` on the Nest API) and assert against it. This test
  passes today but tests a code path that will no longer exist once
  `fetchEvent` moves to `lib/cms.ts` reading Directus. TestDesigner /
  CodeDeveloper must either delete this describe block (with a comment
  pointing at the new `cms.test.ts` coverage) or it will silently test
  dead code while giving false confidence.
- **No `apps/web-next/src/lib/cms.test.ts` exists yet** (checked via
  Glob) — there's no existing unit-test file for `lib/cms.ts` at all in
  web-next. Whatever test file TestDesigner specifies for the new
  `fetchEvent`/`fetchEventPhotos` will be a new file, not an addition to
  an existing suite.
- **V1's OG card route's visibility gate is duplicated logic vs. the
  page's own `isGated`** — both independently check
  `visibilityScope !== 'public'`. This is intentional (the route has no
  session to check against — it 404s any non-public event unconditionally,
  since a scraper preview should never be able to distinguish
  "members-only, you're not signed in" from "doesn't exist"). Carry this
  forward as-is in V2's og-card route; do not try to unify it with the
  page's session-aware `isGated`.
- **`apps/web-next/src/pages/events/[id]/survey.astro` already exists**
  as a sibling route under `events/[id]/` — confirms the routing
  convention for adding `og-card.png.ts` as a new sibling file under the
  same `events/[id]/` directory is already established in V2, not a new
  pattern.

## Affected Layers

### API (NestJS)

No NestJS changes. No new endpoint is being built (Decision: read
Directus directly per the recommendation above, not build
`GET /v1/events/:id`). `EventQuestionsController`
(`v1/events/:id/questions`, write path for forum posts) is unaffected —
already wired and out of scope.

| Module | Change |
|---|---|
| `apps/api/src/modules/events/*` | none |
| `apps/api/src/modules/content/*` (Directus bridge) | none |

### DB Changes Required: no

All fields/collections this FR needs already exist in the Directus
schema bootstrap (`infrastructure/directus/bootstrap.sh`, verified by
direct grep):
- `events.visibility_scope` — line 3783-3796 (`F-S3.10-a`)
- `events.latitude` / `events.longitude` — lines ~3840-3856 (`F-WebU2`)
- `events.recap_md` — line 3858-3867 (`F-WebU9`)
- `events.livestream_url` — line 3869-3877 (`F-WebU10`)
- `event_photos` collection + `event -> events` and `file -> directus_files`
  relations + public-policy read permission — lines 3963-4032 (`F-WebU9`)

This is a **code-only gap**: V2 simply never wrote the fetchers/types/UI
that read these already-existing fields. **No DBMigrationAuthor step —
Step 3 should be skipped.**

### Shared Types

`packages/shared-types/` — not used by this surface (V2's `ApiEvent` /
`EventSpeaker` / etc. live in `apps/web-next/src/lib/types.ts`, a
web-next-local file per that module's own header comment, not the
monorepo shared-types package). No `packages/shared-types` changes.

### Frontend (apps/web-next) — the entire scope of this FR

| File | Change | Notes |
|---|---|---|
| `apps/web-next/src/lib/types.ts` | **modify** | Add to `ApiEvent`: `recapMd?`, `livestreamUrl?`, `latitude?`, `longitude?`, `mapUrl?`, `updatedAt?` (all optional/nullable, additive — matches V1's `api.ts` shape). Add new `EventPhoto` interface (mirror V1's, lines 93-100 of `apps/web/src/lib/api.ts`). |
| `apps/web-next/src/lib/cms.ts` | **modify** | Add `fetchEvent(req, id)` reading `/items/events/:id` from Directus, resolving country via a `countryFromHost` helper (V2 doesn't have one yet — V1's lives in `apps/web/src/lib/cms.ts` lines 196-201, needs porting or a local equivalent), returning a **3-way result** distinguishing not-found / wrong-country / found (see AC-8 note below — do not collapse to a single `null`). Add `fetchEventPhotos(eventId)` (port V1's `apps/web/src/lib/cms.ts` lines 963-995 pattern, matching the existing sibling fetchers' style already in this file). |
| `apps/web-next/src/lib/api-ssr.ts` | **modify** | Remove `fetchEvent` (lines 74-84) — it moves to `cms.ts`. Update the one caller (`pages/events/[id].astro`) to import from `cms.ts` instead. `fetchUpcomingEvents`/`fetchActiveEvents` etc. in this file are unrelated and stay untouched (they hit real, existing `apps/api` endpoints). |
| `apps/web-next/src/lib/api-ssr.test.ts` | **modify** | Remove or repoint the `fetchEvent` describe block (lines 180-193, 569-618) — it tests a code path being deleted. |
| `apps/web-next/src/pages/events/[id].astro` | **modify** | Add: real 404 on not-found/wrong-country (AC-8); lifecycle tab computation + `?tab=` routing (port V1's `VALID_TABS`/`defaultTab`/`tabHref` pattern, lines 32-33, 236-255); `isGated` check using `Astro.locals.auth?.me != null` (NOT V1's cookie sniff); conditional sub-fetch calls (`isGated ? [] : await fetchX(...)`, matching V1's gating-per-fetch pattern lines 48-53); wire the new venue/map, photos, recap/livestream blocks into the appropriate tabs; wire `fetchEventPhotos`. |
| `apps/web-next/src/blocks/customer/EventDetail.astro` | **modify** | Currently a flat single-view block (hero + about + agenda + links, no tabs — see header comment lines 12-13 admitting "map embed + tabs deferred"). Needs either: (a) restructured internally to accept an `activeTab` prop and render tab-specific sections, or (b) kept as the "upcoming" view and given sibling blocks for live/finished. Recommend (a) for cohesion with V1's single-page-multi-tab structure, but this is a CodeDeveloper design call, not dictated here. |
| New: `apps/web-next/src/blocks/customer/VenueMap.astro` (or inline in EventDetail) | **create** | OSM iframe + Google/Yandex deep-links, port V1's `mapEmbedSrc`/`externalMaps` logic (`apps/web/src/pages/events/[id].astro` lines 190-218). |
| New: `apps/web-next/src/blocks/customer/EventPhotoGallery.astro` (or similar) | **create** | Grid of `event_photos`, Finished-tab only, port V1's photos section (lines 585-617). |
| New: recap/livestream section (block or inline) | **create** | `recapMd` render (markdown-lite, can reuse `apps/web-next/src/blocks/common/MarkdownBody.astro` already imported by `EventDetail.astro`) + livestream embed/join-CTA, port V1's `recordingEmbedSrc()` YouTube/Vimeo detection helper (lines 59-84) and Live-tab logic (lines 516-546). |
| New: `apps/web-next/src/pages/events/[id]/og-card.png.ts` | **create** | Port V1's route almost as-is (`apps/web/src/pages/events/[id]/og-card.png.ts`), pointing at the new `cms.ts::fetchEvent` + `fetchEventSpeakers` (already in V2's `cms.ts`). |
| New: `apps/web-next/src/lib/og-template.tsx` | **create** | Port V1's Satori JSX template verbatim (`apps/web/src/lib/og-template.tsx`) — no V2-specific changes needed, it's a pure render function taking `ApiEvent`/`EventSpeaker[]`. |
| New: `apps/web-next/src/lib/og-fonts.ts` | **create** | Port V1's font loader verbatim (`apps/web/src/lib/og-fonts.ts`) — resolves Geist TTFs via `require.resolve('geist/font/sans')`. |
| `apps/web-next/package.json` | **modify** | Add `satori`, `@resvg/resvg-js`, `geist` as dependencies (versions matching `apps/web/package.json`: `^0.28.2`, `^2.6.2`, `^1.7.2`). Requires `pnpm install` — flagged per CLAUDE.md (`pnpm db:migrate` restriction doesn't apply, but this is still a lockfile-touching change worth calling out explicitly in the PR). |
| `apps/web-next/src/locales/en.json` + `ru.json` | **modify** | `event_detail` namespace is missing (checked both files in full): `tabs_label`, `tab_upcoming`/`tab_live`/`tab_finished`/`tab_forum`, `tab_live_empty_title`/`_body`, `livestream_title`/`livestream_join_body`/`_cta`, `tab_finished_empty_title`/`_body`, `recap`, `recordings`, `photos`, `photo_alt_fallback` (this one already exists in V2, confirmed), `members_only_title`/`_body`, `view_map`, `map_title`, `open_google_maps`/`open_yandex_maps`, `address`. Cross-reference against V1's `apps/web/src/locales/en.json` lines 85-151 for exact copy (both locale files need parity — V2's `ru.json` presumably has the same gap as `en.json`, not independently checked line-by-line but same namespace pattern applies). |
| `apps/web-next/src/blocks/customer/index.ts` | **modify** | Add barrel exports for any new blocks created above (VenueMap, photo gallery, etc.) following the existing alphabetized-ish pattern. |

### Bot / Workers

No changes. This FR is web-only surface.

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| *(none)* | — | No NestJS endpoint added/modified. `fetchEvent` moves from calling a nonexistent Nest route to calling Directus directly — this is a client-side (SSR fetch helper) change, not an API surface change. | No |

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| `apps/web-next` (`lib/cms.ts::fetchEvent`, new) | Directus | Direct HTTP, anonymous public policy — same pattern as every existing V2 `cms.ts` fetcher |
| `apps/web-next` (`pages/events/[id]/og-card.png.ts`, new) | Directus | Via `cms.ts::fetchEvent` + `fetchEventSpeakers` — no new call pattern |
| `apps/web-next` (`ForumThread` island, unchanged) | `apps/api` `EventQuestionsController` | Existing, write-path only, out of scope |

No new cross-module or cross-schema calls. Fully consistent with
architecture.md's Data ownership table (Directus owns its schema, reads
happen directly against it, no NestJS mediation required for public
content reads).

## Risk Flags

- **R-1 (Security Review Required — visibility gating correctness).**
  `isGated` must block ALL sub-fetches (speakers/materials/sponsors/
  photos/questions/recap/livestream), not just suppress rendering
  client-side — V1's bug class to avoid is fetching gated data and
  relying on the template to hide it (data still reaches the SSR
  response / can leak via view-source or a misordered conditional). V1's
  own pattern (`isGated ? [] : await fetchX(...)`) gets this right; V2
  must replicate the fetch-level gate, not a render-level one. The
  current V2 page (per the FR's own Notes) "fetches unconditionally" —
  this is the actual security-relevant gap, not a cosmetic one. Flag for
  SecurityReviewer at the code-review gate.
- **R-2 (Architecture consistency — do not reintroduce the cookie-sniff
  auth pattern).** As detailed above, V2 has a strictly better,
  already-built server-verified auth signal (`Astro.locals.auth?.me`).
  Using V1's raw cookie-presence check instead would be a regression
  reintroduced by copy-pasting V1 too literally. Low probability given
  this is called out explicitly, but worth a CodeDeveloper
  self-check / reviewer checklist item.
- **R-3 (AC-8 implementation shape is genuinely ambiguous — flagging a
  design decision CodeDeveloper must make, not defer).** "distinguish
  not-found from found-but-wrong-country" needs a concrete return shape
  from the new `fetchEvent`. Two reasonable options: (a) `fetchEvent`
  returns a tagged union / discriminated result (e.g.
  `{ status: 'ok', event } | { status: 'not_found' } | { status: 'wrong_country' }`),
  or (b) `fetchEvent` returns the raw event regardless of country match
  and the **page** re-checks `event.countryCode` against
  `countryFromHost(Astro.request.headers.get('host'))` itself, 404-ing
  explicitly. (b) is simpler and keeps `fetchEvent`'s return type
  `ApiEvent | null` (matching every other fetcher's convention in this
  file), at the cost of one extra host-parsing helper needing to exist
  in `web-next` (doesn't yet — needs porting/writing, small). Recommend
  (b) for consistency with the rest of `cms.ts`'s null-on-miss
  convention; note this as an open call for CodeDeveloper, not dictated.
- **R-4 (package.json/lockfile change — not just source files).** Adding
  `satori`/`@resvg/resvg-js`/`geist` means `pnpm install` must run and
  `pnpm-lock.yaml` will change. Not a migration, not destructive, but
  worth flagging so CodeDeveloper doesn't forget the install step before
  the build/typecheck gate runs, and so PRSteward/quality-gate isn't
  surprised by an unrelated-looking lockfile diff in the PR.
- **No architecture-rule violations found.** No cross-schema queries, no
  new module boundary crossings, no stack deviation. `failed-escalate` is
  not warranted.

## Test Scope

- **Unit (Vitest):**
  - New `apps/web-next/src/lib/cms.test.ts` (doesn't exist yet) covering
    `fetchEvent` (found / not-found / wrong-country / Directus-unreachable
    → graceful fallback) and `fetchEventPhotos` (mirrors the existing
    per-fetcher test conventions once TestDesigner defines them — no
    existing `cms.ts` test file to pattern-match against in web-next, so
    TestDesigner should look at V1's test coverage for `cms.ts` if any
    exists, or design fresh against the sibling fetchers' error-handling
    contract, i.e. catch-and-return-`[]`/`null`, never throw).
  - `apps/web-next/src/lib/api-ssr.test.ts` — remove/repoint the stale
    `fetchEvent` block (flagged above).
  - Lifecycle tab derivation (`now` vs `startsAt`/`endsAt` → upcoming/live/finished)
    as a pure function, if CodeDeveloper extracts it (recommended, since
    V1 has it inline in Astro frontmatter, untested — an extractable
    pure function is easily unit-testable and worth the small refactor).
- **Integration:** None required — no NestJS/DB layer touched, no
  Testcontainers dependency. Directus reads are already covered by the
  existing "graceful degradation on fetch failure" pattern used
  throughout `cms.ts`; TestDesigner should follow that same convention
  (mock `fetch`, assert catch-and-default behavior) rather than standing
  up a real Directus instance for this FR.
- **E2E (Playwright, `apps/e2e`):** New or extended scenario for
  `/events/[id]`: upcoming/live/finished tab content per AC-1/2/3,
  members_only gate per AC-4, 404 on bad id / wrong country per AC-8,
  OG card 200 for public event + 404 for members_only per AC-7. Forum
  posting (AC-5) and venue/map deep-links (AC-6) may already have
  partial E2E coverage from the original PR 1.3/1.4 — TestDesigner should
  check `apps/e2e` for existing event-detail specs before writing new
  ones from scratch (not enumerated here — out of ImpactAnalyzer's
  verification scope, but worth a look before duplicating).
- **BP-UAT:** Per RequirementAnalyst's finding, only `BP-UAT-010` (Event
  registration flow) is registered for this surface — it covers the
  registration sidebar/CTA cross-tab presence, not the new tabs/photos/
  map/OG-card work specifically. No new BP-UAT script is being invented
  for this workflow (matches RequirementAnalyst's decision); a follow-up
  `ISS-UAT-COV-*` should eventually add coverage for forum/photos/
  lifecycle-tabs/map/OG-card, but that's out of scope here.

## Gate Result

gate_result:
  status: passed
  summary: "Impact fully analyzed. DB Changes Required: no — all Directus fields/collections (event_photos, recap_md, livestream_url, visibility_scope, latitude/longitude) already exist in infrastructure/directus/bootstrap.sh; this is a code-only gap in V2. ~14 files change/create in apps/web-next only (types, cms.ts, api-ssr.ts + test, the page, EventDetail.astro, 2-3 new blocks, og-card route + 2 new lib files, package.json, 2 locale files, barrel export). No NestJS/DB/shared-types/bot/worker changes. Step 3 (DBMigrationAuthor) should be skipped."
  findings:
    - "DB Changes Required: no — verified directly against infrastructure/directus/bootstrap.sh: events.visibility_scope (line ~3784), events.latitude/longitude (~3840-3856), events.recap_md (~3859), events.livestream_url (~3870), and the full event_photos collection + relations + public-read permission (lines 3963-4032) all already exist. Skip Step 3."
    - "satori, @resvg/resvg-js, geist are absent from apps/web-next/package.json (present in apps/web/package.json) — must be added for the OG card route; requires pnpm install, a lockfile change CodeDeveloper should call out explicitly in the PR."
    - "V2 already has a strictly-better server-verified auth signal (Astro.locals.auth?.me != null, populated by middleware.ts, see blocks/common/AppNav.astro line 30) than V1's raw cookie-presence sniff (Astro.cookies.get('aiqadam-refresh')?.value !== undefined). CodeDeveloper must use the V2 pattern for isGated, not port V1's — this is a correctness improvement, not a style preference, since V1's own header comments describe the exact race condition the V2 pattern was built to fix."
    - "V2's kit/Tabs.tsx is a client-side Radix component ('use client') and should NOT be used for the lifecycle tab strip — port V1's SSR-only ?tab= query-param + plain <a> link pattern instead (VALID_TABS, defaultTab, tabHref in apps/web/src/pages/events/[id].astro) to preserve deep-linkability and avoid an unnecessary client island on a prerender=false content page."
    - "apps/web-next/src/lib/api-ssr.test.ts (lines 180-193, 569-618) has a fetchEvent test block against the OLD /v1/events/:id Nest-API code path that is being deleted — must be removed/repointed or it will test dead code."
    - "R-1 security flag: isGated must gate every sub-fetch (speakers/materials/sponsors/photos/questions/recap/livestream) at the fetch level, matching V1's `isGated ? [] : await fetchX()` pattern — current V2 page fetches unconditionally per the FR's own Notes, which is the actual vulnerability this FR closes, not just a UI gap. Flag for SecurityReviewer."
    - "R-3 open design call (not blocking): AC-8's 404 needs a decision on whether fetchEvent returns a tagged not-found/wrong-country/ok union, or stays ApiEvent | null with the page re-deriving countryCode-vs-host itself. Recommended: keep ApiEvent | null (matches every sibling fetcher's convention in cms.ts) and let the page do the country re-check + explicit 404 — but this is CodeDeveloper's call to make, not dictated."
    - "No architecture-rule violations — no cross-schema queries, no new module-boundary crossings, no stack deviation. failed-escalate not warranted."
