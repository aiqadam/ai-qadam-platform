# 06-test-strategy.md — wf-20260630-fix-043

**Workflow:** wf-20260630-fix-043
**Issue:** ISS-UAT-013-9
**Agent:** TestStrategist
**Date:** 2026-06-30

---

## Strategy

The regression test MUST demonstrate:
1. Before the fix: `submitLead` with `email_verified=true` would proceed to `patchLead` and `dispatchVerifyEmail`
2. After the fix: returns `already_verified`, neither `patch` nor `dispatch` called

### Test 1 — Unit test (regression) — `apps/api/test/leads-service.spec.ts`

**Name:** `'skips email and patch when lead is already verified'`

**Setup:**
- Mock `DirectusClient.get` to return `[{ id: 'u-verified', email: '...', state: 'lead', email_verified: true }]`

**Assertions:**
- `result.status === 'already_verified'`
- `result.userId === 'u-verified'`
- `dx.patch` not called (patchLead not reached)
- `dispatcher.dispatch` not called (dispatchVerifyEmail not reached)

**Why this is a regression test:** The mock sets `email_verified: true`. Without the guard, execution would continue past line 67 into `patchLead` and `dispatchVerifyEmail`, causing the test to fail on the `not.toHaveBeenCalled()` assertions.

### Test 2 — Integration test (BP-UAT-013 Step 004)

The acceptance criteria require re-running Step 004 of BP-UAT-013 (Playwright UAT) to confirm Mailpit receives exactly 1 email after the re-submit. This is the live verification of AC-3.

---

## Gate Result

Gate: passed
