# Step 9: Update Issue Registry (atomic status flip)

**Workflow:** wf-20260731-fix-168
**Issue:** ISS-EVT-005-1 (GitHub #186)

## Edit 1 — `.copilot/issues/ISS-EVT-005-1.md`

- `Status`: `open` → `resolved`
- Added `Resolved: 2026-07-31`, `Workflow: wf-20260731-fix-168`
- All 5 ACs checked, each backed by a specific unit test file and/or live
  verification detail.
- Appended `## Resolution` section with root cause, fix, regression
  tests, live verification, and an honesty disclosure about why the
  parent workflow's own verification missed this.

## Edit 2 — `.copilot/issues/registry.md`

- Row for `ISS-EVT-005-1`: `Status` column `open` → `resolved`,
  `Workflow` column confirmed `wf-20260731-fix-168`, summary extended
  with fix description + GitHub issue link.

## Edit 3 — `handoff.yaml`

- `issue_ref: ISS-EVT-005-1`, business_process retained as `["BP-UAT-010"]`
  (Step 13 still applies for this subworkflow, same as its parent).

## Edit 4 — GitHub sync

Deferred to Step 12.5 (post-merge) per protocol.

## Gate Result

gate_result:
  status: passed
  attempt: 1
  timestamp: "2026-07-31T09:30:00Z"
  summary: >
    Both ISS-EVT-005-1.md and registry.md flipped to resolved in the same
    working tree change set; will land atomically with the code fix in
    one commit per Step 9's atomicity rule.
