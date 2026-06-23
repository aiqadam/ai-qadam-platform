# 06-test-strategy.md — ISS-PREEX-001

## Test Strategy: Lint-Cleanup Regression Suite

ISS-PREEX-001 is a **lint-only fix**. There is no behavioral change that
requires new tests. The existing test suite is the regression check.

## Existing Tests as Regression Coverage

The 7 unit tests in `apps/web-next/src/blocks/workspace/Form.test.tsx` are
the primary regression surface for this fix. They cover the
`Record<string, FieldMeta>` index-access patterns that are at the heart of
this fix:

| Test | Coverage | Bracket access exercised |
|---|---|---|
| `infers a string field as text` | string → text | `fields['title']` |
| `infers a date field from key naming convention` | key-naming → date | `fields['eventDate']` |
| `marks optional fields as not required` | optional → not required | `fields['title']` |
| `infers boolean as checkbox` | boolean → checkbox | `fields['isPublic']` |
| `infers number as number` | number → number | `fields['capacity']` |
| `generates readable labels from camelCase keys` | camelCase splitting | `fields['eventTitle']?.label`, `fields['createdAt']?.label` |
| `extracts all fields from a mixed schema` | mixed 4-type | `fields['name']?.type`, `fields['age']?.type`, `fields['role']?.type`, `fields['active']?.type` |

## Why No New Tests Are Required

The original bug — `expect(fields['title']!.label)` — would have failed
**at typecheck time** if the underlying runtime schema did not actually
contain a `title` field. The `!` operator was masking a possible `undefined`
case. The fix replaced `!.` with `?.` and added type narrowing via
`as Record<string, FieldMeta>`. The runtime check is now explicit.

If `extractFields` ever regresses to drop a field, the new `?.label`
chain returns `undefined`, and `toBe('Event Title')` will fail with a
clear, specific message. The fix made the test **more rigorous**, not less.

## What About `RegistrationCTA.tsx` and `cms.ts`?

Neither has a unit-test file in the current test suite. The lint fix in
these files is purely structural:

- `RegistrationCTA.tsx`: removed a dead-code conditional inside
  `onSuccess`. The mutation flow is unchanged. The component re-renders
  from server-confirmed state, so no UI assertion is needed.
- `cms.ts`: extracted an inline `.map()` callback to a named helper. The
  helper is a pure transformation with the same inputs and outputs as
  before.

Adding new tests for these refactors would test the **structure** of the
code rather than its **behavior**, which is anti-pattern. The lint rules
themselves (biome `noExcessiveCognitiveComplexity`) are the regression
guard.

## Manual Verification Plan

The PR author will verify manually that:

1. `pnpm typecheck` → 0 errors
2. `pnpm lint` → exit code 0
3. `pnpm test` → 7/7 tests pass
4. `pnpm build` → completes

The TestRunner will execute these commands and record the results in
`07-test-results.md`.

## Gate Result

gate_result:
  status: passed
  summary: "Existing 7 unit tests in Form.test.tsx serve as regression suite. No new tests needed."
  findings:
    - "7 existing tests cover all Record<string, FieldMeta> index-access patterns in the fix."
    - "Form.test.tsx is itself the artifact under test — it must lint cleanly for the fix to be complete."
    - "RegistrationCTA.tsx and cms.ts changes are structural refactors with no behavioral change; biome is the regression guard."
