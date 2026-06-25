---
code: BP-UAT-012
name: "Points engine and leaderboard"
status: Ready
process_ref: "docs/03-requirements/FR-GAM-001.md"
environment: "http://localhost:4321"
seed_required: true
last_run: ""
---

# BP-UAT-012 — Points Engine and Leaderboard

## Purpose

Verifies that the points engine correctly awards and displays points, that
`points_total` stays consistent with the `activities` audit log, and that the
leaderboard at `/leaderboard` reflects updated rankings. Also verifies the
attendance streak counter (FR-GAM-004): check-in increments it, and the
streak is visible on the member's public profile. Source:
[FR-GAM-001](../../03-requirements/FR-GAM-001.md),
[FR-GAM-003](../../03-requirements/FR-GAM-003.md),
[FR-GAM-004](../../03-requirements/FR-GAM-004.md).

## Acceptance Criteria

- [ ] AC-1: Leaderboard at `/leaderboard` loads, shows the top-3 podium, and ranks members by `points_total`.
- [ ] AC-2: A signed-in user's row is highlighted in the leaderboard table.
- [ ] AC-3: After a check-in, the leaderboard reflects the updated ranking within 60 seconds (Redis cache TTL).
- [ ] AC-4: Switching `?window=year` filters rankings to the current calendar year only.
- [ ] AC-5: The points total on `/me` matches the sum visible on the leaderboard.
- [ ] AC-6: `streak_current` increments after each `meetup`-format check-in and is shown on `/me` and `/u/[handle]`.
- [ ] AC-7: Temporary accounts (`is_temporary=true`) do not appear on the leaderboard.
- [ ] AC-8: Clicking a member's handle on the leaderboard navigates to their `/u/[handle]` page.

## Seed Fixtures Required

| Fixture | Description |
|---|---|
| `uat-member` | Member account (`uat-member@aiqadam.test`), country=`uz`, `is_temporary=false`, `handle='uat-member'` |
| `uat-member-top` | Member in `uz` with the highest `points_total` in seed data (e.g. 500 pts) — appears in podium position 1 |
| `uat-member-2nd` | Member in `uz`, 2nd highest points (e.g. 300 pts) |
| `uat-member-3rd` | Member in `uz`, 3rd highest points (e.g. 200 pts) |
| `uat-temp-member` | Member in `uz` with `is_temporary=true`, some points — should NOT appear on leaderboard |
| `uat-checkin-reg` | Confirmed registration for `uat-member` on a live `meetup`-format event, `qr_token` exposed as `UAT_QR_TOKEN_LB`. `starts_at = now - 15min`, `ends_at = now + 2h`. |
| `uat-member-points-before` | `uat-member`'s `points_total` before check-in (for AC-3 delta). `streak_current` before check-in recorded as `UAT_STREAK_BEFORE`. |

## Steps

### Step 001 — View public leaderboard (unauthenticated)

**AC ref:** AC-1, AC-7

**Precondition:** User is not signed in.

**Action:** Navigate to `http://localhost:4321/leaderboard`.

**Expected UI state:** Leaderboard page loads. Top-3 podium shows `uat-member-top` (rank 1), `uat-member-2nd` (rank 2), `uat-member-3rd` (rank 3) with correct points. `uat-temp-member` does NOT appear anywhere in the list. No row is highlighted (no signed-in user). Page loads in under 2 seconds.

**Screenshot label:** `step-001-leaderboard-public`

---

### Step 002 — Verify temporary account excluded

**AC ref:** AC-7

**Precondition:** Step 001 completed. Leaderboard is visible.

**Action:** Scroll through the full leaderboard list and search for `uat-temp-member`'s display name.

**Expected UI state:** `uat-temp-member` does not appear on the leaderboard at any rank.

**Screenshot label:** `step-002-temp-account-absent`

---

### Step 003 — Sign in and see highlighted row

**AC ref:** AC-2

**Precondition:** Step 001 completed.

**Action:** Sign in as `uat-member@aiqadam.test`. Navigate to `/leaderboard`.

**Expected UI state:** `uat-member`'s row is visually highlighted (different background, bold text, or other distinguishing style). Other rows are not highlighted.

**Screenshot label:** `step-003-self-row-highlighted`

---

### Step 004 — Click member handle to public profile

**AC ref:** AC-8

**Precondition:** Step 001 or Step 003 completed. Leaderboard is visible.

**Action:** Click on `uat-member-top`'s handle/name link in the leaderboard.

**Expected UI state:** Browser navigates to `/u/<handle-of-uat-member-top>`. Public profile page loads showing that member's name, points, and event count.

**Screenshot label:** `step-004-handle-click-profile`

