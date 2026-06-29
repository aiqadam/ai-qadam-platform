# Step 1 — Issue Lookup

**Workflow:** wf-20260629-fix-037
**Issue:** ISS-UAT-013-5
**Date:** 2026-06-29
**Agent:** Orchestrator (direct)

---

## Source of truth

- Registry row: `.copilot/issues/registry.md` — `ISS-UAT-013-5`, severity `minor`, module `uat / seed`, status `open`, reported 2026-06-28 by `wf-20260628-uat-030` (preflight orchestrator).
- Issue file: `.copilot/issues/ISS-UAT-013-5.md` — full symptom, root cause, repro, proposed resolution, acceptance criteria.

## Similar-issue search

Searched `.copilot/issues/registry.md` for keyword overlap (`directus`, `503`, `under pressure`, `bootstrap`, `seed`):

| Existing issue | Match | Decision |
|---|---|---|
| ISS-UAT-013-1 (port guard) | unrelated — port-occupancy | skip |
| ISS-UAT-013-2 (preflight identity) | unrelated — process matching | skip |
| ISS-UAT-013-4 (operator_invites missing from seed) | same seed script, different gap | distinct — keep separate |
| ISS-UAT-013-7 (SMTP env var unset) | unrelated — email transport | skip |

No similar issue exists. Issue file already exists and is comprehensive. No new file needed; this workflow will **resolve** it.

## handoff.yaml setup

`workflow_instance_id: wf-20260629-fix-037`
`workflow_type: issue-resolution`
`requirement_ref: ISS-UAT-013-5`
`branch: fix/ISS-UAT-013-5-directus-retry`
`base_branch: main`
`workflow_status: running`
`current_step: 1` → advancing to 2
`current_step_name: issue-lookup` → `impact-analysis`
`issue_ref: ISS-UAT-013-5`
`merge_mode: auto` (default; user did not opt into manual review)
`expects_registry_update: true` (Step 9 will flip the issue to `resolved`)

## Counter increment

`.copilot/meta/next-workflow-id` was at `00000036` on `origin/main`. Read it, computed
`wf-20260629-fix-037`, then re-wrote `00000037` to the file (and committed in the
Step 0 archive move is unrelated — counter lives independently).

## Acceptance criteria to verify later (Step 8)

From the issue file:

1. `pnpm uat:seed` on a fresh Directus completes in one pass without manual retry.
2. The retry helper is logged (count of retries per collection) so the developer can see when Directus is under pressure.
3. A new bats test (`scripts/tests/uat-seed-retries.bats`) mocks a 503-then-200 sequence and asserts the helper succeeds without test failure.

---

## Gate Result

gate_result:
  status: passed
  summary: "ISS-UAT-013-5 located in registry and issue file; no similar issue to merge; handoff.yaml populated."
  findings:
    - "Issue file is comprehensive — root cause (Directus 503 under pressure during tight bootstrap loop), proposed retry wrapper, and 3 acceptance criteria already documented."
    - "Counter incremented to 00000037 — next workflow will be wf-20260629-feat/fix-038."
    - "Branch fix/ISS-UAT-013-5-directus-retry created from clean main; working tree verified clean; Step 0.5 drift check passed."