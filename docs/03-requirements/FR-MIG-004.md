---
code: FR-MIG-004
name: AsyncSelect block (server-search dropdown)
status: Implemented
module: Migration (MIG)
phase: Rebuild M1
---

## Description
A debounced, server-backed select dropdown for fields where the option list is too large to load upfront (events, cohorts, segments, speakers).

## Users
Engineers composing operator forms that reference server-side data.

## Functional scope
1. `<AsyncSelect loadOptions={async (input) => Option[]} value onChange placeholder>`.
2. Debounces input (300 ms) before calling `loadOptions`.
3. Shows loading spinner while fetching; shows "No results" when empty.
4. Selected value displays label; internally stores id/value.
5. Integrates with `<Form>` as a field renderer when field type is `async-select`.
6. Keyboard-navigable (arrow keys, Enter, Escape).

## Acceptance criteria
- [ ] `<AsyncSelect>` exists at `src/blocks/workspace/AsyncSelect.tsx`.
- [ ] Typing triggers `loadOptions` after 300 ms debounce (verify with network tab).
- [ ] Selecting an option updates the controlled value.
- [ ] Keyboard navigation works without mouse.
- [ ] `blocks.md` entry added.
- [ ] `pnpm arch:check` + `astro check` + `pnpm build` pass.

## Notes
- Blocks M2.2 (event survey form picker), M2.4 (cohort picker), M2.7 (event criteria), M2.8 (segment picker).
- Use Radix `Popover` + `Command` (cmdk) for the dropdown primitive, or build on top of shadcn `<Select>`.
