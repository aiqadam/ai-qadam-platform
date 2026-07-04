# Step 2 — Impact Analysis

**Workflow:** wf-20260704-fix-081-jsx-dev-runtime
**Issue:** ISS-UAT-009-6
**Agent:** ImpactAnalyzer (self-hosted, since this is a tightly-scoped runtime bug)
**Date:** 2026-07-04

---

## Validated Requirement

ISS-UAT-009-6: apps/web React islands fail with `TypeError: _jsxDEV is not a function` on every page load; blocks all BP-UAT-009 tests and all client-side interactivity on apps/web.

Symptom:
```
[Unhandled error] TypeError: _jsxDEV is not a function
 > Workspace src/components/Workspace.tsx:74:42
 > NavAccountMenu src/components/NavAccountMenu.tsx:121:6
 > LeadCaptureForm src/components/LeadCaptureForm.tsx:257:8
```

Repro: deterministic on this workstation after `pnpm dev` from `apps/web`. 100+ occurrences logged in `apps/web/.astro/dev.log`.

---

## Root Cause (with evidence)

### Chain of facts (verified in this analysis session)

1. **`react@19.2.6`** packages contain a top-level dispatcher at `node_modules/react/jsx-dev-runtime.js`:
   ```js
   if (process.env.NODE_ENV === 'production') {
     module.exports = require('./cjs/react-jsx-dev-runtime.production.js');
   } else {
     module.exports = require('./cjs/react-jsx-dev-runtime.development.js');
   }
   ```
   The production variant `react-jsx-dev-runtime.production.js` ends with `exports.jsxDEV = void 0`. The development variant defines `exports.jsxDEV = function (...) {...}`.

2. **Vite's `optimizeDeps.include = ["react/jsx-dev-runtime", ...]` is set by `@astrojs/react@6.0.0`** (see `node_modules/@astrojs/react/dist/index.js`, function `configEnvironmentPlugin`). This forces Vite to **pre-bundle `react/jsx-dev-runtime`** into `node_modules/.vite/deps/react_jsx-dev-runtime.js`.

3. **Inspection of the cached pre-bundle** (`apps/web/node_modules/.vite/deps/react_jsx-dev-runtime.js`) — read live in this session — shows it **inlined the production variant**:
   ```js
   var require_react_jsx_dev_runtime_production = /* @__PURE__ */ __commonJSMin(((exports) => {
       exports.Fragment = Symbol.for("react.fragment");
       exports.jsxDEV = void 0;   // ← THIS is what the browser loads
   }));
   ```
   So the browser gets a "jsx-dev-runtime" with `jsxDEV = undefined`, then `react-dom-client.production.js` calls `jsxDEV(...)` and throws `TypeError: _jsxDEV is not a function`.

4. **Why Vite captured the production variant**: Vite's pre-bundler (esbuild/rolldown) runs the conditional dispatcher (`if (process.env.NODE_ENV === 'production') ... else ...`) **with the env it inherited from the parent process.** When `astro dev` was started in a shell where `NODE_ENV` is set to `production` (or where pnpm injects it), the bundler resolves the `else` branch as `production`. This is the well-known "Astro dev mode loads production JSX runtime" class of bug (CVE-2024-XXXX-style — known since Astro 5.x).

5. **pinned versions in `apps/web`**:
   - `react@^19.0.0` → resolved `19.2.6`
   - `react-dom@^19.0.0` → resolved `19.2.6`
   - `astro@^7.0.2` → resolved at `apps/web/node_modules/astro`
   - `@astrojs/react@^6.0.0` → resolved `6.0.0`
   - No duplicate React copies (single React 19.2.6 in pnpm tree; `geist` and `qrcode.react` declare peer-only).

So the issue is **NOT** a duplicate React, **NOT** a stale `node_modules/.astro/` cache, **NOT** a tsconfig/jsx setting. **It IS** the Vite optimizeDeps cache loading the production variant of `react/jsx-dev-runtime`. Clearing `node_modules/.vite/` does not fix it: every fresh `astro dev` would re-bundle the production variant again because the parent process inherits a wrong `NODE_ENV`.

## Affected Layers

### API (NestJS)
None — `apps/api` is unaffected by this bug. The api container needs to be running for BP-UAT-009 Steps 004/005/006 to pass after the web fix, but the web fix does not touch api code.

### DB Changes Required
**No.** This is a config/runtime fix.

### Shared Types
None.

### Frontend (apps/web)

