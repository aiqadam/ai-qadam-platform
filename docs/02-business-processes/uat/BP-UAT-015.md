---
code: BP-UAT-015
name: "Registration cancellation"
status: Ready
process_ref: "docs/03-requirements/FR-REG-003.md"
environment: "http://localhost:4321"
seed_required: true
last_run: ""
---

# BP-UAT-015 — Registration Cancellation

## Purpose

Verifies that a member can cancel a confirmed registration before the event
ends, that the -5 points are revoked, and that cancelling after event end is
blocked. Also verifies that cancelling a waitlist entry removes it without
revoking points (none were awarded), and that double-cancellation is idempotent.
Source: [FR-REG-003](../../03-requirements/FR-REG-003.md).

## Acceptance Criteria

- [ ] AC-1: Cancelling a confirmed registration sets `status=cancelled` and revokes -5 points.
- [ ] AC-2: After cancellation, the sidebar returns to a "Register" or "Join waitlist" state.
- [ ] AC-3: Cancelling a waitlist registration removes it without point revocation (waitlist entries earn 0 points).
- [ ] AC-4: Cancelling the same registration twice returns 200 on the second call (idempotent).
- [ ] AC-5: Attempting to cancel after `ends_at` has passed returns 409 Conflict.

## Seed Fixtures Required

| Fixture | Description |
|---|---|
| `uat-member` | Member account (`uat-member@aiqadam.test`, password from `.env.test`), country=`uz` |
| `uat-event-future-uz` | Published event in `uz`, `starts_at` = 7 days from now, `ends_at` = 7 days + 3h. `uat-member` has a confirmed registration (`status='confirmed'`). +5 points already awarded. |
| `uat-event-full-waitlist-uz` | Published event in `uz` at capacity. `uat-member` has a waitlist registration (`status='waitlist'`). No points awarded. |
| `uat-event-ended-uz` | Published event in `uz`, `ends_at` = 2 hours ago. `uat-member` has a confirmed registration that was NOT cancelled before the event ended. |
| `uat-member-points-before` | `uat-member`'s `points_total` before cancellation (should include the +5 from the confirmed registration on `uat-event-future-uz`). |

## Steps

### Step 001 — Sign in and view confirmed registration

**AC ref:** AC-1

**Precondition:** `uat-member` has a confirmed registration for `uat-event-future-uz`.

**Action:** Sign in as `uat-member@aiqadam.test`. Navigate to the event detail page for `uat-event-future-uz`.

**Expected UI state:** `RegistrationSidebar` shows "You're registered ✓" state with QR code and **Cancel** link.

**Screenshot label:** `step-001-confirmed-registration`

---

### Step 002 — Cancel the confirmed registration

**AC ref:** AC-1, AC-2

**Precondition:** Step 001 completed.

**Action:** Click **Cancel** in the `RegistrationSidebar`. Confirm the cancellation in any confirmation dialog that appears.

**Expected UI state:** Sidebar transitions to "Register" (or "Join waitlist" if event is full) state. No QR code visible. Success or neutral state — no error banner.

**Screenshot label:** `step-002-cancelled-sidebar`

---

### Step 003 — Verify -5 points revoked

**AC ref:** AC-1

**Precondition:** Step 002 completed.

**Action:** Navigate to `/me`. Observe the points total.

**Expected UI state:** `points_total` is exactly 5 less than `uat-member-points-before`. The deduction is reflected immediately.

**Screenshot label:** `step-003-points-revoked`

---

### Step 004 — Cancel the same registration again (idempotency)

**AC ref:** AC-4

**Precondition:** Step 002 completed. Registration is already `cancelled`.

**Action:** Use Playwright `request.delete` to call `DELETE http://localhost:3000/v1/events/<uat-event-future-uz-id>/register` with `uat-member`'s bearer token.

**Expected UI state:** HTTP 200 response. No additional point revocation occurs. `points_total` is unchanged from after Step 003.

**Screenshot label:** `step-004-cancel-idempotent`

---

### Step 005 — Cancel waitlist entry (no point revocation)

**AC ref:** AC-3

**Precondition:** `uat-member` has a waitlist registration for `uat-event-full-waitlist-uz`.

**Action:** Navigate to `uat-event-full-waitlist-uz` event detail page. Click **Leave waitlist**.

**Expected UI state:** Sidebar transitions to "Event full — Join waitlist" CTA (since the event is still full). `points_total` is UNCHANGED — no -5 revocation because waitlist entries never earned points.

**Screenshot label:** `step-005-waitlist-cancelled`

---

## Negative Scenarios

### Negative 001 — Cancel after event ends returns 409

**AC ref:** AC-5

**Precondition:** `uat-event-ended-uz` has `ends_at` 2 hours ago. `uat-member` has a confirmed registration for it.

**Action:** Use Playwright `request.delete` to call `DELETE http://localhost:3000/v1/events/<uat-event-ended-uz-id>/register` with `uat-member`'s bearer token.

**Expected rejection:** HTTP 409 Conflict. Response body indicates "Event has ended — cancellation not allowed" or equivalent. The registration remains in its current status (not changed to `cancelled`).

**Screenshot label:** `neg-001-cancel-after-event-ended`

---

### Negative 002 — Cancel without auth returns 401

**AC ref:** AC-1

**Precondition:** No active session.

**Action:** Use Playwright `request.delete` to call `DELETE http://localhost:3000/v1/events/<uat-event-future-uz-id>/register` without an Authorization header.

**Expected rejection:** HTTP 401. No registration modified.

**Screenshot label:** `neg-002-cancel-no-auth`

---

### Negative 003 — Cancel waitlist does not revoke points

**AC ref:** AC-3

**Precondition:** `uat-member` is on the waitlist for `uat-event-full-waitlist-uz` (Step 005 not yet run, or a fresh seed state).

**Action:** Record `uat-member`'s `points_total`. Cancel the waitlist entry.

**Expected rejection:** `points_total` after cancellation equals the value before — no deduction. The activities audit log does NOT contain a new negative-points row for this cancellation.

**Screenshot label:** `neg-003-waitlist-cancel-no-deduction`

---

## Notes

- Steps 002–003 test cancellation and immediate point display. Because `points_total` is a denormalized field updated atomically with the cancel transaction, the change should be instant. If there is any delay, UATRunner should reload `/me` once and note the timing.
- Negative 001 requires a registration that was NOT cancelled before the event ended — ensure seed does not pre-cancel it.
- This script can be run after BP-UAT-014 using the same `uat-member` account, provided seed provides separate events. Running them together in sequence is fine; just ensure `uat-event-future-uz` and `uat-event-full-waitlist-uz` are distinct from the events used in BP-UAT-014.
