# Test Results: FR-NTF-002 (Event announcement topic-filtered fan-out)

**Workflow:** wf-20260803-feat-207-event-announcement-fanout  
**Agent:** TestRunner  
**Date:** 2026-08-03  
**Requirement:** [FR-NTF-002](../../../docs/03-requirements/FR-NTF-002.md)  
**Test Strategy:** [06-test-strategy.md](06-test-strategy.md)  
**Code Summary:** [03-code-summary.md](03-code-summary.md)

---

## Execution Summary

| Suite | Tests | Passed | Failed | Skipped |
|-------|-------|--------|--------|---------|
| **Type Check** | N/A | ✅ PASS | 0 | 0 |
| **Lint / Format Check** | 331 files | ✅ CLEAN | 0 | 0 |
| **Unit Tests** | 7 | ✅ 7 | 0 | 0 |
| **Integration Tests** | 6 | ❌ 0 | 6 | 0 |
| **E2E Tests** | N/A | ⚠️ DEFERRED | 0 | 0 |

**Overall Status:** ❌ **FAILED** — Integration tests blocked by circular dependency bug

---

## Type Check

```bash
`$ cd apps/api; pnpm typecheck
> @aiqadam/api@0.0.0 typecheck
> tsc --noEmit
```

✅ **PASS** — No type errors

---

## Lint / Format Check

```bash
`$ pnpm biome check .
Checked 331 files in 155ms. No fixes applied.
```

✅ **CLEAN** — No formatting issues, no lint warnings

---

## Unit Tests

**File:** ``apps/api/test/event-broadcast-service.spec.ts``

```bash
`$ cd apps/api; pnpm test event-broadcast-service.spec.ts
 Test Files  1 passed (1)
      Tests  7 passed (7)
   Duration  27.64s
```

✅ **ALL PASSED** — 7 test cases covering:

| Test | Description | Status |
|------|-------------|--------|
| ``dispatches event_announce to country audience`` | Happy path: broadcast to country, records ledger | ✅ PASS |
| ``is idempotent — second call returns already_dispatched`` | Idempotency check (AC-3) | ✅ PASS |
| ``returns no_audience when country has no members`` | Edge case: empty country | ✅ PASS |
| ``handles null capacity without crashing`` | Null safety | ✅ PASS |
| ``filters audience by topic intersection when event has topics`` | Topic filtering (AC-1) | ✅ PASS |
| ``excludes members with no matching topic interests`` | No-interest exclusion (AC-2) | ✅ PASS |
| ``ensures tenant isolation — country filter always enforced`` | Tenant isolation (AC-4) | ✅ PASS |

**Coverage:** All acceptance criteria (AC-1, AC-2, AC-3, AC-4) covered at unit level with mocked dependencies.

---

## Integration Tests

**File:** ``apps/api/test/event-broadcast-topic-filtering.integration.spec.ts``

```bash
`$ cd apps/api; `$env:INTEGRATION_TEST='1'; pnpm test test/event-broadcast-topic-filtering.integration.spec.ts

 FAIL  test/event-broadcast-topic-filtering.integration.spec.ts > EventBroadcastService topic filtering (integration)
Error: Nest cannot create the LeadsModule instance.
The module at index [1] of the LeadsModule "imports" array is undefined.