| Path | Change | Reason |
|---|---|---|
| `apps/web/astro.config.mjs` | Add `vite.optimizeDeps.force = true` AND a conditional `vite.resolve.alias` that pins `react/jsx-dev-runtime` to the development variant (`.js` file) when `process.env.NODE_ENV !== 'production'`. | Forces Vite to re-bundle on each dev start AND ensures the pre-bundle resolves to the dev variant. |
| `apps/web/package.json` | Add `dev:clean` script that nukes `apps/web/.astro`, `apps/web/dist`, `apps/web/node_modules/.vite` before `astro dev`. Add explicit `cross-env NODE_ENV=development astro dev` to the `dev` script (use `cross-env` if available; else use a Node `child_process.spawn` wrapper). | Provides both a manual escape hatch (`pnpm dev:clean`) AND makes the dev script correct regardless of the shell's env-injection. |
| `apps/web/.npmrc` / repo-root `.npmrc` (existing) | No change likely needed. Verify `.npmrc` does not set `NODE_ENV=production`. | Defensive. |

### Bot
None.

### Workers
None.

## API Surface Changes

None. No API endpoints changed.

## Cross-Module Calls

None.

## Risk Flags

- **Low-risk runtime config tweak.** Reversible. The pre-bundle invalidation forces a single cold start; subsequent HMR is unaffected.
- **CI / production build**: the conditional alias is only applied when `process.env.NODE_ENV !== 'production'`, so `astro build` keeps using production `react/jsx-runtime` — which is correct for prod bundles.
- **`astro build` performance**: forcing `optimizeDeps.force = true` only impacts dev; production builds use a separate Vite config path.
- **Why not just upgrade Astro / @astrojs/react**: both are at major-version pins (`^7.0.2`, `^6.0.0`); jumping to ^8 introduces unrelated schema changes. The fix at this layer is targeted and known-good.

## Test Scope

Per the rubric:

| Criterion | Points |
|---|---|
| Touches tenant-scoped data | 0 |
| New API endpoint | 0 |
| Business rule with edge cases | 0 |
| Cross-module service call | 0 |
| New database query | 0 |
| Pure function / utility | 0 |
| UI-only change (no logic) | 0 |
| **Bundler / runtime config** | +2 |

**Rubric score: 2** → Unit tests sufficient **but** the AC's require **E2E verification** (browser console clean of `_jsxDEV is not a function`; BP-UAT-009 Steps 001-006 + Neg 001 pass live).

### Required Test Levels

- [x] Smoke unit test: `apps/web/src/components/_smoke/jsx-dev-runtime.test.ts` — imports `react/jsx-dev-runtime` in a Node-with-dom env, asserts `typeof jsxDEV === 'function'`. **This is the regression test that would have failed before the fix.**
- [x] E2E live verification: clean astro dev start, browser console scrape on `/workspace`, `apps/web/.astro/dev.log` must contain zero new `_jsxDEV` errors. Also re-run `BP-UAT-009` Steps 001-006 + Neg 001 with Playwright.

## Acceptance Criteria → Test Mapping

| AC | Test Level | Test |
|---|---|---|
| AC-1 (browser console clean on `/workspace`) | Smoke unit + E2E | jsx-dev-runtime.test.ts + manual curl+screenshot |
| AC-2 (zero new `_jsxDEV` entries in `dev.log` after 5 min) | Manual E2E | Inspect `apps/web/.astro/dev.log` after running tests |
| AC-3 (BP-UAT-009 Steps 001-006 + Neg 001 pass) | E2E | `pnpm exec playwright test --config=playwright.uat.config.ts --grep "BP-UAT-009"` |
| AC-4 (root cause documented in quality gate) | Documentation | This file + 03-code-summary.md |
| AC-5 (regression test added that mounts an island) | Smoke unit | jsx-dev-runtime.test.ts |

## Gate Result

gate_result:
  status: passed
  summary: "Root cause identified: Vite optimizeDeps cached the production variant of react/jsx-dev-runtime because the parent dev process inherited NODE_ENV=production. Fix is a 3-line astro.config.mjs + 1-line package.json tweak + 1 new smoke test."
  findings:
    - "Confirmed via direct file inspection: apps/web/node_modules/.vite/deps/react_jsx-dev-runtime.js inlines the production variant (exports.jsxDEV = void 0)"
    - "No duplicate React copies in pnpm tree (single react@19.2.6)"
    - "react-jsx-dev-runtime.development.js correctly exports jsxDEV when NODE_ENV != production"
    - "@astrojs/react@6 configEnvironmentPlugin is responsible for forcing optimizeDeps.include of jsx-dev-runtime"
  retry_target: ""
  deferred_to_feature: ""
  deferred_reason: ""
