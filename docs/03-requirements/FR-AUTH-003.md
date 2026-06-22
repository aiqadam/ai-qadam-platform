---
code: FR-AUTH-003
name: Google and GitHub OAuth
status: Planned
module: Auth (AUTH)
phase: Roadmap Sprint 7
---

## Description

Members can sign in or register using their Google or GitHub account. These are configured as Authentik Sources — the platform handles no OAuth credentials directly. The web sign-in page shows three sign-in options: email/password, Google, and GitHub.

## Users

Members.

## Functional scope

1. **Authentik Google Source** — Add a Google OAuth2 Source in Authentik admin; register an OAuth2 app in Google Cloud Console with appropriate scopes (`email`, `profile`); set the callback URL to Authentik's redirect URI.
2. **Authentik GitHub Source** — Same pattern with a GitHub OAuth App.
3. **Web sign-in UI** — `/auth/sign-in` renders three sign-in buttons: "Sign in with email", "Continue with Google", "Continue with GitHub". Each initiates the standard Authentik OIDC authorize flow (same `/v1/auth/login?provider=...` entry point, different Authentik binding).
4. **Account deduplication** — Authentik deduplicates by email across all sources. A user who registered with email/password and then signs in with Google (same email) lands on the same account.

## Acceptance criteria

- [ ] Clicking "Continue with Google" on `/auth/sign-in` redirects to Google's OAuth consent screen and, after approval, lands the user at `/me` with a valid session.
- [ ] Clicking "Continue with GitHub" follows the same flow via GitHub.
- [ ] A user who signed up via email can subsequently sign in via Google (same email) and accesses the same account (no duplicate).
- [ ] The sign-in page clearly shows all three options without layout issues on mobile.
- [ ] If a user denies OAuth consent on Google/GitHub, they are returned to `/auth/sign-in` with a clear error message.
- [ ] `client_id` and `client_secret` for Google/GitHub are stored only in Authentik's env / secrets; never in web or API code.

## Notes

- Implementation is primarily Authentik configuration, not code. Estimated ~3 PRs of mostly config (see `sprint-5-to-8-plan.md` Sprint 7).
- Telegram widget button on sign-in page is added in FR-AUTH-002; all four options should coexist.
