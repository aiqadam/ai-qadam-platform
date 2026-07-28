# Step 9: Update Issue Registry — wf-20260728-fix-141

## Edit 1 — `.copilot/issues/ISS-USR-PROFILE-001.md`

- `Status`: `in-progress` → `resolved`
- `Resolved`: `—` → `2026-07-28`
- Appended full `## Fix`, `## Regression test`, `## Verification`,
  `### Honesty disclosures`, and `## Resolution` sections (see file for
  full text). `PR:` and `Merged:` left as `<pending>` — back-filled at
  Step 12/12.5.

## Edit 2 — `.copilot/issues/registry.md`

- Row's `Status` column: `in-progress` → `resolved`
- Row's summary text updated to state the fix was applied (was
  "planned").
- `Workflow` column already `wf-20260728-fix-141`; `Date` already
  `2026-07-28` (unchanged, both were already correct at Step 1).

## Edit 3 — `handoff.yaml`

- `issue_resolution: resolved` (see handoff.yaml itself for full state).

Both Edit 1 and Edit 2 will be staged and committed together on this
branch (atomicity rule, `protocol.md` "Status-Consistency Check").

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Both ISS-USR-PROFILE-001.md and registry.md flipped to resolved atomically, staged for the same commit as the code fix."
```
