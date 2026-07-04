# 03 — Code Summary

**Workflow:** wf-20260704-fix-081-jsx-dev-runtime
**Issue:** ISS-UAT-009-6
**Agent:** CodeDeveloper (self-hosted as Orchestrator due to scope: 2-file targeted config + 1-test file)
**Date:** 2026-07-04

---

## Requirement Implemented

ISS-UAT-009-6: `TypeError: _jsxDEV is not a function` on every apps/web React island — every page. Fix is at the **bundler environment** layer, not in React component code.

## Root cause (recap from 02-impact-analysis.md)

`@astrojs/react@6.0.0` registers `react/jsx-dev-runtime` in `optimizeDeps.include`, so Vite pre-bundles it at dev start. React 19's `node_modules/react/jsx-dev-runtime.js` is a conditional dispatcher:

```js
if (process.env.NODE_ENV === 'production') {
  module.exports = require('./cjs/react-jsx-dev-runtime.production.js');
} else {
  module.exports = require('./cjs/react-jsx-dev-runtime.development.js');
}
```

The production variant inlines `exports.jsxDEV = void 0`. When `astro dev` runs in a shell where `NODE_ENV=production` is inherited, the conditional dispatcher resolves to the production file and the pre-bundle ships a runtime without a working `jsxDEV` function. The user then gets `TypeError: _jsxDEV is not a function` on every React island on every page, blocking the entire BP-UAT-009 suite (Steps 001-006 + Neg 001-003 all depend on client-side React islands).

## Fix

Two parts, in `apps/web/astro.config.mjs` and `apps/web/package.json`. **No new dependencies.** **No code logic touched.**

### Part A — astro.config.mjs

Added a module-top guard that runs *before* any React module is loaded:

```js
const isDevCommand =
  process.argv.includes('dev') ||
  process.argv.some((arg) => String(arg).endsWith('astro') && process.argv.includes('dev'));
if (isDevCommand && process.env.NODE_ENV !== 'development') {
  const previous = String(process.env.NODE_ENV);
  process.env.NODE_ENV = 'development';
  console.log(`[astro.config] Forced NODE_ENV=development for astro dev (was: ${previous})`);
}
```

And added `vite.optimizeDeps.force = true` so any stale pre-bundle from a previous hostile-env session is invalidated on every dev start.

`astro build` and `astro preview` are unaffected — the guard only mutates NODE_ENV when `dev` is in argv.

### Part B — package.json

Added a `dev:clean` script (one-liner) that nukes `.astro/`, `dist/`, and `node_modules/.vite/` before starting. This is a defensive escape hatch — `optimizeDeps.force` should make it unnecessary, but it's available for users who hit a stubborn state.

### Part C — regression test

Added `apps/web/src/components/__tests__/jsx-dev-runtime.test.ts` (4 assertions):

1. `typeof jsxDevRuntime.jsxDEV === 'function'` (the regression that would have caught the original bug).
2. `typeof jsxDevRuntime.Fragment === 'symbol'` (confirms a real React build is wired).
3. `jsxDevRuntime.jsxDEV(Fragment, { children: '...' }, 'k')` returns an element with `$$typeof === Symbol.for('react.transitional.element')` (smoke-tests the React 19 transitional-element stream).
4. `react/jsx-runtime` (the **production** variant) does NOT export `jsxDEV` — documents the source of the original bug, so a future React upgrade that changes the prod runtime forces a re-evaluation of `astro.config.mjs`.

The test deliberately does NOT import any React component (per the ISS-TEST-WEB-001 vitest+vite 8 SSR skew workaround pattern used by `apps/web/src/lib/utm.test.ts`).

## Files Changed

| File | Change Type | Description |
|---|---|---|
| `apps/web/astro.config.mjs` | bugfix (config) | Module-top guard + `vite.optimizeDeps.force` |
| `apps/web/package.json` | bugfix (scripts) | New `dev:clean` script |
| `apps/web/src/components/__tests__/jsx-dev-runtime.test.ts` | new test | 4-assertion regression test |

3 files, ~85 lines added total. Well under the 400-line / 5-file PR budget.

## Key Design Decisions

### Why force NODE_ENV at the config top, not in package.json#scripts.dev?

`package.json#scripts.dev` cannot set `NODE_ENV` cross-platform without adding `cross-env` (new dependency, forbidden per AGENTS.md §8). The `astro.config.mjs` runs **inside the same Node process** as the dev server, so mutating `process.env` at module-load time reaches every subsequent module-load (Vite, React, etc.) exactly when they read it. This is the canonical Vite-recommended pattern for environment preparation and avoids a new dep.

### Why not `vite.resolve.alias` to bypass the dispatcher?

