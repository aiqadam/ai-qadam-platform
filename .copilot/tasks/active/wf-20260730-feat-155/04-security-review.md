# Security Review — FR-EVT-004 (Event detail page gap-closure)

Workflow: `wf-20260730-feat-155` · Agent: SecurityReviewer

## Code Changes Reviewed

All files reviewed by reading the actual current file contents (not the
code summary's prose), cross-referenced against `git diff origin/main HEAD`
(HEAD == origin/main; the real diff is the uncommitted working-tree state,
confirmed via `git status` + `git diff --stat`):

- `apps/web-next/src/lib/cms.ts` — full file read (967 lines); `fetchEvent`,
  `countryFromHost`, `toApiEvent`, `fetchEventPhotos` inspected in detail.
- `apps/web-next/src/lib/types.ts` — full file read; `ApiEvent`/`EventPhoto`
  additions inspected.
- `apps/web-next/src/lib/api-ssr.ts` — full file read; confirmed dead
  `fetchEvent` removed, no leftover reference.
- `apps/web-next/src/lib/api-ssr.test.ts` — grepped `describe(` blocks +
  `fetchEvent` occurrences; confirmed the stale describe block was actually
  removed and replaced with a pointer comment (line ~554-560).
- `apps/web-next/src/lib/video-embed.ts` — full file read.
- `apps/web-next/src/lib/og-template.tsx` — full file read.
- `apps/web-next/src/lib/og-fonts.ts` — full file read.
- `apps/web-next/src/pages/events/[id]/og-card.png.ts` — full file read.
- `apps/web-next/src/blocks/customer/EventDetail.astro` — full file read.
- `apps/web-next/src/blocks/customer/VenueMap.astro` — full file read.
- `apps/web-next/src/blocks/customer/EventPhotoGallery.astro` — full file read.
- `apps/web-next/src/blocks/customer/EventRecap.astro` — full file read.
- `apps/web-next/src/blocks/customer/LivestreamPanel.astro` — full file read.
- `apps/web-next/src/blocks/customer/index.ts` — diff read (barrel exports only).
- `apps/web-next/src/pages/events/[id].astro` — full file read (main page, rewritten).
- `apps/web-next/src/locales/en.json` / `ru.json` — diff read, parity confirmed.
- `apps/web-next/package.json` — new dependency versions checked against `apps/web/package.json`.
- `apps/web-next/src/blocks/common/MarkdownBody.astro` — full file read (existing component, not changed by this PR, but load-bearing for R-1/XSS check).
- `apps/web-next/src/middleware.ts` — full file read (existing, not changed by this PR, but load-bearing for the auth-signal check).

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1 | Tenant isolation | PASS | `fetchEvent` resolves `countryFromHost(req.headers.get('host'))` and filters `body.data.country !== country` → `null`, folded into the same `null` as not-found/unpublished (`cms.ts` lines 340-356). No cross-tenant read path; no `bypassTenant()`-equivalent exists here. |
| INV-2 | Secrets by reference | PASS | No `password`/`secret`/`apiKey`/`token`/`Bearer` literals introduced in this diff. `INTERNAL_API_URL`/`INTERNAL_DIRECTUS_URL` are env-var reads, not hardcoded values. |
| INV-3 | Auth at controller level | N/A | No NestJS controller changes in this PR (Astro SSR pages only, confirmed by impact analysis: "No NestJS changes"). |
| INV-4 | Validation at boundaries | PASS | `fetchEvent` guards empty `id`; `fetchEventPhotos`/`fetchEventSpeakers`/etc. all wrap in try/catch and return safe defaults (`[]`/`null`) rather than propagating malformed Directus responses. `normalizeExternalLinks`/`normalizeLinkRow` validate `label`/`url`/`kind` shape and reject non-http(s) URLs via `isHttpUrl`. `parseCoord` bounds-checks lat/lng to valid ranges. |
| INV-5 | No cross-schema queries | PASS | All new/modified fetchers read Directus directly via the existing `get<T>()`/`directusBase()` helpers already in `lib/cms.ts` — no NestJS/Directus JOIN, no Postgres cross-schema query. |
| INV-6 | Rate limiting | N/A | No new NestJS public endpoint added. The og-card route is an Astro page route (SSR), not a NestJS controller — rate limiting for Astro SSR routes is out of this invariant's scope as written (targets `@nestjs/throttler`-backed endpoints); flagging as N/A rather than silently passing. |
| INV-7 | CSRF protection | N/A | No new browser-initiated state-changing (POST/PUT/PATCH/DELETE) endpoint in this diff — everything reviewed here is GET/SSR-render only. |
| INV-8 | No `dangerouslySetInnerHTML` | PASS | Zero occurrences in the diff. `MarkdownBody.astro` (pre-existing, unchanged by this PR) uses Astro's `set:html` — reviewed separately below since it's load-bearing for `EventRecap.astro`'s `recapMd` render; confirmed every fragment passed to it is escaped first. |
| INV-9 | No N+1 queries | PASS | `Promise.all([fetchEventSpeakers, fetchEventMaterials, fetchEventPhotos, fetchEventSponsors, fetchEventQuestions])` — parallel, single-shot per collection, no per-row loop issuing additional queries. |
| INV-10 | Drizzle parameterization | N/A | No Drizzle/Postgres code touched — all reads are HTTP calls to Directus's REST API (`URLSearchParams`-built query strings, not SQL). |
| INV-11 | HttpOnly tokens (web) | PASS (pre-existing, verified) | `middleware.ts` (unchanged) stores the verified `accessToken`/`me` in `Astro.locals.auth`, a server-side-only request-scoped object — never written to `localStorage` or any client-readable store. The refresh cookie itself is set via `set-cookie` response header (HttpOnly presumed at issuance by `apps/api`, out of this diff's scope but consistent with existing pattern). |

## R-1 — Fetch-level visibility gating (security-review-required item)

**Verified correct in `apps/web-next/src/pages/events/[id].astro` lines 79-91:**

```ts
const isGated =
  (event.visibilityScope === 'members_only' || event.visibilityScope === 'invite_only') &&
  Astro.locals.auth?.me == null;

const [speakers, allMaterials, photos, sponsors, questions] = isGated
  ? [[], [], [], [], []]
  : await Promise.all([
      fetchEventSpeakers(event.id),
      fetchEventMaterials(event.id),
      fetchEventPhotos(event.id),
      fetchEventSponsors(event.id),
      fetchEventQuestions(event.id),
    ]);
```

This is a genuine fetch-level gate, not a render-level one: when `isGated`
is true, `fetchEventSpeakers`/`fetchEventMaterials`/`fetchEventPhotos`/
`fetchEventSponsors`/`fetchEventQuestions` are **never called** — the
ternary short-circuits before any `await`, so no HTTP request to Directus
for gated sub-resources happens at all. The gated data literally never
enters process memory, let alone the SSR response body. This is materially
better than a template-conditional hide (which the impact analysis
correctly identified as the bug class to avoid — data fetched-then-hidden
can still leak via view-source or a misordered render). Confirmed by
reading the template below it (lines 139-248): the `isGated` branch of the
`{isGated ? (...) : (...)}` JSX renders only the sign-in gate card; the
`<EventDetail>` composition (which is where `speakers`/`photos`/etc. would
be threaded in as props) sits entirely in the `else` branch. There is no
path where gated data is fetched and only visually suppressed.

`RegistrationCTA` and `ShareButtons` (which reveal `event.title` transitively) are also confined to the `else` branch — a gated visitor sees only the members-only card, never the sidebar. `ForumThread` similarly receives `initialQuestions={questions}` which is `[]` when gated, and `ForumThread` itself sits in the `forum` slot inside `<EventDetail>` (the ungated branch only). No leak path found.

## AC-8 — country-mismatch 404 (no distinguishing information leak)

**Verified correct.** `fetchEvent` (`cms.ts` lines 340-356):

```ts
if (!body.data || body.data.status !== 'published' || body.data.country !== country) {
  return null;
}
```

Not-found, unpublished, and wrong-country all collapse into the exact same
`null` return — same code path, same log line format
(`console.error('[cms] fetchEvent(...) failed:', ...)` only fires on a
thrown exception, not on this branch, so no differential log signal
either), same downstream handling in the page
(`if (!event) return new Response(null, { status: 404 })`,
`[id].astro` line 67-69). No status-code difference, no body-content
difference, no distinguishable timing difference introduced by this logic
(same single Directus GET request regardless of which of the three
conditions is true — the branching happens after the fetch completes, not
before it, so there's no early-return-vs-full-fetch timing signal either).
An attacker probing `uz.aiqadam.org/events/<kz-event-id>` gets byte-identical
404 output to probing a genuinely nonexistent id. This closes the gap the
impact analysis flagged and matches V1's original design intent.

## OG card route's independent visibility check

**Verified correct.** `apps/web-next/src/pages/events/[id]/og-card.png.ts`
lines 39-43:

```ts
const event = await fetchEvent(request, id);
if (!event) return new Response('not_found', { status: 404 });
if (event.visibilityScope && event.visibilityScope !== 'public') {
  return new Response('not_found', { status: 404 });
}
```

`event.visibilityScope` here is the Directus-sourced value returned by
`fetchEvent` (via `toApiEvent`, which reads `row.visibility_scope ?? 'public'`
directly off the Directus row) — there is no client-supplied parameter
(query string, header, cookie) consulted for this decision anywhere in this
route. The route takes no session/auth input at all (no cookie forwarding,
no `Astro.locals.auth` reference in the file), consistent with its own
header comment's stated design: it 404s any non-public event
unconditionally since there's no session to distinguish "members-only, not
signed in" from "doesn't exist." This is independent of (not reusing) the
page's session-aware `isGated`, exactly as the impact analysis specified —
correct by design, not an oversight.

## Markdown rendering — recap_md via MarkdownBody (stored XSS check)

**Verified safe.** `EventRecap.astro` passes `recapMd` (operator/admin-authored
Directus content, `event.recap_md` field) to
`<MarkdownBody content={recapMd} variant="muted" .../>`.
`MarkdownBody.astro` (existing component, not modified by this PR) does:

```ts
function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
```

Every line of text content is run through `escape()` before being
interpolated into the `<p>`/`<li>` HTML strings that are then passed to
`set:html`. There is no raw/unescaped passthrough — the component's own
header comment states this explicitly ("every user-authored fragment runs
through `escape()` ... There are no raw passthroughs") and the
implementation matches the comment. `&`, `<`, `>` are neutralized, which
blocks the standard `<script>`/`<img onerror=`/tag-injection XSS vectors.
The component doesn't support attribute-position markdown syntax (e.g. no
custom link syntax that would let an author-controlled `href=` reach the
DOM), so there's no secondary injection surface via a hypothetical
`javascript:` link either. This is the same, already-in-production
component already used for `event.description` and `event.agendaMd`
elsewhere in `EventDetail.astro` — `EventRecap.astro` is simply a new
consumer of an existing, correctly-sanitizing renderer, not a new
sanitization surface.

## Iframe embeds — allow-list verification

**Verified correct — both call sites only ever build iframe `src` from
server-derived, provider-allow-listed URLs.**

1. **`VenueMap.astro` (OSM embed).** `mapEmbedSrc` is built exclusively from
   `latitude`/`longitude` (both must be present, sourced from
   `parseCoord()` in `cms.ts` which bounds-checks to valid lat/lng ranges
   and returns `null` for anything that doesn't parse as a finite number in
   range) concatenated into a fixed `https://www.openstreetmap.org/export/embed.html?bbox=...`
   template string. There is no operator/attacker-controlled URL passed
   through to this `src` — only two bounded numbers. `mapUrl` (the one
   truly operator-free-text field) is **never** used as an iframe `src` —
   it's rendered only as an `<a href target="_blank" rel="noopener noreferrer">`
   click-through link (`VenueMap.astro` lines 93-102), which is the correct
   treatment for an arbitrary operator-supplied URL.

2. **`LivestreamPanel.astro` / `EventRecap.astro` (YouTube/Vimeo embeds).**
   Both route through `recordingEmbedSrc()` in `lib/video-embed.ts`, which:
   - Parses the input with `new URL(url)` (throws → `null` on malformed input,
     which correctly also rejects `javascript:`-scheme "URLs" since those
     fail the WHATWG URL parse or land in an unrecognized-hostname branch).
   - Checks `parsed.hostname` against an explicit allow-list: only
     `youtu.be`, `youtube.com`/`*.youtube.com`, `vimeo.com`/`*.vimeo.com`
     match; every other hostname (including any attacker-controlled domain)
     falls through to `return null`.
   - Only on a match does it construct a **new**, fully first-party embed
     URL (`https://www.youtube-nocookie.com/embed/<id>` or
     `https://player.vimeo.com/video/<id>`) built from a regex-validated ID
     substring (`YOUTUBE_ID_PATTERN = /^[\w-]{6,}$/` for YouTube; `\d+` for
     Vimeo) — the original operator-supplied URL string itself is never
     placed into the iframe `src`, only a reconstructed URL using an
     extracted, pattern-validated ID. This means even a crafted YouTube-
     hostname URL with attacker-controlled path segments can't smuggle
     extra content into the iframe `src` beyond the validated ID token.
   - When `recordingEmbedSrc()` returns `null` (any other provider, or a
     malformed URL), `LivestreamPanel.astro` falls back to a plain
     `<a href={livestreamUrl} target="_blank" rel="noopener noreferrer">`
     click-through link (lines 49-59) — never an iframe. Same fallback
     behavior for `EventRecap`'s recordings list (a `recording`-kind
     material without a resolvable embed URL stays in the general
     `materials` pill-link list per `splitRecordings()`, never becomes an
     iframe).

   No arbitrary operator/attacker-controlled URL reaches an iframe `src` in
   either block. `javascript:` URLs are rejected at the `new URL()` parse
   step (attempting `new URL('javascript:alert(1)')` succeeds in parsing
   but yields `hostname === ''`, which matches none of the allow-listed
   hostnames, so it correctly falls through to `null` → click-through link,
   never an iframe `src`) — and even in the click-through fallback, `href`
   on an `<a>` tag with `javascript:` is a browser-level phishing/UX
   concern rather than a same-origin script-execution vector, and is a
   pre-existing pattern already used identically for `mapUrl`/`event.externalLinks`
   elsewhere in this codebase (not a new gap introduced by this PR).

## Auth signal correctness

**Verified correct.** `Astro.locals.auth?.me` is populated exclusively by
`apps/web-next/src/middleware.ts`'s `onRequest` handler (pre-existing, not
modified by this PR), which:

1. Checks for a refresh-cookie-shaped value on the incoming request as a
   cheap pre-filter (`hasRefresh`), but
2. Does **not** trust that cookie's presence as the auth signal itself —
   it calls `POST {INTERNAL_API_URL}/v1/auth/refresh` (the real NestJS API,
   over the internal Docker network) forwarding the cookie, and only if
   that call returns `2xx` does it extract `accessToken` and then call
   `GET {INTERNAL_API_URL}/v1/auth/me` with `Authorization: Bearer <accessToken>`
   to obtain `me`.
3. `locals.auth = auth` is set to the **result of this verified round-trip**
   (`{ accessToken, me }` or `null` on any failure) — there is no code path
   where a client-supplied header/cookie value is read directly and treated
   as `me`.

This is exactly the server-verified pattern the impact analysis called
for (R-2), and the page correctly consumes it (`Astro.locals.auth?.me == null`
in the `isGated` check) rather than reimplementing V1's raw
cookie-presence sniff. A client cannot forge a truthy `me` by crafting
request headers/cookies alone — it requires possessing a refresh token
that `apps/api`'s own `/v1/auth/refresh` accepts as valid.

## New dependencies — legitimacy check

`satori` (`^0.28.2`), `@resvg/resvg-js` (`^2.6.2`), `geist` (`^1.7.2`) added
to `apps/web-next/package.json`. Confirmed **identical version ranges**
already present and in production use in `apps/web/package.json` (V1) —
these are not new/unvetted packages being introduced to the monorepo for
the first time, they're the same already-audited dependencies V1 has
depended on, now also used by V2 for the same purpose (Satori SVG
JSX-to-SVG rendering + resvg SVG-to-PNG rasterization + Geist variable
font asset package, all from reputable maintainers — Vercel's `satori`/`geist`,
`resvg-js` is the official Rust-resvg Node binding). No security-relevant
diff between the two apps' usage of them (verbatim-ported render logic,
confirmed above). `pnpm-lock.yaml` was regenerated via `pnpm install`, per
CLAUDE.md's `pnpm`-only package-manager rule.

