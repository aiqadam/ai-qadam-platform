# Step 9 — Registry Update (atomic)

**Workflow:** wf-20260703-fix-065-onboarding-copy
**Issue:** ISS-UAT-013-13

## Edits applied to working tree (will be committed atomically with the code in Step 12)

### Edit 1 — `.copilot/issues/ISS-UAT-013-13.md`

- Header table: `Status: open` → `resolved`; `Resolved: <empty>` → `2026-07-03`; `Workflow: <empty>` → `wf-20260703-fix-065-onboarding-copy`; added `Related: ISS-TEST-WEB-001 (queued follow-up: wf-20260703-fix-066-vitest-bump)`.
- Appended a full `## Resolution` section with:
  - Workflow, PR (placeholder), root cause (1 sentence), fix (1 paragraph), regression test (5 cases), merge SHA (placeholder), and the four honesty disclosures per AGENTS.md §6.1.

### Edit 2 — `.copilot/issues/registry.md`

- ISS-UAT-013-13 row: `Status: open` → `resolved`; `Workflow: wf-20260702-uat-059 (triage 2026-07-02; fix pending follow-up workflow)` → `wf-20260703-fix-065-onboarding-copy (PR pending; AC-1/AC-2 verified by tsc+biome+manual-read; AC-3 test file added but execution deferred to wf-20260703-fix-066-vitest-bump / ISS-TEST-WEB-001; AC-4 optional per issue author)`; `Date: 2026-07-02` → `2026-07-03`.

### Edit 3 — `handoff.yaml`

- `issue_ref: ISS-UAT-013-13` (already set).
- `workflow_status: running` (will be flipped to `completed` after Step 12.5 verification).

## Atomicity

Both files are in the working tree. They will be added in the same `git add` and committed together with the code changes (`OnboardingForm.tsx`, `OnboardingForm.helpers.ts`, `OnboardingForm.test.ts`) in Step 12 via `workflow-finish.sh`. No separate post-merge commit will touch them (per issue-resolution.md Step 9 atomicity rule).

## Pre-merge honesty

Between this step and Step 12.5, the branch carries `resolved` but `main` still shows `open`. This is acceptable per issue-resolution.md §Pre-merge honesty note: the branch is throwaway until the PR merges, so if the PR is closed-unmerged the status flip is discarded along with the branch — `main`'s state stays honest.

## Diff snapshot (working tree, uncommitted)

```diff
 .copilot/issues/ISS-UAT-013-13.md        |  +34 lines (Resolution + honesty)
 .copilot/issues/registry.md               |   ±2 lines (one row update)
 .copilot/tasks/active/wf-20260703-fix-065-onboarding-copy/handoff.yaml |  (Step 9 bookkeeping here)
 .copilot/context/workspace-state.md       |   +1 line (queued follow-up)
 .copilot/tasks/queued/wf-20260703-fix-066-vitest-bump/handoff.yaml  (new — queue entry)
 .copilot/issues/ISS-TEST-WEB-001.md       |  (new — blocker issue)
 apps/web/src/components/OnboardingForm.tsx                       | +2 / -1
 apps/web/src/components/OnboardingForm.helpers.ts                | (new, 20)
 apps/web/src/components/OnboardingForm.test.ts                   | (new, 40)
```

## Gate Result

```yaml
gate_result:
  status: passed
  attempt: 1
  timestamp: 2026-07-03T19:00:00Z
  summary: ISS-UAT-013-13 header table + registry row updated to resolved atomically (in working tree, will commit with the PR in Step 12); Resolution section includes the 4 honesty disclosures per AGENTS.md §6.1 (AC-1/AC-2 verified; AC-3 file present, execution deferred to queued wf-20260703-fix-066-vitest-bump; AC-4 optional).
  output_file: .copilot/tasks/active/wf-20260703-fix-065-onboarding-copy/09-registry-update.md
```