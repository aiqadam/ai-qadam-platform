# ISS-WF-13-1 — Pre-existing workflow state drift detected by FEAT-WORKFLOW-001

## Summary

The first run of `check-workflow-state.sh` (introduced by
FEAT-WORKFLOW-001, shipped in PR #13) detected real, pre-existing
drift in the workflow state files. Without remediation, every future
workflow will fail Step 0.5 until this is resolved.

## Drift items

Detected against `origin/main` by `scripts/check-workflow-state.sh --base origin/main`:

| # | Location | Symptom | Root cause |
|---|---|---|---|
| 1 | `.copilot/context/workspace-state.md` | References `wf-20260623-feat-2` but no `.copilot/tasks/{active,completed,archived}/wf-20260623-feat-2` exists on disk | Workflow was archived on the dev machine after its task dir was already gitignored. The `archived/` path is gitignored so the script doesn't see it. The workspace-state.md entry persists on `origin/main`. |
| 2 | `.copilot/tasks/active/wf-20260622-feat-001/` | Tracked files (01-requirement-validation.md, 02-impact-analysis.md, handoff.yaml) from a workflow that completed 2026-06-22 | These files were committed to the repo before `.copilot/tasks/` was added to `.gitignore`. They are tracked in `origin/main` even though the workflow is long done. |
| 3 | `.copilot/context/workspace-state.md` | References `wf-20260622-feat-001` (FR-MIG-003 Form block) as "main → merged" but the task dir is in `active/` not `archived/` | Same root cause as #1 — the entry is in the registry, the files are tracked, but the dir was never moved. |

## Resolution

This issue is split into two parts:

### Part A — Script improvement (FEAT-WORKFLOW-001 amendment)

Extend `scripts/check-workflow-state.sh` to recognize `.copilot/tasks/archived/`
as a valid home for a workflow's task dir. The current script only
checks `active/` and `completed/` (line 155-156), which forces every
completed workflow to keep a permanent `completed/` entry — but the
housekeeping convention is to move old workflows to `archived/`.

Change the orphan check to also look for `.copilot/tasks/archived/$wf_id`.
This is a one-line fix to the script.

### Part B — Repo cleanup

1. **`git rm` the tracked `wf-20260622-feat-001` files.** They were
   committed before `.gitignore` was tightened. Removing them requires
   `git rm --cached` to delete from the index while keeping local copies
   (or `git rm` to delete entirely). They have no informational value —
   the workflow is long done and `requirements-registry.md` has the
   canonical reference.

2. **No workspace-state.md change needed.** The `wf-20260623-feat-2`
   and `wf-20260622-feat-001` entries describe **merged** workflows —
   they should stay in `workspace-state.md` for historical record. The
   fix to the script (Part A) makes them no longer false-positive.

## Workflow

This will be addressed in a separate `issue-resolution` workflow
**wf-20260623-fix-13-1** (next-workflow-id is already 5).

## Severity

**minor** — does not block any code change; affects only the
freshly-shipped drift detection script and the developer's local
state. Without this fix, every new workflow's Step 0.5 will fail
until either: (a) the developer passes `--skip`, or (b) the orphan
is reconciled. The fix is small and self-contained.

## Acceptance criteria

1. `bash scripts/check-workflow-state.sh --base origin/main` exits 0
   after the fix lands and `origin/main` is updated.
2. `git ls-files .copilot/tasks/active/wf-20260622-feat-001/` returns
   empty (no tracked orphan files).
3. The script's helper function comment documents that `archived/` is
   a valid third home for a workflow's task dir.
4. A regression test in `check-workflow-state.bats` (deferred to
   FEAT-WORKFLOW-002) covers the `archived/` case.

## Resolution (2026-06-23)

Resolved by `wf-20260623-fix-13-1`. Two-part fix:

1. **Part A — script relaxation:** `scripts/check-workflow-state.sh`
   now recognizes `.copilot/tasks/archived/$wf_id` as a valid task-dir
   home (alongside `active/` and `completed/`). This removes the false
   positive for workflows that have been archived on the dev machine.

2. **Part B — git index cleanup:** Tracked files under
   `.copilot/tasks/active/wf-20260622-feat-001/` (3 files) were
   removed from the index via `git rm --cached`. These were committed
   before `.copilot/tasks/` was added to `.gitignore`; they have no
   informational value because the workflow has been Shipped since
   2026-06-22 and the canonical reference is in
   `requirements-registry.md`.

After this fix, `bash scripts/check-workflow-state.sh --base origin/main`
exits 0 (clean) and every future workflow's Step 0.5 will pass without
requiring `--skip`.

## Acceptance criteria results

| # | Criterion | Result |
|---|---|---|
| 1 | `check-workflow-state.sh --base origin/main` exits 0 | ✅ PASS |
| 2 | `git ls-files .copilot/tasks/active/wf-20260622-feat-001/` is empty | ✅ PASS |
| 3 | Script helper comment documents `archived/` | ✅ PASS |
| 4 | bats regression test (deferred to FEAT-WORKFLOW-002) | DEFERRED |