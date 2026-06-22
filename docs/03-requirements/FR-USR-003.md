---
code: FR-USR-003
name: Member dashboard (/me)
status: Shipped
module: Users (USR)
phase: Phase 1 (V1) / Rebuild Phase 3 (V2, In Progress)
---

## Description

The `/me` dashboard is a signed-in member's home on the platform. It shows their identity, upcoming registrations with check-in QR codes, community stats, activity heatmap, earned badges, and suggested upcoming events they haven't registered for yet.

## Users

Members (own dashboard).

## Functional scope

1. **Identity header** — Avatar (initials fallback), display name, role chip (member/speaker/organizer/admin). Profile completeness nudge shown when completeness < 80%: "Your profile is X% complete. [Complete profile]".
2. **Next-event hero card** — Gradient card showing the next event the user is registered for (title, date, venue). Contains a QR code (`qrcode.react`) linking to `/checkin?code=<qr_token>`.
3. **Stat cards (3)** — "Upcoming registrations", "Events attended", "On waitlist" — counts derived from `/v1/registrations/mine`.
4. **Activity heatmap** — 13-week GitHub-style contribution grid. Each cell = a week; filled cells = weeks with at least one `checked_in` registration. Data from `registrations.checked_in_at`.
5. **Badges strip** — Up to 6 most-recently-earned badges as category-tinted pills. Hidden if user has zero badges. Sourced from `GET /v1/me/badges`.
6. **Registrations list** — All registrations with status badge (confirmed/waitlist/checked_in/cancelled). Each row shows event title, date, and QR code for confirmed/checked_in entries.
7. **Suggested events** — SSR-fetched upcoming events for the user's country, filtered to exclude ones they're already registered for. Max 3 shown.
8. **Quick actions** — Links to: Edit profile, Browse events, View leaderboard.

## Acceptance criteria

- [ ] An unsigned visitor to `/me` sees a call-to-action to sign in (not a 401 error page).
- [ ] After sign-in, `/me` loads within 2 seconds on a 4G connection.
- [ ] The QR code on each confirmed registration encodes the correct check-in URL.
- [ ] The 13-week heatmap correctly highlights weeks where the user attended at least one event.
- [ ] Suggested events do not include events the user has already registered for.
- [ ] The badge strip is hidden when the user has zero badges; shows up to 6 when they have badges.
- [ ] Stat card counts match the actual registration records.

## Notes

- V2 (web-next) status: `/me/profile` page exists (consent + skills editors only); `/me` dashboard hub, heatmap, badges strip, stat cards, and QR registrations are not yet ported (M3 milestone).
- QR code for check-in is also shown in the registration confirmation email (FR-NTF-001).
