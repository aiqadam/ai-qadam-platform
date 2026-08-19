# Code Summary — wf-20260819-feat-212

## Requirement Implemented

`FR-CMS-007` — four new public, unauthenticated Astro pages in `apps/web-next`:
About Us (`/about`), Community Rules & Documents (`/rules` + `/rules/[slug]`),
Events & History (`/history`), Partner With Us (`/partners`). Content is
authored/translated in Directus (`content_pages`, `content_documents`
collections, new this workflow) and read via the existing direct
Astro-SSR-to-Directus pattern in `apps/web-next/src/lib/cms.ts` — no NestJS
module was created, per the binding architecture correction in
`01-requirement-validation.md`/`02-impact-analysis.md`.

All 11 acceptance criteria (AC-1..AC-11) from `01-requirement-validation.md`
are addressed — see per-AC notes under Known Limitations for the two that
carry an honest content-completeness caveat (AC-1 leadership bios re: RU
source gap, AC-6 RU sponsorship-deck defect) rather than a code defect.

## Files Changed

| File | Change Type | Description |
|---|---|---|
| `infrastructure/directus/bootstrap.sh` | Modified (append) | New `content_pages` collection (slug-keyed, `translations` flat-JSON field mirroring `events.translations` for ru/en) and `content_documents` collection (ru-only, 5-row library). Public read-only grants via `ensure_perm_for_policy` (name-lookup on `$t:public_label`, not a hardcoded UUID — the more robust of the two patterns already present in this file). No public write grant on either collection. |
| `infrastructure/directus/seed-content-documents.sh` | New | Idempotent seed script for the 5 `content_documents` rows. Reads each row's `body_md` from `infrastructure/directus/content/rules/<slug>.md` via `jq --rawfile` (avoids embedding large Cyrillic JSON literals directly in bootstrap.sh). Update-in-place on re-run (matches on slug). |
| `infrastructure/directus/content/rules/manifesto.md` | New | Reflowed body_md for the Manifesto (Current). |
| `infrastructure/directus/content/rules/charter-v0-1.md` | New | Reflowed body_md for Charter v0.1 (Current) — full §1–§9 + Appendices A–C. |
| `infrastructure/directus/content/rules/kazakhstan-mou.md` | New | Reflowed body_md for the Kazakhstan MoU (Current) — Preamble + Articles 1–16. |
| `infrastructure/directus/content/rules/global-board-polozhenie-v1.md` | New | Reflowed body_md for Global Board Положение v1.0 (Superseded by Charter v0.1) — keeps "Founder Global" terminology verbatim (this document never uses "Хранитель"/"Основатель"). |
| `infrastructure/directus/content/rules/soglashenie-v1.md` | New | Reflowed body_md for Соглашение v1.0 (Superseded by Charter v0.1) — keeps "Основатель" terminology verbatim, including all 5 appendices (richer worked examples than the Charter's own placeholders, per the triage doc). |
| `apps/web-next/src/lib/cms.ts` | Modified (append) | New fetchers: `fetchContentPage(slug, locale)` (content_pages, locale-aware via `translations` fallback), `fetchContentDocuments()` (library index), `fetchContentDocument(slug)` (single document detail). All follow the file's established `URLSearchParams` + `get<T>()` + snake_case→camelCase + catch-and-fallback pattern; never throw into a page. |
| `apps/web-next/src/lib/render-markdown.ts` | New | Shared `renderMarkdown(bodyMd)` helper: `marked` → `isomorphic-dompurify` with a tight `ALLOWED_TAGS`/`ALLOWED_ATTR` allowlist (headings, paragraphs, lists, tables, emphasis, links — no scripts/iframes/style/data-*). Used by all four new pages. |
| `apps/web-next/src/lib/render-markdown.test.ts` | New | 18 tests: empty/nullish input, structure preservation (headings, lists, tables, links, Cyrillic), XSS-safety (`<script>`, `onerror`, `javascript:`, `<iframe>`, inline `style=`, `data-*`). |
| `apps/web-next/src/lib/cms-content-pages.test.ts` | New | 19 tests: slug shape guard, URL param construction, locale-fallback resolution (en default / ru override / unsupported-locale fallback / null-translations fallback), failure paths (invalid slug, no match, network error, non-OK response) for all three new fetchers. |
| `apps/web-next/src/pages/about.astro` | New (via `pnpm gen:page about`) | About Us — mission/principles body_md from `content_pages`, chapter model + leadership team as structured UI (not raw markdown — richer than the source's flat prose), closing tagline. |
| `apps/web-next/src/pages/history.astro` | New (via `pnpm gen:page history`) | Events & History — founding timeline, Meetup #1/#2 metrics + speaker rosters (hardcoded structured data from the richest source, `AI-Qadam-sponsorship-deck-en.pdf`), growth trajectory, roadmap. |
| `apps/web-next/src/pages/partners.astro` | New (via `pnpm gen:page partners`) | Partner With Us — tiers, what partners unlock, current partners, regulator value prop, sponsorship CTA (`mailto:partners@aiqadam.org`, reusing the existing `site_settings.contact_email_partners` convention). |
| `apps/web-next/src/pages/rules.astro` | New (via `pnpm gen:page rules`) | Community Rules & Documents library index — lists all published `content_documents` rows via `fetchContentDocuments()`, each with its `status_label` badge and a link to `/rules/[slug]`. Uses the existing `<EmptyState>` L3 block for the zero-rows case. |
| `apps/web-next/src/pages/rules/[slug].astro` | New (via `pnpm gen:page "rules/[slug]"`) | One-document-per-page detail view. 404s (real `Response(null, {status:404})`, not the broken `Astro.redirect('/404')` pattern in `welcome/[slug].astro` which points at a nonexistent page) on miss/unpublished. Renders `body_md` via `renderMarkdown()`. |
| `apps/web-next/src/blocks/common/AppNav.astro` | Modified | Added About/History/Rules/Partners links to the center nav cluster, `hidden lg:inline-flex` so the compact mobile header doesn't get crowded with 6 total links. |
| `apps/web-next/src/blocks/common/AppFooter.astro` | Modified | Added a "Site" column (4th grid column) with the same 4 links, for discoverability below `lg` breakpoint where the nav hides them. |
| `apps/web-next/src/locales/en.json` / `ru.json` | Modified | New `about`, `rules`, `history`, `partners` sections; `nav.about/rules/history/partners`; `footer.site`. |
| `apps/web-next/package.json` | Modified | Added `marked@^18.0.10` (MIT, CommonMark parser — no markdown parser existed in this repo before this PR; `isomorphic-dompurify` was already present and reused for sanitization, per the dependency policy check-existing-deps-first step). |
| `pnpm-lock.yaml` | Modified | Lockfile update for the `marked` addition. |
| `tools/gen/page.ts` | Modified (drive-by fix) | Fixed a pre-existing Windows-incompatibility bug: `new URL(...).pathname` produces a leading-slash path (`/C:/Users/...`) on Windows, which `resolve()` then doubles into `C:\C:\Users\...\ENOENT`. Replaced with `fileURLToPath(new URL(...))`. Discovered because `pnpm gen:page` (the mandatory page-creation tool for this task) failed outright on this Windows dev machine before the fix — in scope because the task cannot proceed without a working generator. `tools/gen/cabinet.ts` has the identical bug but is untouched (out of scope; not exercised by this task). |

## Key Design Decisions

1. **`content_pages.translations` flat-JSON, not Directus-native o2m translations.** Confirmed via `landing_pages` (no translations field at all) that Directus-native translations are not actually proven anywhere in this schema; `events.translations` (flat per-locale JSON object, `#326`) is the one shipped, battle-tested i18n mechanism. Followed that pattern exactly rather than introducing a new one, per the impact analysis's explicit flag.

2. **`content_documents` seed data lives in git-tracked markdown files (`infrastructure/directus/content/rules/*.md`), not inline JSON in bootstrap.sh.** The impact analysis left this as an open decision. Inlining ~200KB of Cyrillic markdown as JSON-escaped bash string literals directly in `bootstrap.sh` would have made the file's diff unreviewable and fragile (a single stray `'` would break the script). A separate `seed-content-documents.sh` reads each document's own file via `jq --rawfile`, giving a normal, readable markdown diff per document in the PR, while remaining idempotent (`ensure`-equivalent: update-in-place by slug) and git-reproducible. `bootstrap.sh` itself only carries the two collection *schemas* plus public-read permission grants, matching the file's stated single-source-of-truth role for schema.

3. **Body-content rendering: new `marked` dependency + reused `isomorphic-dompurify`.** No markdown parser existed anywhere in this repo (confirmed by dependency scan). `welcome/[slug].astro`'s existing renderer is genuinely dead code (`set:html=""`, a literal empty string) and could not be copied. Chose `marked` (MIT, >10M weekly downloads, actively maintained, matches the "check downloads/license/maintenance" bar in AGENTS.md §8) over `markdown-it` for its smaller surface area and because CommonMark + GFM tables (needed for the Charter/MoU/Global-Board RACI matrices and appendix tables) is sufficient — no plugin ecosystem needed. `isomorphic-dompurify` is unchanged, just newly wired into a real pipeline with a tight tag/attribute allowlist rather than DOMPurify's permissive default.

4. **`welcome/[slug].astro`'s dead `set:html=""` binding was left as-is, not fixed as a drive-by.** The impact analysis flagged this as optional. Decided against fixing it in this PR: `renderMarkdown()` is now available for a future one-line fix, but changing `welcome/[slug].astro`'s rendering behavior is a live-page behavior change for FR-CMS-002/landing pages, outside FR-CMS-007's scope, and better verified by its own workflow with its own test/QA pass rather than bundled silently into this PR. Noted explicitly below as a tracked follow-up, not silently dropped.

5. **Chapter model / leadership team / meetup metrics rendered as structured Astro markup, not raw `content_pages.body_md`.** The source decks present this content as slides with distinct visual structure (stat tiles, speaker cards, chapter status chips) — reflowing it as flat markdown paragraphs would lose that structure and violate the design system's "dense information hierarchy like an ops tool" guidance. `content_pages.body_md` still carries the free-form mission/principles/governance prose (the part that IS naturally prose); the structured sections (chapters, leadership, meetup metrics/speakers) are hardcoded from the verified source content directly in the page, consistent with how `press.astro` hardcodes its brand-color palette and logo list rather than pulling everything from Directus.

6. **`rules/[slug].astro` 404s via a real `Response(null, {status: 404})`, not `Astro.redirect('/404')`.** `welcome/[slug].astro`'s copy-source uses `Astro.redirect('/404')`, but no `/404.astro` page exists in this codebase — that redirect target is itself broken. Used the correct, direct approach instead rather than propagating a known-bad pattern into new code.

7. **Nav placement: `AppNav` center cluster (`hidden lg:inline-flex`) + `AppFooter` 4th column.** AC-9 left this to CodeDeveloper judgment. Compact-header space is scarce (currently 2 center links); adding 4 more directly would crowd small/medium viewports. Desktop shows all 6 top-level links; the footer's new "Site" column covers discoverability below `lg`.

8. **`tools/gen/page.ts` Windows-path fix scoped narrowly.** Fixed only the file this task's mandatory generator step actually needed (`page.ts`); left the identical bug in `tools/gen/cabinet.ts` untouched since it's not exercised by this workflow — a minimal, justified in-scope fix rather than an opportunistic broader refactor.

## Architecture Rule Compliance

- **Module boundaries:** No `apps/api/src/modules/content/` created (binding constraint from `01-requirement-validation.md`/`02-impact-analysis.md`, reconfirmed by inspection before writing any code). `apps/api/src/modules/directus/` (user-sync, unrelated) untouched.
- **Tenant scoping:** Confirmed not applicable — these are global/public content pages (no `country_code` column on either new collection, no `countryFromHost` filtering added).
- **Zod at boundaries:** N/A — no NestJS controller/DTO surface added by this PR (Directus's own REST API is the only "backend", per the architecture correction).
- **No cross-schema queries:** Astro calls Directus's own HTTP API directly (`get<T>()` in `cms.ts`), same mechanism as every existing content page. No raw SQL, no cross-schema join.
- **No `any`:** Confirmed via `astro check` (0 errors, 0 warnings across all new/changed files) and manual review — all new interfaces/functions are fully typed.
- **Auth at controller level:** N/A — all four pages are intentionally public/unauthenticated per FR-CMS-007's own scope; no auth guard needed or added.
- **`no-raw-fetch` / `no-inline-style` / `page-not-from-generator` (ADR-0038 locks):** Verified via `pnpm arch:check` — 289 files scanned, 0 violations. All 5 new page files carry the `// @generated-from gen:page` marker and were produced by the generator, not hand-copied.
- **`dangerouslySetInnerHTML`:** Not used — all body_md rendering goes through Astro's `set:html` (server-side, post-sanitization), consistent with the one other page in this codebase (`welcome/[slug].astro`) that uses the same primitive; no React component in this PR renders raw HTML.

## Formatter Check

- `pnpm biome check` on all changed non-`.astro` TS/JSON files (`render-markdown.ts`, `render-markdown.test.ts`, `cms-content-pages.test.ts`, `cms.ts`, `en.json`, `ru.json`, `package.json`, `tools/gen/page.ts`): **clean, no fixes needed.**
- `.astro` files are repo-wide excluded from Biome (`biome.json` → `files.ignore: ["**/*.astro", ...]`) — no formatter runs on Astro files in this codebase; nothing to normalize there.
- Shell scripts (`bootstrap.sh` addition, `seed-content-documents.sh`) validated with `bash -n` (syntax OK) plus a live `jq`/JSON round-trip test of the seed payload construction and both new collection schema blocks (all valid JSON).

## Known Limitations

1. **AC-1 (About Us leadership bios) — RU source gap, not a code defect.** Per the triage doc, the Russian regulator deck's leadership slide text did not extract cleanly (mostly slide furniture, not bio prose); leadership bios/roles shown on `/about` use the English-source data (`AI_Qadam_Partnership_Deck`) for both locales' *structural* leadership section, since role titles are largely language-agnostic. The `content_pages.body_md`/`translations.ru.body_md` mission/principles prose IS locale-complete (Manifesto RU, Regulator Deck RU, Partnership Deck EN all had full parity per the triage doc). Directus content author can refine leadership bio copy post-deploy without a code change.

2. **AC-2/AC-3 (Community Rules & Documents) — no English version exists yet, by design per the requirement.** All 5 seeded `content_documents` rows are RU-only, matching AC-2's explicit scope ("ru-only for this pass ... explicit tracked gap, not a blocker"). The `rules.language_note` i18n key surfaces this on the page itself.

3. **AC-6 (Partner With Us RU content) — sponsorship-deck-ru.pdf font-embedding defect, pre-existing and outside this PR's ability to fix.** `/partners` renders full English content plus RU-available content from the Regulator Deck (which extracted cleanly); the sponsorship-deck-ru.pdf's Cyrillic text could not be recovered in this pass (systemic PDF font-encoding defect, no docx/pptx fallback source exists for that one file). Per AC-6 this is an explicitly acceptable release state, not a blocking defect — flagged again here for visibility. A future workflow re-exporting that PDF (Canva/Figma/Slides → PDF with embedded/subset fonts fixed) would let a follow-up pass complete the RU partnership copy.

4. **`welcome/[slug].astro`'s dead `set:html=""` binding is NOT fixed by this PR** (see Key Design Decision #4) — left as an explicit, separate follow-up rather than silently bundled. `renderMarkdown()` now exists and is the correct fix (`set:html={renderMarkdown(page.bodyMd)}`) whenever that follow-up lands.

5. **`tools/gen/cabinet.ts` carries the same Windows-path bug fixed in `tools/gen/page.ts`** (Key Design Decision #8) — untouched since this task never invokes it, flagged here so a future session doesn't have to rediscover it independently.

6. **E2E/Playwright coverage not added in this PR.** The impact analysis recommended smoke tests per page plus a `/rules` document-count/superseded-label check; this workflow's scope (per the CodeDeveloper role) is unit-level self-validation (fetchers + renderer, 37 new tests, all passing) — E2E authoring belongs to TestDesigner/TestStrategist per the standard workflow division and was not requested as part of this step.

## Retry 1 — MAJOR-1 Fix

SecurityReviewer's `04-security-review.md` returned one MAJOR finding
(non-blocking, `failed-retry`): `render-markdown.ts`'s `href` safety
relied entirely on `isomorphic-dompurify`'s *default* `ALLOWED_URI_REGEXP`
rather than an explicit, project-documented allowlist, and the test file
didn't cover the raw-HTML-anchor XSS path (as opposed to markdown
link-syntax). Empirically the default worked correctly (reviewer tested
11 vectors), but nothing pinned that behavior against a future
`isomorphic-dompurify` version bump silently loosening it.

**Checked `docs/04-development/security/security.md` first**, per the
task instructions, rather than using the reviewer's suggested
`https|mailto` regex verbatim — it documents this project's actual
policy: *"URLs — explicit allowed schemes (https, mailto, tg); no
`javascript:`, no `file:`."* Used that three-scheme allowlist (adding
`tg` for Telegram deep links, consistent with how this codebase treats
`tg` elsewhere) instead of the reviewer's narrower two-scheme suggestion.

### Sanitizer config — before / after

**Before** (`render-markdown.ts`, `DOMPurify.sanitize()` call):
```ts
return DOMPurify.sanitize(rawHtml, {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  ALLOW_DATA_ATTR: false,
});
```
No `ALLOWED_URI_REGEXP` — schemes were filtered only by DOMPurify's
built-in, unconfigured default.

**After:**
```ts
const ALLOWED_URI_REGEXP = /^(?:https?|mailto|tg):/i;
// ...
return DOMPurify.sanitize(rawHtml, {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  ALLOW_DATA_ATTR: false,
  ALLOWED_URI_REGEXP,
});
```
`ALLOWED_URI_REGEXP` is declared as a module-level constant (same
pattern as `ALLOWED_TAGS`/`ALLOWED_ATTR`) with a comment citing
security.md's scheme policy and explaining why it's now explicit rather
than implicit. `https?` covers both `http:` and `https:` (Directus/CMS
external links may legitimately be either); `mailto:` for the existing
`partners@aiqadam.org`-style links; `tg:` for Telegram deep links.
`javascript:`, `data:`, `vbscript:`, `file:` are all excluded — matches
security.md exactly.

### New test cases added (`render-markdown.test.ts`)

Added 3 cases to the existing `XSS safety` `describe` block, immediately
after the existing markdown-link-syntax `javascript:` test:

1. **Raw HTML anchor, not markdown-link syntax** —
   `<a href="javascript:alert(1)">click</a>` embedded directly in the
   markdown input. This is the path the reviewer flagged as untested and
   most realistic (editor-pasted rich text, or any future wider-authoring
   scenario): `marked` passes raw inline HTML through untouched, so this
   exercises DOMPurify as the sole line of defense, with no `marked`
   escaping involved.
2. **`data:` URI href** —
   `<a href="data:text/html,<script>alert(1)</script>">click</a>`.
3. **Mixed-case / whitespace-obfuscated scheme** —
   `<a href="  jaVaSCript:alert(1)">click</a>` (leading whitespace +
   mixed case, a classic filter-bypass shape).

All three follow the file's existing "exercise the real pipeline, no
mocking" convention — no DOMPurify/marked mocks, real installed package
versions.

### Re-validation results

- `pnpm vitest run src/lib/render-markdown.test.ts` (from `apps/web-next`) —
  **21/21 tests pass** (18 original + 3 new).
- `pnpm typecheck` (`apps/web-next`) — **0 errors, 0 warnings** on
  `render-markdown.ts`/`render-markdown.test.ts` (pre-existing hints in
  unrelated files, e.g. `csat-form.test.ts`, `onboard.astro`, are
  untouched by this change).
- `pnpm arch:check` (repo root) — **passed**, 289 files scanned, mode=full.
- `pnpm biome check apps/web-next/src/lib/render-markdown.ts
  apps/web-next/src/lib/render-markdown.test.ts` — **clean, no fixes
  applied**.

Only `render-markdown.ts` and `render-markdown.test.ts` were touched, as
scoped by the retry instructions — no other file in the original PR was
modified.

## Retry 2 — Windows `ARG_MAX` fix in `seed-content-documents.sh` (Orchestrator drive-by, post-TestRunner)

TestRunner's E2E attempt (`07-test-results.md`) found that
`infrastructure/directus/seed-content-documents.sh` (added in this
workflow) fails on Windows/MSYS once a document's `body_md` exceeds
roughly 5-10KB: `curl --data "${body}"` passes the full JSON payload as a
literal shell/curl argument, hitting `ARG_MAX`. Confirmed empirically:
the 5KB Manifesto seeded fine; the 42KB Charter failed with `Argument
list too long` and aborted the rest of the script (`set -euo pipefail`),
leaving only 1 of 5 `content_documents` rows seeded.

**Fix:** write the JSON payload to a `mktemp` temp file per call and pass
`--data "@${body_json_file}"` instead of the inline literal — `curl`
streams `@file` payloads rather than passing them as argv, so this is
immune to `ARG_MAX` regardless of document size. `trap "rm -f ...' RETURN`
cleans up the temp file after each `seed_content_document()` call. Same
bug class, same fix shape as the `tools/gen/page.ts` Windows-path fix
made earlier in this workflow (CodeDeveloper Retry 1 predates this;
this is a second, independent instance in a different new file).

**Verification (live, not just `bash -n`):** brought up a real local
Postgres + Directus (`docker compose up -d postgres directus`), ran
`bootstrap.sh` (idempotent, confirmed `content_pages`/`content_documents`
already existed from a prior session), then ran the fixed
`seed-content-documents.sh` — **all 5 rows seeded successfully**
(`manifesto` updated, `charter-v0-1`/`kazakhstan-mou`/
`global-board-polozhenie-v1`/`soglashenie-v1` created), including the
42KB Charter that previously failed. Confirmed via direct Directus REST
query: `charter-v0-1`'s `body_md` is 43,131 bytes (full content, not
truncated) and contains "Хранитель" 11 times (terminology preserved
verbatim, per AC-3). Stopped both containers after verification —
working tree left clean, no other services affected.

