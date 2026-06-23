## Impact Analysis — FR-MIG-003

**Requirement:** FR-MIG-003 — Form block (Zod-driven)
**Workspace:** wf-20260622-feat-001
**Step:** 02-impact-analysis
**Date:** 2026-06-22

---

## DB Changes Required

**No.** FR-MIG-003 is a pure frontend component. No database schema changes.

→ **Step 3 (DB Migration) is SKIPPED. Proceed directly to Step 4.**

---

## Scope of Change

### New files
| File | Reason |
|---|---|
| `apps/web-next/src/blocks/workspace/Form.tsx` | The `<Form>` block itself |
| `apps/web-next/src/blocks/workspace/Form.test.tsx` | Unit tests for Form |
| `apps/storybook/stories/blocks/Form.stories.tsx` | Storybook story |

### Modified files
| File | Reason |
|---|---|
| `apps/web-next/src/blocks/workspace/index.ts` | Add Form named export |
| `apps/web-next/package.json` | Add `react-hook-form` dependency |
| `docs/04-development/architecture/blocks.md` | Fill in `<Form>` entry (consumers, story, data source) |

---

## Technical Findings

### 1. `react-hook-form` must be added as a dependency

Not currently in `apps/web-next/package.json`. Required for:
- Typed `useForm` context across all field types
- `register` + `formState.errors` per field
- `trigger()` for per-field blur validation
- `disabled` prop propagation from mutation `isPending`

**Justification:** Manual `useState` per field (current EventEditForm pattern) does not scale to a generic Zod-driven block. Alternatives considered:
- **zod-form-data** — thin wrapper over react-hook-form, adds no value if we control the schema ourselves
- **conform** — newer, first-party Zod integration, but smaller community than react-hook-form
- **plain `useState`** — too error-prone for generic field rendering from schema

react-hook-form chosen: largest community, stable API, excellent TypeScript support.

### 2. `@tanstack/react-query` is already present

`@tanstack/react-query` v5 is in `apps/web-next/package.json`. `useMutation` is available for the `disabled` + loading spinner requirement.

### 3. UI kit atoms in `@/kit`

Available from `apps/web-next/src/kit/`:
- `Input` — text, number, date, textarea (via `type` prop)
- `Select` — via Radix
- `Textarea` — separate component
- `Button` — with `disabled` + spinner support

### 4. `AsyncSelect` field type is blocked on FR-MIG-004

`AsyncSelect` block does not yet exist (FR-MIG-004 is "Not Started"). The `Form` block should emit a `<AsyncSelect>` field type placeholder — FR-MIG-004 implementation will wire it in. For now, the async-select field can render a `Select` with a note.

### 5. Island pattern from EventEditForm

Every React island uses `<IslandRoot>` wrapper for `RuntimeProvider` context. `Form` must follow the same pattern.

---

## Affected Modules

- `apps/web-next` — new block, new dependency, Storybook story
- `docs/04-development/architecture/` — blocks.md update

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "No DB changes. Frontend-only component. react-hook-form dependency required. AsyncSelect field deferred to FR-MIG-004."
  findings:
    - "DB changes: NO — Step 3 skipped"
    - "react-hook-form must be added to package.json"
    - "AsyncSelect field type placeholder — FR-MIG-004 will wire it in"
    - "Form follows IslandRoot pattern from EventEditForm"
    - "blocks.md placeholder entry to be filled in same PR"
```
