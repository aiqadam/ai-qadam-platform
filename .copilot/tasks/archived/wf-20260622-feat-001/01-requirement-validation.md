## Requirement Validation — FR-MIG-003

**Requirement:** FR-MIG-003 — Form block (Zod-driven)
**Workspace:** wf-20260622-feat-001
**Step:** 01-requirement-validation
**Date:** 2026-06-22

---

## Task understanding

Build a generic `<Form>` block at `src/blocks/workspace/Form.tsx` that:
- Accepts a Zod schema + `onSubmit` callback + `defaultValues`
- Renders labelled fields automatically from schema shape
- Supports field types: text, textarea, number, date, select, checkbox, async-select
- Validates inline on blur + on submit
- Disables submit button during TanStack Query mutation
- Exports from `src/blocks/workspace/index.ts`
- Updates `docs/04-development/architecture/blocks.md`

---

## Files that will be created/modified

| File | Reason |
|---|---|
| `apps/web-next/src/blocks/workspace/Form.tsx` | New block |
| `apps/web-next/src/blocks/workspace/index.ts` | Add Form export |
| `docs/04-development/architecture/blocks.md` | Fill in placeholder `<Form>` row |
| `apps/web-next/package.json` | Add `react-hook-form` (not currently present) |

---

## Issues found

### 1. `react-hook-form` is not in web-next dependencies ⚠️

TanStack Query v5 (`@tanstack/react-query`) is present. `react-hook-form` is **not**. The requirement implies (via `onSubmit receives validated typed data`) and the complexity of managing per-field blur validation + touched state + loading state for a generic block makes a forms library necessary. Without it, the block either reinvents too much or leaks raw `FormData`.

**Verdict:** Needs `react-hook-form` addition. Per AGENTS.md §8, must document: what package, why this one, alternatives considered.

### 2. `<AsyncSelect>` is in the kit but has no story

The requirement mentions `async-select` as a field type. The kit has `AsyncSelect.tsx` but blocks.md shows it as deferred (—, —). Not a blocker — FR-MIG-003 consumers will use async-select as a field type inside Form.

**Verdict:** Not a blocker. Needs investigation during development that AsyncSelect wires cleanly into react-hook-form.

### 3. blocks.md already has a placeholder `<Form>` entry

The `<Form>` row exists in blocks.md with placeholder values. Correct state for "Not Started".

**Verdict:** No issue. PR will fill in consumers/story/data source.

### 4. `EventEditForm` comment defers Form extraction

`EventEditForm.tsx` says: "A generic `<Form>` block is deliberately NOT extracted yet." FR-MIG-003 is that proof point.

**Verdict:** No issue. Comment is now historical.

---

## Risks

1. **react-hook-form adoption** — new dependency. Alternative is manual `useState` per field which is error-prone for a generic block.
2. **AsyncSelect integration** — kit's AsyncSelect may need changes to work with react-hook-form integration. Needs investigation during dev.
3. **Validation UX** — inline blur + submit validation requires careful touched/dirty state per field.

---

## Recommendation

**Proceed.** Requirement is well-scoped. The only gap is `react-hook-form` which is necessary to fulfil the spec. No blocking issues.

**Confidence:** High.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "FR-MIG-003 formalized. react-hook-form dependency identified as necessary. No blocking issues."
  findings:
    - "react-hook-form not in web-next deps — must be added per AGENTS.md §8"
    - "AsyncSelect integration with react-hook-form needs dev verification"
    - "blocks.md placeholder row exists — PR fills it in"
```

