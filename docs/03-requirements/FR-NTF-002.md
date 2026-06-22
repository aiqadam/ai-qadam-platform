---
code: FR-NTF-002
name: Event announcement fan-out
status: Planned
module: Notifications (NTF)
phase: Roadmap Sprint 5.5
---

## Description

When an event is published, the platform sends an announcement to all members whose topic interests intersect with the event's topics, for the same country. Delivery is via email (and Telegram when the bot is live). One announcement per member per event (deduplicated).

## Users

Members who have opted into at least one matching topic.

## Functional scope

1. **Trigger** — Directus flow `events-announce-on-publish`: action hook on `events.items.create` where `status=published`, and on `events.items.update` where `status` flips from `draft` to `published`. Re-publishing an already-published event does NOT re-trigger.
2. **Audience resolution** — For the event's country, find users where:
   - `user_interests` contains at least one topic that intersects `event_topics`
   - `notification_email_enabled = true`
   - Not in `notifications_sent` for this `(user, event, channel, kind='event_announced')` (dedupe).
   - Excludes users with `is_temporary=true` (no email to send to).
3. **Fan-out** — For each matched user, call `POST /v1/internal/announce-event` (internal endpoint). The API dispatches via the notification dispatcher (FR-NTF-001) using template `event_announced`.
4. **Rate control** — If audience > 1000 members, fan-out is enqueued as a BullMQ job with controlled concurrency. Otherwise direct dispatch.
5. **Telegram channel** — When the Telegram channel adapter is live (FR-NTF-004), announcements fan out to Telegram DMs for users with `notification_telegram_enabled=true` and a linked `telegram_id`. The Telegram send is via the Bot API directly from the NestJS API (not through the bot service).
6. **Content** — Email + Telegram message: event title, date/time, venue, format chip, "Register now" CTA button (links to event page).

## Acceptance criteria

- [ ] Publishing a new event sends announcement emails only to members who have at least one matching topic interest.
- [ ] A member with no topic interests set receives no announcement.
- [ ] Publishing the same event twice does not send a duplicate announcement.
- [ ] A member in a different country (KZ) does not receive announcements for UZ events.
- [ ] Users with `notification_email_enabled=false` are excluded.
- [ ] The announcement email includes a working "Register now" link to the event page.
- [ ] For large audiences (> 1000), the fan-out completes within 10 minutes without overloading the email service.

## Notes

- Depends on FR-EVT-007 (topic tagging on events and user interests).
- Depends on FR-NTF-001 (notification dispatcher).
- Telegram fan-out in this FR is gated on FR-NTF-004 being deployed.
