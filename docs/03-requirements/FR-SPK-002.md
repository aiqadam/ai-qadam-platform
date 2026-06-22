---
code: FR-SPK-002
name: Speaker management (operator)
status: Shipped
module: Speakers (SPK)
phase: Phase 1 (V1)
---

## Description

Organizers manage the speaker roster in Directus: adding speakers to events, confirming their participation, uploading materials, and tracking the speaker pipeline (outreach → proposal → confirmed → spoke).

## Users

Organizers, Country Admins.

## Functional scope

1. **Speaker roster in Directus** — The `speakers` collection in Directus is managed by organizers. New speakers are added by creating a Directus user + speaker record. Existing platform members can be promoted to `speaker` role via the admin invite process.
2. **Event–speaker linking** — Organizers link speakers to events via `event_speakers`. They set `status` (proposed → accepted → confirmed), `talk_title`, `talk_description_md`, and optional `slides_url`.
3. **Operator approval workflow** — The approvals queue (`/workspace/approvals`) includes speaker-related approvals (e.g., confirming a speaker's participation).
4. **Speaker outreach playbook** — Internal guidance at `docs/02-business-processes/operator-playbook/speaker-outreach.md`. Not a platform feature, but the workflow tool supports it.
5. **Materials upload** — After a talk, organizers upload slides and recording links to `event_materials` in Directus. Linked to the talk and speaker.
6. **Points award** — When a speaker gives a talk at an event (checked in with `is_speaker=true` status), they earn `+50` points (FR-GAM-001).

## Acceptance criteria

- [ ] An organizer can add a speaker to an event in Directus and set their talk details.
- [ ] Changing a speaker's status to `confirmed` makes them appear on the public event page.
- [ ] A speaker with `status=proposed` does not appear publicly.
- [ ] After a talk, an organizer can upload slides and a recording URL; both appear on the event detail page.
- [ ] A speaker who gives a talk earns `+50` points.

## Notes

- CFP (self-application by speakers) is out of scope for Phase 1. All speaker management is organizer-initiated.
- The `is_speaker=true` flag for check-in-based points can be set by the organizer at check-in time.
