# 01 — Requirement Validation

**Workflow:** wf-20260802-feat-192-auth-003-social-oauth  
**Agent:** RequirementAnalyst  
**Date:** 2026-08-02

---

## Raw Input

**FR code:** FR-AUTH-003  
**Source:** `docs/03-requirements/FR-AUTH-003.md`, handoff `wf-20260802-feat-192-auth-003-social-oauth`  
**GitHub issue:** https://github.com/aiqadam/ai-qadam-platform/issues/128  
**Stated requirement:** Members can sign in or register using their Google or GitHub account via Authentik Sources. The web sign-in page shows three sign-in options: email/password, Google, GitHub.

---

## Analysis

### Completeness issues found

Three implementation gaps exist at the boundary between this requirement and the current codebase. None are requirement-level ambiguities; all are CodeDeveloper-resolvable details.

**Gap 1 — `sign-in.astro` behavior change.**  
`apps/web-next/src/pages/auth/sign-in.astro` already has a UI (from FR-AUTH-004). The page needs two new provider buttons (Google, GitHub) and `?error=oauth_denied` error display added.

**Gap 2 — `provider=` parameter not implemented in the API.**  
`GET /v1/auth/login` currently only accepts `?next=`. FR-AUTH-003 says each social button uses `/v1/auth/login?provider=google|github`. The Authentik mechanism is the `source=<slug>` query parameter on the OIDC authorize URL. CodeDeveloper must: (a) add `?provider=` to `GET /v1/auth/login`, (b) add `provider?: string` to `startAuthorization()` input, (c) validate against `['google', 'github'] as const`, (d) append `source: provider` to `oidc.authorizationUrl()` when set.

**Gap 3 — OAuth denial error path undefined.**  
AC-5 says "if a user denies OAuth consent, they are returned to `/auth/sign-in` with a clear error message." Currently `GET /v1/auth/callback?error=access_denied` causes `openid-client` to throw an `OPError`, re-thrown as unhandled 500. The CodeDeveloper must add an early check in `AuthController.callback()`: if `req.query['error'] === 'access_denied'`, redirect to `/auth/sign-in?error=oauth_denied`.

### Conflicts with existing features

None blocking. FR-AUTH-002 (In Progress) also modifies `sign-in.astro` — layout must be 4-button-ready.

### Architectural feasibility

Confirmed feasible. The existing `/v1/auth/callback` is the single OIDC convergence point; Google and GitHub sign-ins produce a standard `id_token` that `upsertByAuthentikSubject()` already handles. Email deduplication is handled by Authentik. Credentials never touch `apps/web` or `apps/api`.

---

## Formalized Requirement

**Identifier:** FR-AUTH-003  
**Feature label:** FEAT-AUTH-3

**Statement:**  
Members can sign in or register using Google or GitHub via Authentik OAuth2 Sources. `/auth/sign-in` renders three options: "Sign in with email", "Continue with Google", "Continue with GitHub". Each social button uses `?provider=google|github` on `GET /v1/auth/login`, which appends `source=<slug>` to Authentik's authorize URL. OAuth denial redirects to `/auth/sign-in?error=oauth_denied`. Credentials stored only in Authentik.

**Files to modify:**

| File | Change |
|---|---|
| `apps/web-next/src/pages/auth/sign-in.astro` | Add Google + GitHub buttons; display `?error=oauth_denied` message |
| `apps/api/src/modules/auth/auth.controller.ts` | Add `?provider=` to login; add `access_denied` early-return in callback |
| `apps/api/src/modules/auth/auth.service.ts` | Add `provider?` to `startAuthorization()`, pass `source` to authorize URL |
| `scripts/provision-authentik-oauth-sources.sh` (new) | Idempotent provisioning for Google + GitHub sources in Authentik |

---

## Acceptance Criteria

**AC-1:** Clicking "Continue with Google" navigates to `GET /v1/auth/login?provider=google&next=/me`, shows Google OAuth consent, lands at `/me` with a valid session.

**AC-2:** Same flow for "Continue with GitHub" via `provider=github`.

**AC-3:** A user who registered with email/password signs in via Google (same email) and gets the same account (no duplicate).

**AC-4:** All three sign-in options visible on 375px-wide mobile viewport without overflow.

**AC-5:** Denying consent on Google/GitHub results in 302 to `/auth/sign-in?error=oauth_denied` with message "Sign-in was cancelled. Please try again."

**AC-6:** No Google/GitHub `client_id` or `client_secret` in any tracked file in `apps/web` or `apps/api`.

**AC-7 (regression):** "Sign in with email" still present and links to `/v1/auth/login` without `provider` param.

**AC-8 (layout readiness):** Adding a fourth button (Telegram, FR-AUTH-002) works without layout redesign.

---

## Gate Result

```
gate_result:
  status: passed
  summary: "FR-AUTH-003 is specific, testable, non-conflicting, architecturally feasible. Three implementation gaps documented for CodeDeveloper."
```
