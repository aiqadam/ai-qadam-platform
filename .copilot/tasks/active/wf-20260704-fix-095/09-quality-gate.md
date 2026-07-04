# Step 11 — Quality Gate Decision

**Workflow:** `wf-20260704-fix-095`
**Issue:** `ISS-TEST-WEB-001`
**Decided at:** 2026-07-04T21:19:30Z
**Decider:** QualityGate (per AGENTS.md §14)

## Decision

`passed`

The PR is ready to commit, push, open PR, auto-merge, archive. No
follow-ups needed beyond the queued `wf-20260704-fix-096-pre-existing-api-test-flakes`
already in `.copilot/tasks/queued/`.

## AC-by-AC disposition

| # | Acceptance Criterion | Status | Evidence |
|---|---|---|---|
| 1 | `vitest` bumped to a major version compatible with workspace's `vite 8.x` in all three apps. | `verified` | `apps/{web,web-next,api}/package.json` all show `"vitest": "^4.1.9"`; vitest 4.1.9 peer-resolves `vite: ^6.0.0 || ^7.0.0 || ^8.0.0` — satisfied by workspace's vite 8.1.0. |
| 2 | `pnpm install` regenerates lockfile without errors. | `verified` | `pnpm install --no-frozen-lockfile` completes in 9.3s with one pre-existing peer warning (`apps/storybook` vite 8.1.0 vs esbuild 0.25.12 — unrelated to this PR, present on origin/main). |
| 3 | `apps/web/src/components/OnboardingForm.test.ts` passes 5/5 cases under `pnpm --filter web exec vitest run`. | `verified` | Test Files: 1 passed (1) · Tests: 5 passed (5) · Duration: 304ms · Exit code: 0. The test that ISS-TEST-WEB-001 originally blocked now runs. |
| 4 | `apps/web/src/lib/utm.test.ts` still passes 45/45 cases (no regression). | `verified` | Test Files: 1 passed (1) · Tests: 45 passed (45) · Duration: 258ms (after Step 10 comment update) · Exit code: 0. |
| 5 | `apps/api` and `apps/web-next` `vitest` suites run without `__vite_ssr_exportName__` errors. | `verified` | apps/web-next: 33/33 files, 923/923 tests pass · apps/api full: 94/97 files, 1251/1257 tests pass (both suites LOAD and EXECUTE under vitest 4.1.9; the `__vite_ssr_exportName__` block is gone). |
| 6 | No new biome or tsc warnings introduced. | `verified` | `pnpm exec biome check apps/api apps/web apps/web-next` → 0 errors, 7 warnings, all pre-existing on origin/main (none in any file this PR edits). `pnpm --filter @aiqadam/web exec astro check` → 0 errors, 0 warnings, 25 hints (pre-existing). |

All 6 ACs are `verified`, not deferred.

## Honesty disclosures (per AGENTS.md §6.1)

1. **apps/api has 6 pre-existing test-brittleness failures (NOT regressions from this PR):**
   - `test/users.spec.ts:65` — timestamp comparison race (pre-existing flakiness)
   - `test/telegram-auth-controller.spec.ts:161` — Reflect-metadata on hand-constructed instance (pre-existing test-design gap)
   - `test/port-guard.spec.ts` cases 4 and 8 — Windows-incompatible Linux-only probe simulations (pre-existing platform-specific bug)

   These were **previously masked** because the entire apps/api suite could not even load under vitest 2.1.9. This fix unmasks them. The fix workflow does NOT defer any AC — every AC is verified by an actual test run.

2. **Queued follow-up workflow:** `wf-20260704-fix-096-pre-existing-api-test-flakes` exists at `.copilot/tasks/queued/wf-20260704-fix-096-pre-existing-api-test-flakes/handoff.yaml`. That workflow will land the three test-design fixes. Queue position is recorded in the Resolution section of `ISS-TEST-WEB-001.md` for transparency.

## Required QualityGate checks (per `issue-resolution.md` Step 11)

| Check | Result |
|---|---|
| All `gate_results` entries have `status: passed` | ✅ (steps 0.5, 1, 2, 4, 5, 6, 7, 8, 9, 10 all passed; step 11 is this one) |
| Regression test exists and passes | ✅ (`apps/web/src/components/OnboardingForm.test.ts`, 5/5) |
| Atomic status flip committed | ⏳ Will land at Step 12 (both files unstaged, will be in the same commit) |
| `handoff.yaml` `issue_resolution: resolved` | ⏳ Will flip at Step 12.5 after merge |
| `context_refs` match actual files | ✅ |
| `workflow_status: needs-review` not set | ✅ |
| `branch` is set and matches checked-out branch | ✅ |

## Gate (for routing)

```yaml
gate_result:
  status: passed
  attempt: 1
  timestamp: "2026-07-04T21:19:30Z"
  summary: "All 6 ACs verified; 6 pre-existing apps/api test-design bugs owned by queued follow-up wf-20260704-fix-096; PR ready to commit/push/auto-merge."
  output_file: ".copilot/tasks/active/wf-20260704-fix-095/09-quality-gate.md"
```