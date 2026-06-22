---
code: FR-NTF-004
name: Telegram notification channel adapter
status: Planned
module: Notifications (NTF)
phase: Roadmap Sprint 6
---

## Description

The notification dispatcher (FR-NTF-001) gains a Telegram channel adapter. This enables all transactional notifications — registration confirmation, reminders, promotions, event announcements — to be delivered as Telegram DMs in addition to email. The NestJS API sends directly to the Telegram Bot API; the bot service handles only inbound commands.

## Users

Members with linked Telegram accounts and `notification_telegram_enabled=true`.

## Functional scope

1. **Channel adapter** — `TelegramChannelAdapter.dispatch({ userId, template, data })` in the notifications module. Lookup path: `userId → Authentik attributes.telegram_id → Telegram Bot API sendMessage`.
2. **Eligibility check** — Before sending: user must have `telegram_id` set in Authentik attributes AND `notification_telegram_enabled=true`. If either is absent, adapter returns `{ status: 'skipped', reason: 'no_telegram_id' | 'opted_out' }` and logs to `notifications_sent` with `status=skipped`.
3. **Message rendering** — Templates rendered as Telegram-safe HTML subset: `<b>`, `<i>`, `<u>`, `<s>`, `<a>`, `<code>`, `<pre>`. No unsupported HTML tags (stripped on send).
4. **Inline buttons** — Key notification types include an inline keyboard button:
   - Registration confirmed: `[Open event page]`
   - Reminder: `[View event]`, `[Check in]` (on event day)
   - Promotion from waitlist: `[Open event page]`
5. **Rate limiting** — Respect Telegram Bot API rate limit: 30 messages/second globally. The adapter uses the existing BullMQ outbox/dispatcher rate limiter (per ADR-0034).
6. **Failure handling** — If the Telegram API returns an error (user blocked the bot, chat not found), the error is logged to `notifications_sent` with `status=failed` and does not block the email channel.
7. **Audit** — Every Telegram send (success, failure, skip) is logged to `notifications_sent` with full result metadata.

## Acceptance criteria

- [ ] A member who has linked Telegram (FR-AUTH-005) and `notification_telegram_enabled=true` receives a Telegram DM for each notification event.
- [ ] A member with `notification_telegram_enabled=false` does not receive Telegram DMs even if linked.
- [ ] A member who blocked the bot gets an error log in `notifications_sent` but the email is still sent.
- [ ] Registration confirmation DM includes an "Open event page" inline button that deep-links to the event.
- [ ] Sending 100 notifications does not exceed Telegram's 30/sec rate limit.
- [ ] The bot service is not involved in outbound DM sending (all outbound comes from the NestJS API directly).

## Notes

- Per the architecture (ADR-0034 and D6 in `sprint-5-to-8-plan.md`): the bot service is inbound-only. All outbound Telegram messages come from the NestJS API.
- Depends on FR-AUTH-002 / FR-AUTH-005 (telegram_id on user records) and FR-BOT-001 (bot deployed so users can interact with it).
