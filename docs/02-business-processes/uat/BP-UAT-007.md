---
code: BP-UAT-007
name: "Pre-event reminder cron"
status: Ready
process_ref: "docs/02-business-processes/operations/event-pre-event-reminders.md"
environment: "http://localhost:4321"
seed_required: true
last_run: ""
---

# BP-UAT-007 — Pre-Event Reminder Cron

## Purpose

Verifies that the reminder tick endpoint correctly dispatches `reminder_72h`
emails to registered attendees when an event is in the T-2 window
(`starts_at ∈ [now+38h, now+58h]`), records the ledger row, and is idempotent
on a second tick. Also verifies the T-3h window (`starts_at ∈ [now+2h, now+4h]`)
dispatches `reminder_3h`. Source runbook:
[event-pre-event-reminders.md](../operations/event-pre-event-reminders.md).

## Acceptance Criteria

- [ ] AC-1: A tick against an event in the T-2 window dispatches `reminder_72h` to all `registered` and `attended` members.
- [ ] AC-2: A second tick for the same event returns `already_dispatched` — no second dispatch fires.
- [ ] AC-3: A tick against an event in the T-3h window dispatches `reminder_3h`.
- [ ] AC-4: Waitlisted members are NOT included in the reminder dispatch.
- [ ] AC-5: The tick endpoint rejects requests without the `x-internal-auth` header (401).
- [ ] AC-6: A `event_announcements` ledger row is created with the correct `kind` after each dispatch.

## Seed Fixtures Required

| Fixture | Description |
|---|---|
| `uat-event-t2-window` | Published event in `uz`, `starts_at = now + 48h` (inside T-2 window `[38h, 58h]`), 0 registrations yet |
| `uat-event-t3h-window` | Published event in `uz`, `starts_at = now + 3h` (inside T-3h window `[2h, 4h]`), 0 registrations yet |
| `uat-member-registered` | Member in `uz`, registered for `uat-event-t2-window` with `status='registered'` |
| `uat-member-waitlisted` | Member in `uz`, registered for `uat-event-t2-window` with `status='waitlisted'` |
| `UAT_INTERNAL_API_TOKEN` | Exposed in `.env.test` — matches `INTERNAL_API_TOKEN` in the running API |

## Steps

### Step 001 — Verify tick endpoint auth protection

**AC ref:** AC-5

**Precondition:** API is reachable at `http://localhost:3000`.

**Action:** Send a POST to `http://localhost:3000/v1/internal/event-reminders/tick` WITHOUT the `x-internal-auth` header (use Playwright `request.post` or `fetch`).

**Expected UI state:** HTTP response status is `401`. Body contains an error message indicating unauthorized access.

**Screenshot label:** `step-001-tick-401-no-auth`

---

### Step 002 — Trigger T-2 tick (first time)

**AC ref:** AC-1, AC-6

**Precondition:** `uat-event-t2-window` exists with `starts_at ∈ [now+38h, now+58h]`. `uat-member-registered` is registered. No `event_announcements` ledger row exists for this event + `kind='reminder_t_minus_2'`.

**Action:** Send a POST to `http://localhost:3000/v1/internal/event-reminders/tick` with header `x-internal-auth: <UAT_INTERNAL_API_TOKEN>`.

**Expected UI state:** HTTP response status is `200`. Response body contains `dispatched` array with an entry for `uat-event-t2-window` showing `kind='reminder_t_minus_2'` and `recipientCount ≥ 1`.

**Screenshot label:** `step-002-t2-tick-dispatched`

---

### Step 003 — Verify idempotency (second tick)

**AC ref:** AC-2

**Precondition:** Step 002 completed. Ledger row now exists for `(uat-event-t2-window, 'reminder_t_minus_2')`.

**Action:** Send the same POST to `http://localhost:3000/v1/internal/event-reminders/tick` again immediately.

**Expected UI state:** HTTP response status is `200`. Response body shows `uat-event-t2-window` in the `skipped` array with `reason='already_dispatched'`. No new dispatch fires. `dispatched` array is empty or does not contain `uat-event-t2-window`.

**Screenshot label:** `step-003-t2-tick-idempotent`

---

### Step 004 — Trigger T-3h tick

**AC ref:** AC-3

**Precondition:** `uat-event-t3h-window` exists with `starts_at ∈ [now+2h, now+4h]`. At least one member is `registered` for it (can reuse `uat-member-registered` if seeded for both events, or add a second registration row).

**Action:** Send POST to `http://localhost:3000/v1/internal/event-reminders/tick` with `x-internal-auth` header.

**Expected UI state:** Response body contains `dispatched` entry for `uat-event-t3h-window` with `kind='reminder_3h'` and `recipientCount ≥ 1`.

**Screenshot label:** `step-004-t3h-tick-dispatched`

---

### Step 005 — Verify ledger rows created

**AC ref:** AC-6

**Precondition:** Steps 002 and 004 completed.

**Action:** Navigate to the Directus admin at `http://localhost:8055`. Open the `event_announcements` collection and filter by `kind IN (reminder_t_minus_2, reminder_3h)`.

**Expected UI state:** At least 2 rows visible:
- `(uat-event-t2-window, kind='reminder_t_minus_2')` with `sent_at` populated and `recipient_count ≥ 1`
- `(uat-event-t3h-window, kind='reminder_3h')` with `sent_at` populated and `recipient_count ≥ 1`

**Screenshot label:** `step-005-ledger-rows`

---

## Negative Scenarios

### Negative 001 — Tick endpoint without auth returns 401

**AC ref:** AC-5

**Precondition:** API is reachable.

**Action:** POST to `/v1/internal/event-reminders/tick` without any `x-internal-auth` header.

**Expected rejection:** HTTP 401. No dispatch fires.

**Screenshot label:** `neg-001-no-auth-401`

---

### Negative 002 — Waitlisted member excluded from dispatch

**AC ref:** AC-4

**Precondition:** Step 002 completed. `uat-member-waitlisted` is `waitlisted` for `uat-event-t2-window`. The T-2 dispatch has fired.

**Action:** In the Directus admin `interaction_deliveries` collection, filter by the `interaction` created in Step 002 and look for a delivery row with `recipient_user = uat-member-waitlisted`.

**Expected rejection:** No delivery row exists for `uat-member-waitlisted`. Only `uat-member-registered` has a delivery row.

**Screenshot label:** `neg-002-waitlisted-not-dispatched`

---

### Negative 003 — Draft event not dispatched

**AC ref:** AC-1

**Precondition:** A draft event exists in the T-2 window (`starts_at ∈ [38h, 58h]` but `status='draft'`).

**Action:** Trigger the tick and observe the response.

**Expected rejection:** The draft event does NOT appear in the `dispatched` array. It may appear in `skipped` with `reason='not_published'` or simply not appear at all.

**Screenshot label:** `neg-003-draft-event-skipped`

---

## Notes

- Steps 002–005 use the API directly (not the web UI) because the reminder cron has no operator-facing web UI — it is a scheduled internal endpoint. Playwright `request` context (browser-independent HTTP calls) is the right tool for these steps.
- `uat-event-t2-window` and `uat-event-t3h-window` have time-sensitive `starts_at` values. Seed must compute them relative to `now` at seed execution time, not hardcode timestamps. If seed runs more than 1 hour before the UAT, the windows may have passed.
- Negative 002 (waitlisted exclusion) requires Directus admin access to verify — this is an engineer-level check. UATRunner records the expected behavior; BusinessAnalyst confirms in Directus after the run.
