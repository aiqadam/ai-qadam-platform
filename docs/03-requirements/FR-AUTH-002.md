---
code: FR-AUTH-002
name: Telegram authentication (bot deep-link + web widget)
status: Implemented
module: Auth (AUTH)
phase: Roadmap Sprint 6
---

## Description

Users can sign in or register using their Telegram identity. Two entry points exist: (1) the Telegram bot `/start` command — creates a temporary account on first contact; (2) the Telegram Login Widget on the web sign-in page — links a Telegram identity to a full account. Authentik remains the single session authority; the API verifies Telegram's HMAC and drives Authentik's admin API to provision/find the user, then completes the standard OIDC flow.

## Users

Members (new via bot), Members (linking Telegram to existing web account).

## Functional scope

1. **HMAC verification** — `POST /v1/auth/telegram/exchange` accepts Telegram Login Widget fields, verifies `hash` using `HMAC-SHA256(SHA256(BOT_TOKEN), data_check_string)`.
2. **User lookup / provision** — After HMAC verification, the API queries Authentik for a user with `attributes.telegram_id = <id>`. If missing, creates one.
3. **Session hand-off** — API drives Authentik's admin API to mint a one-time login token, then 302-redirects through Authentik's session endpoint → existing `/v1/auth/callback` finishes the OIDC dance.
4. **Bot `/start` temp account** — `POST /v1/internal/telegram/upsert-temp-user` (called by bot service): creates an Authentik user with `attributes.telegram_id`, `attributes.is_temporary=true`, and synthetic email `tg<id>@telegram.local` if not present. Returns `{ directusUserId, country }`.
5. **Web sign-in widget** — Telegram Login Widget JS snippet on `/auth/sign-in` page. On callback, widget POSTs to `/v1/auth/telegram/exchange`. Existing users matched by email if the widget provides one; otherwise new account created.
6. **Country assignment** — On bot `/start`, bot prompts "Set your country: [UZ] [KZ] [TJ]"; persisted to `directus_users.country_preference`.

## Acceptance criteria

- [ ] Submitting a valid Telegram Login Widget response to `/v1/auth/telegram/exchange` returns a redirect that completes the OIDC flow and lands the user at `/me`.
- [ ] Submitting an invalid `hash` to `/v1/auth/telegram/exchange` returns `401`.
- [ ] Bot `/start` for a new Telegram user creates an Authentik user with `is_temporary=true` and a synthetic email; no duplicate is created on a second `/start`.
- [ ] Bot `/start` for an existing Telegram user (already provisioned) returns the existing `directusUserId` without creating a new record.
- [ ] A user who has previously signed in via email and then uses the Telegram Login Widget with the same email is matched to the existing account (not duplicated).
- [ ] `telegram_id` attribute is stored on the Authentik user after first Telegram sign-in.
- [ ] `TELEGRAM_BOT_TOKEN` is only present in bot + API environments; never in the web frontend bundle.

## Notes

- Two HMAC schemes exist in Telegram's docs (Login Widget vs WebApp `initData`) — implementation must use the correct one for each entry point.
- ADR-0015 (bot-scope) and the architectural decisions D1–D4 in `sprint-5-to-8-plan.md` govern the design.
- See also FR-AUTH-005 (account linking) and FR-AUTH-006 (temp account upgrade).

## Implementation status

**API layer implemented** (wf-20260625-feat-027, branch `feature/AUTH-002-telegram-signin`):

- `TelegramAuthService` — HMAC-SHA256 widget verification, Authentik user lookup/provision (with email-match fallback), recovery-link minting.
- `POST /v1/auth/telegram/exchange` — public endpoint, rate-limited (5 req/60 s per IP), 302-redirects to Authentik recovery link.
- `POST /v1/internal/telegram/upsert-temp-user` — `InternalAuthGuard`-protected, idempotent temp-user provisioning.
- `AuthentikClient` extended with `getUserByTelegramId` and `createRecoveryLink` methods.
- `TELEGRAM_BOT_TOKEN` env var added (optional; endpoints return `503` when absent).

**Deferred to subsequent PRs:**

| Deferred item | Future work |
|---|---|
| Telegram Login Widget JS snippet on `/auth/sign-in` page | Web follow-up PR (FR-BOT-001 or standalone) |
| Bot `/start` command handler calling `upsert-temp-user` | FR-BOT-001 |
| Country assignment prompt + `country_preference` write | FR-BOT-001 |
| Account linking from `/me` page | FR-AUTH-005 |
| Temp account upgrade flow | FR-AUTH-006 |
