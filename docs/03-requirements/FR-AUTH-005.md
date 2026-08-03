---
code: FR-AUTH-005
name: Telegram account linking (existing web account → Telegram)
status: Implemented
module: Auth (AUTH)
phase: Roadmap Sprint 6
github_issue: https://github.com/aiqadam/ai-qadam-platform/issues/138
business_process: BP-UAT-009
---

## Description

A member who already has a full web account (email/password or OAuth) can link their
Telegram identity to it by typing `/link` in the AI Qadam bot. After linking, they can
use bot commands that require a linked account and Telegram notifications become active
automatically. Their `/me` page shows the linked Telegram handle.

The account-linking flow is **bot-initiated and email-code-based** (per ADR-0034):
the bot collects the member's registered email, the API sends a 6-digit OTP via email,
the member pastes the code back into the bot, and the API writes the link to
`directus_users.telegram_user_id`.

> **2026-08-03 correction (wf-20260803-feat-198):** The original FR described a
> web-initiated flow (`POST /v1/auth/telegram/link-token` on `/me` → QR/deep-link →
> bot calls `POST /v1/internal/telegram/link-user` → sets `attributes.telegram_id` on
> Authentik). None of that was built. The real design — API layer already
> implemented and tested — is bot-initiated: `POST /v1/telegram/link/start` +
> `POST /v1/telegram/link/confirm`, writing to `directus_users.telegram_user_id`.
> The original endpoint names and Authentik-attribute data model are superseded.
> The "notification unlock" scope item was also incorrect — FR-NTF-004 (Shipped)
> already dispatches Telegram notifications to any member with `telegram_user_id` set,
> independent of this FR.

## Users

Members with existing full web accounts.

## Functional scope

1. **API layer — link/start (ALREADY IMPLEMENTED)** — `POST /v1/telegram/link/start`
   (`TelegramController`, `TelegramService.startLink()`): body `{ tg_user_id, email }`.
   Issues a 6-digit OTP, stores a hashed challenge row in `tg_link_challenges`, sends
   the code via the `telegramLinkCode` email template. OTP TTL: 5 minutes.
   Email-enumeration-safe. Returns `{ challenge_id, sent_to_email_masked }`.

2. **API layer — link/confirm (ALREADY IMPLEMENTED)** — `POST /v1/telegram/link/confirm`
   (`TelegramController`, `TelegramService.confirmLink()`): body
   `{ challenge_id, code, tg_user_id, tg_username? }`. Verifies code (constant-time,
   max 5 attempts before invalidation). On success, PATCHes `directus_users` with
   `{ telegram_user_id, telegram_username, telegram_linked_at, telegram_opted_out_at: null }`.
   Returns `{ member_id, tenant }`. Minor addition: `409 Conflict` guard for re-link
   to a different Telegram account.

3. **Bot `/link` command (NOT YET IMPLEMENTED)** — New handler
   `apps/bot/src/handlers/link.py`. FSM: prompt email → call `link/start` → prompt
   6-digit code → call `link/confirm`. Follows the same pattern as
   `handlers/upgrade.py`. Available to any Telegram user regardless of `is_temp`.
   State always cleared after each outcome.

4. **Web `/me` Telegram status display (NOT YET IMPLEMENTED)** — Read-only section
   on the `/me` page. Shows "@username (linked)" when `directus_users.telegram_user_id`
   is set, or "Not linked — open Telegram and type /link in @aiqadam_bot" otherwise.
   Extend the existing Directus member profile fetch to include `telegram_user_id` and
   `telegram_username`. Phase 1: plain-text instruction only; no QR code.

5. **State update** — After bot `/link` completes, the web `/me` Telegram status
   section reflects the linked state on next page load.

## Acceptance criteria

- [ ] AC-1: A member types `/link` in the bot, provides their registered email, and
      receives a "code sent" confirmation from the bot.
- [ ] AC-2: After entering the correct 6-digit code within 5 minutes, the bot confirms
      the link and `directus_users.telegram_user_id` is set for that member.
- [ ] AC-3: Using the same 6-digit code a second time returns an error (single-use OTP).
- [ ] AC-4: Providing an email not registered to any AI Qadam account returns a
      "no account found" message without leaking email existence.
- [ ] AC-5: After 5 wrong code attempts, the challenge is invalidated and the member
      must restart with `/link`.
- [ ] AC-6: Attempting to link when `telegram_user_id` is already set to a *different*
      Telegram account returns `409 Conflict`; re-linking the *same* account is
      idempotent.
- [ ] AC-7: After the bot `/link` flow completes, reloading `/me` shows the linked
      Telegram handle.
- [ ] AC-8: A member without a linked Telegram account sees a "not linked" status on
      `/me` with instructions to use the bot `/link` command.

## Notes

- The API linking layer (Functional scope 1 and 2) is already implemented and fully
  tested in `apps/api/test/telegram-link-service.spec.ts`. No API redesign needed.
- Depends on FR-BOT-001 (bot scaffold — Shipped).
- This is the reverse direction from FR-AUTH-002 (Telegram-first signup).
- FR-AUTH-007 (Planned) adds a "Connected accounts" management panel including unlink
  actions; FR-AUTH-005 is limited to the initial link flow and status display.
- FR-NTF-004 (Shipped) already dispatches Telegram notifications to any member with
  `telegram_user_id` set — the link created by this feature automatically enables
  Telegram delivery without additional integration work.
