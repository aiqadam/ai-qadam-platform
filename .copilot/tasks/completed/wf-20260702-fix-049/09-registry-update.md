# Step 9 — Registry Update (atomic status flip)

**Workflow:** wf-20260702-fix-049
**Issue:** ISS-UAT-013-10
**Date:** 2026-07-02

## Edits applied

### Edit 1 — `.copilot/issues/ISS-UAT-013-10.md`

- Header field table: `Status` → `resolved`; `Resolved` → `2026-07-02`;
  `Workflow` → `wf-20260702-fix-049`.
- Acceptance criteria: AC-1 ticked, AC-2 / AC-3 marked
  `deferred-to-followup` per AGENTS.md §6.1.
- New `## Resolution` section appended (verbatim, for the QualityGate
  status-consistency check):

  - **Workflow:** wf-20260702-fix-049
  - **PR:** https://github.com/tvolodi/aiqadam/pull/76
  - **Root cause:** `ensure_operator_invite()` hardcoded `role_groups:[]`
    for all four fixture rows. The valid-invite row needed
    `["aiqadam-staff"]` so the BP-UAT-013 Step 005 spec assertion
    `getByText(/aiqadam-staff/i)` could find the role label rendered by
    `apps/web/src/components/OnboardingForm.tsx`.
  - **Fix:** 7th positional parameter + jq `--argjson` body +
    `'["aiqadam-staff"]'` at the valid-invite call site.
  - **Regression test:** New AC-5 in `scripts/tests/uat-seed.bats`
    (would have failed before this PR, passes after).
  - **Merged:** `<pending>` (Step 12.5 back-fill)
  - **Honesty disclosures:** code not novel (originated in
    wf-20260630-fix-044); live UAT re-run deferred; git remote HTTPS.

### Edit 2 — `.copilot/issues/registry.md`

Row 18 updated:

```diff
-| ISS-UAT-013-10 | minor | uat/test-design | ... | open | wf-20260630-uat-042 | 2026-06-30 |
+| ISS-UAT-013-10 | minor | uat/test-design | ... | resolved | wf-20260702-fix-049 | 2026-07-02 |
```

### Edit 3 — `handoff.yaml`

- `issue_resolution: resolved` will be set in the next handoff.yaml
  edit before workflow-finish.sh runs.

## Atomicity guarantee

All three edits land in the same commit on the feature branch
(`fix/ISS-UAT-013-10-seed-role-groups`) via `git add` followed by
`git commit` together. Step 12 (workflow-finish.sh) commits everything
as a single push, so when PR #76 merges, the status flip lands on
`main` simultaneously with the code fix.

`main` still shows the issue as `open` because PR #76 is not yet
merged. Per the issue-resolution workflow's Step 9 honesty note:

> Between Step 9 and Step 12.5, the branch carries `resolved` but
> `main` still shows `open`. This is acceptable because the branch
> is throwaway until the PR merges. If the PR is closed-unmerged,
> the status flip is discarded along with the branch — `main`'s
> state stays honest.

## Gate result

```yaml
gate_result:
  status: passed
  summary: "Both registry.md and ISS-UAT-013-10.md updated to resolved/wf-20260702-fix-049 in this workflow's tree. Will land on main when PR #76 merges (Step 12.5)."
  findings:
    - "registry.md row 18: status open → resolved, workflow wf-20260630-uat-042 → wf-20260702-fix-049, date 2026-06-30 → 2026-07-02"
    - "ISS-UAT-013-10.md header table: same three fields updated"
    - "ISS-UAT-013-10.md Resolution section appended with PR URL, root cause, fix, regression test, merged=<pending>, honesty disclosures"
    - "AC-1 ticked; AC-2/AC-3 marked deferred-to-followup per AGENTS.md §6.1"
```