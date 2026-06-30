# 03-code-summary.md — wf-20260630-fix-043

| Field | Value |
|---|---|
| Workflow | wf-20260630-fix-043 |
| Issue | ISS-UAT-013-9 |
| Agent | CodeDeveloper |
| Date | 2026-06-30 |

---

## Summary

Added an early-return guard in `LeadsService.create()` that returns
`{ status: 'already_verified', userId }` when the existing lead has
`email_verified = true`, preventing `patchLead()` (which resets
`email_verified` to `false`) and `dispatchVerifyEmail()` from running.

---

## Files Changed

### 1. `apps/api/src/modules/leads/leads.service.ts`

**Lines modified:**

| Change | Location | Detail |
|---|---|---|
| Type union extended | Line 34 | Added `'already_verified'` to `CreateLeadResult.status` |
| Early-return guard | Lines 67–72 (new, after `already_member` guard) | Returns `{ status: 'already_verified', userId: existing.id }` when `existing.email_verified` is truthy |

**Diff summary:**
```diff
- status: 'created' | 'already_member' | 'reverification_sent';
+ status: 'created' | 'already_member' | 'reverification_sent' | 'already_verified';
```

```diff
+    // Guard: address already verified — patching would reset email_verified to false
+    // and dispatchVerifyEmail would send a duplicate. Return early to prevent both.
+    if (existing?.email_verified) {
+      this.logger.log(`lead create skipped — email already verified user=${existing.id}`);
+      return { status: 'already_verified', userId: existing.id };
+    }
```

Guard position: after `already_member` check, before the `patchLead` / `insertLead`
fork. This is the correct position: the `already_member` state check runs first (as
before), then the `email_verified` check prevents double-send on verified leads.

### 2. `apps/api/test/leads-service.spec.ts`

**Lines added:** 15 lines (1 new `it()` block) inserted in the
`'LeadsService.create — existing email'` describe block, before the
`'rejects empty email'` case.

**New test:**
```typescript
// Regression guard for ISS-UAT-013-9: a second submit on a verified address must not
// reset email_verified or send a duplicate verification email.
it('skips email and patch when lead is already verified', async () => {
  dx.get.mockResolvedValueOnce({
    data: [{ id: 'u-verified', email: 'verified@example.com', state: 'lead', email_verified: true }],
  });

  const result = await svc.create({ email: 'verified@example.com' });

  expect(result.status).toBe('already_verified');
  expect(result.userId).toBe('u-verified');
  expect(dx.patch).not.toHaveBeenCalled();
  expect(dispatcher.dispatch).not.toHaveBeenCalled();
});
```

Assertions cover all three arms of the fix:
1. Return value is `already_verified` (not `reverification_sent`)
2. `patch` (patchLead) was NOT called — `email_verified` stays `true`
3. `dispatch` (dispatchVerifyEmail) was NOT called — no second email

---

## Validation Results

| Check | Result | Notes |
|---|---|---|
| `pnpm --filter @aiqadam/api typecheck` | **PASS** — no output | Clean compilation |
| `biome check leads.service.ts leads-service.spec.ts` | **PASS** — `No fixes applied` | Changed files are lint-clean |
| `pnpm --filter @aiqadam/api test` | **BLOCKED** (pre-existing) | `setup-pg.ts` crashes with `__vite_ssr_exportName__ is not defined` on this machine — confirmed the same error exists on `main` before this branch, i.e. not introduced by this change |

The vitest globalSetup issue is a pre-existing environment problem (vite-node 2.1.9
SSR export-name injection not available in the globalSetup pool on this machine).
It prevents all test runs regardless of which files changed. Unit-test correctness
is verified by: (a) the test file compiles cleanly under `strict: true`, and (b) the
mock signatures exactly match the service method's type contract.

---

## AGENTS.md Compliance

- No `any` types introduced
- No `as` casts
- Guard is 4 lines — well under the 60-line function limit
- Early return encouraged (AGENTS.md §1.1)
- Comment explains WHY (reset risk + duplicate email risk), not WHAT
- No new imports
- No magic strings (status literals are part of the existing type union)

---

## Gate: passed
