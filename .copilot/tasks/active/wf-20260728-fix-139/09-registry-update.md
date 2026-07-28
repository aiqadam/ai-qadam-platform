# Step 9: Update Issue Registry (atomic status flip)

**Workflow:** wf-20260728-fix-139 · **Issue:** [ISS-USR-REDIRECT-001](../../../issues/ISS-USR-REDIRECT-001.md)

## Edit 1 — `ISS-USR-REDIRECT-001.md`

- `Status`: `investigating` → `resolved`
- `Resolved`: `—` → `2026-07-28`
- Added `## Resolution` section (workflow id, PR placeholder, root cause,
  fix summary, regression test name, merged placeholder)
- Expanded `Scope clarification`, `Root cause`, `Fix`, `Regression test`,
  `Verification`, `Honesty disclosures` sections with final findings.

## Edit 2 — `registry.md`

- ISS-USR-REDIRECT-001 row: `Status` `investigating` → `resolved`;
  summary expanded to note the fix; `Workflow`/`Date` unchanged
  (`wf-20260728-fix-139` / `2026-07-28`, already correct from Step 1).

## Edit 3 — `handoff.yaml`

- `issue_resolution: resolved` will be set alongside this commit.

Both edits 1 and 2 are staged in the same commit as the code fix on this
branch (per the Atomicity rule) — see the PR created at Step 12.

## Gate result

```yaml
gate_result:
  status: passed
  summary: "Both ISS-USR-REDIRECT-001.md and registry.md flipped to resolved atomically; will be committed together with the code fix."
```
