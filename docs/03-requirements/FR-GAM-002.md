---
code: FR-GAM-002
name: Badges and achievements
status: Shipped
module: Gamification (GAM)
phase: Phase 1 (V1)
---

## Description

Members earn badges for milestone achievements. Badges are defined in a catalog (Directus) and awarded automatically by the gamification service. They appear on the member's `/me` dashboard, public profile, and in Telegram bot outputs.

## Users

Members (earn badges); Public (view on profiles).

## Functional scope

1. **Badge catalog** — `badge_definitions` Directus collection: `slug` (unique), `name`, `name_ru`, `description`, `tier` (bronze/silver/gold/special), `icon` (asset), `category` (attendance/community/speaker/milestone/founding), `display_order`, `active` (bool). Seeded during bootstrap.
2. **Badge award record** — `user_badges` table: `user_id`, `badge_slug` (FK), `awarded_at`, `context_json` (event_id, etc.). One row per badge per user (badges are awarded once unless explicitly designed as repeatable).
3. **Award triggers** —
   - **Founding Member** — Users who sign up during Phase 1 launch window. Awarded at account creation by checking `created_at` against the launch window config.
   - **Pioneer** — First person to check in at a new country's first event.
   - **Speaker** — Given a talk at an event (awarded when `event_speakers.status=confirmed` + event ends).
   - **Connector** — Referred at least one member who attended an event.
   - **Streak** (bronze/silver/gold) — Achieved streak milestones (e.g., 3 / 6 / 12 consecutive meetups).
   - Additional badges TBD by operators via Directus (catalog is extensible).
4. **Award service** — `GamificationService.awardBadge(userId, badgeSlug, context)`. Idempotent: awards the badge only if not already held. Logs to `activities` with `action_type=badge_earned`.
5. **Display** — `/me` dashboard shows newest 6 badges as category-tinted pills (`BadgesStrip`). Public profile shows all badges. Telegram bot outputs badge emoji or name.
6. **API** — `GET /v1/me/badges` — returns all badges earned by the authenticated user.

## Acceptance criteria

- [ ] A new user who signs up during the Founding Member window receives the Founding Member badge within 60 seconds.
- [ ] A member who gives a talk at an event receives the Speaker badge after the event ends.
- [ ] Calling `awardBadge` twice for the same `(user, badgeSlug)` does not create duplicate rows.
- [ ] `GET /v1/me/badges` returns all badges for the signed-in user with `awarded_at` timestamps.
- [ ] The badge strip on `/me` shows at most 6 badges (newest first) and is hidden when zero badges.
- [ ] Adding a new badge definition in Directus (`active=true`) makes it available for award triggers without code changes.

## Notes

- Badge catalog is seeded via `infrastructure/directus/bootstrap.sh`. New badges are added by updating the Directus collection.
- Badge tier visual treatment: bronze = amber, silver = gray, gold = yellow, special = purple (via CSS `--badge-{tier}` tokens).
