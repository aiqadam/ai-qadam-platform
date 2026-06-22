---
code: FR-SPK-001
name: Speaker profiles
status: Shipped
module: Speakers (SPK)
phase: Phase 1 (V1)
---

## Description

Speakers have dedicated profiles that aggregate their bio, expertise areas, talks history, and links to slides and recordings. A speaker is a Member with the `speaker` role. Their profile is accessible from event pages and a speaker directory.

## Users

Speakers (manage own profile); Public (view).

## Functional scope

1. **Speaker record** — `speakers` table (or Directus collection) fields: `user_id` (FK to `directus_users`), `bio_md`, `expertise_tags` (array), `photo` (asset), `linkedin_url`, `twitter_url`, `github_url`, `website_url`, `company`, `role`.
2. **Talks history** — `event_speakers` junction: links a speaker to an event with `status` (proposed/accepted/confirmed/declined) and `talk_title`, `talk_description_md`, `slides_url`, `recording_url`.
3. **Speaker card on event page** — On `/events/[id]`, confirmed/accepted speakers are shown with photo, name, role/company, and talk title. Card links to the speaker's public profile.
4. **Speaker profile page** — Part of the public `/u/[handle]` profile page (FR-USR-007): a "Speaker" section shows talk history when `users.role` includes `speaker`.
5. **Speaker directory** — (If implemented) A page listing all confirmed speakers across events.
6. **Materials** — Slides/recordings linked on the event detail page and accessible from the speaker's profile.

## Acceptance criteria

- [ ] A speaker's name and talk title appear on the event detail page for their accepted/confirmed talks.
- [ ] A speaker's profile on `/u/[handle]` shows their bio, expertise, and talk history.
- [ ] Slides and recordings linked to a talk are accessible from both the event page and the speaker profile.
- [ ] A speaker with `status=proposed` or `status=declined` does NOT appear on the public event page.
- [ ] Only users with the `speaker` role can access speaker profile editing (if a self-serve edit flow is implemented).

## Notes

- CFP (Call For Papers / speaker self-application) is explicitly out of scope for Phase 1. Speaker management is done by organizers in Directus.
- The `users.handles` endpoint (`/v1/users/handles?directusIds=...`) is required to resolve Directus user IDs to platform handles, since handles live in the NestJS `users` table, not Directus.
