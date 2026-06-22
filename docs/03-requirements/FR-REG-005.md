---
code: FR-REG-005
name: No-show tracking and post-event registration close
status: Shipped
module: Registrations (REG)
phase: Phase 1 (V1)
---

## Description

After an event ends, confirmed registrations that were never checked in are automatically marked as `no_show`. This data informs the CSAT dashboard, operator reports, and future registration prioritization. No-shows may affect gamification (streak broken) but do not result in point deduction.

## Users

System (automated); Organizers (view).

## Functional scope

1. **No-show marking** — A Directus scheduled flow (or BullMQ cron job) fires N hours after `events.ends_at` (configurable, default 2 hours). Finds all `registrations` for that event where `status=confirmed` (not `checked_in`, not `cancelled`). Updates them to `status=no_show`.
2. **Streak impact** — When a no-show is recorded, `GamificationService` evaluates whether the member was "in range" for the streak (attended at least some meetups in the streak window). If so, their `streak_current` resets to 0 (see FR-GAM-004).
3. **Operator view** — No-show counts visible in the operator event control panel (FR-EVT-005) under the registration breakdown.
4. **Post-event lock** — After `ends_at`, registrations for that event are locked: members cannot cancel, and the register endpoint returns `409 Event has ended`. Waitlist entries are cleaned up (set to `cancelled`) when the event closes.
5. **CRM activity** — Log `no_show` activity to Twenty CRM for each affected member (FR-CRM-003).

## Acceptance criteria

- [ ] Two hours after an event ends, all confirmed (non-checked-in) registrations are marked `no_show`.
- [ ] A no-show resets the member's `streak_current` to 0 (streak broken).
- [ ] The operator control panel shows the correct no-show count after the post-event sweep.
- [ ] Attempting to cancel a registration after event end returns `409`.
- [ ] Attempting to register for a past event returns `409 Event has ended`.
- [ ] Waitlist registrations are cancelled (not left as waitlist) after event close.
- [ ] The no-show sweep is idempotent: running it twice on the same event does not double-mark records.

## Notes

- The N-hour delay exists to account for late arrivals and organizer manual check-in completion. The exact threshold is configurable per event in Directus (field: `no_show_grace_hours`, default `2`).
- No-show does not affect total `points_total` (points were never awarded for a no-show; only registration's +5 points stand, which are not revoked for no-shows, only for cancellations).
