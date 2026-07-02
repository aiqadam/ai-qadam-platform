# ISS-UAT-013-9 — Re-submit of verified email triggers second verification email

| Field | Value |
|---|---|
| ID | ISS-UAT-013-9 |
| Severity | bug |
| Module | api/leads |
| Status | resolved |
| Reported | 2026-06-30 |
| Resolved | 2026-06-30 |
| Reporter | BusinessAnalyst (wf-20260630-uat-042 / BP-UAT-013-04-triage.md) |
| Workflow | wf-20260630-fix-043 |
| AC ref | AC-3 (BP-UAT-013) |

## Symptom

During the BP-UAT-013 run on 2026-06-30, Step 004 (re-submit idempotency) failed:

```
Expected: 1, Received: 2
```

After Step 003 verified the email (setting `email_verified = true`), a second submission
of the same address to `POST /v1/leads` triggered a second verification email. Mailpit
received 2 messages instead of 1.

## Root cause (hypothesis)

`apps/api/src/modules/leads/leads.service.ts` — the idempotency guard suppresses re-send
only when `email_verified = false` but does NOT check for `email_verified = true` before
dispatching the email.

## Proposed resolution

In `leads.service.ts`, add an early-return guard:

```typescript
if (existingLead.email_verified) {
  return { status: 'already_verified' };
}
```

This must be before the email dispatch call.

## Acceptance criteria

- [x] Unit test: `submitLead` with `email_verified=true` lead → returns without sending email
- [x] Integration test: `POST /v1/leads` on verified address → 202, Mailpit count unchanged (AC-3 live verification — see Resolution)
- [x] Step 004 in BP-UAT-013 passes on re-run (AC-3 live verification — see Resolution)

## Resolution

- **Workflow:** wf-20260630-fix-043
- **PR:** https://github.com/tvolodi/aiqadam/pull/75
- **Root cause:** `LeadsService.create()` had no guard for `email_verified = true` — after the `already_member` check (which only catches `state !== 'lead'`), execution fell into `patchLead()` (which resets `email_verified = false`) and `dispatchVerifyEmail()` (which sends a duplicate email).
- **Fix:** Added a 4-line early-return guard in `apps/api/src/modules/leads/leads.service.ts` between the `already_member` block and the `patchLead/dispatchVerifyEmail` calls. Also extended the `CreateLeadResult.status` union to include `'already_verified'`. One regression test added to `apps/api/test/leads-service.spec.ts`.
- **Regression test:** `'skips email and patch when lead is already verified'` in `apps/api/test/leads-service.spec.ts` — asserts `status = 'already_verified'`, `dx.patch` not called, `dispatcher.dispatch` not called.
- **Merged:** PR #75 (squash 6f2b1aa on main, 2026-06-30)
- **Live re-run verification (2026-07-02):** BP-UAT-013 Step 004 passed end-to-end against the live local stack. After Step 003 verified `uat-lead-new@example.com` (Mailpit count = 1), re-submitting the same address did NOT trigger a second email — Mailpit count remained 1. Workflow: wf-20260702-uat-059, PR #85 (squash 1f075c6 on main). All 3 acceptance criteria now verified.

### Honesty disclosures

**AC-3 live integration test** (BP-UAT-013 Step 004 re-run via Playwright / Mailpit count = 1 after re-submit) — VERIFIED 2026-07-02 in wf-20260702-uat-059. No outstanding deferrals. The original deferral note (Node.js v24 / vite-node v2.1.9 local test runner incompatibility) is now superseded by the live end-to-end verification.

