# Step 9 — Registry Update (Atomic Status Flip)

**Workflow:** wf-20260704-fix-085
**Issue:** ISS-UAT-BRIDGE-001
**Timestamp:** 2026-07-04
**Performed by:** Orchestrator (per `issue-resolution.md` Step 9)

---

## Edit 1 — `.copilot/issues/ISS-UAT-BRIDGE-001.md`

| Field | Before | After |
|---|---|---|
| `Status` | open | **resolved** |
| `Workflow` | (empty) | wf-20260704-fix-085 |
| `Resolved` | (empty) | 2026-07-04 |
| `## Resolution` section | (absent) | appended — see edits below |

### Resolution section content

The append includes:

- **Workflow**: wf-20260704-fix-085
- **PR**: `<pending>` placeholder; Step 12 back-fills the actual URL via `gh pr edit --body-file` or PR description append
- **Root cause** (one sentence): the public `ensureLinkedByEmail({ email })` carried an OIDC-callback-shaped precondition (must have a `platform.users` row) that seed/admin paths cannot satisfy.
- **Fix** (one paragraph): Option A — try local-row path first (delegates to `ensureLinked` → back-write); on no-local-row, call private `findOrCreate` directly with swallow-and-warn on Directus failure.
- **Regression test**: `directus-users-bridge.spec.ts:215-249` (rewritten) + `:336-392` (3 new).
- **Honesty disclosures** (per AGENTS.md §6.1, mandatory when deferral is unavoidable): four-row AC disposition table mapping AC-1/AC-2/AC-3-unit/AC-4 to their respective follow-up workflow IDs and queue positions (all position 1).
- **Merged**: `<pending>` placeholder; Step 12.5 back-fills the squash SHA on main.

## Edit 2 — `.copilot/issues/registry.md`

| Field | Before | After |
|---|---|---|
| `Status` column for ISS-UAT-BRIDGE-001 | open | **resolved** |
| `Workflow` column for ISS-UAT-BRIDGE-001 | (empty) | wf-20260704-fix-085 (squash <pending>) |
| `Date` column for ISS-UAT-BRIDGE-001 | 2026-07-03 | 2026-07-04 |

### New row appended (auto-registered by UATRunner at Step 9)

| ID | Severity | Module | Summary | Status | Workflow | Date |
|---|---|---|---|---|---|---|
| [ISS-UAT-BRIDGE-002](ISS-UAT-BRIDGE-002.md) | blocker | infra/directus-config | Directus `directus_users.email` `is-email` validator rejects the `*.aiqadam.test` TLD with HTTP 400 FAILED_VALIDATION — blocks the rewritten `ensureLinkedByEmail` fallback from creating a Directus mirror for any seeded `*@aiqadam.test` UAT user | open | queued: wf-20260704-fix-086 (position 1) | 2026-07-04 |

### Edit applied to ISS-UAT-BRIDGE-002 row (workflow column update)

| Field | Before | After |
|---|---|---|
| `Workflow` column for ISS-UAT-BRIDGE-002 | "queued (TBD by Orchestrator — see [wf-20260704-fix-085/uat-live-verify.md](../tasks/active/wf-20260704-fix-085/uat-live-verify.md) \"Follow-up workflow to register\")" | queued: wf-20260704-fix-086 (position 1) |

## Edit 3 — `handoff.yaml`

| Field | Before | After |
|---|---|---|
| `current_step` | 0 | 11 (Step 11 final, just-completed) |
| `current_step_name` | Initialize | Final Quality Gate |
| `workflow_status` | running | `passed-with-deferred-verification` (QualityGate verdict) |
| `issue_resolution` | (absent) | resolved-with-deferred-verification (Step 9 atomic flip) |

## Atomicity rule

Both file edits to `ISS-UAT-BRIDGE-001.md` and `registry.md` (and the
new `ISS-UAT-BRIDGE-002.md` row appended by UATRunner) MUST land in
the same `git commit` as the production code fix
(`directus-users-bridge.service.ts` + `directus-users-bridge.spec.ts`).
This is enforced by `scripts/workflow-finish.sh` per its
`context_update:` opt-in block (FEAT-WORKFLOW-001 §F.5 amendment).

The new follow-up workflow directory
`.copilot/tasks/queued/wf-20260704-fix-086-directus-test-tld-validator/`
(containing its `handoff.yaml` parent-link to wf-20260704-fix-085)
SHOULD also land in this PR's commit so the queued state is visible
on `main` and the next workflow picks it up.

The `.copilot/tasks/active/wf-20260704-fix-085/` artifacts are
**EXCLUDED** from the PR — they archive in Step 12.5's
`active/` → `completed/` move.

## Gate Result

```yaml
gate_result:
  status: passed
  decision: atomic-flip-pending-commit
  summary: >-
    Both registry artifacts updated. The atomic commit lands in Step 12
    along with the production code fix. ISS-UAT-BRIDGE-001 set to
    resolved with full honesty disclosure of four-AC disposition and
    three named, queued follow-up workflows. ISS-UAT-BRIDGE-002
    (auto-registered by UATRunner) Workflow column updated from
    "TBD by Orchestrator" to "queued: wf-20260704-fix-086 (position 1)".
  files_modified:
    - .copilot/issues/ISS-UAT-BRIDGE-001.md
    - .copilot/issues/registry.md
```
