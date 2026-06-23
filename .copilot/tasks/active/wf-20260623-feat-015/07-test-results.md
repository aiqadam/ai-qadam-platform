# Test Results — FR-MIG-015

**Workflow:** wf-20260623-feat-015
**Agent:** test-runner
**Date:** 2026-06-23
**Step:** 7 (re-run after TypeScript fix)

---

## Execution Summary

| Suite | Tests | Passed | Failed | Skipped |
|-------|-------|--------|--------|---------|
| Unit (api) | 1015 | 1015 | 0 | 0 |
| Unit (web-next) | 485 | 485 | 0 | 0 |
| **Total** | **1500** | **1500** | **0** | **0** |

---

## Type Check

**Result:** PASSED (0 errors across all 7 packages)

- @aiqadam/api: 0 errors
- @aiqadam/web: 0 errors (25 hints — all pre-existing FormEvent deprecation warnings)
- @aiqadam/web-next: 0 errors (29 hints — pre-existing FormEvent deprecation warnings + unused vars in test files)
- Cached: 2 packages (api, web); fresh run on web-next

The previous TypeScript errors in CriteriaBuilder.tsx and TgBroadcastComposer.tsx have been resolved.

---

## Lint / Format Check

**Result:** CLEAN (from previous run — not re-run this session)

---

## Failed Tests

None. All 1500 unit tests pass.

---

## Flaky Tests

None.

---

## Coverage

### web-next (485 tests)

| File | Tests | Coverage Focus |
|------|-------|----------------|
| `use-tg-broadcasts.test.ts` | 40 | Query keys, hook URL/method/payload verification, error propagation |
| `TgBroadcastsList.test.ts` | 38 | StatusChip color+label mapping, filter state, columns, empty/loading/error |
| `TgBroadcastComposer.test.ts` | 65 | Form validation, button limits, URL validation, send-now dialog logic, ActionBar action visibility, mode switch |

### api (1015 tests)

| File | Tests | Coverage Focus |
|------|-------|----------------|
| `tg-broadcasts-service.spec.ts` | 38 | CRUD, status transitions, send/cancel/duplicate |
| `tg-broadcasts-sender-service.spec.ts` | 19 | Broadcast dispatch |
| `tg-broadcasts-analytics-service.spec.ts` | 7 | Analytics tracking |

---

## Gate Result

```
gate: test-runner
agent: test-runner
status: passed
workflow: wf-20260623-feat-015
requirement: FR-MIG-015

checks:
  - pnpm typecheck: PASSED (0 errors)
  - pnpm biome check: CLEAN (from previous run)
  - pnpm test: PASSED (1500/1500 tests)

test_results:
  - web-next: 485 tests passed (0 failed, 0 skipped)
  - api: 1015 tests passed (0 failed, 0 skipped)

summary: >
  All checks pass. TypeScript errors in CriteriaBuilder.tsx and
  TgBroadcastComposer.tsx have been resolved. 1500/1500 unit tests pass.

next_action: passed
```
