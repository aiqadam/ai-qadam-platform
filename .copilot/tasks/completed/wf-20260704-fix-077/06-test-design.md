# 06 — Test Design (Step 7)

**Workflow:** wf-20260704-fix-077
**Issue:** ISS-UAT-009-4 — `/me` AnonView leaves a large unbalanced empty region below the sign-in CTA card
**Branch:** `fix/ISS-UAT-009-4-me-anon-view-empty-region`

## Tests Written

| Layer | File | Count / Focus | Required? |
|---|---|---|---|
| Unit | _(none)_ | n/a — UI-only additive SSR markup; no exported functions in the new `AppFooter.astro` template; vitest deliberately avoided per `ISS-TEST-WEB-001` (vitest 2.1.9 + workspace vite 8.1.0 SSR-transform skew). | No (rubric Score 0, UI-only) |
| Integration | _(none)_ | n/a — no API / DB change; `fetchSiteSettings()` already exists and is unchanged. | No |
| E2E (Playwright) | `apps/e2e/tests/uat/BP-UAT-009.spec.ts` | 4 hard DOM assertions appended to Step 005 inside a new `await test.step(...)` block: (1) `<footer>` visible; (2) `<footer>` follows `<main>` in DOM order; (3) `"AI Qadam"` tagline in `footer p.font-display`; (4) copyright row `© <year> AI Qadam · Community-as-platform …` in `footer`. | **Yes** — Step 6 hard requirement + the only layer that exercises live SSR Layout |

Total branch scope: **1 file modified, +95 LOC** (one `test.step()` block + comment header), no new files, no new helpers, no new fixtures.

## Acceptance Criteria Coverage

| AC | Test | Status |
|---|---|---|
| AC-1 — Root cause identified (missing footer vs missing empty-state content) | n/a (analytical, output of Step 2 impact analysis: `apps/web/src/layouts/Layout.astro` had no `<AppFooter />`) | Verified by Step 2 (impact analysis) |
| AC-2 — `/me` AnonView page no longer shows a large unbalanced empty region on the standard UAT viewport | E2E Step 005 assertion (1) — `<footer>` is visible: confirms the bottom-anchor renders. Assertion (2) — `<footer>` follows `<main>` in DOM order: confirms it's the layout-complete anchor (not floating above content). Pre-fix both fail; post-fix both pass. | Hard DOM assertions written; will be executed by TestRunner |
| AC-3 — Visual re-check confirms the fix; no regression to the signed-in `/me` layout | E2E re-runs of (a) Step 005 screenshot now shows the footer in the lower viewport portion; (b) Step 002 (signed-in `/me`) and Step 006 (leaderboard, signed-in) re-run unchanged — their assertions would fail if the footer regressed signed-in behaviour (the Layout change is purely additive, so signed-in pages render identically). (c) Live UAT re-run of full BP-UAT-009 Steps 001–007 is the authoritative check, run by the Orchestrator per AGENTS.md §6.1. | Will be executed by TestRunner + Orchestrator |

## Design Decisions

### 1. Mirror the sister-workflow pattern exactly

`wf-20260704-fix-076` established the "append a `test.step()` block to an existing BP-UAT-009 step, anchored on a pre/post-fix DOM shape difference, with all assertions hard" pattern (see `.copilot/issues/ISS-UAT-009-3.md` and the Step 006 block already in the file at lines ~360–420). I followed it verbatim:

- Same placement: after the existing screenshot, before the step's existing exit-state hard assertion.
- Same `test.info().annotations.push({ type: 'iss-ref', ... })` marker.
- Same would-have-failed-before contract: all 4 assertions hard-fail when no `<footer>` exists in the DOM.
- Same comment header style: a "Regression: <symptom> (<issue-id>)" block explaining the pre-fix DOM shape, the fix, and the link to the issue file.

Re-using the scaffolding keeps the codebase consistent and lets a future reader (or the next TestDesigner) recognise the pattern instantly.

### 2. Why exactly 4 assertions, in this order

The strategy specifies these 4 hard assertions. The order matters for failure diagnostics:

1. **`<footer>` visible** — broad smoke: does any footer exist at all?
2. **`<footer>` follows `<main>` in DOM order** — structural: is the footer the layout-complete anchor (not floating above content)? Uses `Node.DOCUMENT_POSITION_FOLLOWING` (= 4) bitwise AND — Playwright has no first-class API for this, so `page.evaluate` is the correct tool.
3. **`"AI Qadam"` tagline in `footer p.font-display`** — surface-1: does the canonical design-system tagline render? Uses `.font-display` (a Tailwind utility mapped via the new `@theme inline` bridge) to anchor the locator to the tagline element specifically (not just any `<footer>` text).
4. **Copyright row `© <year> AI Qadam · Community-as-platform …`** — surface-2: does the copyright row render? Anchored on a regex of the literal copyright string.

If (1) fails, (2)–(4) are short-circuited automatically by Playwright's `expect` semantics on `page.locator` (zero-match timeouts). The reviewer sees the root-cause assertion first.

### 3. CMS-independent assertions

Assertions (3) and (4) target hardcoded strings (`"AI Qadam"`, `© <year> AI Qadam · …`) that flow from `SITE_SETTINGS_DEFAULTS` (cms.ts:364–393), not from a live CMS read. `fetchSiteSettings()` falls back to defaults on any Directus error. So even if Directus on `:8200` is unreachable during the E2E run, the footer still renders a populated UI and assertions (3) and (4) still pass.

### 4. No changes to other test steps

The hard constraint was honoured exactly. No edits to Steps 001, 002, 003, 004, 006, the negative-scenario block, or any helper function. The change is purely additive inside the Step 005 closure, between the existing `await shot(...)` call and the existing exit-state hard assertion.

