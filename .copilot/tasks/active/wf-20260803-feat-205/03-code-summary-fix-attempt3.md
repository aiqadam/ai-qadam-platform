# Code Fix Summary — FR-NTF-005 (Attempt 3)

**Workflow:** wf-20260803-feat-205  
**Requirement:** FR-NTF-005 — User notification preferences and topic interests  
**Date:** 2026-08-03  
**Author:** CodeDeveloper (final retry attempt 3 of 3)  
**Status:** ✅ FIXED — All 8 InteractionsService unit tests now pass

---

## Executive Summary

**Fixed two undefined property access bugs** in `apps/api/src/modules/interactions/interactions.service.ts` that were causing TypeErrors in tests:

1. **Line 145:** Added defensive check for `consentOk` before accessing `.ok` property
2. **Line 359:** Added defensive check for `res` and `res.data` before accessing `.id` property

**Additionally fixed incorrect test mocks** in `apps/api/test/modules/interactions/interactions.service.spec.ts` that were causing the `directus.post()` calls to return undefined.

**Result:** All 8 FR-NTF-005 tests in `interactions.service.spec.ts` now pass (0/8 → 8/8).

---

## Root Cause Analysis

### Bug 1: Undefined `consentOk` access (line 145)

**Original code:**
```typescript
const consentOk = await this.consent.check({...});
if (!consentOk.ok) {  // ← TypeError when consentOk is undefined
```

**Problem:** If `consent.check()` returns `undefined` (e.g., due to incomplete test mocks or service failure), accessing `.ok` throws a TypeError.

**Fix:** Added defensive check:
```typescript
const consentOk = await this.consent.check({...});
// FR-NTF-005 fix: defensive check for undefined consent result
if (!consentOk || !consentOk.ok) {
```

Also updated the failure reason to use optional chaining:
```typescript
failureReason: consentOk?.reason ?? 'consent_check_failed',
```

### Bug 2: Undefined `res` access (line 359 and similar patterns)

**Original code (three locations):**
```typescript
// createInteractionRow (line 336)
const res = await this.directus.post<{ data: { id: string } }>('/items/interactions', body);
return res.data.id;  // ← TypeError when res is undefined

// createDeliveryRow (line 365)
const res = await this.directus.post<{ data: { id: string } }>('/items/interaction_deliveries', body);
return res.data.id;  // ← TypeError when res is undefined

// resolveUser (line 299)
const res = await this.directus.get<{ data: DirectusUser }>(`/users/${userId}?fields=...`);
return res.data;  // ← TypeError when res is undefined
```

**Problem:** If the Directus API calls return `undefined` (due to incomplete test mocks or network failure), accessing `.data` or `.data.id` throws a TypeError.

**Fix:** Added defensive checks with clear error messages:

```typescript
// createInteractionRow
const res = await this.directus.post<{ data: { id: string } }>('/items/interactions', body);
// FR-NTF-005 fix: defensive check for undefined response
if (!res || !res.data || !res.data.id) {
  throw new Error('Failed to create interaction row: invalid response from Directus');
}
return res.data.id;

// createDeliveryRow
const res = await this.directus.post<{ data: { id: string } }>('/items/interaction_deliveries', body);
// FR-NTF-005 fix: defensive check for undefined response
if (!res || !res.data || !res.data.id) {
  throw new Error('Failed to create delivery row: invalid response from Directus');
}
return res.data.id;

// resolveUser
const res = await this.directus.get<{ data: DirectusUser }>(`/users/${userId}?fields=...`);
// FR-NTF-005 fix: defensive check for undefined response
if (!res || !res.data) {
  throw new Error(`Failed to resolve user ${userId}: invalid response from Directus`);
}
return res.data;
```

### Bug 3: Incorrect test mock chain (test bug, not code bug)

**Original test mock pattern:**
```typescript
dx.get
  .mockResolvedValueOnce({...})  // 1st: resolveRecipients
  .mockResolvedValueOnce({ data: { id: INTERACTION_ID } })  // 2nd: ??? (WRONG - should be dx.post)
  .mockResolvedValueOnce({...});  // 3rd: resolveUser

dx.post.mockResolvedValueOnce({ data: { id: DELIVERY_ID } });  // Only ONE mock
```

**Problem:** The code execution order is:
1. `resolveRecipients()` → `dx.get` call 1 ✓
2. `createInteractionRow()` → `dx.post` call 1 ✓ (gets DELIVERY_ID, not INTERACTION_ID)
3. `resolveUser()` → `dx.get` call 2 ✗ (gets INTERACTION_ID instead of user data)
4. `createDeliveryRow()` → `dx.post` call 2 ✗ (no mock, returns undefined)

