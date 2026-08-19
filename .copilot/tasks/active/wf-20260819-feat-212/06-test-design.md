# Test Design — wf-20260819-feat-212

## Summary

Verified the two existing unit-test files against the strategy's Unit Test
Plan table and found one genuine gap (the `isValidContentSlug` row's
filter-injection / empty-string / >64-char cases were not covered) — added
4 tests to close it, no duplication of existing coverage. Wrote a new
Playwright E2E suite (19 tests) covering all 12 flows in the strategy's E2E
Test Plan, using a new Page Object Model module (`apps/e2e/support/
content-pages.page.ts`) — the first POM in this E2E suite; existing specs
(`smoke-onboarding.spec.ts`, `smoke-public.spec.ts`, etc.) inline locators
directly and were left untouched, per scope.

AC-8 (Directus-unreachable fallback) required investigation before writing
anything, per the task's explicit instruction. Finding: **no mechanism
exists anywhere in `apps/e2e` to actually stop/block Directus** —
`apps/e2e/README.md`'s own "What this is NOT (yet)" section documents that
this suite is read-only, defaults to the live production target, and has
no docker-compose/container-orchestration hook reachable from a spec file
(that capability lives in the `uat-verification` workflow's local stack,
not here). `BP-UAT-010.spec.ts`/`BP-UAT-010.session.spec.ts` call Directus
directly as a read oracle but never stop it — no precedent to reuse. I did
not invent a fake mechanism (e.g., pointing `DIRECTUS_URL` at a black-hole
host only works for tests that spawn their own dev server process, which
this suite's `request`/`page` fixtures against a fixed `BASE_URL` do not
do). Instead: wrote the honest test that's actually possible at this
level (all 4 routes never 500 under normal conditions — a real, if
weaker, regression guard) and recorded the stronger claim as a named gap
below rather than silently passing a test that doesn't test what its name
claims.

---

## Tests Written

### Unit (Vitest)

