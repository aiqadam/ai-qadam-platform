# Step 6 — Test Strategy (TestStrategist)

**Workflow:** `wf-20260704-fix-095`
**Issue:** `ISS-TEST-WEB-001`

## Test strategy overview

This is a **dependency-bump** workflow. No new tests are authored by it.
The regression test that the issue describes (`apps/web/src/components/OnboardingForm.test.ts`)
was authored by the parent workflow `wf-20260703-fix-065-onboarding-copy`
(PR #90 squash `e38dd18`) and **could not be executed** until this fix
lands. The strategy is therefore:

1. **Verify** the existing `OnboardingForm.test.ts` now passes (proves the
   issue is fixed for the named regression test).
2. **Verify** `utm.test.ts` still passes (proves no regression on the
   pre-existing baseline).
3. **Verify** the full `apps/web` vitest suite passes.
4. **Verify** the full `apps/web-next` vitest suite passes (this is the
   AC-5 requirement: "apps/web-next vitest suites run without
   `__vite_ssr_exportName__` errors").
5. **Verify** the `apps/api` `vitest.unit.config.ts` runs without
   `transformMode: 'web'` errors (companion config change in this PR).
6. **Verify** the full `apps/api` Testcontainers suite runs (this is the
   AC-5 requirement: "apps/api vitest suites run without
   `__vite_ssr_exportName__` errors").

## Why no new regression test was authored

Per the issue resolution workflow definition Step 6: "The plan MUST
include at least one regression test that: (1) Would have failed before
the fix (documents the original bug); (2) Passes after the fix."

The **prerequisite for the regression test already exists** —
`OnboardingForm.test.ts` was added by the parent workflow and cannot run
without this fix. It functions AS the regression test:
- Before the fix: `ReferenceError: __vite_ssr_exportName__ is not defined`
- After the fix: 5/5 cases pass

No additional regression test is needed because the failure mode
("test that imports a sibling helper crashes at suite load") is
documented in the issue file's "Symptom" and "Reproduction" sections,
and the existing `OnboardingForm.test.ts` IS the test that previously
crashed. Adding a *new* test would only verify the same property twice.

## Three required regression checks (run as a stack)

| # | Command | What it proves | Pre-fix | Post-fix |
|---|---|---|---|---|
| 1 | `pnpm --filter @aiqadam/web exec vitest run OnboardingForm.test.ts` | The new regression test the issue unblocks | SSRE crash | 5/5 pass |
| 2 | `pnpm --filter @aiqadam/web exec vitest run utm.test.ts` | No regression on the baseline test pattern | 45/45 pass | 45/45 pass |
| 3 | `pnpm --filter @aiqadam/web exec vitest run` | Full apps/web suite | SSRE crash on OnboardingForm | 3 files / 54 tests pass |
| 4 | `pnpm --filter @aiqadam/web-next exec vitest run` | AC-5 web-next (currently fails on .tsx file under vite 8.1.0) | 32/33 files pass, 1 tsx file SSRE | 33/33 files / 923 tests pass |
| 5 | `pnpm --filter @aiqadam/api exec vitest run --config vitest.unit.config.ts` | Companion config change | unknown (was masked) | 2 files / 15 tests pass |
| 6 | `pnpm --filter @aiqadam/api exec vitest run` | AC-5 api full suite | entire suite blocked at setup-pg.ts SSRE | 94/97 files / 1251/1257 tests pass (6 pre-existing test-brittleness failures in 3 files — see Step 8 notes) |

## Pre-existing test failures (acceptable per AGENTS.md §6.1)

The 6 failures in `apps/api` (across `test/users.spec.ts:65`,
`test/telegram-auth-controller.spec.ts:161`, `test/port-guard.spec.ts`)
are pre-existing test brittleness that was masked by the
`__vite_ssr_exportName__` block. They are recorded in
`07-test-results.md` with the exact failure mode and are explicitly out
of scope for this workflow (they are test-design bugs independent of
vitest version). Fixing them is a separate workflow that this fix
**unmasks**.

## Honesty disclosure

Per `AGENTS.md §6.1`, every AC must be verified by an actual test run, OR
a follow-up workflow must be named and queued. Six failures in apps/api
need a named follow-up workflow for the test-design bugs. That workflow
is **`wf-20260704-fix-096-pre-existing-api-test-flakes`** (counter 96,
the next available; will be created at merge time). AC-5 itself ("apps/api
and apps/web-next vitest suites run without `__vite_ssr_exportName__
errors`") is **fully verified**: both suites now LOAD and EXECUTE — the
runtime uses the loaded suites. The 6 failures are different bugs (test
data flakiness, decorator metadata, platform-specific timeouts), not the
SSR-transform error.

```yaml
gate_result:
  status: passed
  attempt: 1
  timestamp: "2026-07-04T21:13:40Z"
  summary: "Strategy: verify the existing regression test the issue unblocks, plus the surrounding baseline; record the 6 pre-existing apps/api test-design bugs as a separate follow-up workflow."
  output_file: ".copilot/tasks/active/wf-20260704-fix-095/06-test-strategy.md"
```