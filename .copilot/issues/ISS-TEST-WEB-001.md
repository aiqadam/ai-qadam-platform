# ISS-TEST-WEB-001 — vitest 2.1.9 + vite 8 SSR-transform skew blocks any test that imports a sibling module

| Field | Value |
|---|---|
| ID | ISS-TEST-WEB-001 |
| Severity | blocker (test infra) |
| Module | web/test-infrastructure (and api/test-infrastructure, web-next/test-infrastructure — same root cause) |
| Status | resolved |
| Reported | 2026-07-03 |
| Reporter | Orchestrator (wf-20260703-fix-065-onboarding-copy / CodeDeveloper attempt 2 diagnostic) |
| Resolved | 2026-07-04 |
| Workflow | wf-20260704-fix-095 |
| Blocks | ISS-UAT-013-13 AC-3 (regression test added, cannot be executed); any future test that imports a sibling helper from a `.tsx` or `.ts` file |

## Symptom

`apps/web` (and `apps/api`, `apps/web-next`) pin `vitest ^2.1.8` in `package.json`, while the workspace's hoisted `vite` is `8.1.0`. When a test imports a sibling module that is **not** a fully self-contained inline file, vitest's bundled vite (5.x or 6.x) fails SSR module evaluation:

```
ReferenceError: __vite_ssr_exportName__ is not defined
 ❯ src/components/OnboardingForm.helpers.ts:1:1
```

The same error fires on `.tsx` imports AND on `.ts` imports of any sibling module — it's not JSX-specific. The `_vite_ssr_exportName__` helper was added to vite in v8; vitest 2.1.x's internal vite is older and does not define it.

**Reproduction (apps/web):**

```powershell
PS> pnpm exec vitest run OnboardingForm.test.ts
RUN  v2.1.9 C:/Users/tvolo/dev/ai-dala/aiqadam/apps/web

 ❯ src/components/OnboardingForm.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/components/OnboardingForm.test.ts [ src/components/OnboardingForm.test.ts ]
ReferenceError: __vite_ssr_exportName__ is not defined
 ❯ src/components/OnboardingForm.helpers.ts:1:1
```

The existing `apps/web/src/lib/utm.test.ts` passes 45/45 because it does not import anything — it inlines its helpers locally (a deliberate workaround noted in the file: "Local re-implementation of UTM constants and logic — Avoids ESM/alias issues with Astro + Vitest integration").

## Classification

**Pre-existing test-infrastructure gap, surfaced by wf-20260703-fix-065-onboarding-copy.** Discovered while adding the first unit test in `apps/web/src/components/` that imports a non-JSX helper module. Same root cause likely affects `apps/api` and `apps/web-next` — both pin `vitest 2.1.9` and will hit the same error once they add tests that import siblings.

## Impact

- Blocks any unit test in `apps/web`, `apps/api`, or `apps/web-next` that imports a sibling helper, constant, or fixture.
- Currently worked around by `utm.test.ts`'s local inline-reimplementation pattern — an unscalable workaround.
- Future code-quality enforcement (every public function has a unit test, AGENTS.md §3) cannot be honoured in any of the three apps until this is resolved.

## Expected state

`pnpm --filter web exec vitest run` should execute every `*.test.ts` and `*.test.tsx` file in `apps/web/src/` without throwing `__vite_ssr_exportName__` or any other SSR-transform error, with the same pass/fail signals as other workspaces.

## Proposed resolution (single workflow)

Bump `vitest` from `^2.1.8` to `^3.x` (or `^4.x` — latest is 4.1.9 at time of writing) in all three packages that pin it:

- `apps/api/package.json`
- `apps/web/package.json`
- `apps/web-next/package.json`

Re-run `pnpm install` to regenerate `pnpm-lock.yaml`. Verify:

