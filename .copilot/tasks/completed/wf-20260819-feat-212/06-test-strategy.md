# Test Strategy — wf-20260819-feat-212

## Requirement

**`FR-CMS-007`** — Four new public, unauthenticated Astro pages in
`apps/web-next`: About Us (`/about`), Community Rules & Documents
(`/rules` + `/rules/[slug]`), Events & History (`/history`), Partner With
Us (`/partners`). Content is authored/translated in Directus
(`content_pages`, `content_documents` — both new collections this
workflow) and read via the existing direct Astro-SSR-to-Directus pattern
in `apps/web-next/src/lib/cms.ts`. No NestJS module was created (binding
architecture correction). CodeDeveloper's implementation (`03-code-summary.md`)
is complete and passed SecurityReviewer's retry verification
(`04-security-review.md`, `status: passed`, `findings: []`) — this
strategy plans test coverage against the *as-built* code, not a future
design.

---

## Rubric Score

| Criterion | Applies? | Points |
|---|---|---|
| Touches tenant-scoped data | No — global/public content, no `country_code` on either new collection | 0 |
| New API endpoint | No — no NestJS controller/route added (binding architecture correction; confirmed by inspection in `02-impact-analysis.md` and `03-code-summary.md`) | 0 |
| Business rule with edge cases (capacity, waitlist, dates) | No — no capacity/date-conflict/waitlist logic; slug lookup and locale fallback are data-shape concerns, not business rules | 0 |
| Cross-module service call | Yes — Astro SSR (`apps/web-next`) → Directus REST API (`content_pages`, `content_documents`) via new `cms.ts` fetchers | +1 |
| New database query | Yes — three new fetchers (`fetchContentPage`, `fetchContentDocuments`, `fetchContentDocument`), each a new Directus collection query | +1 |
| Pure function / utility | Yes — `renderMarkdown()` (markdown → sanitized HTML) | 0 |
| UI-only change (no logic) | Partially — nav/footer link additions | 0 |

**Score: 2** → by the rubric's literal threshold (`< 4` → unit tests
sufficient), this scores below the Integration-tests line and far below
the E2E line (`≥ 6`).

**Override, stated explicitly:** E2E is included anyway, for reasons the
rubric's point criteria don't capture because they're aimed at
API/business-logic changes, not user-facing page delivery:

1. The rubric's criteria (tenant data, new endpoint, business-rule edge
   cases) all target *backend* risk. This requirement's actual risk
   surface — five new public routes rendering correctly, a document
   library with a dynamic detail route, Directus-outage resilience
   (AC-8), and content-completeness ACs (AC-1 through AC-7) — is a
   *page-rendering* risk that only an E2E/Playwright check against a real
   (or realistically stubbed) route can catch. Unit tests on
   `cms.ts` fetchers and `renderMarkdown()` cannot observe whether
   `about.astro` actually calls the fetcher, passes the right slug, or
   renders the returned data into visible markup.
2. Direct precedent: `apps/e2e/tests/smoke-onboarding.spec.ts` already
   covers `/welcome/[slug]` (`landing_pages`, the closest existing
   analog — also a Directus-content SSR page with a dynamic route) at
   E2E level despite that feature likely scoring similarly low on this
   same rubric. Skipping E2E here would leave newer, larger page surface
   (5 routes vs. 1) with strictly less coverage than its own precedent.
3. `02-impact-analysis.md`'s own Test Scope section recommends E2E
   smoke coverage per page plus the `/rules` document-count and
   superseded-label checks, and explicitly asks TestStrategist to make
   the final call — this section is that call.