---

### Step 005 — Switch to year window

**AC ref:** AC-4

**Precondition:** Step 001 or Step 003 completed. Leaderboard is visible.

**Action:** Click the **This year** tab/button (or navigate to `/leaderboard?window=year`).

**Expected UI state:** Leaderboard reloads with rankings based on points earned in the current calendar year only. Total ordering may differ from the all-time view if some members' points were earned in prior years. URL updates to include `?window=year`.

**Screenshot label:** `step-005-year-window`

---

### Step 006 — Trigger check-in to update points

**AC ref:** AC-3, AC-5, AC-6

**Precondition:** Step 003 completed (signed in as `uat-member`). `UAT_QR_TOKEN_LB` is available. `uat-member`'s points baseline and streak baseline recorded.

**Action:** Navigate to `http://localhost:4321/checkin?code=<UAT_QR_TOKEN_LB>`. Click **Check in**.

**Expected UI state:** Check-in success page shows event name. Navigate to `/me` — points total is now `UAT_MEMBER_POINTS_BEFORE + 20`. `streak_current` is `UAT_STREAK_BEFORE + 1`.

**Screenshot label:** `step-006-checkin-for-leaderboard`

---

### Step 007 — Leaderboard reflects updated ranking within 60s

**AC ref:** AC-3, AC-5

**Precondition:** Step 006 completed. 60 seconds have elapsed (or navigate to leaderboard immediately and wait for cache TTL).

**Action:** Navigate to `/leaderboard` (or reload if already there after waiting up to 60s).

**Expected UI state:** `uat-member`'s row shows the updated `points_total` (includes the +20 from check-in). The row's rank position may have moved up if the new total surpasses other members.

**Screenshot label:** `step-007-leaderboard-updated`

---

### Step 008 — Streak visible on profile

**AC ref:** AC-6

**Precondition:** Step 006 completed. Streak incremented.

**Action:** Navigate to `/u/uat-member` (public profile page for `uat-member`).

**Expected UI state:** Streak counter shows `UAT_STREAK_BEFORE + 1`. Points total also matches.

**Screenshot label:** `step-008-streak-on-public-profile`

---

## Negative Scenarios

### Negative 001 — Temporary account absent from leaderboard

**AC ref:** AC-7

**Precondition:** `uat-temp-member` has non-zero `points_total` in seed.

**Action:** Use Playwright `request.get` to call `GET http://localhost:3000/v1/leaderboard?window=all&limit=200`. Parse the response JSON and look for `uat-temp-member`'s user ID.

**Expected rejection:** `uat-temp-member` does not appear in the API response array. `is_temporary=true` members are excluded at the query level.

**Screenshot label:** `neg-001-temp-excluded-api`

---

### Negative 002 — Double check-in does not double-increment streak

**AC ref:** AC-6

**Precondition:** Step 006 completed. Streak is `UAT_STREAK_BEFORE + 1`.

**Action:** Navigate to `http://localhost:4321/checkin?code=<UAT_QR_TOKEN_LB>` again. Click **Check in**.

**Expected rejection:** "Already checked in" state. Navigate to `/me` — `streak_current` is still `UAT_STREAK_BEFORE + 1`, not `UAT_STREAK_BEFORE + 2`.

**Screenshot label:** `neg-002-no-double-streak`

---

### Negative 003 — `points_total` matches activities sum

**AC ref:** AC-1 (data integrity)

**Precondition:** Step 006 completed.

**Action:** Use Playwright `request.get` to call `GET http://localhost:3000/v1/auth/me` (with `uat-member` bearer token) to get `points_total`. Also call a debug or admin endpoint (if available) to get the sum of `activities.points_awarded` for `uat-member`.

**Expected rejection:** The two values are equal. If they differ, it is a data integrity bug — record as a failure.

**Screenshot label:** `neg-003-points-consistency`

---

## Notes

- Redis cache TTL for the leaderboard is 60 seconds. Step 007 may show stale data if run within 60s of the check-in. UATRunner should wait the full 60s before screenshotting, or note "cache still warm" if the updated rank is not yet visible.
- Streak reset behavior (no-show breaks streak) is covered in FR-REG-005 (no-show tracking) and is not tested here; that process is not yet in scope for UAT.
- AC-4 (`?window=year`) is only meaningfully different from `?window=all` if some seed members earned their points in prior years. If all seed data was created in the current year, both windows will produce the same ranking — UATRunner should note this and record it as an `expected-same` observation, not a failure.
- Negative 003 requires either a `/v1/debug/points-consistency` endpoint (engineer-only) or direct Directus admin access to verify the activities sum. Mark as `deferred` if neither is available in the UAT environment.
