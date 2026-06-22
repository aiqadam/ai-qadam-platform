---
code: FR-CRM-003
name: Activity sync — events and registrations to CRM
status: Planned
module: CRM (CRM)
phase: Roadmap Sprint 5
---

## Description

Registration and attendance events are logged to Twenty CRM as Activities on the corresponding Person record. This gives the operator team a timeline view of each community member's engagement: what they registered for, attended, cancelled, or was promoted from waitlist.

## Users

System (automated sync); Country Admins, Super Admin (view in CRM).

## Functional scope

1. **Activity sync endpoint** — `POST /v1/internal/crm/log-activity`. Body: `{ directusUserId, eventTitle, eventId, kind, occurredAt }`. `kind` values: `registered`, `waitlisted`, `cancelled`, `attended`, `promoted`, `no_show`.
2. **CRM client method** — `crm-client.ts → logActivity(personId, activity)`: looks up the Twenty Person by `directusUserId` (via `sync-contact` cross-reference or a direct Twenty query), then creates a Twenty Activity or Note on that Person.
3. **Directus flow triggers** — Three Directus flows wire the activity sync:
   - `crm-activity-on-create` — fires on `registrations.items.create`. Calls `log-activity` with `kind=registered` (if status=confirmed) or `kind=waitlisted` (if status=waitlist).
   - `crm-activity-on-update` — fires on `registrations.items.update`. Calls `log-activity` based on the new `status`: cancelled → `kind=cancelled`, checked_in → `kind=attended`, waitlist→confirmed → `kind=promoted`, confirmed→no_show → `kind=no_show`.
   - (Optional) `crm-activity-on-event-cancel` — fires when an event is cancelled, logs activity for all confirmed registrants.
4. **Person lookup** — The `log-activity` endpoint looks up the Twenty Person by `directusUserId` at call time. No local cache in Phase 1 (simple query per call; optimize if needed).
5. **Idempotency** — If the same `(directusUserId, eventId, kind)` combination is logged twice, the second call is a no-op (check `notifications_sent` or a CRM-side dedup field).

## Acceptance criteria

- [ ] Registering for an event via the web creates an `Activity: registered` on the Person's CRM timeline within 10 seconds.
- [ ] Cancelling a registration creates an `Activity: cancelled` on the CRM timeline.
- [ ] Attending an event (check-in) creates an `Activity: attended` on the CRM timeline.
- [ ] Being promoted from waitlist creates an `Activity: promoted` on the CRM timeline.
- [ ] Logging the same activity twice does not create duplicate CRM entries.
- [ ] Activity sync does not block the registration API: if Twenty is unreachable, the registration completes and the sync is retried asynchronously.

## Notes

- Twenty's exact Activity/Note data model should be confirmed at implementation time — field names evolve across versions. The `crm-client.ts` wrapper abstracts this.
- The `log-activity` endpoint is internal (`X-Internal-Token`); never called directly from the web or bot.
- Async retry: if the sync fails, log the failure and re-attempt via a BullMQ job (max 3 retries, exponential backoff). Do not block the primary registration flow.
