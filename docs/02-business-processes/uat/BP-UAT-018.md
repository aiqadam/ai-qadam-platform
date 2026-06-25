---
code: BP-UAT-018
name: "Lead nurture cron"
status: Ready
process_ref: "docs/02-business-processes/operations/lead-nurture.md"
environment: "http://localhost:4321"
seed_required: true
last_run: ""
---

# BP-UAT-018 — Lead Nurture Cron

## Purpose

Verifies the two automated nurture emails for verified leads: a T+3 value email
(`lead_nurture_value`) dispatched 3 days after email verification, and a T+7
next-event teaser (`lead_nurture_next_event`) dispatched 7 days after
verification when a future published event exists. Both are idempotent — a
second tick does not re-dispatch. A converted lead (state changed to `member`)
is excluded from the candidate query. Source:
[lead-nurture.md](../operations/lead-nurture.md).

## Acceptance Criteria

- [ ] AC-1: The nurture tick dispatches `lead_nurture_value` to leads verified ≥ 3 days ago with no prior ledger row.
- [ ] AC-2: The tick dispatches `lead_nurture_next_event` to leads verified ≥ 7 days ago when a future event exists.
- [ ] AC-3: A second tick for the same leads returns no new dispatches (idempotency via `lead_nurture_dispatches` ledger).
- [ ] AC-4: A lead who has converted to `state='member'` is excluded from the nurture candidate query.
- [ ] AC-5: T+7 is skipped (no ledger row written) when no upcoming published event exists — the lead is re-evaluated on the next tick.
- [ ] AC-6: The tick endpoint rejects requests without `x-internal-auth` (401).

## Seed Fixtures Required

| Fixture | Description |
|---|---|
| `uat-lead-t3` | Lead (`uat-lead-t3@aiqadam.test`), `state='lead'`, `email_verified=true`, `email_verified_at = now - 4d`. No `lead_nurture_dispatches` rows. |
| `uat-lead-t7` | Lead (`uat-lead-t7@aiqadam.test`), `state='lead'`, `email_verified=true`, `email_verified_at = now - 8d`. No `lead_nurture_dispatches` rows. |
| `uat-lead-converted` | Former lead now `state='member'`, `email_verified_at = now - 10d`. Should be excluded. |
| `uat-event-next-uz` | A published event in `uz` with `starts_at > now` (for T+7 teaser). |
| `UAT_INTERNAL_API_TOKEN` | Exposed in `.env.test`. |
| Mail catcher | Running at `http://localhost:8025`. |

## Steps

### Step 001 — Auth guard check

**AC ref:** AC-6

**Precondition:** API is reachable.

**Action:** POST to `http://localhost:3000/v1/internal/lead-nurture/tick` WITHOUT `x-internal-auth` header.

**Expected UI state:** HTTP 401. No dispatch fires.

**Screenshot label:** `step-001-no-auth-401`

---

### Step 002 — Trigger nurture tick (first run)

**AC ref:** AC-1, AC-2

**Precondition:** `uat-lead-t3` (verified 4 days ago) and `uat-lead-t7` (verified 8 days ago) have no ledger rows. `uat-event-next-uz` exists.

**Action:** POST to `http://localhost:3000/v1/internal/lead-nurture/tick` with `x-internal-auth: <UAT_INTERNAL_API_TOKEN>`.

**Expected UI state:** HTTP 200. Response contains:
- `uat-lead-t3` dispatched with `kind='lead_nurture_value'`
- `uat-lead-t7` dispatched with both `kind='lead_nurture_value'` AND `kind='lead_nurture_next_event'` (verified > 7 days ago, so both T+3 and T+7 fire on the same tick)

**Screenshot label:** `step-002-tick-dispatched`

---

### Step 003 — Verify emails in mail catcher

**AC ref:** AC-1, AC-2

**Precondition:** Step 002 completed. Mail catcher running.

**Action:** Navigate to `http://localhost:8025`. Check emails for `uat-lead-t3@aiqadam.test` and `uat-lead-t7@aiqadam.test`.

