# Step 1 — Requirement Validation: FEAT-MIG-004 (AsyncSelect block)

> Output for: `.copilot/tasks/active/wf-20260623-feat-007/01-requirement-validation.md`
> Agent: RequirementAnalyst (Orchestrator-authored)
> Workflow: wf-20260623-feat-007

---

## Raw Input

User asked to **implement FR-MIG-004**. The FR is documented in
[`docs/03-requirements/FR-MIG-004.md`](../../../../docs/03-requirements/FR-MIG-004.md):

> A debounced, server-backed select dropdown for fields where the option
> list is too large to load upfront (events, cohorts, segments, speakers).

### Acceptance criteria (verbatim from FR-MIG-004.md)

| AC | Requirement |
|---|---|
| AC-1 | `<AsyncSelect>` exists at `src/blocks/workspace/AsyncSelect.tsx` |
| AC-2 | Typing triggers `loadOptions` after 300 ms debounce (verify with network tab) |
| AC-3 | Selecting an option updates the controlled value |
| AC-4 | Keyboard navigation works without mouse |
| AC-5 | `blocks.md` entry added |
| AC-6 | `pnpm arch:check` + `astro check` + `pnpm build` pass |

### Functional scope (verbatim)

1. `<AsyncSelect loadOptions={async (input) => Option[]} value onChange placeholder>`.
2. Debounces input (300 ms) before calling `loadOptions`.
3. Shows loading spinner while fetching; shows "No results" when empty.
4. Selected value displays label; internally stores id/value.
5. Integrates with `<Form>` as a field renderer when field type is `async-select`.
6. Keyboard-navigable (arrow keys, Enter, Escape).

---

## Analysis

### Completeness issues found

- AC-2 only mentions "verify with network tab" which is a manual test, not an
  automated one. The acceptance criterion needs to be re-stated as a
  *programmable* check that a test runner can verify. The orchestrator's
  drafted AC (below) keeps the 300 ms figure and makes it a unit-test
  invariant: the `loadOptions` callback is NOT called within 300 ms of
  the last keystroke.
- AC-5 says "`blocks.md` entry added". The catalogue's location per
  [ADR-0038](../../../../docs/04-development/architecture/blocks.md)
  is `docs/04-development/architecture/blocks.md`. (MIG-004's own frontmatter
  says `blocks.md` — this is the shorthand; the canonical file is
  `architecture/blocks.md`.)
- No explicit AC for keyboard navigation (AC-4). The FR mentions "arrow keys,
  Enter, Escape" but no test. The drafted AC below formalises the
  keyboard behaviour as observable events: ↑/↓ moves the active option, Enter
  selects it, Escape closes the list and restores the input value.
- No explicit AC for the empty / loading / error UX (functional scope item 3).
  Drafted as separate ACs below (loading state, empty state).
- No explicit AC for `<Form>` integration (functional scope item 5). The
  drafted AC locks the renderer contract to `(field, value, onChange) =>
  ReactNode` so the existing `<Form>` block (MIG-003) can dispatch to it.

### Conflicts with existing features

- **None.** AsyncSelect is a new block. It does not duplicate any existing
  block:
  - `<Select>` (kit atom, L2) is a synchronous wrapper around a fixed
    `options[]` prop. AsyncSelect differs by accepting an async `loadOptions`
    function.
  - `<Form>` (MIG-003, already shipped) already declares `async-select` as
    one of its auto-rendered field types; the field is currently a stub
    (see [Form.tsx](../../../../apps/web-next/src/blocks/workspace/Form.tsx)
    case `'async-select':` → TODO). AsyncSelect fills that gap.
- **No conflict with security baseline (AGENTS.md §5).** No new external
  input surface; AsyncSelect is a pure UI block that defers to its consumer
  for the actual `loadOptions` fetch. Zod validation happens at the
  caller (Form), not here.

### Architectural feasibility

