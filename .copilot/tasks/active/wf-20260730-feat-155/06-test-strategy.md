# Test Strategy — FR-EVT-004 (Event detail page gap-closure)

Workflow: `wf-20260730-feat-155` · Agent: TestStrategist

## Requirement

**FEAT-EVT-004** — `/events/[id]` gap-closure in `apps/web-next` (V2). Adds
lifecycle-adaptive tabs (upcoming/live/finished/forum via SSR `?tab=`
routing), fetch-level visibility gating (`members_only`/`invite_only`), a
real 404 for not-found/wrong-country (AC-8, new behavior — not a port),
venue+map block, Finished-tab photo gallery + recap + recordings, Live-tab
livestream panel, and a dynamic OG card route (AC-7). All 8 ACs from
`01-requirement-validation.md` apply. CodeDeveloper's implementation is
complete (`03-code-summary.md`); SecurityReviewer already confirmed R-1
(fetch-level gating) and AC-8 (no differentiated 404) are correct at the
code level (`04-security-review.md`) — this strategy defines the
regression-test net around that already-verified behavior, not a
first-pass security audit.

## Rubric Score

| Criterion | Applies? | Points |
|---|---|---|
| Touches tenant-scoped data | Yes — `fetchEvent`'s `countryFromHost` tenant filter (AC-8) | +2 |
| New API endpoint | No — no NestJS route added; `fetchEvent` reads Directus directly | 0 |
| Business rule with edge cases (capacity, waitlist, dates) | Yes — lifecycle derivation (`now` vs `startsAt`/`endsAt`) has boundary conditions (`now === startsAt`, `now === endsAt`) | +2 |
| Cross-module service call | No — Directus reads only, same pattern as every sibling `cms.ts` fetcher, no new cross-module edge | 0 |
| New database query | No — no new Directus collection/field; all fields already exist per impact analysis (`event_photos`, `recap_md`, `livestream_url`, `visibility_scope`, `latitude`/`longitude`) | 0 |
| Pure function / utility | Yes — `recordingEmbedSrc`, `splitRecordings`, lifecycle-tab derivation are pure | 0 |
| UI-only change (no logic) | Partially — new blocks (VenueMap, EventPhotoGallery, EventRecap, LivestreamPanel) are largely presentational | 0 |

**Score: 4** (tenant-scoped data +2, business-rule edge cases +2).