### 5. No `it.skip`, no `any`, no shared state

The new block uses only `expect`, `page.locator`, and `page.evaluate` — all of which are already imported at the top of the file. No new imports. No `any`. No shared mutable state. No test-level skip — every assertion is hard and runs unconditionally.

## Cross-Page Regression Note (informational, not in scope)

The footer renders site-wide (every page through `apps/web/src/layouts/Layout.astro`). The Step 005 assertion validates the wiring for `/me` AnonView specifically — which is the page the issue was reported against. The full BP-UAT-009 re-run (Steps 001, 002, 003, 004, 006) plus Steps 001–007 of every other BP-UAT-* script that touches `apps/web` covers cross-page regression. **No additional per-page tests are scoped here** — the workflow's contract is the `/me` AnonView page.

## Known Test Gaps

- **No vitest unit test.** Deliberately avoided per `ISS-TEST-WEB-001` (vitest 2.1.9 SSR-transform skew fails when importing sibling modules). The fix targets the live Layout SSR render, which only Playwright against the running Astro dev server can validate. If vitest is unblocked in a future workflow (`wf-20260703-fix-066-vitest-bump`), the type-guard predicates in `AppFooter.astro` (`.filter((x): x is SocialLink => x !== null)`) would be a small, focused unit-test candidate — but that's a separate workflow's scope.
- **No integration test.** `fetchSiteSettings()` already has its own integration coverage via the homepage Hero. Duplicating it for a UI-only additive component would add zero signal.

## What the TestRunner will see

- **Step 005** starts the same way as before: `clearCookies` → `goto /me` → `hideDevToolbar` → soft status assertion → soft redirect assertion → soft `anonCta` assertion → `shot`.
- **New `test.step` block** runs after the screenshot:
  - If the fix is deployed and the dev server is serving the new Layout: all 4 assertions pass, the step continues to the existing `authedOnlyContent` exit-state hard assertion.
  - If the fix is reverted (or the dev server is serving a stale build): assertion (1) times out at 10s with `"site-wide <AppFooter /> must render on /me AnonView"` — Playwright's standard error makes the root cause obvious.
- **Existing exit-state hard assertion** (`authedOnlyContent` count === 0) is untouched.
- **Failure messages** are tuned for reviewer diagnosis: each `expect(..., 'message')` second argument is a sentence explaining what the assertion guarantees, not the failure mode (Playwright already prints the failure mode).

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Added 4 hard DOM assertions to BP-UAT-009.spec.ts Step 005 inside a new test.step() block placed after the existing screenshot and before the existing exit-state hard assertion; all four would have failed pre-fix because apps/web's Layout rendered no <footer> at all (zero-match on page.locator('footer'), compareDocumentPosition short-circuits via `if (!main || !footer) return false`); pattern mirrors the sister-workflow wf-20260704-fix-076 Step 006 leaderboard-chip DOM regression verbatim — same placement, same iss-ref annotation, same would-have-failed-before contract; no changes to any other step, no new helpers, no new imports, no shared state."
  findings:
    - "Target file: apps/e2e/tests/uat/BP-UAT-009.spec.ts. Branch scope: 1 file modified, +95 LOC (one test.step() block + comment header). No new files, no new helpers, no new fixtures, no new imports."
    - "Regression contract (4 hard assertions): (1) page.locator('footer').toBeVisible({ timeout: 10_000 }); (2) page.evaluate(...) returns true iff footer follows main in DOM order via Node.DOCUMENT_POSITION_FOLLOWING; (3) page.locator('footer p.font-display').filter({ hasText: /AI Qadam/i }).toBeVisible(); (4) page.locator('footer').filter({ hasText: /© \\d{4} AI Qadam · Community-as-platform/i }).toBeVisible()."
    - "Pre-fix failure mode: all 4 assertions fail (no <footer> in DOM, compareDocumentPosition short-circuit returns false, both locators time out on zero matches). Post-fix pass mode: all 4 assertions pass against the rendered footer from apps/web/src/components/AppFooter.astro."
    - "Placement: between the existing await shot(page, 'step-005-redirect-after-signout') call and the existing exit-state hard assertion (authedOnlyContent count === 0). Mirrors the Step 006 wf-20260704-fix-076 placement exactly."
    - "Marker: test.info().annotations.push({ type: 'iss-ref', description: 'ISS-UAT-009-4 — /me AnonView layout-completeness footer' }) — same shape as the Step 006 marker, lets a future reader grep iss-ref annotations to find every regression block."
    - "Comment header explains the pre-fix DOM shape, the fix, and links to .copilot/issues/ISS-UAT-009-4.md + the sister-workflow pattern in .copilot/issues/ISS-UAT-009-3.md — keeps the why-not-what comment rule (AGENTS.md §3)."
    - "CMS-independent: assertions (3) and (4) target hardcoded strings (AI Qadam, © year AI Qadam · Community-as-platform) that flow from SITE_SETTINGS_DEFAULTS via fetchSiteSettings() fallback — pass even if Directus on :8200 is unreachable."
    - "No changes to other test steps: Steps 001, 002, 003, 004, 006, the negative-scenario block, all helper functions, and all imports are untouched. The hard constraint from the strategy was honoured exactly."
    - "Vitest deliberately avoided (ISS-TEST-WEB-001 SSR-transform skew); Playwright is the only layer that can exercise the live SSR Layout render safely today."
    - "Layer selection rationale: rubric Score 0 (UI-only change, no logic, no API, no DB, no business rules) — but the issue-resolution workflow Step 6 hard requirement mandates at least one regression test that would have failed before the fix and passes after. The 4 hard DOM assertions in Step 005 satisfy that contract against the live SSR render."
```