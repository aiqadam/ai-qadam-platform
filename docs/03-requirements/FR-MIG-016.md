---
code: FR-MIG-016
name: /workspace/admin/cron + /workspace/admin/rbac-sync
status: Not Started
module: Migration (MIG)
phase: Rebuild M2
---

## Description
Two small super-admin health pages. Both are read-heavy with a single write action each.

## Users
Super-admins monitoring platform health.

## Functional scope
1. `pages/workspace/admin/cron/index.astro` — `<DataTable>` of cron job statuses: name, last run, last result (success/fail), next scheduled run. No edit; refresh button.
2. `pages/workspace/admin/rbac-sync/index.astro` — list of recent RBAC sync events with status + timestamp. "Trigger sync" button with confirm dialog → POST `/v1/admin/rbac-sync`.
3. Both: SuperAdminGuard.

## Acceptance criteria
- [ ] Cron table shows all registered cron jobs with last-run status.
- [ ] RBAC sync "Trigger" sends POST and shows success/error toast.
- [ ] Both pages redirect non-super-admin to `/workspace`.
- [ ] `pnpm arch:check` + `astro check` + `pnpm build` pass.

## Notes
- v1 reference: `apps/web/src/pages/workspace/admin/cron.astro` + `rbac-sync.astro`.
- Blocks: `<InternalCronStatusTable>` and `<RbacSyncList>` exist in v1 — port to web-next.
- Related: FR-ADM-007 (RBAC sync), FR-ADM-009 (cron health).
