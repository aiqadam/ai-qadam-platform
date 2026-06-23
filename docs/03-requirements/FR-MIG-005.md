---
code: FR-MIG-005
name: ActionBar block (contextual action row)
status: Shipped
module: Migration (MIG)
phase: Rebuild M1
---

## Description
A consistent top-of-page action row for operator cabinets that have primary actions (Save, Send, Cancel, Duplicate). Replaces ad-hoc button placement in individual pages.

## Users
Engineers composing operator pages with write actions.

## Functional scope
1. `<ActionBar actions={Action[]} sticky?>` — renders a horizontal bar of `<Button>` variants.
2. `Action` type: `{ label, onClick, variant, loading?, disabled?, confirm? }`.
3. `confirm` option shows a `<Dialog>` confirmation before firing `onClick`.
4. `sticky` prop pins the bar to the top of the page body on scroll.
5. Respects disabled/loading state per action independently.

## Acceptance criteria
- [x] `<ActionBar>` exists at `src/blocks/workspace/ActionBar.tsx`.
- [x] Actions with `confirm` show a dialog before executing.
- [x] `loading` prop on an action replaces its label with a spinner and disables it.
- [x] `sticky` keeps the bar visible when page content scrolls.
- [x] `blocks.md` entry added.
- [x] `pnpm arch:check` + `astro check` + `pnpm build` pass.

## Notes
- Blocks M2.2, M2.4, M2.8.
- Use the existing `<Button>` and `<Dialog>` kit atoms.
