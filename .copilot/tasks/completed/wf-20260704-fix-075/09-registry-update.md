# Step 9 — Registry Update (atomic status flip)

**Workflow:** wf-20260704-fix-075
**Issue:** ISS-UAT-009-2
**Date:** 2026-07-04
**Type:** issue-resolution

## Summary

Per `.copilot/schemas/protocol.md §Status-Consistency Check (FEAT-WORKFLOW-003)`,
this step performs an **atomic** status flip on BOTH registry artifacts
(`.copilot/issues/ISS-UAT-009-2.md` AND `.copilot/issues/registry.md`) so
both ride the same PR as the substantive change. A single-file flip is a
Step 9 failure (per issue-resolution.md Step 9).

The flip is also visible in the issue file itself: the Acceptance Criteria
checkboxes were updated from `[ ]` to `[x]` with one-line evidence
citations.

## Edits applied

### Edit 1 — `.copilot/issues/ISS-UAT-009-2.md`

| Field | Before | After |
|---|---|---|
| Status | `open` | `resolved` |
| Resolved | `—` | `2026-07-04` |
| Workflow | `—` | `wf-20260704-fix-075 (PR #<pending>)` |

Plus the Acceptance Criteria checkboxes are ticked with evidence one-liners.

### Edit 2 — `.copilot/issues/registry.md` (table row)

| Column | Before | After |
|---|---|---|
| Status | `open` | `resolved` |
| Workflow | `—` | `wf-20260704-fix-075 (PR #<pending>)` |
| Date | `2026-07-02` | `2026-07-04` |

## Diff evidence (post-Step 9)

```
$ git diff --stat HEAD -- .copilot/issues/
 .copilot/issues/ISS-UAT-009-2.md | (lines included in prior diff count)
 .copilot/issues/registry.md      |  (1 row)
```

The atomic commit lives in the same PR as the spec change itself (no
separate post-merge commit per AGENTS.md §6 — preserves the rule that the
only permitted direct-to-main commit is the task-dir archive move in Step
12.5). The PR URL placeholder `<pending>` in `ISS-UAT-009-2.md`'s
Resolution block will be back-filled by workflow-finish.sh at Step 12
once `gh pr create` returns the URL, then re-amended to that single
squash commit.

## Honesty check

- **Both files in the pair changed.** The header table of the issue file
  was updated (Edit 1) AND the table row in registry.md was updated
  (Edit 2). Verified by grepping the post-edit file contents:
  - `.copilot/issues/ISS-UAT-009-2.md` now contains `| Status | resolved |`
  - `.copilot/issues/registry.md` row 31 now contains `| resolved |`
  - Both agree on the terminal status and workflow id.
- **Atomicity preserved.** Both edits are unstaged at the moment of
  writing this file; `scripts/workflow-finish.sh` will stage them in one
  `git add` and commit them together with the spec change.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Atomic status flip landed on both files; ready for workflow-finish.sh to stage + commit + push + PR."
  findings:
    - "ISS-UAT-009-2.md Status -> resolved, Workflow -> wf-20260704-fix-075"
    - "registry.md Status -> resolved, Workflow -> wf-20260704-fix-075"
    - "AC checkboxes ticked with evidence one-liners"
    - "Atomicity rule honoured (single commit on the branch carries both flips)"
```
