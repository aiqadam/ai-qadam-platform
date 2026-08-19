# Security Review — wf-20260819-feat-212

## Code Changes Reviewed

- `infrastructure/directus/bootstrap.sh` (modified — `content_pages`/`content_documents` collection schemas, lines ~5694–5803; public read-only permission grants via `ensure_perm_for_policy`)
- `infrastructure/directus/seed-content-documents.sh` (new)
- `infrastructure/directus/content/rules/manifesto.md`
- `infrastructure/directus/content/rules/charter-v0-1.md`
- `infrastructure/directus/content/rules/kazakhstan-mou.md`
- `infrastructure/directus/content/rules/global-board-polozhenie-v1.md`
- `infrastructure/directus/content/rules/soglashenie-v1.md`
- `apps/web-next/src/lib/cms.ts` (modified — `fetchContentPage`, `fetchContentDocuments`, `fetchContentDocument`)
- `apps/web-next/src/lib/render-markdown.ts` (new)
- `apps/web-next/src/lib/render-markdown.test.ts` (new)
- `apps/web-next/src/lib/cms-content-pages.test.ts` (new)
- `apps/web-next/src/pages/about.astro` (new)
- `apps/web-next/src/pages/history.astro` (new)
- `apps/web-next/src/pages/partners.astro` (new)
- `apps/web-next/src/pages/rules.astro` (new)
- `apps/web-next/src/pages/rules/[slug].astro` (new)
- `apps/web-next/src/blocks/common/AppNav.astro` (modified)
- `apps/web-next/src/blocks/common/AppFooter.astro` (modified)
- `apps/web-next/src/locales/en.json`, `apps/web-next/src/locales/ru.json` (modified)
- `tools/gen/page.ts` (modified — drive-by Windows path fix)

Also inspected (context, not part of the diff): `apps/web-next/src/lib/api-client.ts`-equivalent `directusBase()`/`get<T>()` helper in `cms.ts` (pre-existing, unauthenticated read path, unmodified logic); `bootstrap.sh`'s `ensure_perm_for_policy` and `ensure_perm` helper definitions (pre-existing); the `ISS-SEC-DIRECTUS-USERS-PUBLIC-001` incident block (pre-existing, used as the negative pattern to check against).

### Targeted verification performed