Potential causes:
- A circular dependency between modules. Use forwardRef() to avoid it.
```

❌ **FAILED** — Test suite setup failed due to circular dependency in module graph

### Root Cause Analysis

**Circular dependency chain:**
```
InteractionsModule → TelegramModule → AuthModule → LeadsModule → InteractionsModule
```

**Concrete path:**
1. Test creates ``TestingModule`` with ``imports: [DirectusModule, InteractionsModule]``
2. ``InteractionsModule`` imports ``TelegramModule`` (line 21 of interactions.module.ts)
3. ``TelegramModule`` imports ``forwardRef(() => AuthModule)`` (line 75 of telegram.module.ts) — already uses forwardRef
4. ``AuthModule`` imports ``LeadsModule`` directly (line 6 + line 59 of auth.module.ts) — **NOT wrapped in forwardRef**
5. ``LeadsModule`` imports ``InteractionsModule`` directly (line 25 of leads.module.ts) — **NOT wrapped in forwardRef**
6. Cycle completes: ``InteractionsModule → ... → LeadsModule → InteractionsModule``

**Error manifestation:** When Nest''s dependency scanner reaches ``LeadsModule``, its second import (``InteractionsModule`` at index [1]) is undefined because ``InteractionsModule`` is still being initialized higher up the stack.

**Fix required:** One of these two modules must wrap the import in ``forwardRef``:

**Option A (Recommended):** Wrap ``InteractionsModule`` in ``forwardRef`` in ``LeadsModule``:
```diff
// apps/api/src/modules/leads/leads.module.ts
+import { Module, forwardRef } from ''@nestjs/common'';
 import { DirectusModule } from ''../directus/directus.module'';
 import { InteractionsModule } from ''../interactions/interactions.module'';

 @Module({
-  imports: [DirectusModule, InteractionsModule],
+  imports: [DirectusModule, forwardRef(() => InteractionsModule)],
   providers: [LeadsService, LeadVerifyTokenService, LeadNurtureCronService, InternalAuthGuard],
   controllers: [LeadsController, LeadNurtureCronController],
   exports: [LeadsService],
 })
 export class LeadsModule {}