**No integration-test tier** (Testcontainers/Postgres) applies: score is
below 4 on that axis too, and substantively there is no `apps/api`
module, no Drizzle/Postgres table, and no NestJS service under test.
Testcontainers-Postgres is not part of this workflow's stack at all
(Directus is not provisioned inside the API's Testcontainers setup).

---

## Required Test Levels

- [x] Unit (Vitest)
- [ ] Integration (Testcontainers)
- [x] E2E (Playwright) — justified above as an explicit override of the raw rubric score

---

## Unit Test Plan

Most unit coverage already exists and passed (`03-code-summary.md`: 21
tests in `render-markdown.test.ts`, 19 tests in `cms-content-pages.test.ts`,
all green). This plan documents what those tests must cover as the
strategy's baseline — TestDesigner should verify the existing files meet
this bar and add any gap found, rather than duplicate what's already
written.

| Target | Happy Path | Failure Paths |
|---|---|---|
| `fetchContentPage(slug, locale)` (`apps/web-next/src/lib/cms.ts`) | Valid slug + `status=published` row returns mapped `ContentPage` object; `locale='ru'` resolves from `translations.ru.*` when present; `locale='en'` (or omitted) resolves from top-level/default fields | Invalid slug shape (fails `isValidContentSlug` regex) returns `null` without a network call; no matching row returns `null`; network error / non-OK response returns `null` (never throws into the page); unsupported locale falls back to default-locale fields; `translations` field `null`/absent falls back cleanly |
| `fetchContentDocuments()` (`cms.ts`) | Returns array of published `content_documents` rows sorted by `display_order` | Empty result set returns `[]` (not `null`/undefined); network error returns `[]` |
| `fetchContentDocument(slug)` (`cms.ts`) | Valid slug returns single mapped document row (`title`, `sourceDocumentLabel`, `statusLabel`, `bodyMd`, `displayOrder`) | Invalid slug shape returns `null` pre-network; no match returns `null`; network error returns `null` |
| `renderMarkdown(bodyMd)` (`apps/web-next/src/lib/render-markdown.ts`) | Headings, paragraphs, lists, tables, emphasis, links, Cyrillic text all render to expected HTML structure; `https://`, `http://`, `mailto:`, `tg:` scheme links preserve `href` | `null`/empty/undefined input returns empty string, not a throw; `<script>`, `onerror`/`onclick`/`onload` attributes, `<iframe>`, `<style>`, `<svg>`, inline `style=` attr, `data-*` attrs all stripped; `javascript:`, `data:`, `vbscript:`, `file:`, `ftp:` scheme hrefs (markdown-link syntax **and** raw-HTML-anchor syntax, both plain and case/whitespace/newline/tab-obfuscated) have `href` stripped entirely; relative (`/about`) and protocol-relative (`//host`) hrefs are stripped (documented fail-safe behavior per `04-security-review.md`'s retry note — assert this explicitly so a future loosening is caught, not just implicitly tolerated) |
| `isValidContentSlug(slug)` (slug regex guard, `cms.ts`) | `/^[a-z0-9][a-z0-9-]{0,63}$/`-conforming slugs accepted | Path-traversal-shaped (`../etc`), filter-injection-shaped (`x' OR 1=1`), empty-string, and >64-char slugs all rejected |

---

## Integration Test Plan

**Not applicable — no scenarios planned.** No `apps/api` module, no
Drizzle/Postgres schema, no NestJS service participates in this
requirement (confirmed by `02-impact-analysis.md` and `03-code-summary.md`
by direct code inspection, not assumption). Directus itself is not part
of the API's Testcontainers stack, so "integration test" in the
Testcontainers-Postgres sense has no applicable target here. Any
live-Directus behavior (including the resilience behavior in AC-8) is
covered instead at the E2E tier below, where a running Directus instance
(or its deliberate absence) is the natural test boundary.

| Scenario | Infrastructure | Key Assertions |
|---|---|---|
| *(none)* | — | — |

---

## E2E Test Plan

Follows the existing `apps/e2e/tests/smoke-onboarding.spec.ts` pattern
(the `/welcome/[slug]` precedent — same direct-Directus-SSR page shape).

| User Flow | Entry Point | Exit Assertion |
|---|---|---|
| About Us page renders | `GET /about` (and locale variant, e.g. `/about?lang=ru` or the site's routing convention — TestDesigner to confirm actual i18n URL/query shape from `i18n.ts`) | 200 status; H1 present; mission statement, principles section heading, governance summary, chapter model, leadership team section, and closing tagline all present in rendered DOM; no raw hex/non-Lucide icon markup (spot-check, not exhaustive — see AC-10 note under Gate Result) |
| Events & History page renders | `GET /history` (ru + en) | 200 status; H1 present; founding-timeline element present; Meetup #1 recap section (metrics + speaker roster + talk titles) present; Meetup #2 recap section present; growth-trajectory and roadmap sections present |
| Partner With Us page renders (EN complete) | `GET /partners` (en) | 200 status; tiers section, current-partners section, regulator/government value-prop section, and sponsorship CTA (`mailto:partners@aiqadam.org` link) all present |
| Partner With Us page renders (RU partial, non-blocking) | `GET /partners` (ru) | 200 status (not 500); page renders without throwing even where RU sponsorship content is incomplete — assert presence of at least the regulator-deck-sourced RU content and absence of a raw error/stack trace in the response body |
| Community Rules & Documents library lists all 5 | `GET /rules` | 200 status; exactly 5 document entries listed (Manifesto, Charter v0.1, Kazakhstan MoU, Global Board Положение v1.0, Соглашение v1.0); each entry links to a distinct `/rules/[slug]` URL; page renders in Russian (no `en` toggle/locale-switch control present) |
| Document detail page renders, terminology preserved verbatim | `GET /rules/global-board-polozhenie-v1` and `GET /rules/soglashenie-v1` | 200 status on both; `global-board-polozhenie-v1` page contains "Founder Global" (or its actual source term) and does **not** contain "Хранитель"; `soglashenie-v1` page contains "Основатель" verbatim; neither page's text has been altered toward a unified/reconciled term |
| Superseded-document label renders | `GET /rules/global-board-polozhenie-v1` and `GET /rules/soglashenie-v1` | Visible "Superseded by Charter v0.1" (or equivalent design-system-styled label) text present on both pages; full original document body is still present in the DOM (not truncated, redacted, or replaced by a redirect) |
| Current-document pages carry no superseded label | `GET /rules/manifesto`, `GET /rules/charter-v0-1`, `GET /rules/kazakhstan-mou` | No "Superseded" label text present on any of the three |
| Unknown document slug 404s cleanly | `GET /rules/not-a-real-document` | Real `404` HTTP status (per `03-code-summary.md`'s `Response(null, {status: 404})` implementation — explicitly not the broken `Astro.redirect('/404')` pattern the codebase already has elsewhere); no unhandled-exception/500 |
| Directus-unreachable fallback (AC-8) | `GET /about`, `/rules`, `/history`, `/partners` with Directus stopped/unreachable (test harness stops the Directus container or points `DIRECTUS_URL`/internal-network URL at an unreachable host for the duration of this test only) | All four routes return a non-500 status (200 with fallback content, matching the `SITE_SETTINGS_DEFAULTS`-style pattern) rather than an unhandled exception; confirms `03-code-summary.md`'s "never throw into the page" fetcher contract holds at the actual page level, not just in the unit-tested fetcher return value — **this is the one AC-8 assertion that unit tests structurally cannot make**, since unit tests exercise the fetcher in isolation, not the full SSR page-render path |
| Nav/footer links present (AC-9) | `GET /` (or any page rendering `AppNav`/`AppFooter`) | Desktop viewport: nav contains links to `/about`, `/rules`, `/history`, `/partners`; footer "Site" column contains the same 4 links (covers the sub-`lg` breakpoint discoverability path per `03-code-summary.md`'s design decision) |
| Excluded source material does not leak (AC-7) | `GET /about`, `/rules/*` (all 5), `/history`, `/partners` (ru + en) | Full rendered body text of every page does not contain content fingerprints unique to the excluded files (e.g. no `Приложение№1`/ABiTech/InterKvadroSoft contract-annex language; no `AI Qadam BFT`-specific internal-roadmap product terms) — a coarse grep-style text-absence check across all page bodies, not a semantic content audit (semantic completeness is a content-authoring concern, already spot-checked once by `04-security-review.md`'s grep for `BFT`/`roadmap`/`BUILD`; this E2E check is a regression guard, not a first-pass discovery mechanism) |

---

## Acceptance Criteria → Test Mapping

| AC | Test Level | Test Description |
|---|---|---|
| AC-1 (About Us renders, bilingual) | E2E + Unit | E2E: "About Us page renders" flow (both locale variants). Unit: `fetchContentPage` locale-fallback tests cover the data layer that feeds it. |
| AC-2 (Rules & Documents lists exactly 5, ru-only) | E2E + Unit | E2E: "Community Rules & Documents library lists all 5" flow. Unit: `fetchContentDocuments()` happy-path/empty-result tests. |
| AC-3 (Document content reflowed, not synthesized — terminology preserved verbatim) | E2E | "Document detail page renders, terminology preserved verbatim" flow — this is a content-fidelity check that can only be made meaningfully against actual rendered page text, not a unit-testable data-shape concern. |
| AC-4 (Superseded documents labeled, not removed) | E2E | "Superseded-document label renders" flow (positive case) + "Current-document pages carry no superseded label" flow (negative case, guards against the label leaking onto the wrong documents). |
| AC-5 (Events & History renders, bilingual, both meetup recaps) | E2E + Unit | E2E: "Events & History page renders" flow (both locales). Unit: `fetchContentPage` covers the underlying data fetch (same fetcher as About Us, slug `history`). |
| AC-6 (Partner With Us renders, ru gap tolerated not blocking) | E2E | "Partner With Us page renders (EN complete)" + "Partner With Us page renders (RU partial, non-blocking)" flows — the "does not 500 despite partial content" behavior is specifically an E2E-observable property. |
| AC-7 (Excluded source files not referenced anywhere) | E2E (regression guard) + manual (first-pass) | E2E: "Excluded source material does not leak" flow, as a coarse regression guard. First-pass verification was already performed manually by SecurityReviewer (`04-security-review.md`'s grep for `BFT`/`roadmap`/`BUILD` across the 5 seeded markdown files) — this AC is fundamentally a content-authoring correctness check, not a code-logic check; E2E adds ongoing regression coverage, it does not replace the need for a human content review if the seed content is ever re-authored. |
| AC-8 (Directus unavailability does not 500 any of the 4 pages) | E2E | "Directus-unreachable fallback" flow — the only test level that can observe the full SSR-page-level fallback behavior (unit tests on the fetcher alone confirm it returns `null`/`[]` on failure, but not that every page's frontmatter/template handles that `null` gracefully at render time). |
| AC-9 (Routing and nav placement confirmed) | E2E + manual | E2E: "Nav/footer links present" flow confirms the CodeDeveloper's placement decision (`AppNav` center cluster `hidden lg:inline-flex` + `AppFooter` 4th column, per `03-code-summary.md` Key Design Decision #7) is actually wired and visible. The AC's own text also calls for confirming placement "against any existing IA convention before merge" — that confirmation is a product/design judgment call, not something an automated test can adjudicate; recommend PRSteward or the requester do a final visual/IA sign-off alongside the E2E check, not in place of it. |
| AC-10 (Design-system compliance — no raw hex, no new tokens, Lucide-only icons) | **Manual review only — confirmed no automated tooling exists for this.** | Checked `tools/architecture-check.ts` directly: its existing locks (`page-not-from-generator`, `no-inline-style`, `no-raw-fetch` — confirmed via `03-code-summary.md`'s "289 files scanned, 0 violations" run) do not include a raw-hex-value rule, a new-CSS-custom-property rule, or a non-Lucide-icon-import rule. No `pnpm design:check` or equivalent script exists in `package.json`/`tools/`. This AC is therefore **not testable by any existing or newly-added-in-this-workflow automated gate** — it must be satisfied by human visual/code review against `docs/04-development/design-system/Design system for AI agents/readme.md` before merge. This is a genuine gap worth flagging (not this workflow's to fix): a future `arch:check` rule (grep for `#[0-9a-fA-F]{3,8}` outside token-definition files, or an icon-import allowlist) would close it permanently, but authoring that rule is out of scope for FR-CMS-007's own workflow. Recorded here so PRSteward/the merge reviewer knows this AC has zero automated coverage and must be eyeballed. |
| AC-11 (`pnpm arch:check` + `astro check` + `pnpm build` pass) | Build gate (not unit/integration/E2E) | Already executed and passing per `03-code-summary.md`: `arch:check` (289 files, 0 violations), `astro check` (0 errors/0 warnings on changed files), `pnpm build`. This is the standard V2 production-readiness gate, re-run as part of workflow finish — no new test authored for this AC beyond confirming the existing gate still passes after TestDesigner's additions (new test files must not themselves fail lint/typecheck). |

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: >
    Rubric score 2 (cross-module Directus call +1, new fetcher/query +1) —
    below both the Integration (>=4) and E2E (>=6) literal thresholds.
    Integration tier is correctly skipped: no apps/api/Testcontainers
    surface exists for this requirement. E2E tier is explicitly included
    as a stated override of the raw score, because the rubric's criteria
    target backend/business-logic risk while this requirement's actual
    risk surface is page-rendering correctness across 5 new routes plus
    a dynamic document-detail route — a risk class only a rendered-page
    check can catch, and one with direct precedent (welcome/[slug]'s
    existing E2E smoke coverage) and an explicit recommendation from
    02-impact-analysis.md. All 11 acceptance criteria are mapped to at
    least one test. AC-8 (Directus-outage resilience) is uniquely an
    E2E-only concern: unit tests already confirm the fetchers return
    null/[] on failure, but only a full SSR-page-render check confirms
    every page's template handles that null gracefully. AC-10
    (design-system compliance) is confirmed to have zero automated test
    coverage available in this codebase today — tools/architecture-check.ts
    has no raw-hex, no-new-token, or Lucide-only-icon rule, and no
    pnpm design:check equivalent exists — so it is explicitly mapped to
    manual review only, not silently left uncovered. AC-7 (excluded
    source material) gets an E2E regression guard on top of the manual
    first-pass check SecurityReviewer already performed.
  findings:
    - "Rubric score 2 is below both thresholds on paper, but E2E is included anyway with explicit justification — the rubric under-scores page-delivery-shaped features since its criteria are backend/business-rule oriented; welcome/[slug]'s existing E2E coverage is the direct precedent this requirement should not fall below."
    - "No integration tier: confirmed no apps/api, Drizzle, or Testcontainers-Postgres surface exists for FR-CMS-007 (Directus itself is outside the API's Testcontainers stack)."
    - "AC-10 (design-system compliance) has no automated test path in this codebase — confirmed by direct inspection of tools/architecture-check.ts's existing locks and package.json scripts. Mapped to manual-review-only, flagged as a permanent gap a future arch:check rule could close (out of this workflow's scope to build)."
    - "AC-8 (Directus-outage resilience) requires an E2E-level check specifically because unit tests on the fetchers alone cannot observe whether each page's Astro template handles a null/empty fetcher return gracefully at render time."
    - "AC-9's automated coverage (nav/footer link presence) only confirms the CodeDeveloper's placement decision is wired — the AC's own text also calls for IA-convention sign-off, which is a human judgment call outside any test's scope, noted as a recommended manual step alongside the E2E check, not a substitute for it."
  rubric_score: 2
  required_levels:
    unit: true
    integration: false
    e2e: true
  all_acs_mapped: true
  blocking: false
```
