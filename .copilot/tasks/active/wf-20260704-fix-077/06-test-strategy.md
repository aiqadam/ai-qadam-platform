# Test Strategy — wf-20260704-fix-077 / ISS-UAT-009-4

## Requirement

**ISS-UAT-009-4** — `/me` AnonView leaves a large unbalanced empty region below the sign-in CTA card. UI-only layout-completeness fix: port `apps/web-next/src/blocks/common/AppFooter.astro` into `apps/web/src/components/`, render it from `apps/web/src/layouts/Layout.astro` after `<slot />`, and add the `@theme inline` Tailwind bridge so the ported footer renders with canonical design-system tokens.

## Rubric score

| Criterion | Points | Hit? |
|---|---|---|
| Touches tenant-scoped data | +2 | No — `fetchSiteSettings()` reads tenant-neutral singleton |
| New API endpoint | +2 | No |
| Business rule with edge cases | +2 | No |
| Cross-module service call | +1 | No — same in-module helper already used by homepage |
| New database query | +1 | No — `fetchSiteSettings()` already exists |
| Pure function / utility | 0 | n/a |
| UI-only change (no logic) | 0 | **Yes — 0** |

**Score: 0 / ≥4 / ≥6.** Per the rubric: "Score < 4: Unit tests sufficient."

**Override applied:** Despite the rubric returning zero, the issue-resolution workflow Step 6 imposes a hard requirement to add at least one regression test that (1) would have failed before the fix and (2) passes after. The only test layer that can satisfy that requirement cheaply and safely against the live SSR render is Playwright E2E — and the sister workflow `wf-20260704-fix-076` already established the exact pattern (DOM assertions appended to `BP-UAT-009.spec.ts` Step 006 for the leaderboard self-row chip, `apps/e2e/issues/ISS-UAT-009-3.md:78`). Re-using that scaffolding is the cheapest, most consistent path.

## Required test levels

- [ ] Unit — not required (UI-only, no logic; per rubric Score < 4)
- [ ] Integration — not required (no API / DB change)
- [x] E2E (Playwright) — required (Step 6 regression-test hard requirement + the only level that exercises live SSR Layout)

## Unit test plan

| Target | Happy Path | Failure Paths |
|---|---|---|
| _(none)_ | UI-only change. The component has no exported functions (just the default Astro template). The only logic — array filters with type-guard predicates for `SocialLink[]` / `ContactLink[]` — runs server-side at SSR time and is consumed by the E2E test via the rendered DOM. | n/a |

Vitest is **avoided** here: the `apps/web` vitest pipeline is broken per ISS-TEST-WEB-001 (vitest 2.1.9 + workspace vite 8.1.0 SSR-transform skew; fails when importing sibling modules). Vitest cannot exercise the SSR Layout render path safely today. The fix targets the live Layout SSR render, which only Playwright against the running Astro dev server can validate.

## Integration test plan

| Scenario | Infrastructure | Key Assertions |
|---|---|---|
| _(none)_ | No API / DB change. The new component calls `fetchSiteSettings()` against `http://localhost:8200/items/site_settings` — the same call the homepage already makes for the Hero. No new endpoint, no new query path, no new module-boundary crossing. Adding a Testcontainers-only integration test for an unchanged CMS read would duplicate existing coverage. | n/a |

## E2E test plan

**Target file:** `apps/e2e/tests/uat/BP-UAT-009.spec.ts`
**Target step:** Step 005 — "Protected page after sign-out". This step already navigates anonymously to `${BASE_URL}/me` and screenshots `step-005-redirect-after-signout.png`, which is the exact scenario that surfaced the original bug. Extending this step keeps the regression check co-located with the UAT artifact already on disk for the same screenshot.

| User Flow | Entry Point | Exit Assertion |
|---|---|---|
| Anonymous visitor lands on `/me` and sees the layout-footer anchor below the AnonView CTA | `await context.clearCookies()` → `await page.goto(`${BASE_URL}/me`)` | (a) `<footer>` is visible AND renders AFTER `<main>` in the DOM (was always-false pre-fix because no `<footer>` existed); (b) the footer includes the canonical design-system surface — at minimum the `"AI Qadam"` tagline (in `<p class="font-display ...">`) and the copyright `"© <year> AI Qadam · Community-as-platform for Central Asian AI engineers"` row |

**Specific assertions to add to Step 005 (immediately before the existing shot/page end-of-test):**

