---
code: FR-REG-001
name: Event registration flow
status: Shipped
module: Registrations (REG)
phase: Phase 1 (V1)
---

## Description

Members register for events from the event detail page. The platform enforces capacity limits, creates a registration record, sends a confirmation email with a QR code, and awards registration points. One member may have at most one active registration per event.

## Users

Members.

## Functional scope

1. **Register endpoint** — `POST /v1/events/:id/register`. Body: `{ referredBy?, acquisitionSource? }` (optional attribution from cookies). Creates a `registrations` row with `status=confirmed` (or `waitlist` if capacity full — see FR-REG-002).
2. **Idempotency** — A second `POST /v1/events/:id/register` for the same member + event returns the existing registration (no duplicate, `200` not `201`).
3. **Capacity enforcement** — If `event.capacity` is set and confirmed registration count ≥ capacity, new registrations go to `waitlist` status.
4. **QR token** — On registration confirmed, generate a unique `qr_token` for this registration. Stored on the `registrations` row. Used for check-in (FR-REG-004).
5. **Confirmation email** — After confirmed registration, send a transactional email (via Listmonk / Resend) with: event details, venue, QR code image (linked to `/checkin?code=<qr_token>`), and add-to-calendar links (Google Calendar, iCal).
6. **Registration sidebar UI** — `RegistrationSidebar` on event detail page. States by auth + registration status:
   - **Unsigned** → "Sign in to register" CTA.
   - **Confirmed** → "You're registered ✓" + QR + "Cancel" link.
   - **Waitlist** → "You're on the waitlist" + "Leave waitlist" link.
   - **Event full (no registration)** → "Join waitlist" CTA.
   - **Cancelled / no_show / checked_in** → appropriate label.
7. **Points** — On confirmed registration, award `+5` points (see FR-GAM-001).
8. **CRM activity** — On registration, log a `registered` activity to Twenty CRM (FR-CRM-003).

## Acceptance criteria

- [ ] Clicking "Register" as a signed-in member creates a registration with `status=confirmed` when capacity is available.
- [ ] Registering for the same event twice returns the existing registration without creating a duplicate.
- [ ] The confirmation email arrives within 60 seconds with a scannable QR code.
- [ ] The QR code links to `/checkin?code=<qr_token>`.
- [ ] An unsigned visitor sees a "Sign in to register" prompt, not the register button.
- [ ] Registering for an event at capacity creates a `waitlist` registration (not `confirmed`).
- [ ] `+5` points are awarded and visible on the leaderboard after registration.
- [ ] `POST /v1/events/:id/register` with no auth token returns `401`.
- [ ] A temporary Telegram-only account (FR-AUTH-002) can register but earns no points until upgraded.

## Notes

- Attribution data (`referredBy`, `acquisitionSource.first_touch`, UTM) is captured from cookies by the `RegistrationSidebar` and sent in the registration body.
- The sidebar uses optimistic local state: the count updates immediately on register/cancel click, without waiting for the full re-fetch.
