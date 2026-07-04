# 06 — Test Strategy

**Workflow:** wf-20260704-fix-081-jsx-dev-runtime
**Issue:** ISS-UAT-009-6
**Agent:** TestStrategist
**Date:** 2026-07-04

---

## Requirement

ISS-UAT-009-6: `apps/web` React islands fail with `TypeError: _jsxDEV is not a function` on every page; blocks all client-side interactivity and the entire BP-UAT-009 suite.

## Rubric Score

| Criterion | Points |
|---|---|
| Touches tenant-scoped data | 0 |
| New API endpoint | 0 |
| Business rule with edge cases | 0 |
| Cross-module service call | 0 |
| New database query | 0 |
| Pure function / utility | 0 |
| UI-only change (no logic) | 0 |
| Bundler / runtime config fix | +2 |
| **Total** | **2** |

**Required test levels:** Unit (live regression test) + manual E2E verification of the live BP-UAT-009 spec.

- [x] **Unit:** `apps/web/src/components/__tests__/jsx-dev-runtime.test.ts` — already shipped in this PR (4 assertions, all green).
- [ ] **Integration (Testcontainers):** N/A — no DB / service code change.
- [x] **E2E (Playwright):** Manual curl-based smoke + scheduled BP-UAT-009 re-run via `apps/e2e/playwright.uat.config.ts --grep "BP-UAT-009"` at Step 8.

## Unit Test Plan

| Target | Happy Path | Failure Paths |
|---|---|---|
| `react/jsx-dev-runtime` exports | `typeof jsxDEV === 'function'`, `typeof Fragment === 'symbol'` | N/A — pure import-shape check |
| `jsxDEV(...)` returns valid React element | Returns `{ $$typeof: Symbol.for('react.transitional.element'), type, key, ref, props }` | N/A — smoke check |
| `react/jsx-runtime` (production) | Does NOT export `jsxDEV`; DOES export `jsx` and `jsxs` | Documents the source of the original bug; future regressions fail here first |

## Integration Test Plan

N/A — no integration delta.

## E2E Test Plan

| User Flow | Entry Point | Exit Assertion |
|---|---|---|
| `astro dev` cold start under hostile env | `pnpm dev:clean` then `pnpm --filter @aiqadam/web dev` | Dev server starts; `Forced NODE_ENV=development` log line is emitted; `http://localhost:4322/workspace` returns 200 |
| 5-route smoke | `curl` / `/`, `/workspace`, `/events`, `/leaderboard`, `/me` | All return 200 within timeout |
| BP-UAT-009 Steps 001-006 + Neg 001 | `pnpm exec playwright test --config=playwright.uat.config.ts --grep "BP-UAT-009"` | All Steps 001-006 + Neg 001 pass (Neg 002, Neg 003 remain pre-existing infra-dependent, owned by their own follow-ups) |
| dev.log clean check | Inspect `apps/web/.astro/dev.log` after tests | Zero new `_jsxDEV is not a function` entries |

## Acceptance Criteria → Test Mapping

| AC | Test Level | Test Description |
|---|---|---|
| AC-1: Workspace island renders, no console errors | Smoke unit + manual E2E | `__tests__/jsx-dev-runtime.test.ts` (assertions 1-3) + curl `/workspace` returns 200 + dev.log clean |
| AC-2: 0 new `_jsxDEV` entries in dev.log after 5 min nav | Manual E2E | Inspect `.astro/dev.log` after running all BP-UAT-009 Steps 001-006 + manual curl smoke |
| AC-3: BP-UAT-009 Steps 001-006 + Neg 001 pass | E2E Playwright | `apps/e2e/tests/uat/BP-UAT-009.spec.ts` re-run |
| AC-4: Root cause documented in quality gate | Documentation | `03-code-summary.md` § Root cause + `09-quality-gate.md` |
| AC-5: Smoke test added (jsxDEV exists and works) | Smoke unit | `__tests__/jsx-dev-runtime.test.ts` (4 assertions) |

## Why no component-mount test in apps/web (the regression test does not import any React component)

`apps/web` has its own open blocker on `vitest 2.1.9 + vite 8 SSR-transform skew` (`ISS-TEST-WEB-001`) — any test that imports a sibling TS module throws `ReferenceError: __vite_ssr_exportName__ is not defined`. The existing `apps/web/src/lib/utm.test.ts` works around this by inlining its helpers rather than importing them; the OnboardingForm test fails open on `__vite_ssr_exportName__`.

Our regression test deliberately avoids that trap: it imports only `react/jsx-dev-runtime` and `react/jsx-runtime` (top-level package entries with stable TypeScript declarations) and checks the export **shape**, which is the exact information a regression would lose. The component-mount smoke that ISS-UAT-009-6's AC-5 could alternatively have required is deferred to a follow-up workflow that resolves ISS-TEST-WEB-001 first; until then, this test is sufficient.

## Gate Result

gate_result:
  status: passed
  summary: "Unit-level regression test shipped (4 assertions), no integration delta, E2E verification scheduled at Step 8 (live BP-UAT-009 re-run + dev.log inspection). Rubric score 2 → unit-only sufficient; E2E is for AC-3 closing, not because the rubric demands it."
  findings:
    - "Each AC mapped to a specific verification step"
    - "Live E2E BP-UAT-009 re-run is required for AC-3 close-out (queued for Step 8)"
  retry_target: ""
  deferred_to_feature: ""
  deferred_reason: ""