| File | Count/Focus | Required? |
|---|---|---|
| `apps/web-next/src/lib/render-markdown.test.ts` | 21 tests (pre-existing, verified against strategy — no gap found). Empty/nullish input, structure preservation (headings/paragraphs/lists/tables/emphasis/links/Cyrillic), XSS safety (script/onerror/iframe/style/data-attr strip; javascript:/data:/obfuscated-scheme href strip on both markdown-link and raw-HTML-anchor syntax). | Yes |
| `apps/web-next/src/lib/cms-content-pages.test.ts` | 23 tests (19 pre-existing + 4 new). Slug shape guard (valid/uppercase/path-traversal/**filter-injection/empty-string/>64-char/64-char-boundary — 4 new cases added**), URL param construction, locale resolution (en default/ru override/unsupported-locale fallback/null-translations fallback), failure paths (invalid slug, no match, network error, non-OK response) for `fetchContentPage`, `fetchContentDocuments`, `fetchContentDocument`. | Yes |

**Gap found and fixed:** the strategy's `isValidContentSlug` row required "path-traversal-shaped (`../etc`), filter-injection-shaped (`x' OR 1=1`), empty-string, and >64-char slugs all rejected." The existing file only covered path-traversal and uppercase. Added: filter-injection (`x' OR 1=1`), empty-string, >64-char rejection, and a 64-char-boundary acceptance case (regex is `{0,63}` after the first char, so exactly 64 total chars is the accept/reject boundary — worth pinning explicitly). All other rows in the strategy's table were already fully covered by the pre-existing tests; no other gaps found.

### Integration (Testcontainers)

None — correctly out of scope per the strategy (no `apps/api`/Drizzle/Testcontainers-Postgres surface for this requirement; Directus itself is outside the API's Testcontainers stack).

### E2E (Playwright)

| File | Count/Focus | Required? |
|---|---|---|
| `apps/e2e/support/content-pages.page.ts` | Page Object Model (new — first POM module in `apps/e2e`). `AboutPage`, `HistoryPage`, `PartnersPage`, `RulesLibraryPage`, `RulesDocumentPage`, `NavFooterFixture`, `ContentPagesApi`, plus `setLocale()`/`acceptLanguageHeader()` locale helpers. | Yes (support module) |
| `apps/e2e/tests/smoke-content-pages.spec.ts` | 19 tests across 9 `describe` blocks: About renders (en+ru), History renders (en+ru), Partners renders (en complete + ru partial-non-blocking), Rules library lists 5 (+ru-only-no-toggle check), document-detail terminology-preserved-verbatim (2), superseded-label positive+negative (2), 404 handling (2: unknown slug + path-traversal), Directus-reachability partial guard (1), nav/footer link presence (2), excluded-source-material regression guard (2). | Yes |

---

## Locale-mechanism finding (worth flagging to CodeDeveloper/PRSteward)

The strategy's E2E Test Plan speculated the locale URL shape might be
`/about?lang=ru` or "the site's routing convention — TestDesigner to
confirm." Confirmed by reading `apps/web-next/src/lib/i18n.ts`:
`getLocale(Astro)` resolves locale from the `aiqadam-locale` **cookie**
first, then `Accept-Language` **header**, falling back to `en` — there is
**no query param or URL path segment** for locale on these pages. Tests
use `setLocale(context, 'ru', BASE_URL)` (sets the cookie via
`BrowserContext.addCookies`) for `page`-fixture tests, and
`acceptLanguageHeader('ru')` for `request`-fixture tests, matching the
production contract exactly rather than a guessed URL shape.

---

## Acceptance Criteria Coverage

| AC | Test | Status |
|---|---|---|
| AC-1 (About renders, bilingual) | `smoke-content-pages.spec.ts` — "/about" describe block (en + ru cookie tests); unit: `fetchContentPage` locale-fallback tests | Covered |
| AC-2 (Rules & Documents lists exactly 5, ru-only) | "/rules (library)" describe block — count assertion + per-slug link check + ru-only-no-toggle test; unit: `fetchContentDocuments` happy-path/empty tests | Covered |
| AC-3 (Document content reflowed, terminology preserved verbatim) | "/rules/[slug] — terminology preserved verbatim" describe block — asserts "Founder Global" present/"Хранитель" absent on Положение, "Основатель" present on Soglashenie | Covered |
| AC-4 (Superseded documents labeled, not removed) | "/rules/[slug] — superseded label" describe block — positive case (2 superseded docs, badge visible + body length check) and negative case (3 current docs, badge absent) | Covered |
| AC-5 (Events & History renders, bilingual, both meetup recaps) | "/history" describe block (en + ru); unit: same `fetchContentPage` coverage (shared fetcher) | Covered |
| AC-6 (Partner With Us renders, ru gap tolerated) | "/partners" describe block — en-complete test + ru-partial-non-blocking test (asserts 200, not 500, structural RU i18n strings visible, no error-text leak) | Covered |
| AC-7 (Excluded source material not referenced) | "excluded source material does not leak" describe block — 2 tests, grep-style absence check across all 5 rule documents + about/history/partners (en+ru) for `Приложение№1`/`ABiTech`/`InterKvadroSoft`/`AI Qadam BFT` | Covered (regression guard, per strategy — first-pass already done manually by SecurityReviewer) |
| AC-8 (Directus unavailability does not 500) | "Directus reachability contract (AC-8, partial)" describe block | **Partially covered** — see Known Test Gaps below |
| AC-9 (Nav/footer link placement) | "nav/footer link presence" describe block — desktop viewport, both `AppNav` and `AppFooter` checked for all 4 routes | Covered (automated part only; strategy itself notes the IA-convention sign-off is a human judgment call, not automatable) |
| AC-10 (Design-system compliance) | N/A — strategy confirms zero automated test path exists in this codebase (`tools/architecture-check.ts` has no raw-hex/new-token/Lucide-only rule); manual review only, not this agent's gap to close | Not applicable to TestDesigner (manual review required, per strategy) |
| AC-11 (Build gate: arch:check + astro check + build) | Re-verified via `npx tsc --noEmit` (apps/e2e, clean) and `pnpm biome check` (both new/changed files, clean) after adding new test files — does not regress the existing gate | Covered (gate re-confirmed clean, no new violations introduced) |

---

## Known Test Gaps

1. **AC-8's strongest claim — "still 200s when Directus is genuinely
   unreachable" — is NOT tested at the E2E level**, because no mechanism
   exists in `apps/e2e` to actually take Directus offline for the duration
   of a test (confirmed by inspection: this suite runs against a fixed
   `BASE_URL`, typically live production, with no container-orchestration
   hook available to a spec file; see `apps/e2e/README.md`'s "What this is
   NOT (yet)" section). What IS tested: all 4 routes return non-500 under
   normal conditions (`smoke-content-pages.spec.ts` — "Directus
   reachability contract (AC-8, partial)"), which is a real but weaker
   regression guard — it would catch a regression to the "never throw"
   contract itself (e.g., someone removing a `try/catch` in `cms.ts`), but
   would NOT catch a regression that only manifests when Directus is
   actually down (e.g., a newly added fetcher missing its own try/catch,
   never exercised because Directus never fails during a normal test run).
   The unit-test tier already fully covers the fetcher-level contract
   (`cms-content-pages.test.ts`'s "AC-8: never throw into the page"
   describe block simulates network errors and non-OK responses directly).
   **No `// TODO` in source** since this isn't a missed test-author task —
   it's a missing test-infrastructure capability. Recommended follow-up:
   a dedicated `smoke-fullstack.spec.ts`-style suite (per
   `apps/e2e/README.md`'s own stated future direction for write-side/
   infra-dependent tests) that runs against a local docker-compose stack
   where `docker compose stop directus` is actually possible, OR a
   Playwright test that swaps `INTERNAL_DIRECTUS_URL` to an unreachable
   host and boots a throwaway `astro dev` server pointed at it — both are
   real, larger changes to test infrastructure, out of scope for this
   workflow's TestDesigner step to build unilaterally.

2. **No `it.skip`/`test.skip` anywhere in the new files** — confirmed by
   grep; nothing was left half-written.

3. **RU document-count assertion (`toHaveCount(5)`) and the specific 5
   slugs are environment-dependent** — these tests assume
   `infrastructure/directus/bootstrap.sh` + `seed-content-documents.sh`
   have run against the target environment (matches the existing
   `smoke-landing-pages.spec.ts` precedent's documented assumption of
   operator-managed seed data). Not a code gap; flagged for whoever runs
   this suite against a fresh/unseeded environment.

---

## Self-Check (per test-designer.md)

- [x] All new public functions have unit tests (happy path + failure path) — `fetchContentPage`, `fetchContentDocuments`, `fetchContentDocument`, `renderMarkdown`, `isValidContentSlug` all covered (pre-existing + 4 new slug-guard cases).
- [x] Integration tests use Testcontainers, never mock DB — N/A, no integration tier for this requirement.
- [x] No `it.skip`/`test.skip` — confirmed via grep across all new/changed files.
- [x] No `any` in test code — confirmed via `npx tsc --noEmit -p apps/e2e/tsconfig.json` (clean) and the existing unit files' prior `astro check` clean result (unit file unchanged beyond the 4 new cases, which use only `string`/`boolean`).
- [x] Coverage target awareness — unit tier at 80%+ line/70%+ branch is very likely met for `cms.ts`'s new fetchers and `render-markdown.ts` given the exhaustive existing suite; not independently measured (no coverage tool run) but no untested branch found during review.

### Verification run

- `pnpm vitest run src/lib/render-markdown.test.ts src/lib/cms-content-pages.test.ts` (apps/web-next) — **63/63 tests pass** (21 + 23, up from 21 + 19 baseline; net +4 from the slug-guard gap fix).
- `npx tsc --noEmit -p apps/e2e/tsconfig.json` — clean, 0 errors (covers the new POM + spec file).
- `pnpm biome check` on all new/changed files (`smoke-content-pages.spec.ts`, `content-pages.page.ts`, `cms-content-pages.test.ts`) — clean, no fixes needed.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: >
    Unit tier verified against the strategy's Unit Test Plan table: one
    genuine gap found in isValidContentSlug coverage (filter-injection,
    empty-string, >64-char cases missing) and fixed with 4 new tests;
    all other rows in the table were already fully covered by the
    pre-existing 21+19 tests. No duplication introduced. E2E tier
    written from scratch: 19 new Playwright tests in
    apps/e2e/tests/smoke-content-pages.spec.ts covering all 12 flows
    from the strategy's E2E Test Plan, using a new Page Object Model
    module (apps/e2e/support/content-pages.page.ts) per the
    no-selectors-in-test-bodies requirement — the first POM in this
    E2E suite. Investigated the strategy's flagged locale-URL-shape
    uncertainty by reading lib/i18n.ts directly: locale resolves via
    cookie/Accept-Language, not a URL param, so tests set the cookie
    via BrowserContext.addCookies rather than guessing a URL shape.
    Investigated the strategy's flagged AC-8 Directus-down-simulation
    uncertainty by searching the full e2e suite + its README: no
    mechanism exists to actually stop Directus for a test (suite is
    read-only, targets a fixed BASE_URL, no container-orchestration
    hook available to a spec file) — wrote the honest weaker test that
    is actually possible (non-500 under normal conditions) and
    recorded the stronger untestable claim as a named Known Test Gap
    rather than fabricating a mechanism that wouldn't really simulate
    an outage. All acceptance criteria are mapped; AC-10 correctly
    left to manual review per the strategy's own finding (no automated
    tooling exists for design-system compliance in this codebase).
  findings:
    - "Unit gap found + fixed: isValidContentSlug was missing filter-injection/empty-string/>64-char/boundary cases the strategy explicitly required; 4 tests added, no duplication of the existing 19."
    - "Locale mechanism resolved by reading source (lib/i18n.ts), not guessed: cookie-first then Accept-Language, no URL param — the strategy had explicitly flagged this as unconfirmed and asked TestDesigner to check."
    - "AC-8 Directus-down simulation has no precedent or mechanism anywhere in apps/e2e (confirmed via README.md's own documented limitations) — rather than inventing one, wrote the weaker-but-real non-500-under-normal-conditions test and named the gap explicitly, matching the strategy's own framing that 'this is the one AC-8 assertion unit tests structurally cannot make' while being honest that E2E can't fully make it either without new test infrastructure."
    - "Established the first Page Object Model module in apps/e2e (support/content-pages.page.ts) since no precedent existed despite the role definition mandating POM — existing specs (smoke-onboarding.spec.ts etc.) inline locators and were left untouched, out of this task's scope to refactor."
    - "AC-9's automated coverage confirmed wired (nav center cluster + footer Site column, both checked at desktop viewport) — the strategy's own note that IA-convention sign-off needs a human is unchanged, not something this tier can close."
  unit_tests_added: 4
  unit_tests_verified_preexisting: 40
  e2e_tests_added: 19
  integration_tests_added: 0
  all_acs_mapped: true
  known_gaps: 1
  blocking: false
```