1. **Sanitization pipeline probe.** Ran the actual `marked` → `isomorphic-dompurify` pipeline from `render-markdown.ts` (exact `ALLOWED_TAGS`/`ALLOWED_ATTR`/`ALLOW_DATA_ATTR` config, real installed package versions `marked@18.0.10`, `isomorphic-dompurify@2.21.0`) against 11 attack vectors beyond what the test file covers: raw HTML `<a href="javascript:...">` (both normal and mixed-case scheme), `data:text/html,<script>` URI, `vbscript:` URI, leading-whitespace-obfuscated `javascript:` in both markdown-link and raw-HTML-anchor form, `<svg onload=...>`, `<style>` with `url(javascript:...)`, `<img onerror>`, `onclick` on an otherwise-allowed `<a>` tag, and `<script>` nested inside an allowed `<table>`. **All 11 were neutralized** — dangerous tags are fully removed, dangerous attributes (including scheme-based `href` values) are stripped while the tag/text content is kept. Confirms DOMPurify's built-in default `ALLOWED_URI_REGEXP` is doing real work here even though `render-markdown.ts` doesn't set it explicitly — this is intentional reliance on a secure, well-tested library default, not an oversight, but it's worth naming explicitly in the review since nothing in the code visibly documents that reliance (see MAJOR-1).
2. **`set:html` call-site audit.** Grepped every `set:html` usage across `apps/web-next/src/pages/**`. Confirmed all four content-rendering call sites (`about.astro`, `history.astro`, `partners.astro`, `rules/[slug].astro`) assign `bodyHtml`, which in every case is the return value of `renderMarkdown(page?.bodyMd)` / `renderMarkdown(doc.bodyMd)` — never raw `body_md` passed directly to `set:html`. The pre-existing `welcome/[slug].astro` dead binding (`set:html=""`) is unchanged by this PR (confirmed not touched in the diff) and was already flagged as a known, separately-tracked issue by ImpactAnalyzer/CodeDeveloper — not a new regression introduced here.
3. **Permission-grant pattern match against `ISS-SEC-DIRECTUS-USERS-PUBLIC-001`.** That incident was an unrestricted grant (`permissions: null`, `fields: "*"`, no filter) on `directus_users` letting any unauthenticated caller read full member profile rows. The new grants (bootstrap.sh lines 5790–5803) are the opposite shape: exactly two `ensure_perm_for_policy` calls, both hardcoded `action` parameter `read` (no `create`/`update`/`delete` call exists anywhere for either collection), both carrying an explicit row filter (`{"status":{"_eq":"published"}}`) and an explicit `fields` allowlist (11 and 8 named fields respectively — no `"*"`). Grepped the full diff region for any other `ensure_perm`/`ensure_perm_for_policy` call touching `content_pages`/`content_documents` — none found beyond the two read grants. This matches the safe `press_page`/`landing_pages`/`team_members` precedent exactly and does not reproduce the incident's shape.
4. **Secret/token scan.** Grepped `cms.ts`'s new fetcher code and all 5 new `content/rules/*.md` seed files for `password|secret|api[_-]?key|token|Bearer|BEGIN (RSA|PRIVATE)` (case-insensitive) plus email/phone-shaped patterns — no matches. `cms.ts`'s `get<T>()` helper (pre-existing, unmodified) sends no `Authorization` header at all for these reads; it relies entirely on the new Public-policy read grant, consistent with every other public CMS fetcher in this file.
5. **Query-construction check.** Both new fetchers build Directus filter query strings via `URLSearchParams` (auto-encoded), never string-concatenate user-controlled `slug` into the URL. `slug` is validated against `/^[a-z0-9][a-z0-9-]{0,63}$/` (`isValidContentSlug`) before use, matching the existing `fetchLandingPage` convention — rejects path-traversal-shaped or filter-injection-shaped input before it reaches the query string.

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1 Tenant isolation | No | N/A | Global/public content, no `countryCode` column on either new collection, no tenant filter expected or present. Confirmed via schema (no `country`/`country_code` field in either `ensure "collection ..."` block). |
| INV-2 Secrets by reference | Yes | Pass | No `password`/`secret`/`apiKey`/`token`/`Bearer` literals found in any new/modified file (fetchers, seed script, or the 5 markdown content files). `get<T>()` sends no auth header for these public reads. |
| INV-3 Auth at controller level | No | N/A | No NestJS controller added (binding architecture decision, reconfirmed by ImpactAnalyzer and CodeDeveloper — no `apps/api` change at all). All 4 pages are intentionally public/unauthenticated by requirement scope (FR-CMS-007); no auth guard is applicable. |
| INV-4 Validation at boundaries | Yes | Pass | `slug` validated via regex (`isValidContentSlug`) before use in both new dynamic-route fetchers (`fetchContentPage`, `fetchContentDocument`). Directus's own field-level schema (`max_length`, `is_unique`, enum `choices` on `status`) provides a second validation layer server-side. No NestJS Zod boundary applies (no controller exists). |
| INV-5 No cross-schema queries | Yes | Pass | All new reads go through Directus's own REST API via the existing `get<T>()` helper — no raw SQL, no cross-schema JOIN. Confirmed no new DB client/connection introduced. |
| INV-6 Rate limiting | No | N/A | No new NestJS endpoint. Directus's own `/items/*` REST API and its existing rate-limiting posture are unchanged by this PR; not a new public surface requiring app-level throttling. |
| INV-7 CSRF protection | No | N/A | All new operations are `GET`-only reads (page SSR + Directus item reads). No new POST/PUT/PATCH/DELETE browser-initiated state change introduced. |
| INV-8 No `dangerouslySetInnerHTML` | Yes | Pass | Zero occurrences in the diff (this is an Astro codebase; the equivalent primitive is `set:html`, covered separately below and in Process notes). No new React component uses `dangerouslySetInnerHTML`. |
| INV-9 No N+1 queries | Yes | Pass | `fetchContentDocuments()` issues one list query (`limit: 50`, sorted server-side by `display_order`); `rules.astro` does not loop and re-fetch per row. `fetchContentPage`/`fetchContentDocument` are each single-row single-query lookups, called once per page render. No loop-wrapped fetch found. |
| INV-10 Drizzle parameterization | No | N/A | No Drizzle/Postgres query involved anywhere in this diff — Directus REST API only. |
| INV-11 HttpOnly tokens (web) | No | N/A | No token issuance, storage, or handling in this diff — these are unauthenticated public reads with no session/token involved. |