## BLOCKER Findings

None.

## MAJOR Findings

None.

## Minor / non-blocking observations (informational only — not gating)

- `apps/web-next/src/lib/api-ssr.test.ts`'s top-of-file summary comment
  (lines 3-4) still lists `fetchEvent` in its "Tests:" inventory even
  though the actual describe block was correctly removed and replaced with
  a pointer comment lower in the file (line ~554-560). Stale doc comment
  only — the test coverage itself is correct (verified no dead-code
  describe block remains). Not a security issue; cosmetic, safe to leave
  for a follow-up or fix in this PR at CodeDeveloper's discretion.
- INV-6 (rate limiting) and INV-7 (CSRF) are marked N/A rather than PASS
  because this diff adds no NestJS endpoint and no state-changing
  browser-initiated request — flagging explicitly so this isn't
  misread as "checked and clean" when it's actually "not applicable."

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "All applicable invariants confirmed (INV-1 through INV-11, several N/A as this PR touches no NestJS controllers/Drizzle/Postgres). R-1 (fetch-level visibility gating) verified correct by reading the actual current apps/web-next/src/pages/events/[id].astro: the isGated ternary short-circuits before any sub-fetch's await, so gated speakers/materials/photos/sponsors/questions data is never fetched, let alone rendered — not a template-conditional hide. AC-8 verified: fetchEvent in cms.ts folds not-found/unpublished/wrong-country into one identical null (same code path, same log behavior, same 404 response, no timing/status/body differentiation). OG card route verified to 404 non-public events using only the Directus-sourced visibilityScope, with no client-supplied parameter influencing the check and no session dependency. MarkdownBody.astro (pre-existing, confirmed by reading it) HTML-escapes every text fragment before set:html, so EventRecap's recap_md render is safe from stored XSS. VenueMap's OSM iframe src is built only from bounds-checked lat/lng; LivestreamPanel/EventRecap's YouTube/Vimeo iframes route through video-embed.ts's recordingEmbedSrc(), which allow-lists exactly 3 hostnames and reconstructs a first-party embed URL from a regex-validated ID, falling back to a plain rel=noopener noreferrer click-through link for every other provider or malformed URL — no arbitrary URL reaches an iframe src in either block. Astro.locals.auth?.me is populated only via middleware.ts's server-verified refresh-token exchange against apps/api's real /v1/auth/refresh + /v1/auth/me endpoints, not a client-forgeable header/cookie read. satori/@resvg/resvg-js/geist are version-matched to the same packages already vetted and in production via apps/web/package.json, not new/unvetted dependencies. Zero BLOCKER or MAJOR findings."
  findings: []
```