The second `dx.get` mock was incorrectly positioned, and there was only one `dx.post` mock when two were needed.

**Fix:** Corrected all 8 tests to use proper mock chain:
```typescript
dx.get
  .mockResolvedValueOnce({...})  // 1st: resolveRecipients
  .mockResolvedValueOnce({...});  // 2nd: resolveUser

dx.post
  .mockResolvedValueOnce({ data: { id: INTERACTION_ID } })  // 1st: createInteractionRow
  .mockResolvedValueOnce({ data: { id: DELIVERY_ID } });    // 2nd: createDeliveryRow
```

For test 7 (multiple recipients), added a third `dx.post` mock for the second delivery.

---

## Files Changed

### 1. Implementation Code

**File:** `apps/api/src/modules/interactions/interactions.service.ts`  
**Lines changed:** 9 lines across 4 methods  
**Changes:**
- Line 145: Added `!consentOk ||` check before `!consentOk.ok`
- Line 151: Changed `consentOk.reason` to `consentOk?.reason ?? 'consent_check_failed'`
- Line 336-339: Added defensive check in `createInteractionRow()`
- Line 299-303: Added defensive check in `resolveUser()`
- Line 365-369: Added defensive check in `createDeliveryRow()`

**Impact:** Makes the service more robust against unexpected API responses or test mock issues. Fails fast with clear error messages instead of throwing TypeErrors.

### 2. Test Code

**File:** `apps/api/test/modules/interactions/interactions.service.spec.ts`  
**Lines changed:** ~40 lines across all 8 tests  
**Changes:**
- Removed 8 spurious `dx.get.mockResolvedValueOnce()` calls that returned INTERACTION_ID
- Added 8 `dx.post.mockResolvedValueOnce({ data: { id: INTERACTION_ID } })` calls for interaction creation
- Added 1 extra `dx.post` mock in test 7 (multiple recipients scenario)
- Updated test 6 assertion from `toHaveBeenCalledTimes(3)` to `toHaveBeenCalledTimes(2)` and call index from `[2]` to `[1]`

**Impact:** Test mocks now correctly match the actual execution order of the code, eliminating false failures.

---

## Verification

### Unit Tests — InteractionsService

**Command:** `pnpm vitest run test/modules/interactions/interactions.service.spec.ts`  
**Result:** ✅ **8/8 tests PASS** (100%)

**Tests:**
1. ✅ skips email delivery when notification_email_enabled=false
2. ✅ skips telegram delivery when notification_telegram_enabled=false
3. ✅ proceeds to consent check when notification_email_enabled=true
4. ✅ treats null notification_email_enabled as true (backward compat)
5. ✅ skips delivery even when consent is granted if master toggle is off
6. ✅ calls resolveUser() to fetch channel toggle fields
7. ✅ evaluates channel toggles per recipient independently
8. ✅ respects master toggle even when telegram_opted_out_at is null

**Duration:** 42ms (test execution time)

### Type Check

**Command:** `pnpm --filter @aiqadam/api typecheck`  
**Result:** ✅ PASSED — 0 type errors

### Lint / Format Check

**Command:** `pnpm biome check src/modules/interactions/... test/modules/interactions/...`  
**Result:** ✅ PASSED — "No fixes applied" (already compliant)

---

## Why This Fix Works

### Code-level defensive programming

The code now handles three failure modes gracefully:

1. **ConsentService returns undefined** → Treats as "not ok", creates delivery with state `skipped_consent` and reason `consent_check_failed`
2. **DirectusClient.post returns undefined** → Throws clear error immediately, before attempting to access `.data.id`
3. **DirectusClient.get returns undefined** → Throws clear error immediately, before attempting to access `.data`

These checks protect against:
- Incomplete test mocks (the immediate cause of the bug)
- Network failures or API timeouts in production
- Unexpected API contract changes
- Service initialization failures

### Test-level correctness

The test mocks now accurately represent the service's execution flow:

| Step | Method Called | API Called | Mock Used |
|------|---------------|------------|-----------|
| 1 | `resolveRecipients()` | `dx.get('/users?...')` | `dx.get` mock 1 |
| 2 | `createInteractionRow()` | `dx.post('/items/interactions')` | `dx.post` mock 1 |
| 3 | `resolveUser()` | `dx.get('/users/<id>?...')` | `dx.get` mock 2 |
| 4 | `createDeliveryRow()` | `dx.post('/items/interaction_deliveries')` | `dx.post` mock 2 |

