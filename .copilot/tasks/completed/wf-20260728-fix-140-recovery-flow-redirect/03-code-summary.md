# Step 4: Code Summary

**Workflow:** wf-20260728-fix-140-recovery-flow-redirect · **Issue:** [ISS-USR-REDIRECT-002](../../../issues/ISS-USR-REDIRECT-002.md)

## Changes

1. `apps/api/src/modules/admin-invites/authentik.client.ts` —
   `createRecoveryLink()` now reads `res.link` instead of
   `res.recovery_link`, matching Authentik's real, live-verified
   response shape (`{"link": "..."}`). Updated the module doc comment
   accordingly and added a note explaining the bug for future readers.
2. `apps/api/test/authentik-client.spec.ts` — corrected the mock
   response in the `createRecoveryLink` describe block from
   `{ recovery_link: RECOVERY_URL }` to `{ link: RECOVERY_URL }`, so the
   test actually exercises Authentik's real response shape instead of
   mirroring the bug.

## Why this is sufficient (for the scope of THIS issue)

`registration.service.ts` and `telegram-auth.service.ts` both already
correctly consume whatever `createRecoveryLink()` returns — neither
needed changes. They were both being fed `undefined` due to the parsing
bug; fixing the parsing restores their existing, correct logic to
working order.

## Explicitly out of scope

Whether the resulting recovery link is actually a working one-click
sign-in mechanism is a SEPARATE, larger problem — filed as
[ISS-USR-REDIRECT-003](../../../issues/ISS-USR-REDIRECT-003.md) after
live Playwright verification showed the link still prompts for email
re-entry rather than silently authenticating. See that issue and
`ISS-USR-REDIRECT-002.md`'s "Scope note" section for the full
investigation trail, including the redirect-stage fix that was applied
live, verified insufficient, and reverted within this same session.

## Gate result

```yaml
gate_result:
  status: passed
  summary: "2 files changed: 1 source (field-name fix), 1 test (mock corrected to match real API). No behavior change beyond restoring the intended, already-written consumer logic to working order."
```
