---
code: FR-EVT-001
name: Event creation and management (operator)
status: Shipped
module: Events (EVT)
phase: Phase 1 (V1)
---

## Description

Organizers and Country Admins create and manage events in Directus CMS. An event has a title, date/time, location, format, description, agenda, capacity, visibility scope, and links to speakers, partners, and materials. Publishing an event triggers a fan-out announcement (FR-NTF-002).

## Users

Organizers, Country Admins, Super Admin.

## Functional scope

1. **Event CRUD in Directus** — Events managed in the `events` Directus collection. Fields: `title`, `slug`, `format` (meetup/workshop/hackathon/conference/online), `starts_at`, `ends_at`, `venue_name`, `venue_address`, `lat`, `lng`, `description_md`, `agenda` (JSON array of timed items), `capacity` (null = unlimited), `status` (draft/published/cancelled), `visibility_scope` (public/members_only/invite_only), `country` (FK), `hero_image` (Directus asset), `external_links` (JSON array), `members_only` (bool), `invite_only` (bool), `post_event_survey_form` (FK to forms).
2. **Event agenda** — The `agenda` field stores a JSON array: `[{ time, title, speaker_id?, duration_min }]`. Displayed as a formatted schedule on the event detail page.
3. **Speakers, sponsors, materials** — Related via junction collections: `event_speakers`, `event_sponsors`, `event_materials`. Managed in Directus.
4. **Operator control panel** — `/workspace/events/[id]` (web, V1 and V2) allows patch of event metadata, followup checklist, and CSAT viewing after the event.
5. **Draft → published transition** — When `status` changes to `published`, a Directus flow fires `events-announce-on-publish` (FR-NTF-002). Re-publishing (draft → published again after an edit) does NOT re-announce.
6. **Cancellation** — Setting `status=cancelled` notifies registered members (see FR-NTF-001).
7. **Multi-language** — Event content supports Russian and English translations via Directus native translations (see FR-EVT-002).

## Acceptance criteria

- [ ] An organizer can create an event in Directus with all required fields and publish it.
- [ ] A draft event is not visible on the public event list.
- [ ] Publishing an event triggers the announcement fan-out exactly once (repeat publish does not re-announce).
- [ ] Cancelling an event sends a notification to all confirmed registrants.
- [ ] The event capacity is enforced: registrations beyond capacity go to waitlist (FR-REG-002).
- [ ] `null` capacity means unlimited; the registration sidebar does not show a capacity counter.
- [ ] Events scoped to `members_only` are only fully visible to signed-in members (public visitors see a teaser).
- [ ] The operator control panel shows registration breakdown and a post-event followup checklist.

## Notes

- Directus is the CMS for event content. The NestJS API reads events via Directus API; it does not write to the `events` collection directly.
- Event i18n is FR-EVT-002. Topic tagging is FR-EVT-007. Materials are part of this FR's scope (linking) but display is FR-EVT-004.
