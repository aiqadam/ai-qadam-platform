# Test Results: FR-NTF-002 (Retry 2/3)

**Workflow:** wf-20260803-feat-207-event-announcement-fanout  
**Agent:** TestRunner (retry 2)  
**Date:** 2026-08-04  
**Requirement:** [FR-NTF-002](../../../docs/03-requirements/FR-NTF-002.md)  
**Test Strategy:** [06-test-strategy.md](06-test-strategy.md)  
**Code Summary (retry 2):** [03-code-summary-retry2.md](03-code-summary-retry2.md)  
**Previous Results:** [07-test-results.md](07-test-results.md)

---

## Executive Summary

**Status:** ❌ **FAILED-ESCALATE** (infrastructure gap)

**Retry 2 Fix Applied:** ✅ Added ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]) to integration test module imports — resolved the test setup bug identified in retry 1.

**New Blocker:** ❌ Integration test requires a running Directus REST API server, but test infrastructure only provides raw Testcontainers Postgres. No Directus container exists.

**Progress:**
- ✅ Circular dependency bugs fixed (CodeDeveloper retry 2)
- ✅ ThrottlerModule test setup bug fixed (TestRunner retry 2)
- ✅ Type check clean
- ✅ Unit tests: 7/7 passing
- ❌ Integration tests: 0/6 passing (infrastructure blocker)

---

## Execution Summary

| Suite | Tests | Passed | Failed | Skipped |
|-------|-------|--------|--------|---------|
| **Type Check** | N/A | ✅ PASS | 0 | 0 |
| **Lint / Format Check** | 1 file (test) | ✅ CLEAN | 0 | 0 |
| **Unit Tests** | 7 | ✅ 7 | 0 | 0 |
| **Integration Tests** | 6 | ❌ 0 | 6 | 0 |
| **E2E Tests** | N/A | ⚠️ DEFERRED | 0 | 0 |

---

## Type Check

**Command:** pnpm typecheck  
**Result:** ✅ PASS — No type errors

---

## Lint / Format Check

**Command:** pnpm biome check apps/api/test/event-broadcast-topic-filtering.integration.spec.ts  
**Result:** ✅ CLEAN — Checked 1 file in 8ms. No fixes applied.

**Note:** Repository-wide lint check reports errors in unrelated files (pre-existing; not introduced by this PR).

---

## Unit Tests

**File:** apps/api/test/event-broadcast-service.spec.ts

**Command:** pnpm test event-broadcast-service.spec.ts  
**Result:** ✅ 7/7 PASSING (duration 13.08s)

**Coverage:**

| Test | Description | Status |
|------|-------------|--------|
| dispatches event_announce to country audience | Happy path: broadcast + ledger | ✅ PASS |
| is idempotent — second call returns already_dispatched | Idempotency check (AC-3) | ✅ PASS |
| returns no_audience when country has no members | Edge case: empty country | ✅ PASS |
| handles null capacity without crashing | Null safety | ✅ PASS |
| filters audience by topic intersection when event has topics | Topic filtering (AC-1) | ✅ PASS |
| excludes members with no matching topic interests | No-interest exclusion (AC-2) | ✅ PASS |
| ensures tenant isolation — country filter always enforced | Tenant isolation (AC-4) | ✅ PASS |

---

## Integration Tests

**File:** apps/api/test/event-broadcast-topic-filtering.integration.spec.ts

### Fix Applied (Retry 2)

**Problem from retry 1:** Missing ThrottlerModule caused dependency resolution failure.

**Fix:** Added to test file (lines 9 and 46):
