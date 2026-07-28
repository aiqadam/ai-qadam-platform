# Quality Gate — wf-20260728-fix-143 (ISS-UAT-RBAC-001)

## Status-Consistency Check

- `.copilot/issues/ISS-UAT-RBAC-001.md`: `Status: resolved`, `Resolved: 2026-07-28`, `Workflow: wf-20260728-fix-143` — modified.
- `.copilot/issues/registry.md`: ISS-UAT-RBAC-001 row `Status` column → `resolved`, `Workflow` → `wf-20260728-fix-143` — modified.
- Both edits staged in the same commit as the code fix. Atomicity rule satisfied.

## AC-by-AC disposition (AGENTS.md §6.1)

This issue had no formal numbered AC list (filed as a discovered blocker,
not a requirement) — its implicit acceptance criterion, per its own
Symptom/Root-cause sections, is: **a seeded UAT member can get a real
Directus policy attached via the sync mechanism.**

| Criterion | Disposition |
|---|---|
| `RBAC_SYNC_WRITE_ENABLED` flips sync from dry-run to write mode locally | verified — flag set in `apps/api/.env`, documented in `.env.example`. |
| `DirectusPolicyApplier` successfully writes the user↔policy relation (no 403) | verified live — `rbac_sync_jobs.directus_status: applied` for all 4 scanned UAT users, confirmed via direct Directus query that `uat-member@example.com` now holds a real `directus_access` row. |
| Regression test proves the specific defect (wrong M2M payload shape) is fixed | verified — `rbac-directus-applier.spec.ts` rewritten, 6/6 pass; previous version asserted the buggy shape. |
| BP-UAT-003 / BP-UAT-016 full live pass (member reads a custom `directus_users` field) | **deferred-with-followup-workflow-ID-and-queue-position**: blocked by a separate, pre-existing gap (zero `directus_permissions` rows for any ADR-0021 policy) discovered during this workflow's own live verification. Filed as [ISS-RBAC-PERMS-001](../../issues/ISS-RBAC-PERMS-001.md), registered in `registry.md`, queued as `wf-20260728-fix-144`. Named + queued before this workflow closes, satisfying AGENTS.md §6.1's deferral bar. |

## Checks

- [x] Regression test added and passing (6/6, `rbac-directus-applier.spec.ts`).
- [x] Full suite run: 1296/1297 pass; 1 failure confirmed pre-existing on `origin/main` (reproduced identically with this PR's diff stashed out).
- [x] Security review: `passed`, no BLOCKER/MAJOR findings (`04-security-review.md`).
- [x] Live infra verification performed (not deferred) — API rebuilt/restarted, `POST /v1/internal/rbac/poll` triggered, Directus queried directly to confirm the actual write. See `07-test-results.md`.
- [x] Status-consistency: both `ISS-UAT-RBAC-001.md` and `registry.md` modified, same commit.
- [x] Deferred item (BP-UAT-003/016 full pass) has a named, queued follow-up workflow ID (`wf-20260728-fix-144`) recorded in the issue's Resolution section, `registry.md`, and `handoff.yaml.deferrals[]`.
- [x] `.claude/CLAUDE.md` updated to record the `.env` dev/test exception the user granted mid-workflow (durable rule, not just a one-off override).

## Gate Result

```markdown
gate_result:
  status: passed
  summary: "Both status-consistency files updated atomically; regression test added; live verification performed; one deferral, named and queued per AGENTS.md §6.1."
  findings: []
```
