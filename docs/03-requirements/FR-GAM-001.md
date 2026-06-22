---
code: FR-GAM-001
name: Points system
status: Shipped
module: Gamification (GAM)
phase: Phase 1 (V1)
---

## Description

Members earn points for community actions. Points are the primary gamification currency driving the leaderboard. Every point transaction is logged in an audit trail for transparency. Points can be revoked (e.g., on registration cancellation).

## Users

Members (earn points); Public (view on leaderboard).

## Functional scope

1. **Point actions and amounts** —
   - Register for an event: `+5`
   - Cancel a registration: `-5` (revoke)
   - Attend an event (check-in): `+20`
   - Give a talk as a speaker: `+50`
   - Bring a friend who attends (referral badge trigger): `+25` (one-time per referred attendee)
   - No-show: `0` (no deduction, but streak resets — FR-GAM-004)
2. **Audit trail** — Every point transaction is recorded in the `activities` table: `user_id`, `action_type` (e.g., `event_registered`, `event_attended`, `speaker_spoke`), `points_awarded` (positive or negative), `event_id` (when applicable), `created_at`.
3. **Denormalized total** — `users.points_total` is maintained as a denormalized sum for fast leaderboard queries. Updated atomically with each transaction via a DB-level transaction (not application-level UPDATE).
4. **Award service** — `GamificationService.awardPoints(userId, action, amount, context)` — single point of entry for all awards. Validates action, logs to `activities`, updates `points_total`.
5. **Revoke service** — `GamificationService.revokePoints(userId, action, amount, context)` — records a negative transaction and decrements `points_total`.
6. **Retroactive backfill** — On temporary account upgrade (FR-AUTH-006), the service backfills points for all past `checked_in` registrations.

## Acceptance criteria

- [ ] Registering for an event increments `points_total` by 5 and adds a positive row to `activities`.
- [ ] Cancelling a registration decrements `points_total` by 5 and adds a negative row to `activities`.
- [ ] Checking in adds 20 points; the leaderboard position updates accordingly.
- [ ] Running the award service twice for the same `(user, action, event)` does not double-award points (idempotency check in the service).
- [ ] `points_total` matches the sum of all `activities.points_awarded` for that user at all times.
- [ ] Retroactive backfill on account upgrade adds the correct historical points without duplicating already-awarded transactions.

## Notes

- `points_total` is denormalized for read performance. If it ever diverges from the `activities` sum (e.g., due to a bug), a reconciliation job can be run: `UPDATE users SET points_total = (SELECT COALESCE(SUM(points_awarded), 0) FROM activities WHERE user_id = users.id)`.
- Future consideration: point multipliers for events on special occasions. Design the award service to accept an optional multiplier param.
