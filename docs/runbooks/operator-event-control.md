# Runbook: Operator event control panel (`/workspace/events`)

**Audience:** country leads, super-admins, day-of organisers.
**Pre-reading:** [ADR-0033](../adr/0033-community-member-graph.md), [operator-cohort-builder.md](./operator-cohort-builder.md), [operator-announce-composer.md](./operator-announce-composer.md).
**Ships:** F-S3.4 cabinet #3.

## What this cabinet does

Single landing for the per-event workflow that used to span Directus + spreadsheets:

- **List view** (`/workspace/events`): every event in the system, newest first, with registration counts (registered / waitlisted / attended) and capacity at a glance.
- **Detail view** (`/workspace/events/[id]`): edit basic metadata (title, description, status, dates, capacity, location), see the registration breakdown, work through the post-event followup checklist.

The cabinet phase-tags each event by clock time:

| Phase | Trigger | What the cabinet emphasises |
|---|---|---|
| **Pre-event** | `now < starts_at` | metadata edit + registration count |
| **Live now** | `starts_at ≤ now ≤ ends_at` | big "Open check-in →" CTA pointing to `/checkin` scanner |
| **Post-event** | `ends_at < now` | followup checklist becomes the primary surface |

## Editable fields

Through the cabinet you can change: **title, description, status, capacity, location**. Status transitions allowed: `draft → published → cancelled` (and any backward direction, e.g. accidentally-published can be sent back to draft).

**NOT editable through the cabinet** (engineer-only in Directus admin):
- `format` (m2o to `event_types` — changes event-type semantics)
- `country` (tenant boundary; changing it migrates the event to another country)
- `starts_at` / `ends_at` (a follow-up PR will add date editing once we settle on how to handle existing registrations)
- `eula_id` (governance change requires explicit ADR-0033-style review)

## Followup checklist

Four kinds (per `event_followups.kind` enum):

| Kind | What done = |
|---|---|
| `retrospective` | Operator wrote a retrospective note. Markdown body optional but encouraged. |
| `thank_you_sent` | Thank-you announcement went out via `/workspace/announce` to the attendees cohort. |
| `recap_posted` | Blog post / Telegram channel / social post live. URL in the body_md. |
| `sponsor_report_delivered` | Per-sponsor digest delivered. Until F-S3.5 cabinet automates this, toggle manually. |

Each row has a checkbox + collapsible markdown notes. Marking complete writes `completed_at = now()`. Unchecking sets it back to `null`. Notes survive the toggle.

## Failure modes + recovery

### "Event not found" on a known UUID
- Most common: a country lead from another country is trying to access an event scoped to a country they don't operate. Today every operator can see every event (country-scoped reads land with [ADR-0021](../adr/0021-rbac-manifest.md) RBAC). If you genuinely can't see it, check the event's `country` field in Directus.
- Less common: the event was deleted. Check `directus_revisions` for the row.

### "Save" button stays disabled
You haven't changed anything. The form computes `dirty` against the loaded values; identity = no save.

### Capacity edit complains
Capacity must be a non-negative integer OR blank. Blank = unlimited. **Lowering capacity below current `registered` count silently allows it** — the registration flow won't reject existing rows, but new registrations will go to `waitlisted`. If you need to bulk-cancel registrations after lowering, that's a Directus admin task today (operator UX for bulk-cancel is a follow-up).

### Followup checkbox toggles but body doesn't save
The checkbox and "Save notes" are independent PUTs. Each round-trips to `/api/v1/workspace/events/<id>/followups/<kind>`. If the checkbox flips but the notes don't save, the second PUT failed — check the inline error message under the row.

### Day-of "Open check-in" button missing
The button only renders when `starts_at ≤ now ≤ ends_at`. If you need check-in scanner access at any other time, go directly to `/checkin`.

## Related

- `apps/api/src/modules/workspace/events.service.ts` + `events.controller.ts` — backend (REST proxy over Directus)
- `apps/web/src/components/workspace/EventsListPanel.tsx` — list view island
- `apps/web/src/components/workspace/EventControlPanel.tsx` — detail view island
- `apps/api/test/events-service.spec.ts` — 8 unit tests covering counts aggregation, 404, patch, upsert followup paths
- `infrastructure/directus/bootstrap.sh` `[event_followups]` — collection that backs the checklist
