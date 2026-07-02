# ISS-WF-REG-002 — workspace-state.md and BP-UAT-013 frontmatter are stale vs. actual repo state

| Field | Value |
|---|---|
| ID | ISS-WF-REG-002 |
| Severity | minor |
| Module | workflow/registry |
| Status | open |
| Reported | 2026-07-02 |
| Reporter | BusinessAnalyst (UAT coverage audit) |
| Related | ISS-WF-REG-001 (same failure class, different files) |

## Symptom

Two documentation-sync gaps found during the UAT coverage audit:

1. **`.copilot/context/workspace-state.md`** still shows `Current branch: main`,
   `Last updated: 2026-06-30`, and `Next Workflow ID: 40` under "Notes," and lists
   `wf-20260630-fix-043` as the sole "Active Workflow." The actual repo has advanced
   well past that point — `.copilot/meta/next-workflow-id` is now in the 50s, and
   dozens of workflows have completed since 2026-06-30 per `.copilot/tasks/active/`.
2. **`docs/02-business-processes/uat/BP-UAT-013.md` frontmatter** still shows
   `status: Ready` and `last_run: ""`, while
   `docs/02-business-processes/uat/registry.md` correctly shows
   `Implemented / 2026-06-30 / partial`. The registry's own "Open Issues" column for
   BP-UAT-013 still links `ISS-UAT-013-9` and `ISS-UAT-013-10`, both of which are now
   `resolved` in their issue files — the registry table wasn't updated when they closed.

## Impact

Low — these are documentation artifacts, not runtime behavior. But this is the second
instance of this failure class (see `ISS-WF-REG-001`, registry-state drift from
`wf-20260623-feat-006`), suggesting the workflow-finish step that's supposed to update
these registries is not consistently applied, particularly for `workspace-state.md`
which appears to not be part of the standard finish checklist at all.

## Proposed resolution

- Update `workspace-state.md` and `BP-UAT-013.md` frontmatter to current state (can be
  done directly, low risk).
- Longer term: confirm whether `scripts/workflow-finish.sh` is expected to touch
  `workspace-state.md`; if not, decide whether it should be, or whether that file
  should be deprecated in favor of deriving state from `.copilot/tasks/active/` +
  `git log` on demand.

## Acceptance criteria

- [ ] `workspace-state.md` reflects current branch, latest completed workflows, and current next-workflow-id
- [ ] `BP-UAT-013.md` frontmatter matches registry.md
- [ ] Registry's Open Issues column for BP-UAT-013 reflects resolved status (or is cleared, pending ISS-UAT-013-11's live re-verification)
- [ ] Decision recorded on whether `workspace-state.md` maintenance is added to `workflow-finish.sh` or deprecated
