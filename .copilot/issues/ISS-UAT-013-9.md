# ISS-UAT-013-9 — Re-submit of verified email triggers second verification email

| Field | Value |
|---|---|
| ID | ISS-UAT-013-9 |
| Severity | bug |
| Module | api/leads |
| Status | open |
| Reported | 2026-06-30 |
| Resolved | — |
| Reporter | BusinessAnalyst (wf-20260630-uat-042 / BP-UAT-013-04-triage.md) |
| Workflow | wf-20260630-uat-042 (reported) |
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

- [ ] Unit test: `submitLead` with `email_verified=true` lead → returns without sending email
- [ ] Integration test: `POST /v1/leads` on verified address → 202, Mailpit count unchanged
- [ ] Step 004 in BP-UAT-013 passes on re-run
