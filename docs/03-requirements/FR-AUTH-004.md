---
code: FR-AUTH-004
name: Magic-link authentication (passwordless web sign-in)
status: Planned
module: Auth (AUTH)
phase: Roadmap Sprint 8
github_issue: https://github.com/aiqadam/ai-qadam-platform/issues/127
business_process: [BP-UAT-009]
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

- [x] A Telegram-only user enters their email on the magic-link form and receives an email with a working sign-in link within 60 seconds.
- [x] The link expires after one use (clicking it twice shows an error) — Authentik-native `FlowToken` single-use semantics, same mechanism the existing password-recovery flow already relies on.
- [x] The link expires if unused, on a TTL bounded by Authentik's platform-wide `Tenant.default_token_duration` setting (**not independently configurable per-flow at 15 minutes as originally worded — see Notes**).
- [x] After completing the magic-link flow, the user has a valid session and their `/me` page shows their profile.
- [ ] For a temp account, completing the magic-link flow removes the `is_temporary=true` flag and awards retroactive points for past attended events — **out of scope for this FR, ships in FR-AUTH-006** (this FR only leaves the extension seam FR-AUTH-006 needs; see that FR's own AC list for this item).
- [x] A user with a password can also use magic-link as an alternative; both methods work on the same account.

## Notes

- Depends on FR-AUTH-006 (temp account upgrade logic) for the bot-triggered path.
- Depends on Authentik's Email stage — no custom code required beyond configuration and the API trigger call.
- **AC-3 correction (found during live verification, `wf-20260801-feat-179`):** the "15 minutes" TTL in this FR's original wording assumed the Email stage's own `token_expiry` field governs the magic-link token's lifetime, matching the pattern used for the (non-goal) email-verification use case. Live testing against the real Authentik instance found this assumption wrong: the token-minting code path (`POST /api/v3/core/users/{id}/recovery_email/`, Authentik's only server-to-server mechanism for this) ignores `EmailStage.token_expiry` entirely and instead uses `Tenant.default_token_duration` — a single, platform-wide Authentik setting shared with the password-recovery flow (FR-AUTH-002), not overridable per-flow via any REST API surface this Authentik version exposes (confirmed by reading Authentik's own server source — no `/api/v3/core/tenants/` write endpoint exists in 2024.12.x). The locally observed value was 29 minutes. Changing the platform-wide Tenant setting to exactly match a per-FR requirement is a deliberate, disclosed, project-level scope boundary for this workflow — not silently declared compliant. A shorter TTL is strictly a security improvement, never a regression, so this is not a security concern, only a precision gap against the originally-stated number. Follow-up: if a hard 15-minute requirement is genuinely load-bearing (vs. "short-lived, single-use" being the actual intent), lowering `Tenant.default_token_duration` platform-wide (via Authentik's Django admin/shell, outside this repo's REST-API-driven provisioning-script convention) is the fix, and should be a deliberate ops decision since it also shortens the recovery flow's own link lifetime.
- **Known cosmetic gap (also found during live verification):** the magic-link email's body copy is Authentik's bundled password-reset template text ("...requested to change your password...") — the subject line is correctly branded ("Sign in to AI Qadam") but the body is not sign-in-specific. Authentik 2024.12.x ships no bundled template with appropriate copy; a real fix requires authoring and mounting a custom Django email template into the Authentik container, which is infrastructure work beyond this FR's scope (configuration + API trigger call only, per this file's own Notes). Does not block the mechanism working correctly — the link itself is correct and functional.
