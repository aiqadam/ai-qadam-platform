---
code: BP-UAT-010
name: "Event registration flow"
status: Ready
process_ref: "docs/03-requirements/FR-REG-001.md"
environment: "http://localhost:4321"
seed_required: true
last_run: "2026-07-31 (wf-20260731-uat-166, mandatory Step 13 post-merge re-verification for ISS-UAT-010-2/wf-20260731-fix-165 — narrower than a full pass, scoped to the waitlist-rendering fix; AC-1/AC-6 MATCH, both explicitly cross-referenced against the live Directus row (not DOM text alone — the same technique that originally caught this bug). Full event's registration correctly rendered 'On waitlist — we'll email if a seat opens' with Directus confirming status=waitlisted; open event's registration correctly rendered '✓ You're registered' with Directus confirming status=registered. Fix holds, no regression. Pre-existing ISS-EVT-004-1 (registeredCount display bug) still visible in the capacity counter — unrelated, already tracked, not re-filed.)"
linked_issues: [ISS-UAT-SEED-003, ISS-UAT-010-1, ISS-EVT-004-1, ISS-BRIDGE-STALE-001, ISS-UAT-010-2]
---

# BP-UAT-010 — Event Registration Flow

## Purpose

Verifies the core product loop: a signed-in member finds an event, registers
for it, sees the confirmation state in the `RegistrationCTA` block, and (on a
full event) is placed on the waitlist instead. Also verifies idempotency
(second register returns the existing registration, no duplicate row), the
unauthenticated state (sign-in CTA instead of register button), and that
points are awarded only at check-in, not at registration time. Source:
`apps/api/src/modules/registrations/` (Directus-backed V2 implementation) —
[FR-REG-001](../../03-requirements/FR-REG-001.md) is a superseded Phase-1/V1
spec kept for history only; do not use it as a source of truth for field
values or endpoints (see ISS-UAT-010-1).

## Acceptance Criteria

- [ ] AC-1: A signed-in member can register for an event with available capacity; a `registered` row is created (`POST /v1/events/:eventId/register` → `200 OK`).
- [ ] AC-2: The `RegistrationCTA` block updates to "You're registered" state. (No QR code element exists in the current UI — check-in is by staff scan against the Directus row, not a member-visible code; do not assert a QR image/canvas.)
- [ ] AC-3: A confirmation email/notification is dispatched for the registration (verified via the local mail-catcher if running; see Notes).
- [ ] AC-4: Registering for the same event a second time does not create a duplicate row; the CTA stays "You're registered".
- [ ] AC-5: An unauthenticated visitor sees "Sign in to register" CTA, not the register button.
- [ ] AC-6: Registering for a full event (registered count ≥ capacity) creates a `waitlisted` row and the CTA shows "On waitlist".
- [ ] AC-7: +10 points are awarded on event check-in (`reg-checkin-points` Directus Flow, `status: attended`), not on registration. No points are awarded at registration time, for either a `registered` or `waitlisted` row.

## Seed Fixtures Required

Manifest: `scripts/uat-fixtures/BP-UAT-010.json` (`pnpm uat:seed --reset BP-UAT-010`).

| Fixture | Description |
|---|---|
| `uat-member` | Member account (`uat-member@example.com`, password per `.env.uat`/seed default), country=`uz` |
| `uat-event-open-uz` | Published event in `uz`, capacity=10, 0 pre-existing registrations, `starts_at` = 7 days from now |
| `uat-event-full-uz` | Published event in `uz`, capacity=2, already 2 `registered` rows from 2 filler seed accounts, `starts_at` = 14 days from now |
| `uat-member-points-baseline` | A fixed `point_awards` row for `uat-member` (`source: event_attended`, `points: 10`) seeded directly — NOT a claim that registration itself granted these points; establishes a deterministic points_total baseline a future check-in-flow AC could diff against. |

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

**Action:** Navigate to `/auth/sign-in`. Sign in as `uat-member@example.com` with `UAT_MEMBER_PASSWORD`. After sign-in, navigate back to the event detail page for `uat-event-open-uz`.

**Expected UI state:** `RegistrationSidebar` now shows a **Register** button. User is recognized as signed in (account chip visible in nav).

**Screenshot label:** `step-002-signed-in-event-detail`

---

### Step 003 — Register for the event

**AC ref:** AC-1, AC-2

**Precondition:** Step 002 completed. Member is signed in and on the event detail page. `uat-event-open-uz` has capacity available.