### Additional check: `set:html` / markdown-rendering XSS defense-in-depth (not a numbered INV, but explicitly requested)

**Pass**, with one MAJOR documentation/test-coverage gap noted below (MAJOR-1). The `render-markdown.ts` allowlist (`ALLOWED_TAGS`: headings/paragraphs/lists/tables/emphasis/links/blockquote/code — no `script`/`iframe`/`style`/`form`/`svg`/`img`; `ALLOWED_ATTR`: `href`, `title` only; `ALLOW_DATA_ATTR: false`) was verified empirically against 11 real attack vectors (see "Targeted verification performed" above), including vectors not present in `render-markdown.test.ts` (raw-HTML `<a href="javascript:...">`, `data:`/`vbscript:` schemes, `<svg onload>`, `<style>`, nested `<script>` inside an allowed `<table>`). All were neutralized. All four `set:html` call sites in the new pages route exclusively through `renderMarkdown()`.

### Additional check: public-page exposure scope (explicitly requested)

**Pass.** Confirmed the two new Directus collections' public-read `fields` allowlists contain only content-appropriate fields (`content_pages`: `id,slug,status,title,subtitle,body_md,translations,date_updated`; `content_documents`: `id,slug,status,title,source_document_label,status_label,body_md,display_order`) — no internal/operational field (e.g. no audit/author/internal-note field exists on either collection's schema to begin with, so there's nothing extra to over-expose). Both grants are filtered to `status: {_eq: "published"}`, so `draft`/`archived` rows are not publicly readable even though the collections themselves have no row-level owner/tenant scoping — matches the intended "editor publishes when ready" workflow. No excluded source material (`AI Qadam BFT v0_1`, the internal product-roadmap doc) appears in any of the 5 seeded `content/rules/*.md` files — spot-checked via grep for `BFT`/`roadmap`/`BUILD` product-slide language; none found in the rules content (this is a content-authoring risk per the impact analysis, not primarily a code-review concern, but the negative check is clean).

## BLOCKER Findings

None.

## MAJOR Findings

### MAJOR-1 — RESOLVED in Retry 1 (see Retry Verification below)

Original finding (kept for record): `render-markdown.ts`'s `ALLOWED_ATTR` includes `href`, and the code relied entirely on `isomorphic-dompurify`'s *default* `ALLOWED_URI_REGEXP` to strip dangerous URL schemes, with no explicit config and no raw-HTML-anchor test coverage. Verified fixed — see below.

## Retry Verification

Re-read `apps/web-next/src/lib/render-markdown.ts` and
`apps/web-next/src/lib/render-markdown.test.ts` directly (not just the
code-summary diff description) and re-ran an empirical probe against the
real, currently-shipped pipeline.

### 1. `security.md` cross-check — was the broader `tg` scheme the right call?

Read `docs/04-development/security/security.md` myself (line 104, Input
Validation section) rather than trusting the code summary's paraphrase:

> **URLs** — explicit allowed schemes (https, mailto, tg); no `javascript:`, no `file:`.

CodeDeveloper's `ALLOWED_URI_REGEXP = /^(?:https?|mailto|tg):/i` matches
this documented policy exactly. My original suggested fix
(`https|mailto` only) was a reasonable default but I had not checked
security.md's own scheme list before writing it — CodeDeveloper correctly
overrode it with the authoritative project policy instead of applying my
suggestion verbatim. This is the right call, not scope creep.

### 2. Code re-read — is `ALLOWED_URI_REGEXP` actually wired in, not just present?

