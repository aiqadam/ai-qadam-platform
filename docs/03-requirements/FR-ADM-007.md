---
code: FR-ADM-007
name: RBAC sync management
status: Shipped
module: Admin / Operator (ADM)
phase: Phase 1 (V1) / Rebuild Phase 2 (V2, Shipped)
---

## Description

The RBAC sync process ensures that roles assigned in Authentik are mirrored to the platform's operator permissions. Super Admins can view sync job statuses, inspect diffs between expected and actual role assignments, and retry failed syncs.

## Users

Super Admin.

## Functional scope

1. **Route** — `/workspace/admin/rbac-sync` (`RbacSyncList` island, super-admin only).
2. **Sync job list** — Table of recent sync jobs: timestamp, status (pending/running/success/failed), diff summary (roles added/removed), duration.
3. **Status filter** — Filter jobs by status.
4. **Diff view** — Per-job: table of role changes (added: green, removed: red) with user email, role, country scope.
5. **Retry** — "Retry" button per failed job → `POST /v1/admin/rbac-sync/jobs/:id/retry`.
6. **Auto-trigger** — Sync runs automatically after: operator invite acceptance, role changes in Authentik webhook (if configured), or manually from this page.
7. **API** — `GET /v1/admin/rbac-sync/jobs` (list, filterable). `POST /v1/admin/rbac-sync/jobs/:id/retry`.

## Acceptance criteria

- [ ] After a new operator accepts an invite, a sync job runs and the operator's role appears in Authentik.
- [ ] A failed sync job shows an error summary and a working "Retry" button.
- [ ] The diff view shows exactly which roles were added or removed in a given sync run.
- [ ] Non-super-admin users cannot access `/workspace/admin/rbac-sync`.

## Notes

- V2 (web-next): `RbacSyncList` block shipped in RB-P2.
- Sync direction: Authentik is authoritative for credentials; the platform API is authoritative for business-role assignment. The sync pushes platform roles to Authentik groups for OIDC claim propagation.
