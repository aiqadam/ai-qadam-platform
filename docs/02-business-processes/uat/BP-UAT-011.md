---
code: BP-UAT-011
name: "QR check-in"
status: Ready
process_ref: "docs/03-requirements/FR-REG-004.md"
environment: "http://localhost:4321"
seed_required: true
last_run: ""
---

# BP-UAT-011 — QR Check-In

## Purpose

Verifies the event day check-in flow at `/checkin`: an organizer navigates to
the check-in page with a member's QR token, the registration transitions to
`checked_in`, +20 attendance points are awarded, and the streak counter
increments. Also verifies idempotency (second scan shows `already_checked_in`
with no duplicate points), timing guards (too early, too late), and invalid
token rejection. Source: [FR-REG-004](../../03-requirements/FR-REG-004.md).

## Acceptance Criteria

- [ ] AC-1: Navigating to `/checkin?code=<valid_token>` and clicking Check In transitions the registration to `checked_in` and shows the event name.
- [ ] AC-2: A second scan of the same token returns `already_checked_in` state; no duplicate +20 points are awarded.
- [ ] AC-3: Scanning a token more than 30 minutes before event start returns an "event not yet active" error.
- [ ] AC-4: Scanning a token after event end returns an "event ended" error.
- [ ] AC-5: An invalid or tampered token returns a 404 / invalid-code error state.
- [ ] AC-6: +20 points are awarded on a successful check-in; the member's total increases by exactly 20.
- [ ] AC-7: The `/checkin` page requires no authentication (token is the credential).

## Seed Fixtures Required

| Fixture | Description |
|---|---|
| `uat-member` | Member account (`uat-member@aiqadam.test`), country=`uz` |
| `uat-event-live-uz` | Published event in `uz`, `starts_at = now - 15min`, `ends_at = now + 2h` (currently live). Seed must compute these relative to now at seed time. |
| `uat-reg-confirmed` | Confirmed registration (`status='confirmed'`) for `uat-member` on `uat-event-live-uz`, with a valid `qr_token`. Seed exposes the token as `UAT_QR_TOKEN`. |
| `uat-event-future-uz` | Published event in `uz`, `starts_at = now + 4h` (more than 30 min away). A confirmed registration exists with token `UAT_QR_TOKEN_FUTURE`. |
| `uat-event-past-uz-checkin` | Past published event in `uz`, `ends_at = now - 1h`. A confirmed registration exists with token `UAT_QR_TOKEN_PAST`. |
| `uat-member-points-baseline` | `uat-member`'s `points_total` before check-in (for AC-6 delta). |

## Steps

### Step 001 — Open check-in page without authentication

**AC ref:** AC-7

**Precondition:** No session cookie. `UAT_QR_TOKEN` is available.

**Action:** Navigate to `http://localhost:4321/checkin?code=<UAT_QR_TOKEN>` in a browser with no active session.

**Expected UI state:** The check-in page loads. A **Check in** button is visible. No sign-in redirect occurs. The page is accessible without authentication.

**Screenshot label:** `step-001-checkin-page-no-auth`

---

### Step 002 — Perform a valid check-in

**AC ref:** AC-1, AC-6

**Precondition:** Step 001 completed. Check-in form is visible with `UAT_QR_TOKEN` pre-populated from the URL.

**Action:** Click the **Check in** button.

**Expected UI state:** Success state appears: event title is shown (e.g. "You're checked in to UAT Event UZ"), confirmation message. No error. The registration status is now `checked_in`.

**Screenshot label:** `step-002-checkin-success`

---

### Step 003 — Verify +20 points awarded

**AC ref:** AC-6

**Precondition:** Step 002 completed.

**Action:** Navigate to `http://localhost:4321/me` (sign in as `uat-member` first if needed). Observe the points total.

**Expected UI state:** `points_total` is exactly 20 more than the seed baseline. The points change is visible on the dashboard.

**Screenshot label:** `step-003-points-after-checkin`

---

### Step 004 — Second scan of same token (idempotency)

**AC ref:** AC-2

**Precondition:** Step 002 completed. Registration is already `checked_in`.

**Action:** Navigate to `http://localhost:4321/checkin?code=<UAT_QR_TOKEN>` again. Click **Check in**.

**Expected UI state:** Page shows "Already checked in" state (or equivalent message). No error banner. Points total does NOT increment a second time (still 20 above baseline).

**Screenshot label:** `step-004-already-checked-in`

---

### Step 005 — Token for event not yet started

**AC ref:** AC-3

**Precondition:** `UAT_QR_TOKEN_FUTURE` is for `uat-event-future-uz` which starts in 4h (> 30 min away).

**Action:** Navigate to `http://localhost:4321/checkin?code=<UAT_QR_TOKEN_FUTURE>`. Click **Check in**.

**Expected UI state:** Error state: "Event hasn't started yet" or "Check-in opens 30 minutes before the event" (or equivalent). Registration remains `confirmed`, no points awarded.

**Screenshot label:** `step-005-event-not-active-yet`

---

### Step 006 — Token for past event

**AC ref:** AC-4

**Precondition:** `UAT_QR_TOKEN_PAST` is for `uat-event-past-uz-checkin` which ended 1 hour ago.

**Action:** Navigate to `http://localhost:4321/checkin?code=<UAT_QR_TOKEN_PAST>`. Click **Check in**.

**Expected UI state:** Error state: "Event has ended" or equivalent. Registration remains `confirmed`, no points awarded.

**Screenshot label:** `step-006-event-ended`

---

## Negative Scenarios

### Negative 001 — Invalid token returns error

**AC ref:** AC-5

**Precondition:** No prior state needed.

**Action:** Navigate to `http://localhost:4321/checkin?code=not-a-real-token`.

**Expected rejection:** Page shows "Invalid code" or "Not found" error state. No registration is updated. No points awarded.

**Screenshot label:** `neg-001-invalid-token`

---

### Negative 002 — No code in URL shows empty state

**AC ref:** AC-1

**Precondition:** No prior state needed.

**Action:** Navigate to `http://localhost:4321/checkin` (no `?code=` param).

**Expected rejection:** Page shows a "no code" state — prompts organizer to scan a QR or enter a code. No check-in attempt is made. No error (this is a valid empty state for the organizer's scanner page).

**Screenshot label:** `neg-002-no-code-param`

---

### Negative 003 — Double check-in does not double-award points

**AC ref:** AC-2

**Precondition:** Step 002 completed. `uat-member` has been checked in once.

**Action:** Use Playwright `request.post` to call `POST http://localhost:3000/v1/checkin/<UAT_QR_TOKEN>` directly a second time.

**Expected rejection:** HTTP 200 response with `status: 'already_checked_in'`. The `points_total` for `uat-member` has NOT changed from after Step 002. Exactly one `+20` row exists in the `activities` table for this `(user, event, action='event_attended')`.

**Screenshot label:** `neg-003-no-double-points`

---

## Notes

- `uat-event-live-uz` has `starts_at = now - 15min` — this is 15 minutes into the event, which is within the `starts_at - 30min` to `ends_at` validity window. Seed must compute timestamps relative to the seed execution time, not hardcode them.
- If the seed runs significantly before the UAT run (> 2 hours), `uat-event-live-uz` may slip outside the valid check-in window. Re-seed or account for this with a wider `ends_at`.
- Streak increment (FR-GAM-004) is tested separately in BP-UAT-012, not here. This script focuses on check-in state transitions and points only.
- The QR code on `/me` is generated client-side via `qrcode.react`. Its scannability by a real QR reader is not testable via Playwright (no camera); UATRunner should note this limitation.