**Score ≥ 4 → Integration tests required per the rubric's letter.** However,
per the impact analysis's explicit test-scope guidance (echoed in
`02-impact-analysis.md`'s "Test Scope" section) and this codebase's own
established convention for `cms.ts` fetchers, "integration" here means
**mocked-`fetch` unit tests against `cms.ts`'s Directus HTTP boundary**, not
Testcontainers — there is no Postgres/Drizzle layer in this diff to stand up
a real database for (INV-10 in the security review: N/A, no Drizzle/Postgres
touched). Standing up a real Directus instance for this FR would test
Directus's own HTTP contract, not this codebase's logic, and no other
`cms.ts` fetcher in this file is tested that way (confirmed: zero
Testcontainers usage in `apps/web-next` — it's a Vitest + mocked-`fetch`
codebase throughout, per `api-ssr.test.ts` and `cms-landing-page.test.ts`).
**Deviation from the rubric's literal "Testcontainers" prescription is
intentional and matches `docs/04-development/standards.md` §IV's own tiering
by observing what this specific service boundary actually is (external HTTP
API, not this repo's own Postgres).**

**Score < 6 by the rubric's raw arithmetic, but E2E is still required** —
not because of the score, but because AC-1/AC-2/AC-3/AC-4/AC-8 are
**SSR-response-shape assertions across three different wall-clock-relative
event fixtures plus an auth-state fork**, which cannot be fully verified by
unit tests alone (see "Why E2E is required" below). Treat the rubric score
as a floor, not a ceiling: this FR's E2E requirement is driven by the AC
mapping, not the point total.

## Required Test Levels

- [x] **Unit** (Vitest) — required. Primary layer for this FR; covers all
  new pure functions and the `cms.ts` fetcher contract via mocked `fetch`.
- [x] **Integration** (mocked-`fetch` against `cms.ts`, NOT Testcontainers —
  see justification above) — required for `fetchEvent`/`fetchEventPhotos`'s
  Directus-query-construction + response-shape-guard behavior.
- [x] **E2E** (Playwright, `apps/e2e`) — required. See per-AC mapping below;
  AC-1/2/3 (lifecycle tab content), AC-4 (gating UI), AC-8 (404 status code)
  need a real SSR round-trip because they depend on `Astro.locals.auth`
  (middleware-populated, not mockable from a pure-function unit test) and on
  actual HTTP response status codes (404 vs 200), which only an E2E/HTTP-level
  check observes.

## Why E2E is required (not just "nice to have")

1. **AC-8's 404 is an HTTP status code**, not a data value — a unit test on
   `fetchEvent` can confirm it returns `null` for a wrong-country event, but
   only an E2E/HTTP request against the actual running Astro route confirms
   the page turns that `null` into a real `404` response (vs. a stale cached
   build still 302-redirecting, a middleware ordering bug, or a
   `Response(null, {status: 404})` construction typo that unit tests of
   `cms.ts` alone cannot catch since they never touch `[id].astro`).
2. **AC-4's gating depends on `Astro.locals.auth`**, populated by
   `middleware.ts`'s real refresh-token round-trip against `apps/api`. This
   is explicitly *not* mockable at the unit level without reimplementing
   middleware (which would test the reimplementation, not the real gate) —
   the security review's own R-1 verification was a source-reading exercise,
   not a test; TestDesigner should close that gap with a real signed-out vs.
   signed-in E2E run.
3. **AC-1/2/3 require three fixture events at different points in wall-clock
   time relative to `now`** (`startsAt` in the future / `endsAt` in the past
   / straddling `now`) and confirm the **rendered tab content**, which is a
   full-page composition of `EventDetail` + four different named-slot blocks
   — a unit test on the lifecycle-derivation function alone (see below)
   proves the *tab selection* logic but not that the right blocks actually
   render inside that tab.
4. **No existing E2E spec covers this surface.** Confirmed via
   `Glob apps/e2e/**/*event*`: `smoke-event-share.spec.ts` covers only the 3
   share-channel buttons; `smoke-event-regen-social-card.spec.ts` covers an
   unrelated authenticated operator endpoint
   (`POST /v1/workspace/events/:id/regenerate-social-card`, 401-only smoke).
   `smoke-event-matches*.spec.ts`, `smoke-event-reminders.spec.ts`,
   `smoke-event-speaker-briefs.spec.ts` are all different features entirely.
   **This is new E2E ground, not an extension of existing coverage** — the
   impact analysis flagged this as "worth checking, not yet done"; it has
   now been checked and confirmed there is nothing to extend.

## Unit Test Plan

| Target | Happy Path | Failure Paths |
|---|---|---|
| `apps/web-next/src/lib/video-embed.ts::recordingEmbedSrc(url)` | `https://youtu.be/dQw4w9WgXcQ` → nocookie embed URL; `https://www.youtube.com/watch?v=dQw4w9WgXcQ` → same; `https://youtube.com/embed/dQw4w9WgXcQ`; `https://youtube.com/shorts/dQw4w9WgXcQ`; `https://vimeo.com/123456789` → player.vimeo.com embed; subdomain variants (`m.youtube.com`, `player.vimeo.com` as host itself) | Malformed URL string (throws in `new URL()`) → `null`; `javascript:alert(1)` → parses but `hostname === ''` → `null`; non-allowlisted host (e.g. `https://vimeo.evil.com.attacker.io`, `https://dailymotion.com/...`) → `null`; YouTube URL with `v=` param shorter than 6 chars (fails `YOUTUBE_ID_PATTERN`) → `null`; `youtube.com/embed/` with no id segment (`videoId === undefined`) → `null`; Vimeo URL with non-numeric path (`vimeo.com/abc`) → `null`; empty string input → `null` |
| `apps/web-next/src/lib/video-embed.ts::splitRecordings(materials)` | Mixed list with 2 `recording`-kind materials (1 YouTube-resolvable, 1 non-resolvable) + 2 non-recording materials → `recordings` has exactly the 1 resolvable one (with `embedSrc` attached), `materials` has the other 3 (non-resolvable recording falls back into `materials`, matching the documented fallback) | Empty array → `{ recordings: [], materials: [] }`; all-recording-kind list where none resolve → `recordings: []`, all items preserved in `materials`; `m.url == null` on a `recording`-kind item → skipped from `recordings`, stays in `materials` (per `if (m.kind !== 'recording' \|\| m.url == null) continue`) |
| Lifecycle-tab default derivation (currently inline in `[id].astro` lines 106-110: `now >= endsAtMs ? 'finished' : now >= startsAtMs ? 'live' : 'upcoming'`) | `now` well before `startsAt` → `upcoming`; `now` well between `startsAt`/`endsAt` → `live`; `now` well after `endsAt` → `finished` | **Boundary conditions (explicitly called out in the task brief):** `now === startsAt` → must resolve to `live` (the `>=` operator, confirmed by reading the actual code, means the boundary is inclusive on the `live` side, not `upcoming`); `now === endsAt` → must resolve to `finished` (same `>=` inclusive-on-finished-side behavior — confirm this is the *intended* semantic, since a naive reading of "at the exact end instant" could argue for `live`; the code as written picks `finished`, so the test must pin down current behavior and flag it to TestDesigner as a spec decision worth one line in the AC, not silently assume it's obviously correct); malformed/unparseable `startsAt`/`endsAt` strings → `Date.parse()` returns `NaN`, and `now >= NaN` is always `false` in JS — verify this degrades to `'upcoming'` (both comparisons false) rather than throwing, since `ApiEvent.startsAt`/`endsAt` are typed as required strings but a Directus data-quality issue could still produce a bad ISO string reaching this code path |
| `apps/web-next/src/lib/cms.ts::countryFromHost(host)` | `'uz.aiqadam.org'` → `'uz'`; `'kz.aiqadam.org'` → `'kz'`; `'tj.aiqadam.org:3000'` → `'tj'` (port stripped) | `null`/`undefined` → `'uz'` default; `'localhost'` → `'uz'` default (label `'localhost'` not in the allow-set); `''` (empty string) → `'uz'`; unrecognized label e.g. `'ru.aiqadam.org'` → `'uz'` default (not `'ru'` — confirm the allow-list is exactly `{uz, kz, tj}` and anything else silently falls back, which is load-bearing for AC-8: an attacker cannot probe for other country codes since they all alias to `uz`) |
| `apps/web-next/src/lib/cms.ts::fetchEvent(req, id)` | Valid id, matching country, `status: 'published'` → full `ApiEvent` with all new fields (`latitude`, `longitude`, `recapMd`, `livestreamUrl`, `updatedAt`) correctly mapped from snake_case Directus row fields (`recap_md`, `livestream_url`, `date_updated`) | `id` empty string → `null` *without* calling `fetch` (guard clause `if (!id \|\| id.length === 0) return null` — assert `fetch` was NOT called, this is a distinct assertion from "returns null"); Directus returns `data: null` (not-found) → `null`; Directus returns a row with `status: 'draft'` or `'cancelled'` → `null` (unpublished gate); Directus returns a row with `country !== resolved-country` (wrong-country, AC-8) → `null`, and **this must be asserted as byte-identical in return shape to the not-found case** (both just `null` — there is no way to unit-test the "no differentiated response" security property other than confirming the function's return type genuinely cannot distinguish the two cases, i.e. no side-channel like a different `console.error` call or thrown error only on one branch — the security review already confirmed this by reading the code; TestDesigner should still write the assertion so a future refactor can't silently reintroduce a leak); `fetch` throws / network error (Directus-unreachable) → `null`, caught by the try/catch, logged via `console.error('[cms] fetchEvent(...) failed:', ...)` (assert graceful degradation, not a thrown exception reaching the caller — this matters because the page has no try/catch of its own around `await fetchEvent(...)`) |
| `apps/web-next/src/lib/cms.ts::fetchEventPhotos(eventId)` | Returns array of `EventPhoto[]` sorted by `order_index`, each with `fileUrl` built from `directusBase()/assets/{file}` when `file` is set, or raw `url` when only `url` is set | Row with neither `file` nor `url` → filtered out (`null` mapped then filtered via the `is EventPhoto` type guard); `caption`/`alt_text` empty-after-trim → normalized to `null` (`row.caption?.trim() \|\| null`); Directus fetch throws → `[]` (never throws, matches every sibling fetcher's contract); empty `data: []` → `[]` |
| `apps/web-next/src/lib/cms.ts` internal `parseCoord` (via `fetchEvent`'s `latitude`/`longitude` mapping — referenced by security review as bounds-checking) | Valid numeric string within range (e.g. lat `41.31`, lng `69.24`) → parsed number | Out-of-range value (e.g. lat `95`, lng `-200`) → `null` (per security review's INV-4 note that this is bounds-checked); non-numeric string → `null`; this is what makes `VenueMap`'s OSM iframe safe per the security review — worth a direct unit test even though it's not separately exported, either by testing it through `fetchEvent`'s output or by exporting it if TestDesigner finds no other way to reach it deterministically |

## Integration Test Plan

| Scenario | Infrastructure | Key Assertions |
|---|---|---|
| `fetchEvent` Directus query construction | Mocked global `fetch` (vi.fn(), matching `api-ssr.test.ts`/`cms-landing-page.test.ts` convention) — **not** Testcontainers, no real Directus instance | URL requested is `/items/events/${encodeURIComponent(id)}?fields=...` with the exact `EVENT_FIELDS` list (catches accidental field-list drift if someone adds a new `ApiEvent` field but forgets to add it to `EVENT_FIELDS`, silently returning `undefined` for it); `id` is URL-encoded (path-traversal / injection guard — e.g. an `id` containing `../` or `?` must not break the query path) |
| `fetchEvent` response-shape guard | Mocked `fetch` returning varying malformed bodies | `body.data` missing entirely (Directus 200 with unexpected shape) → `null`, not a thrown `TypeError` on `body.data.status`; confirms the `!body.data \|\| ...` short-circuit order (must check `!body.data` *before* dereferencing `.status`/`.country` on it) |
| `fetchEventPhotos` query construction | Mocked `fetch` | Filter param `filter[event][_eq]=<eventId>` present; `sort=order_index`; `limit=60` (matches the coded constant — regression guard if someone changes the cap without updating a test) |
| `api-ssr.test.ts` stale-block removal verification | Static/grep-level check, not a runtime test | Confirm no `describe('fetchEvent'` (or similarly-named) block remains in `api-ssr.test.ts` that exercises the deleted `/v1/events/:id` path — CodeDeveloper's summary states this was done and the security review independently confirmed it (grepped `describe(` blocks), but TestDesigner should still add this as an explicit CI-time guard (e.g. a one-line grep-based lint check, or simply re-confirm by reading the file) so it can't silently regress if a future edit re-adds a stale block |

## E2E Test Plan

| User Flow | Entry Point | Exit Assertion |
|---|---|---|
| Upcoming event — full content (AC-1) | `GET /events/[id]` for a fixture event with `starts_at` in the future | Registration sidebar (`RegistrationCTA`) visible; agenda section visible when `agendaMd` set; speakers grid renders; sponsors wall renders; default tab is `upcoming` (no `?tab=` needed); tab strip's `upcoming` tab has `aria-selected="true"` |
| Finished event — recap/recordings/photos (AC-2) | `GET /events/[id]` for a fixture event with `ends_at` in the past, with `recap_md`, at least one `recording`-kind material with a resolvable embed URL, and at least one `event_photos` row | Default tab is `finished`; recap markdown renders; recording iframe(s) render (from `EventRecap`); photo gallery grid renders with the fixture photo(s) |
| Finished event — empty state | `GET /events/[id]` for a fixture event with `ends_at` in the past but no recap/recordings/photos | `hasFinishedContent` is `false` → empty-state block (`tab_finished_empty_title`/`_body`) renders instead of `EventRecap`/`EventPhotoGallery` |
| Live event — livestream + Live chip (AC-3) | `GET /events/[id]` for a fixture event with `starts_at <= now <= ends_at` and `livestream_url` set to a YouTube/Vimeo URL | Default tab is `live`; livestream iframe embed renders inside `LivestreamPanel`; some visible "Live" indicator is present (confirm exact selector/copy with TestDesigner — task brief names a "Live chip" but this codebase's current `EventDetail.astro`/`LivestreamPanel.astro` should be grepped for the actual chip markup before asserting a specific class/text, since it wasn't found verbatim in the files read so far) |
| Live event — non-embeddable livestream URL | `GET /events/[id]` live-window fixture with `livestream_url` set to a non-allowlisted host | `LivestreamPanel` falls back to a click-through `<a>` Join link, not an iframe (`rel="noopener noreferrer"`, `target="_blank"`) |
| Live event — no livestream URL | `GET /events/[id]` live-window fixture with `livestream_url` unset | `tab_live_empty_title`/`_body` empty state renders |
| Members-only event — signed out (AC-4) | `GET /events/[id]` for a `visibility_scope: members_only` fixture, no auth cookie | Sign-in prompt card renders (`members_only_title`/`_body` + sign-in link to `/api/v1/auth/login?next=...`); **assert absence** of speakers/materials/sponsors/photos/registration-sidebar/forum content in the response HTML (not just that the gate card is present — a regression that renders both would only be caught by asserting the negative); response status is `200` (gated ≠ 404 — distinct from AC-8) |
| Members-only event — signed in as member (AC-4 happy path) | `GET /events/[id]` with a valid authenticated session cookie for a `members_only` fixture | Full content renders (sidebar/speakers/etc.), no sign-in prompt |
| Members-only event — signed in but... (edge case named in task brief: "wrong role") | Same as above but the signed-in identity has no special role distinction relevant here — **flag to TestDesigner**: per the code read (`isGated = (visibilityScope is members_only/invite_only) && auth?.me == null`), there is **no role check at all**, only an authenticated-vs-not check. "isGated with auth but wrong role" as phrased in the task brief does not map to any code path that exists — `invite_only` visibility does not appear to have a separate invite-list check anywhere in the reviewed files (`[id].astro`, `cms.ts`). **This is either a gap in the current implementation (invite_only behaves identically to members_only — any signed-in user passes) or a misunderstanding in the task brief.** TestDesigner should write the test for actual current behavior (any authenticated user passes `isGated` regardless of "role") and flag this named discrepancy to RequirementAnalyst/ImpactAnalyzer as a possible follow-up issue (`invite_only` presumably should mean something *more* restrictive than `members_only`, but the code doesn't currently implement that distinction) rather than inventing a role-check test against code that doesn't exist |
| Not-found event → 404 (AC-8) | `GET /events/00000000-0000-4000-8000-000000000000` (nonexistent id) | HTTP status `404`; body is empty/generic (`new Response(null, {status: 404})` — no leaked "event not found" vs. "wrong country" distinction in body text either) |
| Wrong-country event → 404 (AC-8) | `GET /events/[id]` for a real, published KZ-country event fixture, requested with a `Host` header resolving to `uz` (or via staging's actual `uz.` subdomain if E2E runs against a multi-tenant staging host) | HTTP status `404`, **byte-identical response** to the not-found case above (this is the core AC-8 assertion — TestDesigner should diff the two response bodies/headers if feasible, not just separately assert "404" twice) |
| Unpublished (draft/cancelled) event → 404 | `GET /events/[id]` for a `status: draft` or `status: cancelled` fixture, if such a fixture can be seeded/found | HTTP status `404` (same fold-into-null path as not-found/wrong-country) |
| OG card — public event (AC-7) | `GET /events/[id]/og-card.png` for a public, published fixture event | HTTP `200`; `Content-Type: image/png`; image dimensions 1200×630 (may need a lightweight PNG-header dimension check rather than full pixel comparison); re-fetching after touching `date_updated` on the fixture changes the cache-busting query value referenced by the page's `ogImage` (this half of the assertion may be easier to verify at the page level — confirm the `<meta property="og:image">` tag's `?v=` query param changes — than by hitting the PNG route twice, since the route itself doesn't take a cache-bust param as a behavioral input, the *page* is what encodes it into the URL it emits) |
| OG card — gated event → 404 (AC-7) | `GET /events/[id]/og-card.png` for a `members_only` fixture | HTTP `404`, regardless of requester's auth state (route has no session awareness — confirmed in security review) |
| Venue map — deep-links (AC-6) | `GET /events/[id]` for a fixture with `latitude`/`longitude` set | OSM iframe present with `src` containing `openstreetmap.org/export/embed.html?bbox=`; Google Maps link present and `href` resolves to a working `google.com/maps` deep-link containing the coordinates; Yandex Maps link present similarly; if `map_url` (operator override) is also set, confirm it renders as a separate click-through link, not swapped in for the coordinate-based iframe |
| Venue map — no coordinates | `GET /events/[id]` for a fixture with `latitude`/`longitude` both null | No OSM iframe rendered (per security review: iframe only built when both present); address-only fallback / no-map state used instead — confirm exact fallback with TestDesigner against the actual `VenueMap.astro` markup |
| Forum posting — optimistic prepend (AC-5) | Signed-in member on any tab of `/events/[id]`, navigate to `?tab=forum`, submit a question ≤2000 chars | New question appears immediately at/near the top of the list (reverse-chronological; pinned questions still float above it) without a full page reload — this is a client-island (`ForumThread`, `client:load`) behavior, appropriately E2E-only since it's optimistic-UI/client-state, not SSR output. **Note:** per the impact analysis, this AC may already have partial E2E coverage from the original PR 1.3/1.4 — TestDesigner should grep `apps/e2e` for an existing forum/questions spec before writing a new one (not found under the `*event*` glob used in this investigation — worth a second, broader grep for `forum`/`question` filenames specifically, since a differently-named spec could still exist) |
| Forum posting — over length limit | Same entry point, submit a 2001+ char question | Client-side validation blocks submit or server rejects — confirm which layer owns this; out of this FR's *new* scope if `ForumThread`/`EventQuestionsController` already enforce it (per impact analysis, this island is "unchanged," so this may already have coverage — verify, don't duplicate) |
| Deep-link tab routing | `GET /events/[id]?tab=finished` directly (no client nav) | Page renders with `finished` tab active server-side (SSR, no client JS needed) — confirms the `?tab=` routing is genuinely SSR-deep-linkable per the impact analysis's explicit requirement (R-2/architecture note: must not require `kit/Tabs.tsx` client island) |
| Invalid `?tab=` value | `GET /events/[id]?tab=nonsense` | Falls back to the lifecycle-derived `defaultTab`, not an error — per `tabRequested` only being set when `VALID_TABS.includes(tabParam)` |

## Acceptance Criteria → Test Mapping

| AC | Test Level | Test Description |
|---|---|---|
| AC-1 (upcoming event: sidebar, agenda, speakers, sponsors) | E2E + Unit (lifecycle derivation) | E2E: "Upcoming event — full content" flow above. Unit: lifecycle-derivation `now < startsAt → upcoming` case backs the tab-selection half; the content-rendering half needs the E2E round-trip since it's a multi-block composition. |
| AC-2 (finished event: recap, recordings, photos) | E2E + Unit (`splitRecordings`, `recordingEmbedSrc`) + Integration (`fetchEventPhotos`) | E2E: "Finished event" flows above (with-content and empty-state). Unit/Integration back the data-shaping that feeds those blocks. |
| AC-3 (live event: livestream embed + Live chip) | E2E + Unit (`recordingEmbedSrc`, lifecycle boundary) | E2E: "Live event" flows above (embeddable, non-embeddable, empty). Unit: `recordingEmbedSrc`'s YouTube/Vimeo detection plus the `now === startsAt`/`now === endsAt` boundary cases feeding tab selection. |
| AC-4 (members_only gate for unsigned visitors) | E2E (primary) + Unit (`isGated` boolean logic can be extracted/tested if TestDesigner finds it worth pulling out of the Astro frontmatter, otherwise E2E-only since it's currently inline) | E2E: "Members-only — signed out" and "signed in" flows above, with explicit negative assertions (content absence, not just gate presence). Flag the `invite_only`-vs-role ambiguity to TestDesigner/RequirementAnalyst per the note above — do not invent a role-based test against nonexistent code. |
| AC-5 (forum post, optimistic prepend) | E2E (client-island behavior) | "Forum posting" flow above. Check `apps/e2e` for pre-existing coverage from the original PR before writing new — this specific island (`ForumThread`) is stated as unchanged by this FR. |
| AC-6 (venue block: OSM map + Google/Yandex deep-links) | E2E + Unit (`parseCoord` bounds-check) | E2E: "Venue map" flows above. Unit: `parseCoord`'s range validation (feeds directly into whether an iframe is even attempted, which is also a minor security-adjacent assertion per the security review's iframe-allowlist verification). |
| AC-7 (OG card: title+date, cache-busted, 404 for non-public) | E2E (PNG route is not meaningfully unit-testable — Satori/resvg rendering) + Unit (the `cacheBuster`/`isPubliclyShareable` derivation in `[id].astro`, if extracted; otherwise covered indirectly by the E2E page-level `<meta og:image>` assertion) | E2E: "OG card — public" and "OG card — gated → 404" flows above. |
| AC-8 (404 for not-found / wrong-country) | Unit (`fetchEvent`'s null-collapse, `countryFromHost`) + E2E (actual HTTP status) | Unit backs the data-layer guarantee (byte-identical `null` for both cases); E2E backs the HTTP-layer guarantee (byte-identical `404` response) — **both are needed, neither alone proves the end-to-end security property**, since a unit test only proves `cms.ts` is correct, and the page's `if (!event) return new Response(null, {status:404})` wiring is a separate, thin but real integration point that a unit test of `cms.ts` alone cannot observe. |

## Edge Cases Called Out for TestDesigner (consolidated from task brief + investigation)

1. **`isGated` with no auth vs. `isGated` with auth but "wrong role"** — see
   the E2E table note above: the actual code has no role/invite-list check,
   only authenticated-vs-not. Do not write a test asserting behavior that
   doesn't exist in the code; instead flag the `invite_only`-vs-`members_only`
   behavioral-parity gap as a discrepancy for follow-up.
2. **`fetchEvent` for Directus-unreachable** — must resolve to `null` via the
   try/catch, never throw past `fetchEvent` into the page (which has no
   surrounding try/catch of its own around `await fetchEvent(...)` in
   `[id].astro`) — an uncaught throw here would 500 the whole page instead of
   404ing gracefully. High-value unit test.
3. **`recordingEmbedSrc` with malformed/non-allowlisted URLs** — covered in
   the unit test plan table above in detail (malformed → `null` via caught
   `new URL()` exception; non-allowlisted host → `null` via the explicit
   allow-list falling through; `javascript:` scheme → parses but empty
   hostname → falls through to `null`, never reaches an iframe `src`).
4. **Boundary conditions `now === startsAt` / `now === endsAt`** — both
   resolve to the *later* state (`live` and `finished` respectively) per the
   `>=` operators read directly in `[id].astro` lines 109-110. TestDesigner
   should pin this down with an exact-boundary unit test (not just
   comfortably-before/after fixtures) since off-by-one logic here is exactly
   the kind of bug boundary tests exist to catch, and no test currently
   exercises this exact instant.
5. **Malformed `startsAt`/`endsAt` producing `NaN` from `Date.parse`** — not
   explicitly named in the task brief but surfaced during this investigation:
   worth one defensive unit test confirming graceful fallback to `'upcoming'`
   rather than a thrown error, since `ApiEvent`'s type doesn't prevent a bad
   ISO string from Directus reaching this code path.
6. **AC-8 "byte-identical" response property** — this is a security property,
   not just a functional one (per the security review's own framing). Both
   the unit level (`fetchEvent` returns the same `null`) and the E2E level
   (same `404`, same empty body) should assert this explicitly as a
   *comparison*, not as two independently-passing single assertions, so a
   future refactor that accidentally differentiates the two cases (e.g. a
   debug log visible in a response header, or a different error body) gets
   caught.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Test strategy complete for FR-EVT-004 gap-closure. Rubric score: 4 (tenant-scoped data via countryFromHost +2, lifecycle business-rule edge cases +2); rubric's literal Testcontainers prescription at score>=4 is deliberately reinterpreted as mocked-fetch integration tests against cms.ts's Directus HTTP boundary, matching this codebase's actual established convention (zero Testcontainers usage anywhere in apps/web-next; Vitest+mocked-fetch throughout per api-ssr.test.ts/cms-landing-page.test.ts) since there is no Postgres/Drizzle layer in this diff. E2E (Playwright) is required independent of the raw score because AC-1/2/3/4/8 depend on real Astro.locals.auth middleware state and real HTTP status codes that unit tests cannot observe. Confirmed apps/e2e has NO existing event-detail spec to extend (smoke-event-share.spec.ts covers only share buttons; smoke-event-regen-social-card.spec.ts covers an unrelated operator endpoint) — this is new E2E ground per the impact analysis's flagged-but-unchecked item, now checked. All 8 ACs mapped to at least one test level. Unit test plan covers recordingEmbedSrc/splitRecordings (video-embed.ts), lifecycle-tab boundary derivation (including the now===startsAt/now===endsAt boundary cases explicitly requested), countryFromHost, fetchEvent (found/not-found/wrong-country/unreachable), fetchEventPhotos, and parseCoord bounds-checking. One discrepancy surfaced and flagged rather than silently resolved: the task brief's 'isGated with auth but wrong role' edge case does not correspond to any code path in the actual implementation — isGated only checks authenticated-vs-not, with no invite_only-specific role/list check found in [id].astro or cms.ts. Flagged for TestDesigner to raise as a follow-up rather than testing against nonexistent behavior."
  findings:
    - "Rubric scoring deviation (justified, not a violation): score is 4, which per the rubric's literal text requires Testcontainers-based integration tests. This FR has no Postgres/Drizzle/NestJS layer to containerize (confirmed via security review INV-10: N/A). Integration coverage is instead mocked-fetch tests against lib/cms.ts's Directus HTTP calls, consistent with every existing sibling fetcher's test convention in this codebase (zero Testcontainers usage found anywhere in apps/web-next)."
    - "apps/e2e has no existing spec for /events/[id]'s lifecycle tabs, gating, or 404 behavior — confirmed via Glob apps/e2e/**/*event* (7 files, all a different feature or a narrow sub-surface: share buttons, operator social-card regen, matches, reminders, speaker briefs, workspace events list). All E2E scenarios in this strategy are net-new specs, not extensions."
    - "Discrepancy flagged, not silently resolved: task brief asks for an 'isGated with auth but wrong role' test case. Reading apps/web-next/src/pages/events/[id].astro lines 79-81, isGated is `(visibilityScope is members_only or invite_only) && Astro.locals.auth?.me == null` — there is no role or invite-list check anywhere; any authenticated user passes regardless of visibilityScope being members_only vs invite_only. TestDesigner should write tests for actual current behavior and separately flag this as a possible functional gap (invite_only currently behaves identically to members_only) for RequirementAnalyst/ImpactAnalyzer follow-up, not invent a test against a role-check that doesn't exist in the code."
    - "AC-7's 'Live chip' (named in the task brief for AC-3) was not found as a distinct, separately-labeled UI element in the files read (EventDetail.astro, LivestreamPanel.astro summaries from code-summary.md). TestDesigner should re-grep the actual current LivestreamPanel.astro/EventDetail.astro markup for the exact selector/copy before writing the E2E assertion — flagged so it isn't assumed to exist verbatim as phrased in the brief."
    - "AC-8's byte-identical-response property (not-found vs wrong-country) is a security property already verified at the source-reading level by SecurityReviewer (04-security-review.md). This strategy asks TestDesigner to encode it as an explicit comparison assertion (same status, same body) rather than two independently-passing single assertions, so a future refactor accidentally reintroducing a differentiating signal gets caught by CI, not by the next security review."
```