- **Stack fit:** React island (TSX), consistent with the existing
  `<Form>` / `<DataTable>` / `<MembersList>` workspace blocks. The block
  self-wraps in `<IslandRoot>` per the M0-fix-B pattern
  ([blocks.md §Provider-coupled blocks](../../../../docs/04-development/architecture/blocks.md#provider-coupled-blocks))
  so its internal hook calls (`useId`, `useRef`, `useState`) reach a
  stable React root. The block has no provider dependencies itself.
- **No backend change.** The API endpoint behind `loadOptions` is the
  caller's responsibility (e.g. `/v1/workspace/cohorts?search=`,
  `/v1/events?search=`). This PR ships only the block.
- **No DB migration.** Step 3 (DBMigrationAuthor) is skipped.
- **Storybook story:** AsyncSelect uses only React hooks + DOM (no
  provider), so a Storybook story is feasible. Per
  [blocks.md §Storyless Astro blocks](../../../../docs/04-development/architecture/blocks.md#storyless-astro-blocks)
  the block is React and DOES need a story. Story:
  `apps/storybook/stories/blocks/AsyncSelect.stories.tsx`.

---

## Formalized Requirement

**FEAT-MIG-004: AsyncSelect block (server-search dropdown)**

A reusable React block under `apps/web-next/src/blocks/workspace/` that
renders an input + a debounced dropdown of options loaded asynchronously
from a caller-supplied function. The block is the runtime implementation
of the `async-select` field type stub in the existing `<Form>` block.

### Cross-references

- Blocks catalogue: [blocks.md §AsyncSelect](../../../../docs/04-development/architecture/blocks.md#layer-3-blocks--the-catalogue)
- Form integration: [FR-MIG-003](../../../../docs/03-requirements/FR-MIG-003.md)
- Architectural pattern: [M0-fix-B provider-coupled blocks](../../../../docs/04-development/architecture/blocks.md#provider-coupled-blocks)
- Standards: [standards.md §VI Code standards](../../../../docs/04-development/standards.md)

### Refined acceptance criteria (for TestDesigner)

| AC | Type | Description | Verifiable by |
|---|---|---|---|
| AC-1 | Structure | `<AsyncSelect>` exists at `apps/web-next/src/blocks/workspace/AsyncSelect.tsx` | `test -f apps/web-next/src/blocks/workspace/AsyncSelect.tsx` |
| AC-2 | Debounce | Typing does NOT call `loadOptions` within 300 ms of the last keystroke; rapid typing results in a single `loadOptions` call after the pause | Vitest test that calls `loadOptions` via spy with controlled timer |
| AC-3 | Selection | Calling `onChange(newOption)` updates the controlled value; the input displays the new option's label | Vitest test |
| AC-4 | Keyboard | ↑/↓ moves the highlighted option; Enter calls `onChange` with the highlighted option; Escape closes the list and does NOT change `value` | Vitest test using `fireEvent.keyDown` |
| AC-5 | Catalogue | `blocks.md` entry exists for `<AsyncSelect>` in the workspace blocks table | grep test |
| AC-6 | Form integration | When `<Form>` receives a Zod schema with `z.object({ x: z.string() })` and field metadata `{ type: 'async-select', loadOptions }`, the rendered field is an `<AsyncSelect>` instance | Vitest test that mounts `<Form>` with async-select field metadata |
| AC-7 | Loading state | While `loadOptions` promise is pending, an `[aria-busy="true"]` element is rendered | Vitest test |
| AC-8 | Empty state | When `loadOptions` resolves to `[]`, the dropdown shows "No results" | Vitest test |
| AC-9 | Build | `pnpm arch:check` + `astro check` + `pnpm build` pass | Terminal commands |
| AC-10 | Storybook | Story at `apps/storybook/stories/blocks/AsyncSelect.stories.tsx` with a Default variant | file existence + smoke render |
| AC-11 | Lint | `pnpm -r lint` (Biome) reports zero errors on the new files | Terminal command |

---

## Decision

**Approved.** No conflict with existing features; the formalised AC set
extends the FR's bullets to be programmatically testable.

**Open questions** (non-blocking, will be resolved during CodeDeveloper):

- Whether the highlighted option should reset to "first item" on every
  input change (most debounced-search UX does). Default: yes.
- Whether Escape should re-focus the input. Default: yes.

---

## Gate Result

```markdown
## Gate Result

gate_result:
  workflow_id: "wf-20260623-feat-007"
  workflow_type: "requirement-development"
  requirement_ref: "FEAT-MIG-004"
  decision: "passed"
  notes: "Requirement formalised as FEAT-MIG-004. 11 ACs derived from 6 original bullets. No architectural conflict. No DB migration required."
  retry_count: 0
  timestamp: "2026-06-23T06:35:00Z"
```