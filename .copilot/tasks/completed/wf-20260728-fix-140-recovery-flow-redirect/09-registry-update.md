# Step 9: Update Issue Registry (atomic status flip)

**Workflow:** wf-20260728-fix-140-recovery-flow-redirect · **Issue:** [ISS-USR-REDIRECT-002](../../../issues/ISS-USR-REDIRECT-002.md)

## Edit 1 — `ISS-USR-REDIRECT-002.md`

- Rewrote the entire file: title, symptom, root cause corrected to
  reflect the real finding (field-name mismatch, not "no redirect
  stage" as originally hypothesized).
- `Status`: `open` → `resolved`; `Resolved`: `—` → `2026-07-28`.
- Added `## Resolution` section.
- Added `## Scope note` explaining the split to ISS-USR-REDIRECT-003.

## New file — `ISS-USR-REDIRECT-003.md`

Created for the design question discovered during this workflow's live
verification (recovery link isn't a real one-time-login mechanism).
`Status: open`, no workflow scheduled — explicitly flagged as needing
`requirement-development`, not `issue-resolution`.

## Edit 2 — `registry.md`

- ISS-USR-REDIRECT-002 row: rewritten to match the corrected finding;
  `Status` `open` → `resolved`.
- New row added for ISS-USR-REDIRECT-003: `Status: open`, `Workflow: —
  (not yet scheduled)`.

## Edit 3 — `handoff.yaml`

- `issue_resolution: resolved` set alongside this commit.

## Gate result

```yaml
gate_result:
  status: passed
  summary: "ISS-USR-REDIRECT-002.md and registry.md flipped to resolved atomically. New ISS-USR-REDIRECT-003.md filed and registered as open/unscheduled, not silently dropped."
```
