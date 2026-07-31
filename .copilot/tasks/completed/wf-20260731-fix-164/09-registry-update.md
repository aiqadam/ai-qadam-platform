# Step 9: Update Issue Registry (atomic status flip) — ISS-WF-GH-CLOSE-001

## Edit 1 — `.copilot/issues/ISS-WF-GH-CLOSE-001.md`

- `Status`: `open` → `resolved`
- Added `Resolved: 2026-07-31`, `Workflow: wf-20260731-fix-164`
- All 4 real ACs checked (AC-5 was reference-only, not an open AC), with
  honest narrowing notes on AC-2 (no auto-reopen mechanism) and AC-4
  (guard-script-level tests, not full Step-13 end-to-end simulation)
- `## Resolution` section filled in

## Edit 2 — `.copilot/issues/registry.md`

- Row `Status`: `open` → `resolved`
- `Workflow` column: empty → `wf-20260731-fix-164`
- `Date` column: unchanged (`2026-07-31`, already correct)
- Appended a clause summarizing the fix mechanism + the second bug found

## Edit 3 — `handoff.yaml`

- `issue_resolution: resolved`

## Gate Result

**Status:** `passed` → Step 10 (conditional doc update — already done as
part of Step 4's protocol.md/workflow-file changes, which ARE the doc
update for this fix) → Step 11 (Final Quality Gate).