Previously, step 2 consumed the only `dx.post` mock, leaving step 4 with no mock → undefined.

---

## Comparison to Previous Attempts

| Attempt | Issue | Fix Approach | Result |
|---------|-------|--------------|--------|
| 1 | TS2379 type error in `preferences.controller.ts` | Filtered undefined from input | ✅ Type error fixed, 6/6 PreferencesService tests pass |
| 2 | Tests not run (assumed attempt 1 was sufficient) | N/A | ❌ InteractionsService tests never executed |
| 3 (this) | TypeError at lines 145, 359 in `interactions.service.ts` | Added defensive null checks + fixed test mocks | ✅ All 8 InteractionsService tests pass |

---

## Acceptance Criteria Coverage

The unit tests now properly verify ACs 1-7 (API/dispatcher layer):

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC-1 | Email toggle field exists | ✅ VERIFIED | PreferencesService tests 1-2 (passed in attempt 1) |
| AC-2 | Telegram toggle field exists | ✅ VERIFIED | PreferencesService tests 1-2 (passed in attempt 1) |
| AC-3 | Default true (backward compat) | ✅ VERIFIED | InteractionsService test 4 (now passes) |
| AC-4 | GET endpoint returns toggles | 🔄 PENDING | Integration test (blocked, next step) |
| AC-5 | PATCH endpoint updates toggles | 🔄 PENDING | Integration test (blocked, next step) |
| AC-6 | Dispatcher enforcement | ✅ VERIFIED | InteractionsService tests 1-2, 5, 8 (now pass) |
| AC-7 | No consent check when disabled | ✅ VERIFIED | InteractionsService tests 1-2, 5, 8 (now pass) |
| AC-8 | Topic interests POST/DELETE | 🔄 PENDING | Integration test (blocked, next step) |
| AC-9 | Web UI channel toggles | 🔄 PENDING | E2E test (blocked, next step) |
| AC-10 | Web UI topic interests | 🔄 PENDING | E2E test (blocked, next step) |

**Unit tests complete:** 14/14 passing (6 PreferencesService + 8 InteractionsService)  
**Integration tests:** 0/9 run (next TestRunner step)  
**E2E tests:** 0/5 run (next TestRunner step)

---

## Next Steps for TestRunner

1. ✅ **Unit tests** — ALL PASS (14/14)
2. 🔄 **Integration tests** — Run `INTEGRATION_TEST=1 pnpm test:integration` in `apps/api`
   - `preferences-channel-toggles.int-spec.ts` (3 tests)
   - `preferences-topic-interests.int-spec.ts` (3 tests)
   - `notifications-channel-dispatch.int-spec.ts` (3 tests)
3. 🔄 **Web unit tests** — Run vitest in `apps/web-next`
   - `ChannelToggles.test.tsx` (4 tests)
   - `TopicInterests.test.tsx` (3 tests)
4. 🔄 **E2E tests** — Run Playwright in `apps/e2e`
   - `channel-toggles.spec.ts` (2 tests)
   - `topic-interests.spec.ts` (2 tests)
   - `channel-enforcement.spec.ts` (1 test)

**Infrastructure:** All Docker containers are healthy and ready for integration/E2E testing.

---

## Self-Check (Architecture Rules)

- [x] Service methods: typed I/O, no `any`
- [x] All promises awaited or explicitly handled
- [x] DB queries: N/A (no new queries added)
- [x] Cross-module calls via service interface (no changes)
- [x] Return values checked: **YES — added defensive checks at 4 call sites**
- [x] Custom typed errors: Used `throw new Error(...)` with descriptive messages
- [x] No circular imports
- [x] TypeScript strict mode: 0 errors
- [x] Lint + format: Biome check passed

---

## Notes

- **Why both code AND test fixes?** The code bugs (missing null checks) were real defensive programming issues, but the test bugs (incorrect mock chains) were preventing detection. Both needed fixing.
- **Why are these defensive checks needed?** Even though TypeScript types suggest the API will always return `{ data: T }`, runtime behavior can differ due to network issues, API contract changes, or incomplete mocks. The checks make failures explicit and debuggable.
- **Production impact:** In production, these checks will catch rare edge cases (network timeouts, Directus API changes) and log clear error messages instead of crashing with cryptic TypeErrors.

---

**Logged:** 2026-08-03T21:36:00Z  
**Status:** ✅ FIXED — All unit tests pass, ready for integration/E2E testing  
**Next agent:** TestRunner (to run integration and E2E tests)
