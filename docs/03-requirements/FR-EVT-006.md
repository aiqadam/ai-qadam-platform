---
code: FR-EVT-006
name: Post-event survey
status: Shipped
module: Events (EVT)
phase: Phase 1 (V1) / Rebuild Phase 3 (V2, Not Started)
---

## Description

After an event ends, attendees receive an email (and optionally a Telegram DM) with a link to a short CSAT / post-event survey. The survey is operator-configured per event. Results feed into the operator control panel's CSAT dashboard.

## Users

Members who attended (received survey link); Organizers (view results).

## Functional scope

1. **Survey form** — Each event can have an optional `post_event_survey_form` linked in Directus (FK to `forms` collection, see FR-CMS-004). The form can include rating scales, text fields, and yes/no questions.
2. **Survey page** — `/events/[id]/survey` — public page (token-gated via tokenized link from the post-event email). Renders the form via `FormRenderer`. Returns `404` if no survey form is attached to the event.
3. **CSAT form** — `/feedback/csat` — Simpler alternative: single 1–5 star rating + optional comment, accessed via a tokenized `?t=` link embedded in the post-event email. No sign-in required; token serves as credential.
   - `POST /v1/feedback/csat` — accepts `{ token, rating, comment }`. Returns `202` on success, `409` if already submitted.
4. **Post-event trigger** — A Directus scheduled flow fires some hours after the event ends (configurable). It queries confirmed/checked_in registrations and dispatches the survey link via the notification dispatcher (FR-NTF-001).
5. **Survey context** — `/events/[id]/survey` shows event title/date as context above the form (fetched via `forms-api`).
6. **Results** — Aggregate CSAT data visible in the operator event control panel (FR-EVT-005).

## Acceptance criteria

- [ ] Clicking the post-event survey link from the email opens the correct form with event context shown.
- [ ] Submitting a CSAT rating returns `202`; submitting again with the same token returns `409`.
- [ ] `/events/[id]/survey` returns `404` if the event has no linked survey form.
- [ ] The survey token expires after 7 days (link from older event emails returns `410 Gone`).
- [ ] Survey responses appear in the operator control panel's CSAT panel.
- [ ] An event with no attendees (all no-shows) does not trigger a survey send.

## Notes

- V2 (web-next): not started (M3.6 milestone).
- The post-event survey trigger is a Directus scheduled flow, not a BullMQ job, since the timing is relative to the event end time.
