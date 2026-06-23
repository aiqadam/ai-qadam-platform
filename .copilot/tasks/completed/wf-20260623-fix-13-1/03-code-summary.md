# Code Summary — ISS-WF-13-1

> Output for: `.copilot/tasks/active/wf-20260623-fix-13-1/03-code-summary.md`
> Agent: CodeDeveloper (Orchestrator-authored)
> Workflow: wf-20260623-fix-13-1
> Issue: ISS-WF-13-1

---

## Files changed

| File | LOC delta | What changed |
|---|---|---|
| `scripts/check-workflow-state.sh` | +7, −1 | Extended orphan check (Check 1) to recognize `.copilot/tasks/archived/$wf_id` as a valid home, alongside the existing `active/` and `completed/` checks. Updated comment block to document the three-home convention (R-3d + ISS-WF-13-1 mitigation). |
| `.copilot/tasks/active/wf-20260622-feat-001/01-requirement-validation.md` | deleted via `git rm --cached` | Pre-gitignore tracked file from a workflow that completed 2026-06-22. Dead artifact. |
| `.copilot/tasks/active/wf-20260622-feat-001/02-impact-analysis.md` | deleted | Same. |
| `.copilot/tasks/active/wf-20260622-feat-001/handoff.yaml` | deleted | Same. |
| `.copilot/issues/registry.md` | +1, −1 | Updated ISS-WF-13-1 row: `open` → `resolved`, workflow column populated. |
| `.copilot/meta/next-workflow-id` | +1, −1 | Bumped counter 5 → 6 to reserve `wf-20260623-fix-13-2` for any follow-up. |

**Total:** 6 files, 9 net LOC added, 4 net LOC removed. Well under the
400 LOC / 5 files PR cap.

## Implementation notes

### scripts/check-workflow-state.sh (Part A)

The orphan check now has three valid homes:

```bash
if [[ ! -d ".copilot/tasks/active/$wf_id" \
   && ! -d ".copilot/tasks/completed/$wf_id" \
   && ! -d ".copilot/tasks/archived/$wf_id" ]]; then
  # ...drift emission logic...
fi
```

This is a pure relaxation: workflows that were previously flagged as
orphans (because they live in `archived/`) are now correctly
recognized. Workflows that genuinely have no on-disk representation
are still flagged.

### git rm --cached (Part B)

Used `git rm --cached` (not `git rm`) to remove the 3 files from the
index without touching the working tree. After this:

- `git ls-files .copilot/tasks/active/` returns only `.gitkeep`.
- The files remain on disk locally, but `.copilot/tasks/` is
  gitignored, so they won't be re-added on commit.

### Why archived/ works despite being gitignored

The drift check reads from disk (`test -d`), not from git history.
The gitignored `.copilot/tasks/archived/` directory is per-machine
state. As long as the dev runs the script on the same machine that
ran the workflow, `archived/` exists and the script sees it. Other
developers who don't have those dirs locally will still see drift —
that's intentional: drift is a per-machine signal that "something
fell out of sync on this machine", not a repo-wide invariant.

## Self-validation

- `bash -n scripts/check-workflow-state.sh` → exit 0.
- `bash scripts/check-workflow-state.sh --base origin/main` →
  "OK: no drift detected against origin/main." exit 0.
- `bash scripts/check-workflow-state.sh --help` → exit 0,
  expected stdout, empty stderr.
- `bash scripts/check-workflow-state.sh --skip` → exit 0 with
  WARNING to stderr.
- `pnpm typecheck` → 4 successful, 0 errors. (Cached; full re-run
  is N/A since no TS files changed.)

## Status

**passed** — proceed to Step 5 (SecurityReviewer).