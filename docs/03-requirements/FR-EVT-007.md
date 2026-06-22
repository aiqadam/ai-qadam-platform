---
code: FR-EVT-007
name: Event topic tagging and interest matching
status: Planned
module: Events (EVT)
phase: Roadmap Sprint 5.5
---

## Description

Events are tagged with one or more community topics (AI/ML, MLOps, Python, etc.). Members select topics they're interested in. When an event is published, only members whose interests intersect with the event's topics receive an announcement. This drives the notification fan-out system (FR-NTF-002).

## Users

Organizers (tag events); Members (select interests).

## Functional scope

1. **Topics collection** — New Directus collection `topics`: `id`, `slug`, `name` (English), `name_ru`, `country` (FK, country-scoped), `sort` (int). Seeded with 6–8 starter topics per country: AI/ML, MLOps, Python, Frontend, Backend, Data Engineering, Hardware/Robotics, Research.
2. **Event → topics junction** — `event_topics` M2M: `event` (FK), `topic` (FK). Directus validation: at least one topic required on publish.
3. **User → topics junction** — `user_interests` M2M: `user` (FK to `directus_users`), `topic` (FK), `created_at`. Managed via `/me/preferences` and bot `/interests` command.
4. **Tagging in Directus** — Organizers tag events via multi-select in the Directus event editor.
5. **Interest filtering for notifications** — `GET /v1/internal/announce-event` (internal): given `event_id`, resolves users matching `(country = event.country AND user_interests ∩ event_topics ≠ ∅ AND notification_email_enabled AND not opted-out)`. Used by FR-NTF-002 fan-out.
6. **Bot `/interests` command** — Lists available topics for the user's country as a checklist. Toggle topic = upsert/delete `user_interests` row via API.
7. **Web preferences page** — Topic interest checkboxes on `/me/preferences` (FR-USR-004).

## Acceptance criteria

- [ ] At least one topic must be selected before an event can be published (Directus validation rejects empty `event_topics`).
- [ ] A member who selects "AI/ML" receives announcements only for events tagged with "AI/ML".
- [ ] A member with no interests set receives no announcement emails (opt-in model).
- [ ] Adding a new topic in Directus makes it available for both event tagging and member interest selection.
- [ ] Cross-tenant leak check: a UZ member does not receive announcements for KZ events.
- [ ] Bot `/interests` shows the current topics and lets the user toggle them; changes persist.

## Notes

- Depends on the notification dispatcher being in place (FR-NTF-001 / T6.0).
- The `user_interests` data also informs the bot's event recommendations (FR-BOT-002).
- Dedupe: a user who matches multiple topics for the same event receives only one announcement (dedupe on `notifications_sent.(user, event, channel, kind)`).