`bash -n infrastructure/directus/seed-content-documents.sh` — syntax OK.
`shellcheck` is not installed in this environment; the live end-to-end
run is stronger verification than a static lint pass would have been.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: >
    FR-CMS-007 implemented in full: two new Directus collections
    (content_pages, content_documents) with public read-only grants,
    5 seeded governance documents reflowed faithfully from source with
    per-document terminology preserved verbatim (AC-3), three new cms.ts
    fetchers, a new shared markdown-to-sanitized-HTML renderer (marked +
    isomorphic-dompurify) with 21 passing tests, five new generator-created
    Astro pages (about/history/partners/rules/rules-[slug]), nav+footer
    placement, and bilingual i18n strings. pnpm arch:check (289 files),
    astro check (0 errors/0 warnings on changed files), pnpm build, and
    the full vitest suite all pass. Biome clean on every non-.astro
    changed file (.astro is repo-wide excluded from Biome). One
    pre-existing Windows-incompatibility bug in tools/gen/page.ts was
    fixed as an in-scope blocker (the generator is mandatory for this
    task and did not run at all on Windows before the fix).

    Retry 1: SecurityReviewer's one MAJOR finding (implicit reliance on
    DOMPurify's default ALLOWED_URI_REGEXP, no raw-HTML-anchor XSS test
    coverage) is fixed — render-markdown.ts now sets an explicit
    ALLOWED_URI_REGEXP (/^(?:https?|mailto|tg):/i) matching
    security.md's documented "https, mailto, tg" scheme allowlist, and
    3 new tests cover the raw-HTML-anchor, data:, and obfuscated-scheme
    paths the reviewer identified as uncovered. All re-validation
    (vitest, typecheck, arch:check, biome) is clean.
  architecture_rule_compliance:
    module_boundaries: confirmed — no apps/api/src/modules/content/ created
    tenant_scoping: not applicable — global/public content, no country_code
    zod_at_boundaries: not applicable — no NestJS surface added
    no_cross_schema_queries: confirmed — Directus REST API only
    no_any: confirmed — 0 typecheck errors/warnings on all new/changed files
    auth_at_controller_level: not applicable — pages are intentionally public
  formatter_check: clean (biome on all non-astro files; .astro excluded repo-wide)
  known_limitations:
    - "AC-1: leadership bios sourced from EN deck for both locales (RU regulator-deck slide text did not extract cleanly) — content-authoring gap, not code defect."
    - "AC-2/AC-3: Community Rules & Documents is RU-only by explicit requirement scope, not a gap."
    - "AC-6: /partners RU content is best-effort per the sponsorship-deck-ru.pdf font-embedding defect — explicitly acceptable per AC-6's own text."
    - "welcome/[slug].astro's dead set:html=\"\" binding intentionally left unfixed — separate follow-up, renderMarkdown() now available for it."
    - "tools/gen/cabinet.ts has the same Windows-path bug fixed in tools/gen/page.ts — untouched, out of scope, flagged for awareness."
    - "No new E2E/Playwright tests added — out of this step's scope per the standard TestDesigner/TestStrategist division of labor."
  blocking: false
```
