---
code: FR-MIG-006
name: FormBuilder block (drag/reorder, 7 field types)
status: Not Started
module: Migration (MIG)
phase: Rebuild M1
---

## Description
A drag-and-drop form builder for operator-authored forms and segment criteria. The heaviest M1 block — gates both the forms builder cabinet and the Telegram segment builder.

## Users
Operators building custom forms and audience segments.

## Functional scope
1. `<FormBuilder schema={FieldDef[]} onChange={...}>` — renders an ordered list of field definitions.
2. 7 field types: short text, long text, yes/no, select-one, select-many, scale (1–10), speaker-rating.
3. Drag-to-reorder fields (mouse + keyboard).
4. Add field via type picker; delete field with confirmation.
5. Each field editable inline: label, help text, required toggle, options (for select types).
6. Outputs a `FieldDef[]` array — same schema as v1 `FormRenderer`.
7. Read-only preview mode (renders the form as a member would see it).

## Acceptance criteria
- [ ] `<FormBuilder>` exists at `src/blocks/workspace/FormBuilder.tsx`.
- [ ] All 7 field types can be added, edited, reordered, and deleted.
- [ ] Drag reorder works with both mouse and keyboard (space to grab, arrow keys, space to drop).
- [ ] Output `FieldDef[]` matches the schema consumed by `FR-MIG-019` (`/forms/[slug]` renderer).
- [ ] Preview mode renders a non-editable version of the form.
- [ ] `blocks.md` entry added.
- [ ] `pnpm arch:check` + `astro check` + `pnpm build` pass.

## Notes
- Blocks FR-MIG-013 (forms builder cabinet), FR-MIG-014 (Telegram segments), FR-MIG-019 (public form renderer).
- v1 reference: `apps/web/src/components/workspace/FormBuilderPanel.tsx`.
- Use `@dnd-kit/core` for drag-and-drop (already a common Astro/React pattern; add to package.json if absent).
