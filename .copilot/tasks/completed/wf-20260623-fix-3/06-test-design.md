# 06-test-design.md — ISS-PREEX-001

## Test Files

**No new test files created.**

**Reused:** `apps/web-next/src/blocks/workspace/Form.test.tsx` (7 existing tests).

## Test Inventory

The 7 existing tests in `Form.test.tsx` are the regression suite. Each test
was reviewed against the fix to confirm it still meaningfully tests the
production behavior:

### Test 1: `infers a string field as text`
```ts
const fields = extractFields(z.object({ title: z.string() })) as Record<string, FieldMeta>;
// biome-ignore lint/complexity/useLiteralKeys: Record<string, T> requires bracket access
expect(fields['title']).toMatchObject({ type: 'text', label: 'Title', required: true });
```
Coverage: string schema → text field. Confirms `extractFields` returns
the expected shape for the most common case.

### Test 2: `infers a date field from key naming convention`
Coverage: schema key containing "Date" infers as date field. Exercises the
`/date|at|_at/i` regex in `inferFieldType`.

### Test 3: `marks optional fields as not required`
Coverage: `z.string().optional()` → `required: false`. Exercises the
`ZodOptional` unwrap path.

### Test 4: `infers boolean as checkbox`
Coverage: `z.boolean()` → `type: 'checkbox'`. Exercises the
`typeName === 'ZodBoolean'` branch.

### Test 5: `infers number as number`
Coverage: `z.number()` → `type: 'number'`.

### Test 6: `generates readable labels from camelCase keys`
Coverage: `eventTitle` → `Event Title`, `createdAt` → `Created At`. The
most important test for the bracket-access fix — both assertions use
`?.label` (was `!` before).

### Test 7: `extracts all fields from a mixed schema`
Coverage: a schema with 4 field types (string, optional number, enum, boolean)
verifies that all 4 are extracted with the right types. Uses `?.type`
chain (was `!` before) for all 4 assertions.

## Why `biome-ignore` Comments Are Acceptable

`useLiteralKeys` and `noUncheckedIndexedAccess` are in conflict for
`Record<string, T>` types. There is no way to satisfy both rules. The
`biome-ignore` comments:

1. Are **scoped** to the specific rule (`lint/complexity/useLiteralKeys`).
2. Have a **justification** ("Record<string, T> requires bracket access").
3. Are **adjacent** to the line they affect (above the `expect()`).

The fix does not weaken type safety — `noUncheckedIndexedAccess` remains
active and the typecast `as Record<string, FieldMeta>` narrows the type.

## Gate Result

gate_result:
  status: passed
  summary: "Test design reuses existing test file; no new tests required."
  findings:
    - "All 7 existing tests pass after the fix."
    - "Tests 6 and 7 are the primary regression guards for the bracket-access change."
    - "Test 3 is the primary regression guard for the noUncheckedIndexedAccess + useLiteralKeys interaction."
