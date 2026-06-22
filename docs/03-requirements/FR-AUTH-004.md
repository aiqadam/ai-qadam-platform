---
code: FR-AUTH-004
name: Magic-link authentication (passwordless web sign-in)
status: Planned
module: Auth (AUTH)
phase: Roadmap Sprint 8
---

## Description

Users who signed up only via Telegram (no password set) can sign in to the web app by receiving a one-time magic link by email. This is the step-2 upgrade path for temporary accounts (see FR-AUTH-006) and also a recurring passwordless sign-in option for any user. Implemented via Authentik's built-in Email stage.

## Users

Members with Telegram-only accounts; any Member who prefers passwordless sign-in.

## Functional scope

1. **Authentik Email stage** — Configure an Authentik flow `magic-link-login` using the Email stage. This handles both: (a) first-time email verification for temp accounts, and (b) recurring passwordless logins.
2. **Entry point** — On `/auth/sign-in`, a "Sign in with email link" option appears. User enters their email address; the API triggers the Authentik email flow; user receives a link.
3. **Email delivery** — Authentik sends the magic-link email (using the configured SMTP/Listmonk connection). The link expires after a configurable TTL (default: 15 minutes, single use).
4. **Completion** — Clicking the link completes the Authentik flow and issues a session. The user lands at `/me`.
5. **Bot-triggered upgrade** — When a temp user initiates `/upgrade` in the bot, the bot calls `POST /v1/internal/telegram/upgrade-temp` → API triggers the Authentik email flow → user receives a magic link. On completion, `is_temporary=true` is removed and gamification unlocks.

## Acceptance criteria

- [ ] A Telegram-only user enters their email on the magic-link form and receives an email with a working sign-in link within 60 seconds.
- [ ] The link expires after one use (clicking it twice shows an error).
- [ ] The link expires after 15 minutes if unused.
- [ ] After completing the magic-link flow, the user has a valid session and their `/me` page shows their profile.
- [ ] For a temp account, completing the magic-link flow removes the `is_temporary=true` flag and awards retroactive points for past attended events (see FR-AUTH-006).
- [ ] A user with a password can also use magic-link as an alternative; both methods work on the same account.

## Notes

- Depends on FR-AUTH-006 (temp account upgrade logic) for the bot-triggered path.
- Depends on Authentik's Email stage — no custom code required beyond configuration and the API trigger call.