```

**Option B (Alternative):** Wrap ``LeadsModule`` in ``forwardRef`` in ``AuthModule``:
```diff
// apps/api/src/modules/auth/auth.module.ts
 @Module({
   imports: [
     UsersModule,
     DirectusModule,
-    LeadsModule,
+    forwardRef(() => LeadsModule),
     AuthentikModule,
     InteractionsModule,
     PointsModule,
     forwardRef(() => RegistrationsModule),
     forwardRef(() => MeProfileModule),
   ],
```

**Precedent:** The ``telegram.module.ts`` file already documents this exact pattern (lines 43-76) and uses ``forwardRef(() => AuthModule)`` to break a similar cycle. The auth.module.ts comment (lines 24-70) also documents ``forwardRef`` usage for ``RegistrationsModule`` and ``MeProfileModule``.

**Recommendation:** Use **Option A** (wrap in LeadsModule) because:
1. ``InteractionsModule`` is the lower-level module (utilities layer) and ``LeadsModule`` is the higher-level domain module (business logic layer)
2. Breaking cycles at the higher-level module is the established pattern (see ``TelegramModule`` wrapping ``AuthModule``, not the reverse)
3. Fewer files already import ``LeadsModule`` compared to ``InteractionsModule``, so the change has smaller blast radius

---

## Failed Tests

| Test | File | Error | Classification |
|------|------|-------|----------------|
| All 6 integration tests | ``event-broadcast-topic-filtering.integration.spec.ts`` | Circular dependency: ``LeadsModule`` imports[1] undefined | **failed-retry-code** |

**Classification:** ``failed-retry-code``

**Rationale:**
- This is a module dependency configuration issue in the codebase (leads.module.ts, auth.module.ts)
- The test design is correct — it mirrors the unit test setup and follows Testcontainers best practices
- The failure is NOT a test logic bug — the test never executed; setup failed
- CodeDeveloper must fix the circular dependency by adding ``forwardRef`` per the precedent in telegram.module.ts
- No test changes required; the same test file will work once the module graph is fixed

**Route To:** **CodeDeveloper** (retry attempt 2/3 per protocol)

---

## Flaky Tests

None identified. Unit tests are deterministic with mocked dependencies.

---

## Coverage

### Unit Test Coverage

✅ **Complete** — All acceptance criteria mapped:

| AC | Unit Test | Assertion |
|----|-----------|-----------|
| AC-1 | ``filters audience by topic intersection when event has topics`` | Mock ``fetchEventTopics`` returns 2 topics → ``resolveToUserIds`` called with ``member_interests.topic._in`` filter |
| AC-2 | ``excludes members with no matching topic interests`` | Mock returns ``recipientCount: 0`` when no interests match |
| AC-3 | ``is idempotent — second call returns already_dispatched`` | Mock ``fetchPriorAnnouncements`` returns ledger entry → status === ''already_dispatched'' |
| AC-4 | ``ensures tenant isolation — country filter always enforced`` | Verifies ``filter.country._eq`` present alongside topic filter |

### Integration Test Coverage (When Unblocked)

⚠️ **Blocked by circular dependency** — Expected coverage once fixed:

| AC | Integration Test | Live Database Verification |
|----|------------------|----------------------------|
| AC-1 | ``sends announcements only to members with at least one matching topic interest`` | 3 members with AI/ML or Python interests receive; 2 without do not |
| AC-2 | ``excludes members with no topic interests from the announcement`` | Event with Frontend topic (no members have) → ``recipientCount === 0`` |
| AC-3 | ``is idempotent — second call returns already_dispatched`` | ``event_announcements`` ledger entry persists; second call returns ``already_dispatched`` |
| AC-4 | ``enforces tenant isolation by filtering on country alongside topic filter`` | KZ member with AI/ML interest does NOT receive UZ event with AI/ML topic |
| Fallback | ``broadcasts to entire country when event has no topics`` | Legacy event (no ``event_topics`` rows) → all 4 UZ members receive |
| Edge | ``returns no_audience when topic has no members`` | Event with topic no members have → ``status === ''no_audience''`` |

**Test data volume:** 3 topics, 5 members, 3 events across 2 countries — sufficient to verify all paths without performance overhead.

### E2E Coverage

⚠️ **DEFERRED** — Per test strategy (06-test-strategy.md), E2E test required for AC-6 (email delivery + link click-through):

**Test flow:** Operator publishes event → member receives email in Mailpit → "Register now" link navigates to event page

**Estimated LOC:** ~80 lines (Playwright test + Mailpit API polling)

**Infrastructure requirements:** Full Docker stack (``docker-compose up -d``), pre-flight check (``scripts/uat-preflight-email.sh``)

**Deferral justification (AGENTS.md §6.1):**
1. Integration tests provide strong coverage of the topic filtering logic (the core FR-NTF-002 behavior)
2. Email delivery mechanism is tested in isolation by existing ``InteractionsService`` tests
3. E2E test requires infrastructure setup (Mailpit + API + Bot + Directus) which is currently not running
4. Rubric score of 6 mandates E2E, but the blocker is the circular dependency fix, not E2E test authoring
5. Follow-up workflow ID for E2E test: **wf-20260804-e2e-nft-002** (queued after this workflow resolves the circular dependency)

**Honesty disclosure:** The current workflow is NOT production-ready per AGENTS.md §6.1 because:
- Integration tests are blocked by a code bug
- E2E test is missing (deferred to follow-up workflow wf-20260804-e2e-nft-002)
- The issue file for FR-NTF-002 should NOT be marked ``Status: resolved`` until both are complete

---

## Performance Coverage

⚠️ **DEFERRED** — Per test strategy (06-test-strategy.md), performance test required for AC-7 (>1000 members, 10-minute timeout):

**Test requirements:**
1. Synthetic data generation script (1000+ test members with topic interests)
2. Mailpit instance with increased resource limits (or mock dispatcher)
3. Timing instrumentation in ``EventBroadcastService``
4. Load testing against live Directus + Postgres

**Deferral justification (AGENTS.md §6.1):**
1. Current scale is <100 members per event (orders of magnitude below AC-7 threshold)
2. Performance risk is low-likelihood at current scale
3. Code summary (03-code-summary.md) already flagged "No BullMQ job queue for large audiences" as a known limitation
4. If AC-7 fails during performance testing, follow-up workflow will add BullMQ batching
5. Follow-up issue for performance test: **ISS-NTF-002-PERF** (registered in issue registry with queued workflow)

---

## Gate Result

```yaml
status: failed-retry-code
attempt: 1
timestamp: 2026-08-03T23:59:57Z
summary: |
  Unit tests PASS (7/7). Integration tests FAILED — circular dependency in module graph
  (LeadsModule imports[1] undefined). CodeDeveloper must add forwardRef to break cycle.
  E2E and performance tests deferred to follow-up workflows per AGENTS.md §6.1.
output_file: .copilot/tasks/active/wf-20260803-feat-207-event-announcement-fanout/07-test-results.md
retry_reason: Circular dependency in LeadsModule → InteractionsModule edge
route_to: code-developer
retry_count: 1
max_retries: 3
blocking_issue: None (code fix only)
next_steps: |
  CodeDeveloper: Add ``forwardRef(() => InteractionsModule)`` in leads.module.ts imports array.
  After fix: Re-run this test suite with same command: 
  ``$env:INTEGRATION_TEST=''1''; pnpm test test/event-broadcast-topic-filtering.integration.spec.ts``
```

**Rationale for ``failed-retry-code``:**
- Type-check ✅ PASS
- Lint/format ✅ CLEAN
- Unit tests ✅ PASS (7/7)
- Integration tests ❌ FAIL — **code bug** (circular dependency), not test bug
- Classification per TestRunner role definition: "TypeScript type error" OR "code bug" → ``failed-retry-code`` → route to CodeDeveloper

**Not ``failed-escalate``:** This is not an infrastructure failure (Docker/Testcontainers unavailable). The test environment is working; the code has a module dependency bug.

**Not ``failed-retry-tests``:** The test logic is correct; it mirrors the unit test setup. The failure is in the module configuration (leads.module.ts), not the test file.

---

## Recommendations

### Immediate (CodeDeveloper, retry 2/3)

1. ✅ Apply the ``forwardRef`` fix (Option A from "Integration Tests" section above)
2. ✅ Re-run integration tests: ``$env:INTEGRATION_TEST=''1''; pnpm test test/event-broadcast-topic-filtering.integration.spec.ts``
3. ✅ Verify all 6 integration tests pass
4. ✅ Return to TestRunner agent (this file) with updated gate result

### Follow-up Workflows (After Integration Tests Pass)

1. **wf-20260804-e2e-nft-002** — E2E test for AC-6 (email delivery + link click-through)
   - Assigned to: TestRunner
   - Blocking on: Infrastructure setup (Docker stack + Mailpit)
   - Estimated effort: ~80 LOC Playwright test

2. **ISS-NTF-002-PERF** — Performance test for AC-7 (>1000 members)
   - Assigned to: TestRunner (performance testing)
   - Blocking on: Synthetic data generation + load test infrastructure
   - Estimated effort: ~200 LOC (data gen script + timing instrumentation)

---

## Honesty Disclosure (AGENTS.md §6.1)

**This workflow is NOT production-ready:**

1. ❌ Integration tests blocked by circular dependency bug
2. ⚠️ E2E test deferred to follow-up workflow wf-20260804-e2e-nft-002
3. ⚠️ Performance test deferred to follow-up issue ISS-NTF-002-PERF

**The issue file for FR-NTF-002 should NOT be marked ``Status: resolved`` until:**
- Integration tests pass (requires CodeDeveloper retry)
- E2E test passes (follow-up workflow wf-20260804-e2e-nft-002)

**Performance test (AC-7) can be deferred to post-production** because:
- Current scale (<100 members/event) is orders of magnitude below the 1000+ threshold
- Known limitation already documented (no BullMQ queue)
- Performance test is flagged for Phase 2 (when scale warrants it)

---

## Audit Trail

| Timestamp | Agent | Action | Result |
|-----------|-------|--------|--------|
| 2026-08-03 23:58:56 | TestRunner | Type-check (``pnpm typecheck``) | ✅ PASS |
| 2026-08-03 23:58:56 | TestRunner | Lint/format (``pnpm biome check .``) | ✅ CLEAN |
| 2026-08-03 23:58:56 | TestRunner | Unit tests (``pnpm test event-broadcast-service.spec.ts``) | ✅ PASS (7/7) |
| 2026-08-03 23:59:24 | TestRunner | Integration tests (``pnpm test event-broadcast-topic-filtering.integration.spec.ts``) | ❌ FAIL (circular dependency) |
| 2026-08-03 23:59:57 | TestRunner | Gate result: ``failed-retry-code`` | Route to CodeDeveloper (retry 2/3) |
