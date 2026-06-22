---
code: FR-EVT-005
name: Operator event control panel (/workspace/events/[id])
status: Shipped
module: Events (EVT)
phase: Phase 1 (V1) / Rebuild M2.2 (V2, Shipped)
---

## Description

The operator event control panel is the single workspace cabinet for managing a specific event after it's been created in Directus. It provides a real-time view of registrations, a CSAT dashboard, a followup checklist, and the ability to patch event metadata without re-entering Directus.

## Users

Organizers, Country Admins, Super Admin.

## Functional scope

1. **Route** — `/workspace/events/[id]` (operator auth required).
2. **Metadata edit** — Patch: `title`, `starts_at`, `ends_at`, `venue_name`, `capacity`, `status`. Changes are sent to `PATCH /v1/workspace/events/:id`.
3. **Registration breakdown** — Real-time counts per status: confirmed, waitlist, checked_in, no_show, cancelled. List of registrations with member names.
4. **CSAT panel** — After event ends: aggregate CSAT scores from post-event forms (if a survey form is attached). Shows distribution histogram.
5. **Followup checklist** — Persistent checklist per event: "Send recording links", "Mark no-shows", "Upload materials", "Publish recap". Each item toggleable.
6. **Transition actions** — Cancel event button (triggers FR-NTF-001 cancellation notification).

## Acceptance criteria

- [ ] Patching event title from the control panel updates the Directus event record and reflects on the public event page.
- [ ] Registration counts update in real time (or on page refresh) as members register/cancel.
- [ ] The followup checklist persists state between operator visits.
- [ ] Only operators for the event's country can access the control panel (cross-country access returns 403).
- [ ] Cancelling an event via the panel sends a notification to all confirmed registrants.

## Notes

- V2 (web-next): shipped as M2.2 milestone (`EventControlPanel` block).
- CSAT form attachment is configured at the event level in Directus (FR-CMS-004 for form building). The control panel only reads aggregate CSAT data.
