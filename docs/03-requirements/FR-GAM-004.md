---
code: FR-GAM-004
name: Attendance streaks
status: Shipped
module: Gamification (GAM)
phase: Phase 1 (V1)
---

## Description

Members build a streak by attending consecutive meetups. The streak counter increments on each check-in and resets when a member misses a meetup they were in range to attend (i.e., the meetup happened in their country and they did not attend). Streak milestones unlock streak badges (FR-GAM-002).

## Users

Members.

## Functional scope

1. **Streak fields** — `users.streak_current` (int, default 0): current consecutive meetup streak. `users.streak_best` (int): all-time highest streak. `users.streak_last_event_id`: the last event contributing to the streak.
2. **Streak increment** — When a member checks in (`status=checked_in`) at a `meetup`-format event, `GamificationService.incrementStreak(userId, eventId)` runs: increments `streak_current` by 1, updates `streak_best` if `streak_current > streak_best`, sets `streak_last_event_id`.
3. **Streak break** — After each meetup ends, for each member who had `confirmed` or `checked_in` registration on the PREVIOUS meetup (establishing they were "in range"), check if they attended the CURRENT meetup. If not (i.e., `no_show` or no registration), set `streak_current = 0`.
   - "In range" definition: the member's `country_preference` matches the event's country.
   - Members who had no registration for the missed meetup are not penalized (only members who were registered but no-showed).
4. **Streak display** — `streak_current` is shown on `/me` dashboard and public profile. A flame emoji or streak icon is used visually.
5. **Badge milestones** — Streak badges triggered at: 3 (bronze), 6 (silver), 12 (gold) consecutive meetups (FR-GAM-002).
6. **Streak reset on no-show** — Handled by FR-REG-005 post-event sweep; GamificationService is called from there.

## Acceptance criteria

- [ ] Attending 3 consecutive meetups sets `streak_current=3` and awards the Bronze Streak badge.
- [ ] Missing a meetup (no-show, was registered) resets `streak_current` to 0.
- [ ] Missing a meetup with no registration does not reset the streak.
- [ ] `streak_best` is preserved even when `streak_current` resets.
- [ ] The streak count appears on `/me` and on the public `/u/[handle]` page.
- [ ] Streak milestones (3, 6, 12) award the respective streak badge exactly once.

## Notes

- "Consecutive meetups" applies only to the `meetup` format (not workshops, hackathons, etc.). Other event formats do not affect streaks.
- Streak evaluation is triggered by the post-event no-show sweep (FR-REG-005). The timing of streak reset corresponds to when no-shows are marked (2 hours after event end).
