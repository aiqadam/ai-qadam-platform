# Step 9: Update Issue Registry (atomic status flip) — ISS-BRIDGE-STALE-001

## Edit 1 — `.copilot/issues/ISS-BRIDGE-STALE-001.md`

- `Status`: `open` → `resolved`
- Added `Resolved: 2026-07-31`, `Workflow: wf-20260731-fix-162`
- All 5 ACs checked, with honest narrowing notes on AC-3 (no standalone
  script; fix itself is the repair mechanism) and AC-4(b) (one added GET
  per sign-in, disclosed tradeoff — not literally zero added cost)
- `## Resolution` section filled in (root cause, fix, regression test);
  `PR:`/`Merged:` left as `<pending>` for Step 12/12.5 to back-fill

## Edit 2 — `.copilot/issues/registry.md`

- Row `Status`: `open` → `resolved`
- `Workflow` column: `wf-20260730-uat-158 (discovery only...)` →
  `wf-20260731-fix-162`
- `Date` column: `2026-07-30` → `2026-07-31`
- Appended one clause summarizing the fix mechanism to the description

## Edit 3 — `handoff.yaml`

- `issue_resolution: resolved` (see handoff.yaml directly)

## Edit 4 — GitHub sync

Deferred to after these files are committed (next tool call).

## Gate Result

**Status:** `passed` — both files modified, both show `resolved`, will be
committed atomically in the same commit. → Step 10 (conditional doc
update — skipped, no guide/convention gap to document beyond what's
already in the issue file itself) → Step 11 (Final Quality Gate).
