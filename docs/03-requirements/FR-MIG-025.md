---
code: FR-MIG-025
name: /workspace/sponsors — sponsor row management
status: Implemented
module: Migration (MIG)
phase: Rebuild Phase 3
---

## Description
New cabinet. Operators manage sponsor records (name, logo, tier, website, event associations) without Directus admin.

## Users
Operators managing sponsorship relationships.

## Functional scope
1. `pages/workspace/sponsors/index.astro` — `<DataTable>` of sponsors with tier column.
2. `pages/workspace/sponsors/new.astro` + `pages/workspace/sponsors/[id].astro` — create/edit via `<Form>`.
3. Logo upload (file input → MinIO via `/v1/admin/uploads`).
4. Event association picker: multi-select of events via `<AsyncSelect>`.
5. AuthGuard.

## Acceptance criteria
- [ ] Creating a sponsor with logo upload saves to MinIO and displays on the list.
- [ ] Editing an existing sponsor persists changes.
- [ ] Event association shows the sponsor on linked event pages.
- [ ] `pnpm arch:check` + `astro check` + `pnpm build` pass.

## Notes
- No v1 equivalent — operators used Directus directly.
- Depends on: FR-MIG-003 (`<Form>`), FR-MIG-004 (`<AsyncSelect>`), FR-MIG-005 (`<ActionBar>`).
- Blocks cutover gate.
