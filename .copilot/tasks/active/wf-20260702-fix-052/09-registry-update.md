# Step 9 — Registry Update (atomic status flip)

## Edits applied

### Edit 1 — `.copilot/issues/ISS-CI-002.md` (header table + Resolution section)

**Header table:**

| Before | After |
|---|---|
| `Status | **open**` | `Status | **resolved**` |
| (no `Resolved` row) | `Resolved | 2026-07-02` |

**Added `## Resolution` section** at the bottom of the file with:
- Workflow: `wf-20260702-fix-052`
- PR: `<pending>` (back-filled at Step 12)
- Root cause: `nodemailer@6.10.1` carries GHSA-rcmh-qjqh-p98v + GHSA-p6gq-j5cr-w38f
- Fix: `nodemailer ^6.9.16` → `^9.0.1`
- Regression test: `scripts/tests/audit-nodemailer-version.bats`
- Merged: `<pending>` (back-filled at Step 12.5)
- Out of scope: Storybook rolldown (advisory)

### Edit 2 — `.copilot/issues/registry.md` (table row)

Added new row immediately after the `ISS-CI-001` row:

```markdown
| [ISS-CI-002](ISS-CI-002.md) | blocker | ci/infrastructure | Pre-existing CI failures regressed: `apps/api > nodemailer@6.10.1` carries GHSA-rcmh-qjqh-p98v (DoS) + GHSA-p6gq-j5cr-w38f (SSRF); `pnpm audit --prod --audit-level=high` exits 1 → blocks every PR to main | resolved | wf-20260702-fix-052 | 2026-07-02 |
```

**Atomicity note:** the registry row was added as `resolved` in the
same commit. The issue file's Status was flipped from `open` →
`resolved` in the same commit. Both are on the `fix/ISS-CI-002-ci-regression`
branch and will ride the same PR as the code fix.

## Honesty disclosure (registry-vs-file parity check)

| Field | File A (ISS-CI-002.md) | File B (registry.md row) | Match? |
|---|---|---|---|
| Status | `resolved` | `resolved` | ✅ |
| Workflow | `wf-20260702-fix-052` | `wf-20260702-fix-052` | ✅ |
| Date | `2026-07-02` | `2026-07-02` | ✅ |

## Pre-merge honesty note

Per `.copilot/workflows/issue-resolution.md` Step 9:

> Between Step 9 and Step 12.5, the branch carries `resolved` but
> `main` still shows the original state. This is acceptable because
> the branch is throwaway until the PR merges.

`main` does NOT contain a `ISS-CI-002` row in the registry (the issue
was filed in a workflow that didn't merge — see `wf-20260702-fix-051`
status). The PR will introduce both the file and the row to `main`
simultaneously. No separate post-merge commit is needed for the
flip.

## Git status (post-edit, pre-commit)

```
$ git status --porcelain
 M .copilot/issues/ISS-CI-002.md
 M .copilot/issues/registry.md
 M apps/api/package.json
 M pnpm-lock.yaml
?? scripts/tests/audit-nodemailer-version.bats
?? .copilot/tasks/active/wf-20260702-fix-052/
```

The status-flip edits are part of the same branch as the code fix.
The Step 12 commit (`workflow-finish.sh`) will include everything
in one push.

## Gate Result

gate_result:
  status: passed
  summary: "Both files updated atomically: ISS-CI-002.md Status → resolved with Resolution section; registry.md row added as resolved. Status/Workflow/Date parity confirmed."
  findings:
    - "ISS-CI-002.md Status field flipped from `open` to `resolved`."
    - "Resolution section appended with Workflow, PR placeholder, root cause, fix, regression test, and merged placeholder."
    - "registry.md row added immediately after ISS-CI-001, with Status=resolved, Workflow=wf-20260702-fix-052, Date=2026-07-02."
    - "Both edits ride the same branch; PR will land the flip on main simultaneously with the code fix."