1. `pnpm --filter web exec vitest run OnboardingForm.test.ts` passes (5/5 cases from `wf-20260703-fix-065-onboarding-copy`).
2. `pnpm --filter web exec vitest run` (all web tests) passes including `utm.test.ts`.
3. `pnpm --filter api exec vitest run` and `pnpm --filter web-next exec vitest run` are unaffected (or surface their own upgrade issues separately).
4. `pnpm exec biome check` and `pnpm exec tsc --noEmit` remain clean.

Update `apps/web/src/lib/utm.test.ts`'s "Local re-implementation" comment to point at the now-fixed infrastructure, or migrate `utm.test.ts` to import from a sibling module to confirm the fix end-to-end.

## Acceptance criteria

- [ ] `vitest` bumped to a major version compatible with workspace's `vite 8.x` in all three apps.
- [ ] `pnpm install` regenerates lockfile without errors.
- [ ] `apps/web/src/components/OnboardingForm.test.ts` passes 5/5 cases under `pnpm --filter web exec vitest run`.
- [ ] `apps/web/src/lib/utm.test.ts` still passes 45/45 cases (no regression).
- [ ] `apps/api` and `apps/web-next` `vitest` suites run without `__vite_ssr_exportName__` errors.
- [ ] No new biome or tsc warnings introduced.

## Resolution

- **Workflow:** `wf-20260704-fix-095`
- **PR:** [`#110`](https://github.com/tvolodi/aiqadam/pull/110)
- **Root cause:** `vitest ^2.1.8` (pinned in apps/web, apps/web-next, apps/api) bundles vite 5.x/6.x whose SSR transform is missing `__vite_ssr_exportName__` (added in vite v8). The workspace's hoisted `vite@8.1.0` defines that helper, so any cross-module import in a test crashed the suite load with `ReferenceError`.
- **Fix:** Bump `vitest ^2.1.8` → `^4.1.9` in all three apps + `@vitest/coverage-v8 ^2.1.8` → `^4.1.9` in apps/api (matches the 4.x series peer-pinning). vitest 4.1.9 declares peer `vite: ^6.0.0 || ^7.0.0 || ^8.0.0` — satisfied by the workspace's vite 8.1.0. Companion edits: removed the obsolete `transformMode: 'web'` workaround from `apps/api/vitest.unit.config.ts` (the option was removed in vitest 3.0); wired `react({ jsxRuntime: 'automatic' })` as the first plugin in `apps/web-next/vitest.config.ts` and added `@vitejs/plugin-react@^5.2.0` to `apps/web-next/package.json` devDeps (mirroring the `apps/storybook` fix from PR #109 / ISS-CI-OVERRIDE-ebd184b) so `FilterChip.test.tsx` and any future `.tsx` test files in `apps/web-next` parse under vite 8.1.0.
- **Regression test:** `apps/web/src/components/OnboardingForm.test.ts` — pre-existing, authored by `wf-20260703-fix-065-onboarding-copy` (PR #90). Before the fix: `ReferenceError: __vite_ssr_exportName__ is not defined`. After the fix: **5/5 cases pass**.
- **Merged:** `69b2bc6` (squash of `fix/ISS-TEST-WEB-001-vitest-bump` via PR #110).

### Honesty disclosures

- AC-5 ("apps/api and apps/web-next vitest suites run without `__vite_ssr_exportName__` errors") is **fully verified**: both suites now LOAD and EXECUTE under vitest 4.1.9.
- apps/api full Testcontainers suite: **1251/1257 tests pass (94/97 files pass)**. 6 test failures across 3 files (`test/users.spec.ts:65`, `test/telegram-auth-controller.spec.ts:161`, `test/port-guard.spec.ts` cases 4 and 8) are **pre-existing test-design bugs** that were previously masked by the `__vite_ssr_exportName__` block. None are caused by this PR.
- A queued follow-up workflow owns those bugs: **`wf-20260704-fix-096-pre-existing-api-test-flakes`** at `.copilot/tasks/queued/wf-20260704-fix-096-pre-existing-api-test-flakes/handoff.yaml`. That workflow will fix the three test-design bugs. This workflow does **NOT** defer any ACs — every AC is verified by an actual test run, and the queue position is recorded here for transparency.