---
code: FR-NTF-003
name: 24-hour event reminder
status: Planned
module: Notifications (NTF)
phase: Roadmap Sprint 5.5
---

## Description

Registered members receive a reminder notification 24 hours before each event they are confirmed for. Reminder is sent via email (and Telegram when the bot is live). One reminder per member per event (deduplicated). Deduplication prevents re-sending if the cron fires multiple times.

## Users

Members with confirmed registrations.

## Functional scope

1. **Trigger** — Directus scheduled flow (hourly cron). Finds all events where `starts_at` is between `now + 23h` and `now + 25h` (2-hour window to tolerate missed cron ticks). For each such event, resolves all `registrations` with `status=confirmed`.
2. **Dedupe** — Checks `notifications_sent` for `(user_id, event_id, channel, kind='reminder_24h')`. Skips if already sent.
3. **Dispatch** — For each eligible registration, calls the notification dispatcher (FR-NTF-001) with template `event_reminder_24h`. Channels: email (always), Telegram (when adapter live and user has `notification_telegram_enabled=true` and linked `telegram_id`).
4. **Content** — "Reminder: {event} is tomorrow." Event title, date/time, venue, "View event" CTA, QR code image (same as confirmation email).
5. **Waitlist exclusion** — Members with `status=waitlist` do not receive a reminder (they are not confirmed to attend).

## Acceptance criteria

- [ ] A confirmed registrant receives a reminder email approximately 24 hours before the event start time.
- [ ] A waitlisted member does not receive a reminder.
- [ ] Running the reminder cron twice within the same hour does not send duplicate reminders (dedupe via `notifications_sent`).
- [ ] Members who cancelled (`status=cancelled`) do not receive a reminder.
- [ ] The reminder email contains a working link to the event page and the QR check-in code.

## Notes

- Depends on FR-NTF-001 (dispatcher) and FR-EVT-007 (topics/interests) infrastructure being in place.
- The 2-hour cron window (`now+23h` to `now+25h`) ensures reminders are sent even if the scheduler drifts by up to one interval.
- Telegram reminder is gated on FR-NTF-004 (Telegram channel adapter).
