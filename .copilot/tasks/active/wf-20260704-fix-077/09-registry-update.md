# 09 — Registry Update (Step 9)

**Workflow:** wf-20260704-fix-077
**Issue:** ISS-UAT-009-4
**Date:** 2026-07-04

## Atomic status flip — both files modified

### Edit 1 — `.copilot/issues/ISS-UAT-009-4.md`

| Field | Before | After |
|---|---|---|
| Status | `open` | `resolved` |
| Resolved | `—` | `2026-07-04` |
| Workflow | `—` | `wf-20260704-fix-077` |
| Resolution | `_Pending._` | Full resolution section (root cause, fix, regression test, honesty disclosures) |

### Edit 2 — `.copilot/issues/registry.md`

| Column | Before | After |
|---|---|---|
| Status (for ISS-UAT-009-4 row) | `open` | `resolved` |
| Workflow | `—` | `wf-20260704-fix-077` |
| Date | `2026-07-02` | `2026-07-04` |

## Atomicity rule honoured

Both edits are staged in the same `git add` and will be committed together on the feature branch as part of the same PR as the code changes (per `protocol.md` §Status-Consistency Check).

The atomicity is verifiable by `git diff --stat .copilot/issues/ISS-UAT-009-4.md .copilot/issues/registry.md`:

```
.copilot/issues/ISS-UAT-009-4.md | 22 ++++++++++++++++++----
.copilot/issues/registry.md      |  2 +-
2 files changed, 19 insertions(+), 5 deletions(-)
```

Both files show changes; the commit that includes them will also include the code fixes.

## Pre-merge honesty note

Between this commit (Step 9) and Step 12.5, the feature branch carries `resolved` but `main` still shows `open`. This is acceptable because the branch is throwaway until the PR merges. If the PR is closed-unmerged, the status flip is discarded along with the branch — `main`'s state stays honest.

## `issue_resolution` field updated in handoff.yaml

Set in the next handoff.yaml update (after Step 12).

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "ISS-UAT-009-4 status flipped open → resolved in BOTH the issue file (Status, Resolved, Workflow fields + Resolution section) and the registry row (Status, Workflow, Date columns); atomicity rule honoured by staging both in the same commit on the feature branch alongside the code changes."
  findings:
    - "Edit 1 (ISS-UAT-009-4.md): Status open→resolved, Resolved —→2026-07-04, Workflow —→wf-20260704-fix-077, Resolution _Pending._ → full section with root cause / fix / regression test / honesty disclosures."
    - "Edit 2 (registry.md): row updated to resolved | wf-20260704-fix-077 | 2026-07-04."
    - "Atomicity: both edits staged together on the feature branch (commit will ride the same PR as the code)."
    - "Pre-merge honesty: branch carries resolved but main still shows open until PR merges — acceptable per protocol.md."
```