---
code: FR-BOT-003
name: Bot operator runtime commands
status: Planned
module: Telegram Bot (BOT)
phase: Roadmap Sprint 6
---

## Description

Organizers can manage events in real time via the Telegram bot on event day: monitor live attendance, approve pending registrations, scan QR codes for check-in, and push announcements to registered attendees. These are separate from the member command set and require the `organizer` role.

## Users

Organizers, Country Admins.

## Functional scope

1. **Role gate** — All operator commands check that the calling user has `organizer` or `country_admin` role (resolved via the auth middleware's API lookup). Non-operators receive "You don't have access to this command."
2. **Live attendance** — `/attendance <event_id>` — Shows real-time confirmed / checked-in / waitlist counts for the event. Updates on each call (no live-push; operators re-run the command).
3. **QR scan check-in** — `/scan` — The bot prompts "Send the QR code image." The operator sends a QR code photo; the bot decodes it and calls `POST /v1/checkin/:code`. Returns member name + "Checked in ✓" or error state.
4. **On-the-fly approval** — `/approvals` — Lists pending registration approvals (for `invite_only` events). Each row has "Approve" and "Decline" inline buttons. Approval calls the API approval endpoint.
5. **Push announcement** — `/announce <event_id>` — Sends a message to all confirmed registrants for the event. Bot prompts for the message body, then calls `POST /v1/internal/telegram/push-announcement` → API fans out to all registrants via the notification dispatcher.
6. **Operator /me** — `/me` for operator-role users additionally shows a quick stats card: events managed, total registrations in current period.

## Acceptance criteria

- [ ] A non-operator member calling `/attendance` receives an access-denied message.
- [ ] `/attendance <event_id>` returns up-to-date counts (within 5 seconds of a check-in).
- [ ] Sending a QR code image to `/scan` checks in the member and returns their name.
- [ ] `/scan` with an invalid or expired QR code returns a descriptive error.
- [ ] `/approvals` lists pending approvals with working Approve/Decline buttons.
- [ ] `/announce <event_id>` prompts for a message body, confirms the audience count, and sends the message to all confirmed registrants.
- [ ] Operator push announcement is limited to the operator's own country's events (cross-country access returns "not authorized").

## Notes

- QR scanning uses a Telegram photo message decoded via a Python QR library (e.g., `pyzbar` or `opencv`). The decoded string is the `qr_token` passed to the check-in endpoint.
- Web authoring (event creation, long-form description editing, agenda building, materials upload) remains web-only per ADR-0015 and the bot-scope decision.
- The push announcement from this FR is a direct, unscheduled operator announcement, distinct from the scheduled broadcast composer (FR-CMS-005) which is the web operator tool for planned broadcasts.
