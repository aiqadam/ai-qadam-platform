---
code: FR-MIG-013
name: /workspace/forms/[id] — form builder + responses
status: Not Started
module: Migration (MIG)
phase: Rebuild M2
---

## Description
Two missing pages for the forms cabinet: the drag-and-drop form builder and the responses inbox with per-field aggregates.

## Users
Operators building custom forms (post-event surveys, application forms, etc.).

## Functional scope
1. `pages/workspace/forms/[id].astro` — mounts `<FormBuilder>` (FR-MIG-006) with current form schema; `<ActionBar>` with Save + Preview + Archive.
2. PATCH `/v1/admin/forms/:id` on save.
3. `pages/workspace/forms/[id]/responses.astro` — `<DataTable>` of responses + per-field aggregate panel (response count, average for scale fields, distribution for select fields).
4. CSV export button on the responses page.

## Acceptance criteria
- [ ] Adding, editing, reordering, and deleting fields saves correctly via PATCH.
- [ ] Responses table shows submitted responses with timestamps.
- [ ] Scale field shows average; select field shows option distribution.
- [ ] CSV export downloads a valid file.
- [ ] `pnpm arch:check` + `astro check` + `pnpm build` pass.

## Notes
- v1 reference: `apps/web/src/components/workspace/FormBuilderPanel.tsx` + `FormResponsesPanel.tsx`.
- Depends on: FR-MIG-006 (`<FormBuilder>`), FR-MIG-005 (`<ActionBar>`).
- Related: FR-CMS-003 (form builder application FR).
