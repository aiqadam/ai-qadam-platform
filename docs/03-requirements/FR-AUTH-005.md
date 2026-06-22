---
code: FR-AUTH-005
name: Telegram account linking (existing web account → Telegram)
status: Planned
module: Auth (AUTH)
phase: Roadmap Sprint 6
---

## Description

A member who already has a web account (email/password or social OAuth) can link their Telegram identity to it. After linking, they can sign in via Telegram and receive Telegram notifications. The link is initiated from `/me` on the web and completed via a one-time deep-link in the bot.

## Users

Members with existing web accounts.

## Functional scope

1. **Link initiation (web)** — On `/me`, a "Link Telegram" button calls `POST /v1/auth/telegram/link-token` → API generates a one-time link token (short expiry, single use) → web displays `t.me/aiqadam_bot?start=link_<token>` as a clickable link or QR.
2. **Link completion (bot)** — Bot detects `link_<token>` in `/start` payload → calls `POST /v1/internal/telegram/link-user` with `{ token, telegram_id, telegram_username, ... }` → API verifies token, verifies HMAC, sets `attributes.telegram_id` on the existing Authentik user.
3. **State update** — After linking, `/me` shows "Linked: Telegram (@username)" on next load.
4. **Notification unlock** — Linking Telegram enables the Telegram notification channel for that user (see FR-NTF-004).

## Acceptance criteria

- [ ] Clicking "Link Telegram" on `/me` shows a deep-link or QR code.
- [ ] Opening the deep-link in Telegram and tapping Start causes the bot to call `link-user`; the API links the Telegram identity to the correct web account.
- [ ] Using the same link token a second time returns an error (single-use).
- [ ] After successful linking, `/me` shows the linked Telegram handle.
- [ ] A user with `telegram_id` already set cannot link a different Telegram account without unlinking first (returns `409 Conflict`).
- [ ] The link token expires after 10 minutes if unused.

## Notes

- Depends on FR-BOT-001 (bot scaffold) being deployed.
- This is the reverse of FR-AUTH-002 (Telegram-first signup). Together they cover all identity-linking scenarios.
