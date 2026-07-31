# Step 9 — Update Issue Registry (atomic status flip)

**Edit 1 — `.copilot/issues/ISS-UAT-010-1.md`:**
- `Status: open` → `resolved`
- Added `Resolved: 2026-07-31`, `Workflow: wf-20260731-fix-169`
- Replaced the placeholder Resolution section with root cause, fix, and
  live-verification evidence (PR/Merged left as `<pending>`, back-filled at
  Step 12/12.5).

**Edit 2 — `.copilot/issues/registry.md`:**
- Row `Status` column: `open` → `resolved`
- `Workflow` column: `wf-20260730-fix-157 (discovery only...)` → `wf-20260731-fix-169`
- `Date` column: `2026-07-30` → `2026-07-31`
- Summary text updated from future-tense ("wrong field values") to
  past-tense resolved description.

**Edit 3 — `handoff.yaml`:** `current_step: 9`, `issue_resolution: resolved`
(to be added alongside the commit).

Both file edits are staged together in the same commit as the code (doc +
spec) changes per this step's atomicity rule.

## Gate Result

gate_result:
  status: passed
  summary: "Both ISS-UAT-010-1.md and registry.md flipped to resolved atomically, staged for the same commit as the fix."
  findings: []
