---
code: FR-CMS-003
name: Operator form builder
status: Shipped
module: CMS / Content (CMS)
phase: Phase 1 (V1) / Rebuild M2.6 (V2, Not Started)
---

## Description

Organizers can build custom forms (surveys, applications, feedback forms) via a visual form builder in the operator workspace. Published forms are accessible publicly at `/forms/[slug]`. Form responses are viewable in an operator inbox. Forms can be attached to events as post-event surveys (FR-EVT-006).

## Users

Organizers, Country Admins (create forms); Members / Public (submit forms).

## Functional scope

1. **Form schema** — `forms` Directus collection: `slug`, `title`, `description`, `status` (draft/published/archived), `allow_anonymous` (bool), `country`, `post_event_survey` (bool). `form_fields` related collection: `form_id`, `type`, `label`, `required`, `options` (for select types), `sort`.
2. **Field types** — `short_text`, `long_text`, `scale` (1–5 or 1–10, configurable), `select_one` (radio), `select_many` (checkboxes), `yes_no`, `speaker_rating` (composite: rating + comment per speaker).
3. **Form builder UI** — `/workspace/forms/[id]` (`FormBuilderPanel` island): add/remove/reorder fields (up/down buttons, no drag-drop in V1), set field metadata, preview the form, publish.
4. **Form list** — `/workspace/forms` (`FormsListPanel`): list of forms with status pills, submission counts, "+ New Form" button.
5. **Public form render** — `/forms/[slug]` (`FormRenderer` island): renders the form schema into interactive field components. On submit: `POST /v1/forms/[slug]/submit`. If `allow_anonymous=false` and user is not signed in, shows a sign-in lock message.
6. **Form responses inbox** — `/workspace/forms/[id]/responses` (`FormResponsesPanel`): aggregate stats (NPS histogram for scale fields, yes/no counts, select distributions) + raw responses table (anonymous submissions badged). Client-side paginated (50/500).
7. **Form submission** — Anonymous submissions stored with a random respondent ID. Signed-in submissions linked to the user.

## Acceptance criteria

- [ ] An organizer can create a form with multiple field types and publish it.
- [ ] A published form is accessible at `/forms/my-form-slug` and renders all fields.
- [ ] Submitting the form saves a response; it appears in the `/workspace/forms/[id]/responses` inbox.
- [ ] An `allow_anonymous=false` form shows a sign-in lock to unsigned visitors.
- [ ] A draft form is not accessible at `/forms/[slug]` (returns 404).
- [ ] The responses panel shows correct aggregate stats for scale fields (histogram distribution).
- [ ] Reordering fields in the builder changes their display order in the public form.

## Notes

- V2 (web-next): form builder and responses are M2.6 milestone (not started). The public form render page (`/forms/[slug]`) is M3.3 (not started).
- `FormRenderer` supports all 7 field types. Adding new field types requires both schema changes and a new renderer component.