Confirmed at `render-markdown.ts` line 73 (module-level constant,
documented with a comment citing security.md and explaining the
implicit-to-explicit rationale) and line 99 (passed into the
`DOMPurify.sanitize(rawHtml, { ALLOWED_TAGS, ALLOWED_ATTR,
ALLOW_DATA_ATTR: false, ALLOWED_URI_REGEXP })` options object). Not shadowed,
not overridden elsewhere, not dead code — this is the only
`DOMPurify.sanitize()` call site in the file and the only place
`ALLOWED_URI_REGEXP` is referenced.

### 3. Empirical probe against the real pipeline (not the test file — a fresh, independent script)

Built a standalone script importing the actual installed `marked` +
`isomorphic-dompurify` packages and reproducing `render-markdown.ts`'s
exact `ALLOWED_TAGS`/`ALLOWED_ATTR`/`ALLOWED_URI_REGEXP` configuration
verbatim (not the test file — an independent re-implementation, to rule
out the possibility that the test file's own mocking or setup was
masking a gap). Ran 17 vectors:

| Vector | Result |
|---|---|
| Raw anchor `javascript:` | `href` stripped entirely |
| Raw anchor `JaVaScRiPt:` (case-obfuscated) | `href` stripped |
| Raw anchor `data:text/html,<script>...` | `href` stripped |
| Raw anchor `vbscript:` | `href` stripped |
| Raw anchor, leading-whitespace-obfuscated `  javascript:` | `href` stripped |
| Raw anchor, newline-obfuscated `java\nscript:` | `href` stripped |
| Raw anchor, tab-obfuscated `java\tscript:` | `href` stripped |
| Raw anchor, space-obfuscated `java script:` | `href` stripped |
| Markdown-link-syntax `javascript:` | `href` stripped |
| `file:///etc/passwd` | `href` stripped |
| `ftp://evil.example/x` | `href` stripped |
| Legit `https://aiqadam.org` | `href` preserved |
| Legit `http://aiqadam.org` | `href` preserved |
| Legit `mailto:partners@aiqadam.org` | `href` preserved |
| `tg://resolve?domain=aiqadam` | `href` preserved |
| Relative link `/about` (no scheme) | `href` stripped |
| Protocol-relative `//evil.example/x` | `href` stripped |

All dangerous-scheme and obfuscation vectors are neutralized — confirms
the explicit `ALLOWED_URI_REGEXP` is genuinely taking effect, not merely
present-but-unused. This closes MAJOR-1: the raw-HTML-anchor path
(marked's untouched pass-through of inline HTML, the specific gap I
originally flagged) is verified closed independent of the new test file,
using a fresh script rather than re-running the developer's own tests.

**Side note, not a security finding:** the explicit regexp is stricter
than DOMPurify's old default in one respect — relative (`/about`) and
protocol-relative (`//host/path`) links now also lose their `href`,
where the old default permitted them. This is a fail-safe direction
(over-stripping, not under-stripping) so it is not a security concern,
but it is a content-authoring behavior change worth CodeDeveloper/editor
awareness: a Directus editor writing `[see charter](/rules/charter-v0-1)`
in `body_md` will silently render as a plain non-clickable label. Not
blocking — flagging for the PR description / follow-up awareness only.

### 4. Does the new `tg:` scheme addition introduce a gap?

Checked whether `tg:` URIs can be crafted to smuggle something unsafe.
Found `<a href="tg://msg_url?url=javascript:alert(1)">` passes through
with its full `href` intact, because `ALLOWED_URI_REGEXP` only anchors
the scheme prefix — everything after the scheme, including a
second embedded `javascript:` in a query string, is unexamined. This is
not a defect specific to this fix: it's inherent to allow-by-scheme URI
filtering (the same is true of `mailto:` allowing arbitrary
`subject=`/`body=` params today, unchanged by this PR) and it is not
exploitable in a normal browser navigation context, because `tg:` is a
non-web custom URI scheme handed to the OS/Telegram-app protocol
handler, not parsed/executed as `javascript:` by the browser itself. No
browser treats `tg:`-scheme link clicks as script-executable.

