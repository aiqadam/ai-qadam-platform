# ISS-USR-REDIRECT-002 — Self-registration welcome-email link never re-enters the app

| Field | Value |
|---|---|
| ID | ISS-USR-REDIRECT-002 |
| Severity | blocker |
| Module | infra/authentik (recovery flow) + api/auth (registration) |
| Status | open |
| Reported | 2026-07-28 |
| Resolved | — |
| Workflow | queued: wf-20260728-fix-140-recovery-flow-redirect |
| Reporter | Orchestrator (discovered during ISS-USR-REDIRECT-001 impact analysis) |
| Business-Process | BP-UAT-013 |

## Symptom

A new member who self-registers (`POST /v1/auth/register`) receives a
welcome email (`registration.service.ts`'s `dispatchWelcomeEmail`)
containing an Authentik one-time login link
(`AuthentikClient.createRecoveryLink`, `POST
/api/v3/core/users/{pk}/recovery/`). Clicking that link does **not**
land the user anywhere in the app — it re-enters Authentik's
`default-recovery-flow`, which only re-prompts for account recovery by
email. The user never reaches `/v1/auth/callback`, never gets an AI
Qadam session, and never lands on `/me`.

## Root cause (confirmed live, 2026-07-28)

Queried `aiqadam-authentik-server` directly:

```
GET /api/v3/flows/instances/?slug=default-recovery-flow
  → stages: [aiqadam-recovery-identification, aiqadam-recovery-email]
GET /api/v3/stages/all/?flow=<default-recovery-flow pk>
  → aiqadam-recovery-identification: ak-stage-identification-form
  → aiqadam-recovery-email: ak-stage-email-form
```

Neither stage is a login stage (`ak-stage-user-login-form`) or a
redirect/user-write stage. `createRecoveryLink()`
(`apps/api/src/modules/admin-invites/authentik.client.ts:239`) mints the
link with no `next`/redirect target either. The flow that a recovery
link consumes has no way to hand control back to the app — by design
it is meant for "I forgot my password, re-send me a recovery email,"
not "log me in for the first time and take me to the app."

This is a **different and more severe** bug than
[ISS-USR-REDIRECT-001](ISS-USR-REDIRECT-001.md) (the `next`-defaulting
bug for the ordinary Sign-in button): that one lands the user on the
wrong page; this one prevents the welcome-email path from ever reaching
the app at all.

## Scope (not yet implemented — this is a discovery record for the queued follow-up)

Two candidate fixes, to be evaluated by the follow-up workflow:

1. **Bind a login + redirect stage to `default-recovery-flow`** (or a new
   AI-Qadam-specific recovery flow) so consuming the link establishes an
   Authentik session AND redirects into the app's OIDC `authorize`
   endpoint (e.g. `http://localhost:9000/if/flow/.../?next=<authorize-url>`
   or via Authentik's stage `flow_finish_action` / redirect stage).
2. **Change the welcome-email flow entirely**: instead of an Authentik
   recovery link, have `registration.service.ts` construct a URL that
   goes through the app's own `/v1/auth/login?next=/me` after the
   recovery link establishes the session (chained redirect) — avoids any
   Authentik flow/stage config change, keeps the fix entirely in
   app-owned code.

No live infra should be modified without going through the normal
issue-resolution workflow (impact analysis → fix → security review →
regression test → live verification) — this record exists so the
finding isn't lost, not as authorization to patch Authentik flows ad hoc.
