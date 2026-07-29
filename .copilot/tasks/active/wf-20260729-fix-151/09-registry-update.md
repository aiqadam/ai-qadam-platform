# Step 9 — Registry Update: ISS-WEB-NEXT-SSR-JSDOM-001

## Edit 1 — `.copilot/issues/ISS-WEB-NEXT-SSR-JSDOM-001.md`

- Header table: `Status` → `resolved`, added `Resolved: 2026-07-29`,
  `Workflow: wf-20260729-fix-151`.
- `## Resolution` section replaced the "Not yet resolved" placeholder
  with the full root-cause/fix/regression-test/verification writeup
  (see the file itself for full text).

## Edit 2 — `.copilot/issues/registry.md`

- Row `Status` column: `open` → `resolved`.
- `Workflow` column: `wf-20260729-feat-150 (discovery only...)` →
  `wf-20260729-fix-151`.
- `Date` column: `2026-07-29` (unchanged, same day).
- Summary text condensed to reflect the fix, replacing the
  discovery-only description.

## Edit 3 — `handoff.yaml`

- `issue_resolution: resolved` set.

## Atomicity

Both Edit 1 and Edit 2 will be staged in the same `git add` /
commit at Step 12, alongside the code fix (`package.json`,
`pnpm-lock.yaml`) and the regression test — all part of the same PR.

## Gate Result

gate_result:
  status: passed
  summary: "Both registry files updated to resolved, atomic commit planned for Step 12."
  findings: []
