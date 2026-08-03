# Test Results: FR-NTF-002 (Retry 2/3)

**Workflow:** wf-20260803-feat-207-event-announcement-fanout
**Agent:** TestRunner (retry 2)
**Date:** 2026-08-04
**Gate Status:** failed-escalate (infrastructure gap)

## Executive Summary

✅ **ThrottlerModule Fix Applied Successfully**
- Added `ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])` to test imports
- Resolved test setup bug from retry 1

❌ **New Infrastructure Blocker Identified**
- Integration test requires running Directus REST API server
- Test infrastructure (`test/setup-pg.ts`) only provides Testcontainers Postgres
- No Directus container setup exists in the repo

## Test Execution Results

### Type Check
✅ PASS - No type errors

### Lint / Format
✅ CLEAN - Test file passes all checks

### Unit Tests (7/7 passing)
✅ ALL PASS - Full AC coverage at service logic level
- AC-1: Topic filtering
- AC-2: No-interest exclusion
- AC-3: Idempotency
- AC-4: Tenant isolation

### Integration Tests (0/6 passing)
❌ BLOCKED - Infrastructure gap

**Error:** `getaddrinfo ENOTFOUND placeholder.invalid`

**Root Cause:** DirectusClient tries to connect to `http://placeholder.invalid` (from vitest.config.ts), but integration tests need a real Directus server.

**Precedent:** No integration test in this repo uses a real Directus container. All mock DirectusClient or use Drizzle directly.

## Gate Result

**Status:** failed-escalate

**Classification:** Infrastructure issue

**Retry Budget:**
- CodeDeveloper: 2 of 3 used
- TestRunner: 2 of 3 used
- Subworkflow: 0 of 3 available

## Next Action

Escalate to Orchestrator. Spawn subworkflow to add Directus Testcontainer to `test/setup-pg.ts`:
1. Use `directus/directus` Docker image
2. Bootstrap with Directus schema
3. Provide `TEST_DIRECTUS_URL` to tests
4. Update vitest config to use injected URL

## Blocking Issue

**ISS-TEST-INFRA-DIRECTUS-001:** Integration tests cannot use DirectusClient without Testcontainers Directus setup
- **Severity:** Major
- **Module:** Testing infrastructure
- **Impact:** Blocks all integration tests requiring DirectusModule

## Recommendation

Unit tests (7/7 passing) provide sufficient confidence to merge feature code. Integration tests should be unblocked in a follow-up PR after infrastructure work.

---

**File:** .copilot/tasks/active/wf-20260803-feat-207-event-announcement-fanout/07-test-results-retry2.md
**Agent:** TestRunner
**Result:** failed-escalate
**Next:** Orchestrator escalation → subworkflow spawn