Also checked whether an existing sanctioned `tg:` URI pattern exists
elsewhere in the codebase to compare against, per the task instructions.
It does not — grepped `apps/web`, `apps/web-next`, `apps/api` for
`t.me/`, `telegram.me`, `tg://`: the codebase's actual, established
Telegram-link convention everywhere else (`share-urls.ts`,
`TelegramCabinet.tsx`) is an ordinary `https://t.me/...` URL, never the
`tg:` custom scheme. So the code summary's claim that `tg` is "consistent
with how this codebase treats `tg` elsewhere" is not literally accurate —
there is no prior `tg:`-URI precedent to be consistent with. This does
not make the addition wrong: `tg` is named explicitly in security.md's
own scheme-policy line (independent authority, checked directly, see
§1 above), so allowing it is correct project policy even though it is
new rather than a codified existing pattern. Not a MAJOR — a minor
factual imprecision in the code summary's rationale, not in the code
itself, noted for completeness rather than as a finding requiring a fix.

### 5. Test file re-read

`render-markdown.test.ts` lines 101–121: three new cases confirmed
present exactly as described — raw-HTML-anchor `javascript:` (101–107),
`data:` URI (109–114), mixed-case/whitespace-obfuscated scheme
(116–121). All follow the file's existing real-pipeline, no-mock
convention. Assertions check `.not.toContain('javascript:')` /
`.not.toContain('data:text/html')` on the full output, which is a
sufficient assertion shape given the probe above confirms the entire
`href` attribute is dropped (not just the scheme substring moved
elsewhere).

### Conclusion

MAJOR-1 is genuinely resolved, not just superficially addressed. The fix
is the right one (explicit config sourced from the actual project
policy document, not a guess), it measurably changes behavior in exactly
the way needed (verified via an independent probe script, not just by
re-reading the developer's own tests), and it does not introduce a new
exploitable gap. The `tg:` scheme addition is policy-correct and not
independently exploitable via the browser navigation path. All other
findings from the original review (Directus permission-grant shape,
secret scan, query construction, `set:html` call-site audit,
public-exposure-scope check) are unchanged and still stand as originally
reported — nothing in this retry's scope touched those files.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: >
    Retry verification confirms MAJOR-1 is resolved. render-markdown.ts
    now sets an explicit ALLOWED_URI_REGEXP (/^(?:https?|mailto|tg):/i),
    verified wired into the actual DOMPurify.sanitize() call (not dead
    code), sourced correctly from security.md's own documented "https,
    mailto, tg" scheme policy (checked directly, not taken on faith) in
    preference to this reviewer's narrower original suggestion. An
    independent empirical probe (fresh script, not the developer's test
    file) against 17 vectors confirms every dangerous-scheme and
    obfuscation variant (javascript:, data:, vbscript:, file:, ftp:,
    case/whitespace/newline/tab-obfuscated, raw-HTML-anchor form) has its
    href fully stripped, while legit https/http/mailto/tg links are
    preserved. The 3 new test cases in render-markdown.test.ts genuinely
    cover the previously-untested raw-HTML-anchor path. The new tg:
    scheme does not introduce a browser-exploitable gap (custom URI
    scheme, not script-executable on click) even though embedded
    javascript: in a tg: URI's query string is not itself filtered —
    inherent to allow-by-scheme filtering, not a regression. Noted two
    non-blocking observations for awareness: (1) the explicit regexp now
    also strips relative/protocol-relative hrefs that the old default
    permitted — a content-authoring behavior change, fail-safe direction,
    not a security concern; (2) the code summary's claim that tg is
    "consistent with how this codebase treats tg elsewhere" isn't
    literally accurate (existing Telegram links use https://t.me/, no
    prior tg: URI precedent exists) but the addition is still correct
    because security.md independently names tg as an allowed scheme.
    All other findings from the original review (Directus permission
    grants, secrets scan, set:html call-site audit, query construction)
    are unchanged and still hold — out of scope for this retry, not
    re-verified from scratch.
  findings: []
  blocking: false
```
