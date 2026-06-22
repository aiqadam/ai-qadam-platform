---
code: FR-NTF-005
name: User notification preferences and topic interests
status: Planned
module: Notifications (NTF)
phase: Roadmap Sprint 5.5
---

## Description

Members control which notifications they receive and for which topics. Preferences include a per-channel toggle (email on/off, Telegram on/off) and a topic interest list. These preferences gate all fan-out notifications (FR-NTF-002, FR-NTF-003). Preferences are managed on `/me/preferences` (web) and via bot `/interests` command.

## Users

Members.

## Functional scope

1. **New fields on `directus_users`** —
   - `notification_email_enabled` (bool, default `true`)
   - `notification_telegram_enabled` (bool, default `true`, inert until Sprint 6)
   - `country_preference` (FK to `countries`, defaults from first tenant sign-in)
   - `telegram_id` (bigint, populated by Sprint 6)
2. **Topic interests table** — `user_interests`: `user` (FK), `topic` (FK), `created_at`. See FR-EVT-007 for the topic catalog.
3. **Web preferences page** — `/me/preferences` (FR-USR-004): displays the two channel toggles and a topic checklist for the user's country. Saving topic changes calls `POST/DELETE /v1/me/profile/interests/:id`.
4. **Bot `/interests` command** — Lists topics for the user's country as inline keyboard toggle buttons. Each tap upserts or deletes a `user_interests` row via API.
5. **API endpoints** —
   - `GET/PATCH /v1/me/preferences/consents` — channel toggles and email-topic consents.
   - `POST /v1/me/profile/interests` — add topic interest.
   - `DELETE /v1/me/profile/interests/:id` — remove topic interest.
6. **Effect on notifications** — `notification_email_enabled=false` suppresses ALL email notifications for that user, regardless of other settings. Per-topic interests affect only fan-out announcements (FR-NTF-002), not transactional messages (confirmation, reminder, promotion).

## Acceptance criteria

- [ ] Setting `notification_email_enabled=false` stops all email notifications (including reminders and announcements) for that user.
- [ ] Setting `notification_telegram_enabled=false` stops all Telegram DMs.
- [ ] Toggling a topic off in bot `/interests` immediately stops announcement emails for events with only that topic.
- [ ] `country_preference` defaults to the first country subdomain the user signs in on.
- [ ] Transactional emails (registration confirmation, promotion) are sent regardless of topic interests.

## Notes

- The `notification_telegram_enabled` field is wired in this sprint but is only effective after FR-NTF-004 (Telegram adapter) is deployed.
- `notification_email_enabled=false` is a hard off for all emails. If users want finer control (e.g., "keep reminders, stop announcements"), that requires per-template preferences — out of scope for this sprint.