**Action:** Click the **Register** button in the `RegistrationCTA` block.

**Expected UI state:** CTA transitions to "You're registered" state with a **Cancel registration** button visible. No error banner. Registration count on the event increments by 1. Cross-reference against Directus: the corresponding `registrations` row has `status=registered` (not just DOM text — see ISS-UAT-010-2 for why a DOM-only check is insufficient).

**Screenshot label:** `step-003-registered-state`

---

### Step 004 — Verify no points awarded on registration (AC-7 negative check)

**AC ref:** AC-7

**Precondition:** Step 003 completed.

**Action:** Query `point_awards` in Directus for `uat-member`, filtered to `source_ref = uat-event-open-uz`'s id.

**Expected state:** No new `point_awards` row exists for this registration — only the fixed seed baseline row (`uat-member-points-baseline`) is present. Points are awarded solely by the `reg-checkin-points` Flow on check-in (`status: attended`), which this business process does not drive (check-in is covered by BP-UAT-011).

**Screenshot label:** `step-004-no-points-on-registration` (Directus admin query result, not a member-facing screen)

---

### Step 005 — Re-register (idempotency)

**AC ref:** AC-4

**Precondition:** Step 003 completed. Member is registered.

**Action:** Navigate back to the event detail page for `uat-event-open-uz`. Observe the `RegistrationCTA` state. If a Register button is somehow visible again, click it.

**Expected UI state:** CTA still shows "You're registered" state. No second registration row is created (still exactly one `registered` row for this user+event in Directus). No duplicate email/notification is sent.

**Screenshot label:** `step-005-idempotent-registration`

---

### Step 006 — Register for a full event (waitlist)

**AC ref:** AC-6

**Precondition:** Step 002 completed (member is signed in). `uat-event-full-uz` has capacity=2 with 2 pre-existing `registered` rows from other seed accounts.

**Action:** Navigate to the event detail page for `uat-event-full-uz`. Click the CTA button (label may read "Register" or "Join waitlist" depending on the client-side registered-count display — see the known, unrelated `ISS-EVT-004-1` display gap in Notes; the server-side decision is authoritative regardless of the button label).

**Expected UI state:** CTA transitions to "On waitlist" state with a **Leave waitlist** button visible. No points are awarded. Cross-reference against Directus: the resulting row has `status=waitlisted`, not `registered` (the exact DOM-vs-Directus divergence `ISS-UAT-010-2` found and fixed — always verify both, never DOM text alone).

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

**Precondition:** `uat-event-full-uz` is at capacity (2/2 `registered`). User is signed in.

**Action:** Navigate to `uat-event-full-uz` event detail page. Observe the `RegistrationCTA` block, then click its button.

**Expected rejection:** The resulting registration row is `waitlisted`, not `registered`, regardless of what the button was labeled (the button label is driven by a separate, known, unrelated client-side registered-count display gap — `ISS-EVT-004-1` — not by this AC's server-side enforcement). Verify the row's actual `status` in Directus, not just the CTA text.

**Screenshot label:** `neg-003-full-event-waitlist-only`

---

## Notes

- Confirmation email (AC-3) verification: Playwright cannot read actual email delivery in a local stack without a mail-catcher (e.g., Mailpit). UATRunner should check for the confirmation email in the local mail-catcher UI at `http://localhost:8025` (or configured address). If no mail-catcher is running, record this step as `deferred` with a note.
- QR code: the current `RegistrationCTA` implementation has no QR code element anywhere — check-in is by staff scan against the Directus row directly, there is no member-visible code to display. Do not assert a QR `<img>`/`<canvas>` for AC-2; this was corrected from an earlier doc revision that assumed a QR-code confirmation UI that was never built (see ISS-UAT-010-1).
- Points (AC-7): verify the ABSENCE of a registration-time `point_awards` row, not the presence of one. The +10 check-in award is covered by BP-UAT-011, not this process.
- Attribution cookies (`aiqadam-ref-owner`, `aiqadam-attribution`) are not explicitly tested here — they are covered in BP-UAT-016 (referral programme).
- If `uat-event-open-uz` and `uat-event-full-uz` are the same event that gets modified between steps, seed must ensure they are two distinct events.
- Known, unrelated, already-tracked display gap (`ISS-EVT-004-1`): `apps/web-next`'s registered-count display can lag the real Directus count, which may make the CTA button read "Register" even on a full event. This does not affect this process's ACs — the server-side capacity/waitlist decision (AC-6) is independent of the client-side count display.