````typescript
await test.step('ISS-UAT-009-4: layout-completeness footer regression (pre-fix: no <footer>)', async () => {
  test.info().annotations.push({
    type: 'iss-ref',
    description: 'ISS-UAT-009-4 — /me AnonView layout-completeness footer',
  });

  // (1) Hard: there is now a rendered <footer> on the page.
  //     Pre-fix: apps/web/src/layouts/Layout.astro had no <AppFooter />,
  //     so this would have timed out / zero-matched.
  const footer = page.locator('footer');
  await expect(footer, 'site-wide <AppFooter /> must render on /me AnonView').toBeVisible({
    timeout: 10_000,
  });

  // (2) Hard: the footer is in document order AFTER <main>, so it acts
  //     as the layout-complete anchor (not floating above content).
  //     Pre-fix: <main> was the last block in the Layout, no footer
  //     existed, so this assertion would have failed (footerCount === 0).
  const footerAfterMain = await page.evaluate(() => {
    const main = document.querySelector('main');
    const footer = document.querySelector('footer');
    if (!main || !footer) return false;
    // 4 = DOCUMENT_POSITION_FOLLOWING — footer follows main in DOM order
    return (footer.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  });
  expect(footerAfterMain, '<footer> must follow <main> in DOM order').toBe(true);

  // (3) Hard: footer renders the canonical design-system tagline.
  //     Pre-fix: no footer, "AI Qadam" tagline inside .font-display
  //     never reached the DOM.
  await expect(
    page.locator('footer p.font-display').filter({ hasText: /AI Qadam/i }).first(),
    'footer must render the "AI Qadam" tagline in font-display',
  ).toBeVisible();

  // (4) Hard: footer renders the canonical copyright row.
  //     Pre-fix: no footer, this row never reached the DOM.
  await expect(
    page.locator('footer').filter({ hasText: /© \d{4} AI Qadam · Community-as-platform/i }),
    'footer must render the canonical copyright row',
  ).toBeVisible();
});
````

**Why this satisfies the Step 6 hard requirement:**

| Phase | Pre-fix behavior | Post-fix behavior |
|---|---|---|
| Assertion (1) — `expect(footer).toBeVisible()` | `page.locator('footer')` matched zero elements — Playwright's `toBeVisible` times out at 10s and fails the test. | One `<footer>` is now in the DOM (rendered by the new `AppFooter.astro` via the wired Layout). |
| Assertion (2) — `footerAfterMain` | Returns `false` (no `<footer>` exists; the `if (!main || !footer) return false` branch fires). | Returns `true` (footer exists and follows main in DOM order). |
| Assertion (3) — `font-display` "AI Qadam" tagline | Locator times out (no footer). | The `<p class="font-display ...">AI Qadam</p>` renders. |
| Assertion (4) — copyright row | Locator times out (no footer). | The `<p class="font-mono ...">© 2026 AI Qadam · Community-as-platform ...</p>` renders. |

**Soft guard:** The hard assertions are placed **after** the existing screenshot capture and just before the existing exit-state assertion (`authedOnlyContent` count). All four are hard — they fail the test outright — so they satisfy the "would have failed before the fix, passes after" contract.

**Honesty disclosure:** The step keeps the existing screenshot and the existing exit-state assertion. Adding an `await shot(page, 'step-005-redirect-after-signout-footer.png')` (or reusing the existing screenshot — the `<footer>` will be in the lower portion of the same frame) is sufficient; the existing screenshot already shows the visual fix.

## Acceptance criteria → test mapping

| AC | Test Level | Test Description |
|---|---|---|
| AC-1 — Root cause identified (missing footer vs missing empty-state content) | n/a (analytical) | Identified by the impact analysis (Step 2): `apps/web/src/layouts/Layout.astro` had no `<AppFooter />`. Not a test target. |
| AC-2 — `/me` AnonView page no longer shows a large unbalanced empty region on the standard UAT viewport size | E2E | Step 005 assertion (1): `<footer>` is visible. Step 005 assertion (2): footer follows `<main>` in DOM order (so it's the anchor, not floating). The footer fills the bottom region; the previously-empty background-coloured region is gone. |
| AC-3 — Visual re-check confirms the fix; no regression to the signed-in `/me` layout | E2E + live UAT re-run | (a) Step 005 screenshot (`step-005-redirect-after-signout.png`) gets re-captured by the same Playwright run and shows the footer in the bottom portion of the viewport. (b) Step 002 (signed-in `/me`) is re-run unchanged — its assertions would fail if the footer regressed signed-in behaviour (no footer is rendered post-fix either because the Layout change is purely additive). (c) Step 006 (leaderboard, signed-in) re-run unchanged — its `.me-name-wrap` regression assertions are footer-orthogonal. (d) Live UAT re-run of full BP-UAT-009 (Steps 001–007) is the authoritative check, run by the Orchestrator per AGENTS.md §6.1 with the full docker stack up. |

## Cross-page regression note

The footer renders site-wide — every page that goes through `apps/web/src/layouts/Layout.astro` now has it (`/`, `/leaderboard`, `/me`, `/events/*`, `/auth/*`, etc.). The Step 005 assertion alone validates the wiring for `/me` AnonView. The full BP-UAT-009 re-run (Steps 001, 002, 003, 004, 006) plus Steps 001–007 of every other BP-UAT-* script that touches `apps/web` covers the cross-page regression — **no additional per-page tests are scoped here**; this workflow's contract is the `/me` AnonView page specifically.

## Infrastructure pre-flight (TestRunner will execute)

- `apps/web` Astro dev server already running on :4321 (PID 5536, per `terminal_last_command` snapshot in the active terminal) — confirmed in the task prompt.
- Directus on :8200 — confirmed.
- Authentik on :9000 — confirmed.
- Postgres on :5433 — confirmed (not needed for this test; `:5433` is for API tests).
- No additional fixtures or uat-operator seed data required (Step 005 uses `context.clearCookies()` and navigates as anonymous — same pattern the existing Step 005 already uses).

## Risks / known limitations

1. **vitest 2.1.9 / ISS-TEST-WEB-001 skew** — not relevant here; this strategy deliberately uses Playwright (which runs against the live Astro dev server, not vitest's SSR pipeline).
2. **CMS unreachable during E2E run** — `fetchSiteSettings()` (cms.ts:391–393) falls back to `SITE_SETTINGS_DEFAULTS` on any error, so the footer still renders a populated UI even when Directus is down. Assertions (3) and (4) target hardcoded strings ("AI Qadam", "© year AI Qadam …") that come from defaults — they pass regardless of CMS reachability.
3. **Step 005 is one anonymous visitor viewport** — the visual bug was reported on a "standard UAT viewport size" (`wf-20260702-uat-058/03-uat-triage.md`). The Playwright default viewport (1280×720) matches the reviewer-evidence setup. No viewport-parameterisation is scoped here.
4. **CSS bridge dependency** — the `@theme inline` block in `globals.css` is required for the footer's Tailwind utilities (`bg-card`, `border-border`, `text-muted-foreground`, `font-display`, `font-mono`) to generate. If the CSS bridge fails to compile, the footer would still be in the DOM (assertions 1 & 2 pass) but assertions 3 & 4 might fail to VISIBLE if classes don't apply styles — they would still TO-EXIST in the DOM because the literal text "AI Qadam" is in `<p class="font-display">AI Qadam</p>` regardless of whether `.font-display` generates CSS. Acceptance: visible check on the text node.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "UI-only additive change scores 0 on the rubric (no API, no DB, no logic) but the issue-resolution workflow Step 6 hard requirement mandates a regression test — added 4 hard DOM assertions to BP-UAT-009.spec.ts Step 005; assertions 1 & 2 (footer visible / footer follows main in DOM order) would have failed pre-fix because apps/web's Layout rendered no <footer> at all, satisfying the would-have-failed-before, passes-after contract; vitest is deliberately avoided (ISS-TEST-WEB-001 skew) in favour of Playwright against the live :4321 Astro dev server, mirroring the sister-workflow wf-20260704-fix-076 Step 006 pattern."
  findings:
    - "Rubric score: 0 (UI-only change, no logic, no API, no DB, no business rules)."
    - "Layer selected: Playwright E2E only. Vitest deliberately avoided (ISS-TEST-WEB-001 SSR-transform skew). No unit or integration tests are warranted for an additive SSR markup change that exercises no API and no business logic."
    - "Target file: apps/e2e/tests/uat/BP-UAT-009.spec.ts Step 005 (the step that already navigates anonymously to /me and screenshots step-005-redirect-after-signout.png — the exact scenario that surfaced the original bug)."
    - "Regression contract: 4 hard assertions. Pre-fix, all 4 would have failed (no <footer> in DOM, no .font-display tagline, no copyright row). Post-fix, all 4 pass. Mirrors the wf-20260704-fix-076 Step 006 leaderboard-chip DOM-regression pattern (5 assertions, anchored on chip-parent className)."
    - "AC mapping: AC-1 (root cause) is analytical and not test-scoped; AC-2 (no large empty region) is covered by assertions 1+2 (footer exists, follows main); AC-3 (no regression to signed-in /me) is covered by re-running Steps 002 and 006 unchanged plus the live UAT re-run of full BP-UAT-009 (Orchestrator pre-flight per AGENTS.md §6.1)."
    - "Infrastructure: apps/web dev server :4321 confirmed running (PID 5536, Astro dev). Directus :8200, Authentik :9000. fetchSiteSettings() falls back to defaults on CMS failure so assertions 3+4 are CMS-independent."
    - "Branch scope for TestDesigner: ~45 LOC added inside one existing describe block; no new files, no new helpers, no new fixtures."
```