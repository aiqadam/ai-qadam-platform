---
code: FR-MIG-003
name: Form block (Zod-driven)
status: Not Started
module: Migration (MIG)
phase: Rebuild M1
---

## Description
A generic form wrapper for all write operations in the workspace. Every cabinet that PATCHes or POSTs data must use this block — no ad-hoc form HTML in pages.

## Users
Engineers composing write-capable operator pages.

## Functional scope
1. `<Form schema={z.ZodObject} onSubmit={...} defaultValues={...}>` — accepts a Zod schema and renders labelled fields automatically.
2. Field types rendered from schema: text, textarea, number, date, select (via `<Select>`), checkbox, async-select (via `<AsyncSelect>` when available).
3. Inline validation errors on blur and on submit.
4. Submit button shows loading spinner during mutation; disables on pending.
5. `onSubmit` receives validated, typed data — no raw `FormData` in consuming pages.
6. Compatible with TanStack Query mutations (`useMutation` → `onSubmit`).

## Acceptance criteria
- [ ] `<Form>` exists at `src/blocks/workspace/Form.tsx` and is exported from `src/blocks/workspace/index.ts`.
- [ ] A page using `<Form>` with a Zod schema renders all expected fields without extra markup in the page file.
- [ ] Submitting with invalid data shows field-level errors; valid data calls `onSubmit` with typed payload.
- [ ] Submit button is disabled while mutation is in-flight.
- [ ] `blocks.md` entry added.
- [ ] `pnpm arch:check` + `astro check` + `pnpm build` pass.

## Notes
- Blocks M2.2, M2.4, M2.5 (operator write cabinets).
- Shadcn `<Input>`, `<Select>`, `<Textarea>` are the field primitives.
- Keep `<Form>` presentation-only: no direct API calls inside the block.
