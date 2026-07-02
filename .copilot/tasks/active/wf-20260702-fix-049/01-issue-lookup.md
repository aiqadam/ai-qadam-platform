# Step 1 — Issue Lookup

**Workflow:** wf-20260702-fix-049
**Issue ref:** ISS-UAT-013-10
**Branch:** fix/ISS-UAT-013-10-seed-role-groups
**Date:** 2026-07-02

## Lookup result

The issue is already registered in `.copilot/issues/registry.md` (row 18,
the `open` entry the user is asking us to resolve):

| ID | Severity | Module | Summary | Status | Workflow | Date |
|---|---|---|---|---|---|---|
| ISS-UAT-013-10 | minor | uat/test-design | Step 005 spec asserts `aiqadam-staff` role visible but seed has `role_groups: []` — spec/seed misalignment → Step 005 fails | open | wf-20260630-uat-042 | 2026-06-30 |

Full issue body lives at `.copilot/issues/ISS-UAT-013-10.md` and was read
in full before this step. The issue's own Classification section already
identifies it as **spec/seed misalignment, NOT a product bug** and lists
two valid fix paths:

- **Option A (preferred):** Add `aiqadam-staff` to `role_groups` for the
  valid invite row in `scripts/uat-seed.sh`.
- **Option B:** Update the spec assertion to match the empty role_groups
  state.

This workflow chooses **Option A** because:

1. The issue itself marks it as the preferred path.
2. Option A produces a more meaningful UAT — the seed exercises the
   realistic staff-role onboarding code path instead of the empty-state
   edge case.
3. The previous (abandoned) workflow `wf-20260630-fix-044` already
   implemented Option A and verified it via bats regression (8/8). The
   audit trail is preserved by re-running the same code change under
   the current workflow id.

## Search for similar issues

Keyword search (`role_groups`, `aiqadam-staff`, `operator_invites`,
`BP-UAT-013`) against `.copilot/issues/registry.md` returned only the
target issue itself. No duplicates to merge.

## Related (resolved) issues for context

- **ISS-UAT-013-8** (`wf-20260629-fix-039`) — fixed the operator_invites
  email ↔ Authentik user mismatch that previously blocked Step 006.
- **ISS-UAT-013-9** (`wf-20260630-fix-043`) — fixed the lead-verification
  idempotency gap that previously blocked Step 004.

Both are upstream prerequisites for this fix (Step 006 must reach the
api's `consumeInvite()` for the role_groups we are adding to be
meaningful). Both are already merged on `main`.

## Honesty disclosure

The previous workflow `wf-20260630-fix-044` opened PR #76 with the
exact same code change and reached Step 12 (workflow-finish.sh
completed) but never reached Step 12.5 — the PR is still OPEN on
github.com/tvolodi/aiqadam/pull/76. This workflow re-uses the same
branch and PR after a `git reset --hard origin/main` + rebase, so
the audit trail under the new counter is coherent while the actual
fix code is preserved.

## Gate result

```yaml
gate_result:
  status: passed
  summary: "Issue located; classification confirmed (spec/seed misalignment); Option A chosen; related upstream issues already resolved on main."
  findings:
    - "ISS-UAT-013-10 already in registry; no duplicate to register"
    - "Upstream ISS-UAT-013-8 and ISS-UAT-013-9 already merged"
    - "Same fix was authored on 2026-06-30 by abandoned wf-20260630-fix-044; this workflow re-applies for audit trail"
```