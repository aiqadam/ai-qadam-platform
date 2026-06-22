---
code: FR-USR-004
name: Notification and comms preferences (/me/preferences)
status: Shipped
module: Users (USR)
phase: Phase 1 (V1) / Rebuild Phase 3 (V2, Not Started)
---

## Description

Members control which types of communications they receive from the platform. Preferences include email topics, Telegram notification toggle (once linked), and per-purpose GDPR consents. This is separate from the skills/bio profile editing (FR-USR-002).

## Users

Members.

## Functional scope

1. **Email consent toggles** — Three email-topic consents: `newsletter` (community news and updates), `sponsor_offer` (partner promotions), `speaker_promo` (speaker program announcements). Each is a `Granted/Revoked` toggle button.
   - Endpoint: `GET /v1/me/preferences/consents` to load; `PATCH /v1/me/preferences/consents` to update.
2. **Telegram notification toggle** — `notification_telegram_enabled` (bool). Visible only when user has a linked Telegram account. Disabling stops all Telegram DMs.
   - Endpoint: `PATCH /v1/me/profile` (shared with FR-USR-002).
3. **Topic interests** — Multi-select of platform topics; controls which event announcements are sent to the user. Shown on this page and on `/me/profile` (same underlying data, `user_interests` table).
4. **Optimistic UI** — Toggling a consent updates the UI immediately (pending state); reverts if the API call fails.

## Acceptance criteria

- [ ] Toggling a consent and refreshing the page shows the new state (persisted).
- [ ] Revoking `newsletter` stops future newsletter sends to that user (verified by not appearing in newsletter segment queries).
- [ ] Telegram toggle is hidden until the user links a Telegram account.
- [ ] After revoking Telegram notifications, the user does not receive Telegram DMs from the platform.
- [ ] `PATCH /v1/me/preferences/consents` with an unsigned request returns `401`.

## Notes

- In V2 (web-next): not started (M3.2 milestone).
- The 7-purpose GDPR consents (ADR-0033) are split across this page (comms) and `/me/profile` (data-related); ensure the page makes the grouping clear to users.
