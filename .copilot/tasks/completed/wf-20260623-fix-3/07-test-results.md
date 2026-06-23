# 07-test-results.md — ISS-PREEX-001

## Test Execution

### 1. Typecheck
```
$ cd apps/web-next && pnpm typecheck
Result (115 files):
- 0 errors
- 0 warnings
- 13 hints (pre-existing deprecation warnings for React.FormEvent in unrelated files)
PASS
```

### 2. Lint
```
$ cd apps/web-next && pnpm lint
Found 1 warning.
  - RegistrationCTA.tsx:77:10 lint/complexity/noExcessiveCognitiveComplexity (15 / max 10)
  - Status: WARNING only — does not block
Exit code: 0
PASS
```

**17 errors → 0 errors.** The single remaining `AuthedCta` cognitive
complexity warning is documented in `03-code-summary.md` as structurally
inherent to the 4-branch UI renderer.

### 3. Unit Tests
```
$ cd apps/web-next && pnpm test
✓ src/blocks/workspace/Form.test.tsx (7 tests) 7ms

Test Files  1 passed (1)
     Tests  7 passed (7)
Exit code: 0
PASS
```

### 4. Build
```
$ cd apps/web-next && pnpm build
[build] output: "server"
[build] ✓ Completed in 89ms.
[build] Building server entrypoints...
[vite] ✓ built in 2.64s
[build] ✓ Completed in 2.68s.
building client (vite)
[vite] ✓ 1810 modules transformed.
[vite] ✓ built in 4.09s
prerendering static routes
✓ Completed in 34ms.
[build] Server built in 6.94s
[build] Complete!
Exit code: 0
PASS
```

## Regression Coverage

All 7 tests in `Form.test.tsx` pass. These cover the bracket-access and
optional-chaining patterns at the heart of the fix:

- `it('generates readable labels from camelCase keys')` — uses `fields['eventTitle']?.label`
- `it('extracts all fields from a mixed schema')` — uses `fields['name']?.type` x4

## Gate Result

gate_result:
  status: passed
  summary: "All 4 gates pass: typecheck (0), lint (0 errors, 1 warning), test (7/7), build (complete)."
  findings:
    - "17 pre-existing lint errors reduced to 0."
    - "1 structural warning remains in AuthedCta — documented in 03-code-summary.md as a future refactor opportunity."
    - "All 7 regression tests pass."
    - "Build completes without warnings on changed code."