I tried and rejected this. Aliasing `react/jsx-dev-runtime` to the CJS dev source file (`react/cjs/react-jsx-dev-runtime.development.js`) caused `require is not defined` because the source is a CJS module loaded into an ESM context (Vite's bundler context). The dispatcher at `react/jsx-dev-runtime.js` already does the right thing once `NODE_ENV` is forced — it picks the dev variant and ESM-imports the CJS file via Vite's CJS interop. So the alias is unnecessary and actively harmful.

### Why not bump Astro / @astrojs/react versions?

Both are pinned at `^7.0.2` / `^6.0.0` and have been working at those versions for the prior ~30 days. Bumping to v8 introduces unrelated schema changes (per the registry's completed-workflows table) and is out of scope. The fix at this layer is targeted and known-good.

### Why not just clear caches and re-test?

Cache clearing alone does not fix the bug — Vite's pre-bundler runs the conditional dispatcher with whatever `NODE_ENV` it inherits from the calling shell. If the shell's `NODE_ENV=production` persists (PNPM workspace scripts, CI runners, captured PowerShell envs), every fresh `astro dev` would pre-bundle the production variant again. The fix has to address the env-injection layer, not the cache layer.

## Architecture Rule Compliance

| Rule | Compliance |
|---|---|
| Small PR (≤ 400 lines / 5 files) | ✅ 3 files, ~85 lines |
| No new dependencies | ✅ No package.json#dependencies/devDependencies change |
| TypeScript strict | ✅ No TS code added (only `.mjs` config + `.ts` test file) |
| Zero warnings policy | ✅ Astro check: 0 errors, no new warnings |
| No .env edits | ✅ No .env touched |
| No DB migrations | ✅ No DB |
| Comments explain why | ✅ Each comment block names the root cause and points to the issue |
| Honest: no `it.skip` | ✅ All 4 assertions are live tests |
| `tsconfig.json#jsx: "preserve"` left unchanged | ✅ The fix is below the TS layer |
| Production builds unchanged | ✅ The guard is `if (isDevCommand)` — only fires for `astro dev` |

## Formatter Check

`pnpm --filter @aiqadam/web lint` was clean on my 3 files (no new lint errors introduced). The pre-existing `biome-ignore` in `apps/web/src/lib/cms.ts:134` is **NOT introduced by this PR** and is out of scope (owned by the biome-scope workflow wf-20260703-fix-069-biome-scope, which already trimmed the rule set in `packages/biome-config/biome.json` for ISS-CI-003).

## Self-check Verification

1. ✅ `pnpm --filter @aiqadam/web typecheck` → 0 errors
2. ✅ `pnpm --filter @aiqadam/web lint` (my 3 files only) → 0 errors
3. ✅ `pnpm exec vitest run src/components/__tests__/jsx-dev-runtime.test.ts` → 4 passed, 0 failed
4. ✅ Manual regression run with NODE_ENV=production set in shell:
   - Dev server started successfully on `http://localhost:4322`
   - Log emitted `[astro.config] Forced NODE_ENV=development for astro dev (was: production)`
   - All 5 routes (`/`, `/workspace`, `/events`, `/leaderboard`, `/me`) returned **200**
   - `.astro/dev.log` has **zero** `_jsxDEV` / `TypeError` entries (was 100+ before)
   - Vite pre-bundle (`node_modules/.vite/deps/react_jsx-dev-runtime.js`) now inlines `exports.jsxDEV = function(...) {...}` (the development variant) instead of `exports.jsxDEV = void 0`

## Acceptance Criteria → Verification

| AC | Status |
|---|---|
| AC-1: Workspace island renders, no console errors | ✅ verified — `/workspace` returns 200, dev.log clean |
| AC-2: 0 new `_jsxDEV` entries in dev.log after 5 min nav | ✅ verified — count = 0 |
| AC-3: BP-UAT-009 Steps 001-006 + Neg 001 pass | ⏸ deferred to Step 8 — UATRunner must run the full Playwright spec; not blocking |
| AC-4: Root cause documented in quality gate | ✅ this file |
| AC-5: Smoke test added that asserts jsxDEV exists and works | ✅ `__tests__/jsx-dev-runtime.test.ts` (4 assertions) |

## Known Limitations

1. The `dev:clean` script uses `node -e "…"` inline — readable but a one-liner Node script. If a `.cjs/.mjs` shim becomes necessary (e.g. for `cross-env` parity), that's a follow-up.
2. AC-3 (full BP-UAT-009 re-run) is deferred to Step 8 — the Playwright spec must be exercised against the live stack; not blocked by this PR.

## Gate Result

gate_result:
  status: passed
  summary: "Fix shipped in astro.config.mjs (NODE_ENV guard + optimizeDeps.force) + package.json (dev:clean) + 4-assertion regression test. No new deps. 5 routes return 200, dev.log clean, pre-bundle uses dev variant."
  findings:
    - "All 5 pages (/, /workspace, /events, /leaderboard, /me) HTTP 200"
    - "0 _jsxDEV/TypeError entries in fresh .astro/dev.log (was 100+ before fix)"
    - "Vite pre-bundle correctly inlines dev variant of react/jsx-dev-runtime"
    - "vitest run on new test: 4 passed, 0 failed"
    - "astro check: 0 errors, no new warnings"
  retry_target: ""
  deferred_to_feature: ""
  deferred_reason: ""
