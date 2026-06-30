## What

Fixes the React island hydration bug in apps/web Astro dev server. BP-UAT-013 Step 006 Playwright run was failing on `getByText(/welcome,/i)` because the `<astro-island>` shell loaded (HTTP 200) but the React renderer threw `_jsxDEV is not a function` immediately on hydration, leaving `<main>` blank.

## Why

Astro 7 + @astrojs/react 6 + React 19.2.6 dual-channel ESM/CJS runtime chain was resolving two different `react/jsx-dev-runtime` instances: one via Vite optimizeDeps pre-bundle (production-channel `_jsx` export only) and one via Astro server-side transform (full `_jsxDEV`). At runtime the JSX compiled by Astro called `_jsxDEV` on the production-channel module and threw.

## How

Three coordinated Vite settings in `apps/web/astro.config.mjs` (+50 lines, no version bumps, no production-runtime code changes):

1. `vite.resolve.dedupe: ['react', 'react-dom']` — single React instance across server + island bundles
2. `vite.optimizeDeps.include: ['react/jsx-dev-runtime', 'react/jsx-runtime', 'react-dom/client']` — deterministic pre-bundle of the dev runtime
3. `vite.define: { "process.env.NODE_ENV": "<mode>" }` — guarantee Vite serves the dev-mode file even if a parent shell leaks NODE_ENV=production

Plus a new hermetic smoke spec at `apps/e2e/tests/smoke-onboarding-hydration.spec.ts` that locks in the regression with a `pageerror` bucket check.

## Verification (per AGENTS.md §6.1)

- **AC-1 + AC-2 verified end-to-end**: smoke spec passes 2/2 in 5.6s with zero pageerror events. `/welcome,/i` heading visible within 4.4s. UAT Step 006 first assertion (`/welcome,/i` ≤ 20s) passes in both single-step and full-spec runs.
- **AC-3 partial**: first assertion verified (hydration works); second assertion fails on a pre-existing seed-layer bug (out of scope).
- **AC-4 deferred**: 4 distinct pre-existing out-of-scope bugs surfaced and queued as separate workflows with named IDs and queue positions:
  - ISS-UAT-013-10 → wf-20260630-fix-044 (queue 1): role_groups seed gap
  - ISS-UAT-013-11 → wf-20260630-fix-045 (queue 2): authentik_user_id FK back-fill
  - ISS-UAT-013-12 → wf-20260630-fix-046 (queue 3): spec port drift :3000 vs :3001
  - ISS-UAT-013-13 → wf-20260630-fix-047 (queue 4): api POST /v1/leads idempotency
- **AC-5 verified**: working-tree diff is exactly the 2 expected files (no package.json, no OnboardingForm.tsx, no onboard.astro touched).
- `pnpm typecheck` PASS (4/4 tasks green). `pnpm biome check` clean on changed files.
- Security review: 0 BLOCKER / 0 MAJOR / 0 MINOR / 3 INFO.

## Risks

- The 4 follow-up issues must be addressed in order to make the full UAT spec pass; they are queued for next workflows.
- Push may hang on HTTPS credential prompts in bash contexts; the documented resolution is to switch the remote to SSH (or use `git config --global credential.helper manager` and cache the PAT once via Windows Credential Manager).

## Files changed (production-runtime only)

- `apps/web/astro.config.mjs` — modified, +50 lines (the fix)
- `apps/e2e/tests/smoke-onboarding-hydration.spec.ts` — new (the regression test)

Plus doc/test artifacts: `.copilot/issues/ISS-UAT-013-9.md` Resolution + 4 new follow-up issues + registry update + workflow artifacts.

## Workflow

- Workflow: `wf-20260629-fix-043` (issue-resolution)
- Branch: `fix/ISS-UAT-013-9-react-hydration`
- Base: `main`
- Steps: 0, 0.5, 1, 2, 3, 4, 6, 7, 8, 9, 11, 12 — all passed
- QualityGate verdict: `passed` (per AGENTS.md §6.1 honesty disclosures for partial AC-3 and deferred AC-4)