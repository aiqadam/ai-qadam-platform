# Step 9 — Registry Update

## Edit 1 — `.copilot/issues/ISS-UAT-010-2.md`

- `Status`: `open` → `resolved`
- `Resolved`: `2026-07-31`
- `Workflow`: `wf-20260731-fix-165`
- All 3 ACs checked off with evidence.
- `## Resolution` section added: root cause, fix, regression test name,
  `PR: <pending>`, `Merged: <pending>`.

## Edit 2 — `.copilot/issues/registry.md`

- Row `Status`: `open` → `resolved`
- Row `Workflow`: `wf-20260730-uat-158 (discovery only...)` →
  `wf-20260731-fix-165`
- Row `Date`: `2026-07-30` → `2026-07-31`
- Summary text updated to describe the confirmed root cause + fix instead
  of only the symptom.

## Edit 3 — `handoff.yaml`

- `issue_resolution: "in-progress"` → `"resolved"`

## Edit 4 — GitHub sync

Deferred to Step 12.5 per protocol (this step only stages, does not sync
`implemented` yet — that happens at commit/PR time along with the other
close-out actions).

## Gate

`passed` → Step 10 (Documentation — skipped, no guide/convention gap
revealed by this fix) → Step 11 (Quality Gate).
