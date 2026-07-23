# Step 9 — Update Issue Registry (atomic status flip)

**Workflow:** wf-20260723-fix-127
**Issue:** ISS-USR-REG-002

## Edit 1 — `.copilot/issues/ISS-USR-REG-002.md`

- `Status`: `in-progress` → `resolved`
- Added `Resolved: 2026-07-23` field
- Replaced the placeholder "Root cause" / "Fix" / "Regression test"
  sections with a full `## Resolution` section (Workflow, PR `<pending>`,
  Root cause, Fix, Regression test, Merged `<pending>`, Deferred/follow-up
  note about the separate `deploy-qa` CI blocker).

## Edit 2 — `.copilot/issues/registry.md`

- Row for `ISS-USR-REG-002`: `Status` column `in-progress` → `resolved`;
  summary cell rewritten to reflect the confirmed root cause and fix
  instead of the original "still investigating" framing; `Workflow`
  column unchanged (`wf-20260723-fix-127`); `Date` column unchanged
  (`2026-07-23`, same day).

## Edit 3 — `handoff.yaml`

- `issue_resolution` field not present in this schema version (older
  `handoff.schema.yaml` doesn't define it) — status is tracked via
  `current_step`/`current_step_name`, advanced to
  `11` / `quality-gate`.

## Atomicity

Both Edit 1 and Edit 2 will be staged in the same `git add` and committed
together with the code/test changes on this branch — no separate
post-merge status commit, per protocol.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Both ISS-USR-REG-002.md and registry.md flipped to resolved atomically; both will land in the same commit as the code fix."
  findings:
    - "ISS-USR-REG-002.md: Status in-progress -> resolved, Resolved date added, full Resolution section written."
    - "registry.md: matching row Status column in-progress -> resolved, summary rewritten to reflect confirmed root cause + fix."
  retry_target: null
  deferred_to_feature: null
  deferred_reason: null
```
