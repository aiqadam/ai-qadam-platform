---
code: BP-UAT-014
name: "Waitlist management"
status: Ready
process_ref: "docs/03-requirements/FR-REG-002.md"
environment: "http://localhost:4321"
seed_required: true
last_run: ""
---

# BP-UAT-014 — Waitlist Management

## Purpose

Verifies that when an event reaches capacity a new registration lands on the
waitlist, and that when a confirmed registrant cancels, the first waitlisted
member is automatically promoted to `confirmed`, awarded +5 points, and sent a
notification email. Also verifies that leaving the waitlist manually does not
trigger promotion. Source: [FR-REG-002](../../03-requirements/FR-REG-002.md).

## Acceptance Criteria

- [ ] AC-1: Registering for a full event creates a `waitlist` registration and shows "You're on the waitlist" in the sidebar.
- [ ] AC-2: When a confirmed registrant cancels, the oldest waitlist member is automatically promoted to `confirmed`.
- [ ] AC-3: The promoted member's sidebar updates to "You're registered ✓" with a QR code.
- [ ] AC-4: +5 points are awarded to the promoted member on promotion.
- [ ] AC-5: A promotion notification email is sent to the promoted member within 60 seconds.
- [ ] AC-6: Leaving the waitlist manually removes the registration without triggering promotion.

## Seed Fixtures Required

| Fixture | Description |
|---|---|
| `uat-member-canceller` | Member who will hold and then cancel a confirmed spot (`uat-canceller@aiqadam.test`, password from `.env.test`) |
| `uat-member-waiter` | Member on the waitlist (`uat-waiter@aiqadam.test`, password from `.env.test`), country=`uz`, `events` consent active |
| `uat-event-full-uz` | Published event in `uz`, `capacity=1`, exactly 1 confirmed registration for `uat-member-canceller`, 1 waitlist registration for `uat-member-waiter` (FIFO first). `starts_at` = 7 days from now. |
| `uat-waiter-points-before` | `uat-member-waiter`'s `points_total` before promotion. |
| Mail catcher | Running at `http://localhost:8025`. |

## Steps

### Step 001 — Verify waitlist state in sidebar

**AC ref:** AC-1

**Precondition:** Seed complete. `uat-member-waiter` is on the waitlist for `uat-event-full-uz`.

**Action:** Sign in as `uat-waiter@aiqadam.test`. Navigate to the event detail page for `uat-event-full-uz`.

**Expected UI state:** `RegistrationSidebar` shows "You're on the waitlist" state. A **Leave waitlist** link is visible. No QR code is shown.

**Screenshot label:** `step-001-waitlist-state`

---

### Step 002 — Cancel confirmed registration (triggers promotion)

**AC ref:** AC-2, AC-3, AC-4, AC-5

**Precondition:** Step 001 confirmed. Sign out from `uat-member-waiter`, then sign in as `uat-canceller@aiqadam.test`. Navigate to `uat-event-full-uz`.

**Action:** Click **Cancel** in the `RegistrationSidebar` to cancel `uat-member-canceller`'s confirmed registration.

**Expected UI state:** Sidebar updates to show the event without an active registration (shows Register or "Event full" state since `uat-member-waiter` immediately takes the spot). Cancellation completes without error.

**Screenshot label:** `step-002-cancellation-triggers-promotion`

---

### Step 003 — Verify promoted member sidebar

**AC ref:** AC-3

**Precondition:** Step 002 completed.

**Action:** Sign out from `uat-member-canceller`. Sign in as `uat-waiter@aiqadam.test`. Navigate to `uat-event-full-uz` event detail page.

**Expected UI state:** `RegistrationSidebar` now shows "You're registered ✓" state. QR code is visible. The `status` of `uat-member-waiter`'s registration is `confirmed`.

**Screenshot label:** `step-003-waiter-promoted-sidebar`

---

### Step 004 — Verify +5 points awarded to promoted member

**AC ref:** AC-4

**Precondition:** Step 002 completed. Signed in as `uat-waiter@aiqadam.test`.

**Action:** Navigate to `/me`. Observe the points total.

**Expected UI state:** `points_total` is exactly 5 more than `uat-waiter-points-before`. The +5 award reflects the promotion (waitlist entry originally earned 0 points; promotion grants the same +5 as a direct confirmed registration).

**Screenshot label:** `step-004-promotion-points`

---

### Step 005 — Promotion email in mail catcher

**AC ref:** AC-5

**Precondition:** Step 002 completed. Mail catcher running.

**Action:** Navigate to `http://localhost:8025`. Find email sent to `uat-waiter@aiqadam.test`.

**Expected UI state:** An email with a subject referencing promotion from the waitlist is present. Body mentions the event name and includes the QR code or check-in link. Email arrived within 60 seconds of the cancellation in Step 002.

**Screenshot label:** `step-005-promotion-email`

---

## Negative Scenarios

### Negative 001 — Leaving waitlist does not trigger promotion

**AC ref:** AC-6

**Precondition:** A separate seed state: `uat-event-full-uz-2` has capacity=1, 1 confirmed registration for `uat-member-3rd`, and `uat-member-waiter` on the waitlist. (Can reuse `uat-member-waiter` if the event is different.)

**Action:** Sign in as `uat-waiter@aiqadam.test`. Navigate to `uat-event-full-uz-2`. Click **Leave waitlist**.

**Expected rejection:** Waitlist registration is removed. `uat-member-3rd`'s confirmed registration is untouched — no promotion fires. No email sent to any waitlist members. Sidebar shows "Event full — Join waitlist" CTA again.

**Screenshot label:** `neg-001-leave-waitlist-no-promotion`

---

### Negative 002 — Capacity prevents over-promotion

**AC ref:** AC-2

**Precondition:** An event with capacity=1, 1 confirmed registrant, and 2 waitlist members (member A and member B, A joined first).

**Action:** The confirmed registrant cancels.

**Expected rejection:** Only member A (the FIFO-first waiter) is promoted. Member B remains on the waitlist. Exactly one promotion notification email is sent (to member A). Confirmed count stays at 1 after promotion.

**Screenshot label:** `neg-002-only-one-promotion`

---

### Negative 003 — Waitlist register on event with space is actually confirmed

**AC ref:** AC-1

**Precondition:** `uat-event-open-uz` (from BP-UAT-010 seed) still has capacity available.

**Action:** Sign in as a fresh member with no registration for `uat-event-open-uz`. Register.

**Expected rejection:** Registration status is `confirmed`, NOT `waitlist`. Sidebar shows "You're registered ✓". This verifies the waitlist path only fires when capacity is truly exhausted.

**Screenshot label:** `neg-003-open-event-not-waitlisted`

---

## Notes

- Step 002 relies on the cancellation endpoint (FR-REG-003) triggering the promotion synchronously. The cancel request returns 200 only after promotion completes. If promotion fails asynchronously, the cancel still returns 200 — UATRunner should check Step 003 immediately after Step 002 to catch a promotion failure.
- Promotion email verification (Step 005) requires mail catcher. Mark Step 005 as `deferred` if no mail catcher is available.
- Negative 002 requires seeding two distinct waitlist members on the same event. If this is impractical, mark as `deferred`.
- This script pairs tightly with BP-UAT-015 (cancellation) — they test the same cancel endpoint from different perspectives. Run BP-UAT-014 before BP-UAT-015 so the waitlist seed state is clean.
