---
code: BP-UAT-010
name: "Event registration flow"
status: Ready
process_ref: "docs/03-requirements/FR-REG-001.md"
environment: "http://localhost:4321"
seed_required: true
last_run: ""
---

# BP-UAT-010 — Event Registration Flow

## Purpose

Verifies the core product loop: a signed-in member finds an event, registers
for it, sees the confirmation state in the `RegistrationSidebar`, receives a
confirmation email with a QR code, and earns +5 points. Also verifies
idempotency (second register returns the existing registration), the
unauthenticated state (sign-in CTA instead of register button), and the
at-capacity / waitlist path. Source: [FR-REG-001](../../03-requirements/FR-REG-001.md).

## Acceptance Criteria

- [ ] AC-1: A signed-in member can register for an event with available capacity; `status=confirmed` is created.
- [ ] AC-2: The `RegistrationSidebar` updates to "You're registered" state with the QR code visible.
- [ ] AC-3: A confirmation email arrives with event details and a QR link to `/checkin?code=<qr_token>`.
- [ ] AC-4: Registering for the same event a second time does not create a duplicate; sidebar stays "You're registered".
- [ ] AC-5: An unauthenticated visitor sees "Sign in to register" CTA, not the register button.
- [ ] AC-6: Registering for a full event (confirmed_count ≥ capacity) creates a `waitlist` registration and shows "You're on the waitlist".
- [ ] AC-7: +5 points are awarded on confirmed registration.

## Seed Fixtures Required

| Fixture | Description |
|---|---|
| `uat-member` | Member account (`uat-member@aiqadam.test`, password from `.env.test`), country=`uz` |
| `uat-event-open-uz` | Published event in `uz`, capacity=10, 0 confirmed registrations, `starts_at` = 7 days from now |
| `uat-event-full-uz` | Published event in `uz`, capacity=2, already 2 confirmed registrations (from other seed accounts), `starts_at` = 14 days from now |
| `uat-member-points-baseline` | Record of `uat-member`'s `points_total` before registration (for AC-7 delta check) |

## Steps

### Step 001 — View event detail as unauthenticated visitor

**AC ref:** AC-5

**Precondition:** User is not signed in.

**Action:** Navigate to the event detail page for `uat-event-open-uz` (e.g. `http://localhost:4321/events/<id>`).

**Expected UI state:** `RegistrationSidebar` shows a "Sign in to register" CTA button. No "Register" button is visible. The event title, description, date, and location are visible.

**Screenshot label:** `step-001-unauth-event-detail`

---

### Step 002 — Sign in as member

**AC ref:** AC-1

**Precondition:** Step 001 completed (on event detail page or navigated away).

**Action:** Navigate to `/auth/sign-in`. Sign in as `uat-member@aiqadam.test` with `UAT_MEMBER_PASSWORD`. After sign-in, navigate back to the event detail page for `uat-event-open-uz`.

**Expected UI state:** `RegistrationSidebar` now shows a **Register** button. User is recognized as signed in (account chip visible in nav).

**Screenshot label:** `step-002-signed-in-event-detail`

---

### Step 003 — Register for the event

**AC ref:** AC-1, AC-2, AC-7

**Precondition:** Step 002 completed. Member is signed in and on the event detail page. `uat-event-open-uz` has capacity available.

**Action:** Click the **Register** button in the `RegistrationSidebar`.

**Expected UI state:** Sidebar transitions to "You're registered ✓" state. A QR code image is visible in the sidebar. A **Cancel** link is visible. No error banner. Registration count on the event increments by 1.

**Screenshot label:** `step-003-registered-state`

---

### Step 004 — Verify +5 points awarded

**AC ref:** AC-7

**Precondition:** Step 003 completed.

**Action:** Navigate to `/me` (member dashboard). Observe the points total displayed.

**Expected UI state:** `points_total` is exactly 5 more than the seed baseline recorded for `uat-member`. The points change is visible on the dashboard.

**Screenshot label:** `step-004-points-awarded`

---

### Step 005 — Re-register (idempotency)

**AC ref:** AC-4

**Precondition:** Step 003 completed. Member is registered.

**Action:** Navigate back to the event detail page for `uat-event-open-uz`. Observe the `RegistrationSidebar` state. If a Register button is somehow visible again, click it.

**Expected UI state:** Sidebar still shows "You're registered ✓" state. No second registration is created. No duplicate email is sent. Points total does not increment again.

**Screenshot label:** `step-005-idempotent-registration`

---

### Step 006 — Register for a full event (waitlist)

**AC ref:** AC-6

**Precondition:** Step 002 completed (member is signed in). `uat-event-full-uz` has capacity=2 with 2 confirmed registrations from other seed accounts.

**Action:** Navigate to the event detail page for `uat-event-full-uz`. Click the **Join waitlist** button.

**Expected UI state:** Sidebar transitions to "You're on the waitlist" state. A **Leave waitlist** link is visible. No QR code is shown. No points are awarded (waitlist entry = 0 points).

**Screenshot label:** `step-006-waitlisted-state`

---

## Negative Scenarios

### Negative 001 — Unauthenticated user cannot register directly

**AC ref:** AC-5

**Precondition:** User is not signed in.

**Action:** Navigate to the event detail page for `uat-event-open-uz`. Attempt to find and click a Register button.

**Expected rejection:** No Register button is present. Only a "Sign in to register" CTA is shown. No `POST /v1/events/:id/register` request fires.

**Screenshot label:** `neg-001-no-register-without-auth`

---

### Negative 002 — Unauthenticated POST to register endpoint returns 401

**AC ref:** AC-1

**Precondition:** No session cookie present.

**Action:** Use Playwright `request.post` to call `POST http://localhost:3000/v1/events/<uat-event-open-uz-id>/register` without an Authorization header.

**Expected rejection:** HTTP 401 response. No registration row created.

**Screenshot label:** `neg-002-api-401-no-auth`

---

### Negative 003 — Full event shows waitlist path, not register

**AC ref:** AC-6

**Precondition:** `uat-event-full-uz` is at capacity (2/2 confirmed). User is signed in.

**Action:** Navigate to `uat-event-full-uz` event detail page. Observe the sidebar.

**Expected rejection:** No "Register" button shown. Instead shows "Event full — Join waitlist" CTA (or equivalent). Clicking this creates a `waitlist` registration, not `confirmed`.

**Screenshot label:** `neg-003-full-event-waitlist-only`

---

## Notes

- Confirmation email (AC-3) verification: Playwright cannot read actual email delivery in a local stack without a mail-catcher (e.g., Mailpit). UATRunner should check for the confirmation email in the local mail-catcher UI at `http://localhost:8025` (or configured address). If no mail-catcher is running, record this step as `deferred` with a note.
- QR code (AC-2) verification: the QR image must be visible in the sidebar DOM as an `<img>` or `<canvas>` element. UATRunner records whether the element is present; scanning validity is covered in BP-UAT-011.
- Attribution cookies (`aiqadam-ref-owner`, `aiqadam-attribution`) are not explicitly tested here — they are covered in BP-UAT-016 (referral programme).
- If `uat-event-open-uz` and `uat-event-full-uz` are the same event that gets modified between steps, seed must ensure they are two distinct events.
