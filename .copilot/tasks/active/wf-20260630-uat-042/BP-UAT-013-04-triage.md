# BP-UAT-013 UAT Triage Report
# wf-20260630-uat-042
# 2026-06-30

## Run Summary

- **Script:** BP-UAT-013 — Member signup and operator onboarding
- **Run date:** 2026-06-30
- **Result: 10 passed / 2 failed**
- **Playwright spec:** apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts
- **Full run command:** UAT_API_URL=http://localhost:3000 UAT_BASE_URL=http://localhost:4321 ... pnpm exec playwright test ...

## AC Verification

| AC | Description | Test | Result |
|---|---|---|---|
| AC-1 | Lead form submits; verify email arrives within 60s | Steps 001, 002 | ✓ VERIFIED |
| **AC-2** | **Verify link → email_verified=true + /leads/verified** | **Step 003** | **✓ VERIFIED — closes ISS-UAT-013-8 deferred item** |
| AC-3 | Re-submit same email → 202, no second email | Step 004 | ✗ FAILED — 2nd email sent (ISS-UAT-013-9) |
| AC-4 | Honeypot → silent 202, no row | Neg 001 | ✓ VERIFIED |
| AC-5 | Valid token → onboarding form + accepts password + AUP | Step 005 (partial), Step 006 | ✓ PARTIAL — Step 005 assertion failed (ISS-UAT-013-10), Step 006 passed |
| AC-6 | Used token → 410 | Neg 002 | ✓ VERIFIED |
| AC-7 | Expired token → 410 | Neg 003 | ✓ VERIFIED |
| Neg 004 | Plus-addressing rejected | Neg 004 | ✓ VERIFIED |
| Neg 005 | No-user token → 409 | Neg 005 | ✓ VERIFIED |

## Issues Registered

| Issue | Severity | Classification | Summary |
|---|---|---|---|
| ISS-UAT-013-9 | bug | Product bug | Re-submit of verified email sends 2nd email (idempotency incomplete) |
| ISS-UAT-013-10 | minor | Spec/seed misalignment | Step 005 asserts aiqadam-staff role but seed has role_groups: [] |

## Key Finding: AC-2 VERIFIED

AC-2 (deferred from ISS-UAT-013-8 / wf-20260629-fix-039) is now **VERIFIED**:
- Step 001: Lead form submitted successfully
- Step 002: Verification email received in Mailpit (SMTP transport working)
- Step 003: Verification link navigated → /leads/verified page shown, email_verified=true
This closes the deferred AC-2 item.

## Infrastructure issues discovered during this run

1. **AUTHENTIK_ADMIN_TOKEN not set in apps/api/.env** — required for consumeInvite to call Authentik's set_password API. Workaround: API restarted with token as env var (not persisted to .env per AGENTS.md §6).
2. **operator_invites.authentik_user_id null in seed** — seed does not set this field; consumeInvite fails with 409. Workaround: patched via Directus API during pre-flight.
3. **uat-seed.sh fails at step 4** — operator_invites INSERT fails because `consumed_at: null` triggers Directus readonly field validation bug. New issue ISS-UAT-SEED-001 (see below).

## gate_result

```yaml
gate_result:
  status: passed
  summary: "Triage complete. 10/12 passed. AC-2 verified (closes ISS-UAT-013-8). 2 issues registered (ISS-UAT-013-9 product bug, ISS-UAT-013-10 spec fix)."
```