**Expected UI state:**
- `uat-lead-t3` has received 1 email (`lead_nurture_value` — value/community content).
- `uat-lead-t7` has received 2 emails: `lead_nurture_value` and `lead_nurture_next_event` (the teaser references `uat-event-next-uz`).
- `uat-lead-converted` has received NO emails.

**Screenshot label:** `step-003-nurture-emails`

---

### Step 004 — Verify ledger rows created

**AC ref:** AC-3 (precondition for idempotency check)

**Precondition:** Step 002 completed.

**Action:** In Directus admin, open `lead_nurture_dispatches`. Filter by `lead IN (<uat-lead-t3-id>, <uat-lead-t7-id>)`.

**Expected UI state:** At minimum 2 rows: one `(uat-lead-t3, kind='lead_nurture_value')` and one `(uat-lead-t7, kind='lead_nurture_next_event')`. Possibly also `(uat-lead-t7, kind='lead_nurture_value')`. All rows have `sent_at` populated.

**Screenshot label:** `step-004-ledger-rows`

---

### Step 005 — Second tick is idempotent

**AC ref:** AC-3

**Precondition:** Step 002 completed. Ledger rows exist.

**Action:** POST to `/v1/internal/lead-nurture/tick` again immediately.

**Expected UI state:** HTTP 200. Both `uat-lead-t3` and `uat-lead-t7` appear in a `skipped` or empty `dispatched` array. No new emails in mail catcher for either lead.

**Screenshot label:** `step-005-second-tick-idempotent`

---

## Negative Scenarios

### Negative 001 — Converted lead excluded from nurture

**AC ref:** AC-4

**Precondition:** `uat-lead-converted` has `state='member'` and `email_verified_at = now - 10d` (would qualify if still a lead).

**Action:** Observe the response from Step 002. Check mail catcher after Step 002.

**Expected rejection:** `uat-lead-converted` does NOT appear in the `dispatched` array. No nurture email is sent to `uat-lead-converted@aiqadam.test`.

**Screenshot label:** `neg-001-converted-excluded`

---

### Negative 002 — T+7 skipped when no upcoming event

**AC ref:** AC-5

**Precondition:** A separate seed state where `uat-lead-t7-noevent` is verified 8 days ago but NO published event exists in any country with `starts_at > now`.

**Action:** Trigger the tick in this no-event seed state.

**Expected rejection:** `uat-lead-t7-noevent` gets `lead_nurture_value` dispatched (T+3 fires) but `lead_nurture_next_event` is NOT dispatched. No ledger row is written for `(uat-lead-t7-noevent, 'lead_nurture_next_event')`. On the next tick (when an event exists), the T+7 will fire then.

**Screenshot label:** `neg-002-t7-skipped-no-event`

---

### Negative 003 — Lead verified < 3 days ago is not dispatched

**AC ref:** AC-1

**Precondition:** A fresh lead `uat-lead-fresh` with `email_verified_at = now - 1d` (only 1 day ago).

**Action:** Trigger the tick. Observe the response.

**Expected rejection:** `uat-lead-fresh` does NOT appear in the `dispatched` array. The T+3 window has not been reached yet.

**Screenshot label:** `neg-003-fresh-lead-not-dispatched`

---

## Notes

- Step 002 note on double-dispatch for `uat-lead-t7`: a lead verified 8 days ago qualifies for both T+3 and T+7 on the same tick. The service dispatches them both and writes both ledger rows. This is correct behavior, not a bug.
- Negative 002 requires a seed state with no published future events — this conflicts with seeds from other scripts. Either run this test in isolation or create a separate isolated test country (e.g. `tj`) where no future events exist.
- Mail catcher Steps 003 require Mailpit or equivalent. Mark as `deferred` if no mail catcher is running.
- `uat-lead-converted`'s exclusion (Negative 001) is enforced at the SQL level via `WHERE state='lead'`. If the `state` field was inadvertently not updated during conversion, the lead may wrongly receive nurture emails — this would be a data integrity bug to register as a distinct issue.
