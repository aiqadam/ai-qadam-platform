---
code: FR-NTF-001
name: Notification dispatcher — transactional email
status: Shipped
module: Notifications (NTF)
phase: Phase 1 (V1) / Sprint 5.5 (refactored)
---

## Description

The platform sends transactional emails for key lifecycle events: registration confirmation, waitlist notification, promotion from waitlist, event cancellation, and post-event survey. Email delivery uses Listmonk (self-hosted) or Resend as the sending backend. A dispatcher service routes notifications to the appropriate channel(s) based on user preferences.

## Users

Members (receive emails); System (sends).

## Functional scope

1. **Notification dispatcher** — `apps/api/src/modules/notifications/dispatcher.service.ts`. Signature: `dispatch({ userId, template, data, channels? })`. Default channels: `['email']`; future: `['email', 'telegram']`. Looks up user's enabled channels and sends to each in parallel. Each channel adapter handles its own failure (try/catch + log; never throws or blocks other channels).
2. **Email channel adapter** — Calls Resend/Listmonk API. Maps `template + data` to the email template. Records send to `notifications_sent` collection (dedupe key: `user_id + event_id + channel + kind`).
3. **Templates** — All transactional email templates:
   - `registration_confirmed` — "You're registered for {event}." Includes QR code image, venue, add-to-calendar links.
   - `waitlist_confirmed` — "You're on the waitlist for {event}."
   - `waitlist_promoted` — "Good news — a spot opened up for {event}!"
   - `event_cancelled` — "Unfortunately, {event} has been cancelled."
   - `event_announced` — "New event: {event} — check it out." (FR-NTF-002)
   - `event_reminder_24h` — "{event} is tomorrow." (FR-NTF-003)
   - `post_event_survey` — "How was {event}? Tell us in 1 minute." (FR-EVT-006)
4. **Idempotency** — `notifications_sent` table records each send. Before dispatching, check for an existing row with the same `(user_id, event_id, channel, kind)`. Skip if found.
5. **Email content standards** — All emails: branded (AI Qadam mark), localized (ru/en), plain-text alternative, unsubscribe link.

## Acceptance criteria

- [ ] A registration confirmation email is sent within 60 seconds of `POST /v1/events/:id/register`.
- [ ] Sending the same notification twice (same user, event, channel, kind) delivers only once (idempotency via `notifications_sent`).
- [ ] If the email channel fails (Resend API error), the error is logged but no exception propagates to the caller.
- [ ] `notifications_sent` table has a row for each successfully dispatched notification.
- [ ] All emails include an unsubscribe link that sets the user's relevant consent to revoked.

## Notes

- The dispatcher was refactored in Sprint 5.5 (T6.0) to support multiple channels. Before that, it was a direct `EmailService` call from each trigger point.
- Telegram channel adapter is added in FR-NTF-004. The dispatcher is designed for it from day one.
- Email templates are managed in Listmonk (or as code-side templates if using Resend's React Email approach).
