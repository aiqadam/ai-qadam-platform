---
code: FR-REG-004
name: Event check-in via QR code
status: Shipped
module: Registrations (REG)
phase: Phase 1 (V1) / Rebuild Phase 3 (V2, Not Started)
---

## Description

At event check-in, organizers scan a member's QR code (shown on `/me` or the confirmation email) using the `/checkin` web page or the Telegram bot. A successful scan transitions the registration to `checked_in`, awards attendance points, and triggers any post-check-in flows.

## Users

Organizers / Country Admins (scanning); Members (presenting QR code).

## Functional scope

1. **QR token** — Each confirmed registration has a unique `qr_token` stored in `registrations.qr_token`. The token encodes to a QR code displayed as `https://uz.aiqadam.org/checkin?code=<qr_token>`. The token is valid only during the event: from `starts_at - 30 min` to `ends_at`.
2. **Web check-in page** — `/checkin` (SSG shell, `CheckinForm` island). Reads `?code=` from the URL. On "Check in" button click: calls `POST /v1/checkin/:code`. States: no-code, checking, success (event title + time), already-checked-in, event-not-active, invalid-code.
3. **Check-in endpoint** — `POST /v1/checkin/:code` (no auth required — token is the credential). Validates token, checks event timing, sets `registrations.status=checked_in`, records `checked_in_at`, awards points, returns event context `{ eventTitle, startsAt }`.
4. **Points award** — `+20` attendance points (FR-GAM-001). Streak update (FR-GAM-004).
5. **Idempotency** — Checking in twice returns `200` with status `already_checked_in`; no double point award.
6. **Bot check-in** — Operator can scan via the Telegram bot (FR-BOT-003). Bot calls the same check-in endpoint via internal API.
7. **QR code display** — QR visible on `/me` dashboard (in registration list) and in the confirmation email. QR code generated client-side via `qrcode.react`.
8. **CRM activity** — Log `attended` activity to Twenty CRM (FR-CRM-003).

## Acceptance criteria

- [ ] Scanning a valid QR code on `/checkin` sets the registration to `checked_in` and shows the event name.
- [ ] Scanning the same QR code twice returns `already_checked_in` with no duplicate points awarded.
- [ ] Scanning a QR code more than 30 minutes before event start returns an error.
- [ ] Scanning a QR code after event end returns an expired error.
- [ ] An invalid or tampered QR token returns `404`.
- [ ] `+20` points appear on the leaderboard after check-in.
- [ ] The QR code on `/me` is scannable by a standard QR reader (correct encoding, adequate size).

## Notes

- V2 (web-next): not started (M3.5 milestone).
- The `/checkin` page is intentionally simple — no authentication required; the token is the credential. This allows fast check-in even when the organizer's device is on a different network.
- The organizer-facing bot check-in for runtime attendance management is covered in FR-BOT-003.
