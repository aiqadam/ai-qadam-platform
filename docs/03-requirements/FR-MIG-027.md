---
code: FR-MIG-027
name: /workspace/badges — badge grant + award history
status: Not Started
module: Migration (MIG)
phase: Rebuild Phase 3
---

## Description
New cabinet. Operators grant badges to members for achievements (spoke at 3 events, 100-point milestone, etc.) and view the badge award audit trail.

## Users
Country leads rewarding community engagement.

## Functional scope
1. `pages/workspace/badges/index.astro` — list of badge definitions (`<DataTable>` with icon + name + criteria description).
2. "Grant badge" action: member picker via `<AsyncSelect>` + badge picker + optional note. POST `/v1/admin/badges/grant`.
3. Award history tab: `<DataTable>` of all grants (member, badge, granted-by, date). Filterable by badge type.
4. Revoke grant (with confirm dialog + reason note).
5. AuthGuard.

## Acceptance criteria
- [ ] Granting a badge to a member creates an award record and shows on their `/u/[handle]` profile.
- [ ] Revoking a grant requires a reason note and triggers a confirmation dialog.
- [ ] Award history filters correctly by badge type.
- [ ] `pnpm arch:check` + `astro check` + `pnpm build` pass.

## Notes
- No v1 equivalent.
- Depends on: FR-MIG-003 (`<Form>`), FR-MIG-004 (`<AsyncSelect>`), FR-MIG-005 (`<ActionBar>`).
- Related: FR-GAM-003 (gamification badges application FR).
