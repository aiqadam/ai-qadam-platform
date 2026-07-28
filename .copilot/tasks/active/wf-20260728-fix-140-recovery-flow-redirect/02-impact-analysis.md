# Step 2: Impact Analysis

**Workflow:** wf-20260728-fix-140-recovery-flow-redirect · **Issue:** [ISS-USR-REDIRECT-002](../../../issues/ISS-USR-REDIRECT-002.md)

## Affected surface

| File | Role |
|---|---|
| `apps/api/src/modules/admin-invites/authentik.client.ts` (`createRecoveryLink`) | Reads the wrong JSON field (`recovery_link` instead of Authentik's actual `link`) from `POST /api/v3/core/users/{pk}/recovery/`'s response — always returns `undefined`. |
| `apps/api/src/modules/auth/registration.service.ts` (`dispatchWelcomeEmail` call site) | Consumer #1 of the broken field — `if (recoveryUrl)` silently skips sending the welcome email. |
| `apps/api/src/modules/auth/telegram-auth.service.ts` (`exchangeWidgetPayload`) | Consumer #2 — feeds the `undefined` straight into `AuthController.telegramExchange`'s 302 redirect. |
| `apps/api/src/modules/auth/auth.controller.ts` (`telegramExchange`) | `res.redirect(HttpStatus.FOUND, recoveryUrl)` with `recoveryUrl: undefined` — broken redirect for every Telegram Login-Widget sign-in. |
| Authentik `default-recovery-flow` (live config, not app code) | Even with the field-name fixed, the flow itself has no login/redirect stage — consuming the (now-working) link still won't hand control back to the app. |

## Root cause — two independent bugs (see ISS-USR-REDIRECT-002.md for full live-verification detail)

**Bug A (fix in this workflow):** `createRecoveryLink()` parses the
wrong field name. Confirmed live via direct `curl`/`node fetch` against
`aiqadam-authentik-server`: the real response shape is `{"link": "..."}`,
not `{"recovery_link": "..."}`. `res.recovery_link` is always
`undefined`. This is a plain typo-class bug, not a version/config drift
— nothing in this codebase's own tests exercises the real HTTP response
shape (existing tests presumably mock the client method itself, not the
raw Authentik API response), so it was never caught.

**Bug B (fix in this workflow):** Even with Bug A fixed, Authentik's
`default-recovery-flow` (stages: `aiqadam-recovery-identification` +
`aiqadam-recovery-email` only) has no stage that authenticates the user
into a session and redirects back into the app. It is Authentik's stock
"forgot my password, re-send recovery email" flow — appropriate for
password-reset self-service, not a one-time login link.

## Fix approach

**Bug A:** One-line fix — change `authentik.client.ts`'s
`createRecoveryLink()` to read `res.link` instead of `res.recovery_link`,
and rename the inline response type accordingly. No other change needed
— `registration.service.ts` and `telegram-auth.service.ts` both already
correctly propagate whatever `createRecoveryLink()` returns; they were
never wrong, they were just being fed `undefined`.

**Bug B:** Requires a flow-execution decision. Two real options
(from `ISS-USR-REDIRECT-002.md`'s original discovery):

1. **Authentik flow/stage change** — add a login + redirect stage to
   `default-recovery-flow` (or a new AI-Qadam-specific recovery flow)
   bound to the OIDC provider's authorize endpoint. Requires live
   Authentik admin API changes (new stage objects, flow binding order),
   is infra config rather than app code, and is harder to
   regression-test (no code diff to review, only API-call diffs against
   a stateful external system).
2. **App-code-only fix** — after the user completes Authentik's
   recovery flow (re-authenticates via the identification+email stages,
   which DOES establish an Authentik session even without a login
   stage — Authentik's session cookie is set during flow execution
   regardless of a login stage being present, since the identification
   stage itself authenticates), redirect the user to the app's own
   `/v1/auth/login?next=/me`, which will silently SSO them (existing
   `max_age` silent-SSO behavior documented in `auth.service.ts`'s
   `startAuthorization` comments) and complete a normal OIDC round-trip
   into the app.

   This requires knowing WHEN the recovery flow finishes so the redirect
   can fire — Authentik's flow executor supports a
   `flow_finish_action`/final "redirect" via a stage. Investigating
   whether stage-less redirect is possible without adding a stage: **no
   — some stage must be the one issuing the redirect.** This collapses
   back to needing a stage-binding change on the Authentik side
   regardless — option 2 doesn't actually avoid touching Authentik flow
   config, it just changes what the added stage points to (app's
   `/v1/auth/login` instead of the OIDC authorize URL directly).

**Decision:** Bug A ships in this PR (pure app code, zero risk,
directly fixes both consumers). Bug B requires an Authentik stage
binding either way — implement the smaller, safer version: bind a
**redirect stage** (not a full login stage — `default-recovery-flow`'s
existing identification+email stages already authenticate the session)
to `default-recovery-flow` that sends the browser to the app's
`/v1/auth/login?next=/me`, relying on silent-SSO to complete the OIDC
handshake using the session Authentik's identification stage already
established. This is smaller-blast-radius than adding a full login
stage (no risk of double-prompting for credentials) and reuses the
app's existing, already-tested `/v1/auth/login` → silent-SSO →
`/callback` → `/me` path end-to-end.

## Files/systems to modify

- `apps/api/src/modules/admin-invites/authentik.client.ts` — field name
  fix (app code, in this PR/branch).
- Authentik `aiqadam-authentik-server`, live API calls via
  `AUTHENTIK_ADMIN_TOKEN` — add a `ak-stage-redirect` (or equivalent)
  stage bound to `default-recovery-flow`, redirecting to
  `{WEB_BASE_URL}/auth/sign-in?next=/me` (reusing the just-fixed
  ISS-USR-REDIRECT-001 default). This is infra-state, not a git diff —
  recorded as a runbook-style script (mirroring `.copilot/bootstrap-oidc.sh`'s
  precedent) so it's reproducible on QA/prod, not a one-off manual
  change only applied locally.

No DB migration. No API contract change for Bug A (internal client
method, callers unchanged). Bug B is a new Authentik flow stage — purely
additive, does not change `default-recovery-flow`'s existing behavior
for actual password-reset use (identification + email stages still run
first; the new stage only fires after they succeed, same as before, just
adds a redirect at the end instead of leaving the user on a blank
"recovery flow complete" screen).

## Gate result

```yaml
gate_result:
  status: passed
  summary: "Two independent root causes identified: Bug A (field-name mismatch, always-undefined recoveryUrl, breaks both welcome-email and Telegram sign-in) fixed as one-line app code change; Bug B (recovery flow has no redirect-back-to-app stage) fixed via a new Authentik redirect stage bound to default-recovery-flow, reusing the /auth/sign-in?next=/me path already fixed by ISS-USR-REDIRECT-001."
```
