# ISS-USR-REDIRECT-003 — Self-registration needs a real one-click sign-in mechanism

| Field | Value |
|---|---|
| ID | ISS-USR-REDIRECT-003 |
| Severity | blocker |
| Module | api/auth (registration) + infra/authentik |
| Status | open |
| Reported | 2026-07-28 |
| Resolved | — |
| Workflow | — (not yet scheduled — needs design input) |
| Reporter | Orchestrator (discovered during ISS-USR-REDIRECT-002 live verification) |
| Business-Process | BP-UAT-013 |

## Symptom

New members who self-register via `POST /v1/auth/register` are meant to
receive a welcome email with a one-click "sign in for the first time"
link (`registration.service.ts`'s `dispatchWelcomeEmail`,
`AuthentikClient.createRecoveryLink`). Once
[ISS-USR-REDIRECT-002](ISS-USR-REDIRECT-002.md)'s field-name bug is
fixed, the email is sent and the link correctly points at Authentik's
real recovery-flow URL — but clicking it does **not** sign the user in.

## Root cause

Authentik's `POST /api/v3/core/users/{pk}/recovery/` link does not
behave like a one-time login token. Live-verified via Playwright:
loading a freshly-minted link renders Authentik's identification stage
prompting **"Enter the email associated with your account"** — the same
form a genuine "I forgot my password" visitor sees. It does not
pre-authenticate the session; it only pre-selects/validates that a user
exists for the recovery flow's next step (send another email with an
actual recovery token). This is Authentik's stock password-recovery UX,
not a magic-link sign-in mechanism — the two are different concepts that
this codebase's comments (`authentik.client.ts`'s module doc, prior to
[ISS-USR-REDIRECT-002](ISS-USR-REDIRECT-002.md)'s fix) conflated.

## Why this needs design input, not just a code fix

Two materially different directions exist, with different trust/security
properties:

1. **A real Authentik one-time-login mechanism.** Authentik supports
   token-based flows (e.g. binding a stage with `pretend_user_exists`
   plus a lookup on a pre-issued token, or Authentik's own "impersonate"
   / admin-token flows) that CAN skip the email-re-entry step — but this
   needs research into which Authentik primitive actually delivers
   "click link → authenticated session, no further input," and whether
   that primitive is safe to expose to self-registration (vs. being
   reserved for admin-initiated flows like `admin-invites`, which this
   codebase already uses for a **different**, deliberately-consent-gated
   purpose — operator invites, not open self-registration).
2. **An app-owned short-lived JWT magic link.** Mint a signed,
   short-TTL JWT server-side (mirroring the existing `FLOW_COOKIE`
   pattern in `auth.controller.ts`/`auth.service.ts`), email a link
   containing it, and add a new endpoint that verifies the JWT and
   completes sign-in directly — bypassing Authentik's recovery flow
   entirely for this specific case. More app-code surface, but full
   control over the UX and security properties (can enforce true
   one-time-use, exact TTL, no re-prompt).

Both are legitimate; the choice affects security review scope,
Authentik config ownership, and how much new app code is needed. This is
exactly the kind of trade-off AGENTS.md §13 says must be surfaced to the
user with Concern/Evidence/Proposal, not decided unilaterally inside an
issue-resolution bugfix workflow — hence filing this as a new issue
rather than continuing to expand `wf-20260728-fix-140`'s scope.

## Impact if unaddressed

New members who self-register currently have **no working password-free
first-sign-in path** via the welcome email — they must either already
know to go to `/auth/sign-in` and use "forgot password" manually, or the
UX silently fails to deliver on what the welcome email promises
("Tap the link below to sign in for the first time"). This is a real
gap in the registration flow's first-time UX, not a cosmetic issue.

## Suggested next step

Schedule a `requirement-development` workflow (not `issue-resolution` —
this needs the RequirementAnalyst step to weigh the two directions
against `docs/04-development/security/security.md` and
`docs/04-development/architecture/auth-architecture.md` before
CodeDeveloper touches anything) once the user is ready to prioritize it.
