## What

Reconciles a **registry-state drift** that was undetected for 9 days: the bats-core test suite for FEAT-WORKFLOW-001 (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-8 — 7 of 8 ACs) was shipped on 2026-06-23 in PR #15 by commit `0698d1e`, but `.copilot/issues/registry.md` row 7 and the issue file `.copilot/issues/FEAT-WORKFLOW-002.md` were never updated to reflect this. The implementation workflow (`wf-20260623-feat-006`) shipped its code but did not execute Step 9 (atomic FR status flip per FEAT-WORKFLOW-003).

AC-7 (shellcheck CI gate) was not shipped — `wf-20260623-feat-006` silently dropped it rather than formally deferring with user approval (per AGENTS.md §8 shellcheck is GPLv3). AC-7 remains effectively dropped unless the user later files `FEAT-WORKFLOW-003-shellcheck-gate` with explicit GPLv3 approval.

## Why

The user requested "Resolve issue FEAT-WORKFLOW-002" on 2026-07-02. Step 1 (RequirementAnalyst) audit found that 7/8 ACs were already on `main`. The correct action is **abandon the workflow** (per `handoff.schema.yaml`, `workflow_status: "abandoned"` is a first-class outcome for cases where planned work is discovered to be already done) and reconcile the bookkeeping.

This is the **exact failure mode** that FEAT-WORKFLOW-001 (drift detection, PR #13) was designed to catch — but FEAT-WORKFLOW-001's drift check only runs at Step 0.5 of the *next* workflow, by which time the broken state has already been merged. A future hardening (out of scope here) could add a post-merge CI check.

## How

- **Abandon** `wf-20260702-feat-048-bats-f5-refactor` after Step 1.
- **Flip** `.copilot/issues/FEAT-WORKFLOW-002.md` frontmatter to `status: resolved` with a `## Resolution` section listing which ACs shipped (with file:line citations) and which was dropped (AC-7).
- **Flip** `.copilot/issues/registry.md` row 7 to `Status: resolved | Workflow: wf-20260623-feat-006 (PR #15, commit 0698d1e — 7/8 ACs shipped; AC-7 shellcheck dropped without GPLv3 approval) | 2026-06-23`.
- **File** new issue `ISS-WF-REG-001` documenting the meta-drift itself, with full repro and AC list (5 ACs for the reconciliation).
- **Add** `.copilot/issues/registry.md` row for `ISS-WF-REG-001` (resolved).
- **Mark** this workflow as `abandoned` with the abandoned_resolution block in `handoff.yaml`.

## Risks

- **Low.** This PR touches only metadata (issue + registry files) and the workflow's own handoff. Zero code change, zero runtime impact.
- **Honesty disclosure:** the AC-7 drop in `wf-20260623-feat-006` is itself a smaller instance of the same meta-drift problem (silent drop without formal user approval). Documented in the FEAT-WORKFLOW-002 Resolution section. If the user wants to revisit AC-7, a new feature issue with explicit GPLv3 approval is the path forward.

## Testing

- `arch:check` passes (5 files scanned).
- `git diff origin/main...HEAD --stat` shows only metadata changes (issue files + registry + handoff.yaml).
- No tests added — there is no code change to test.

## Checklist
- [x] Tests added / updated — N/A (no code change)
- [x] Docs updated (issue files + registry + ISS-WF-REG-001 + handoff)
- [x] No new dependencies
- [x] Manually audited (verified 7/8 ACs shipped on main before opening PR)
- [x] Honest disclosure on AC-7 (no GPLv3 approval obtained)

Closes FEAT-WORKFLOW-002 retroactively. Files + resolves ISS-WF-REG-001.