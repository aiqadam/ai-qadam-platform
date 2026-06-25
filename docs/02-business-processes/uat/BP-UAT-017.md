---
code: BP-UAT-017
name: "Pre-event member matching (T-7)"
status: Ready
process_ref: "docs/02-business-processes/operations/event-member-matches.md"
environment: "http://localhost:4321"
seed_required: true
last_run: ""
---

# BP-UAT-017 — Pre-Event Member Matching (T-7)

## Purpose

Verifies that the T-7 member-matching tick dispatches personalised
`member_match` emails to opted-in registered attendees (one per recipient,
naming their top-3 matches by shared interest tags), records the idempotency
ledger row, and is a no-op on a second tick. Also verifies that a member with
`appear_in_matches=false` is excluded from both receiving and being named.
Source: [event-member-matches.md](../operations/event-member-matches.md).

## Acceptance Criteria

- [ ] AC-1: A tick against an event in the T-7 window dispatches `member_match` emails to all opted-in registered attendees.
- [ ] AC-2: Each recipient email names up to 3 other attendees (personalised per recipient).
- [ ] AC-3: A second tick returns `already_dispatched` — no second email fires.
- [ ] AC-4: A member with `appear_in_matches=false` is excluded from receiving AND from being named in others' emails.
- [ ] AC-5: The tick endpoint rejects requests without `x-internal-auth` (401).
- [ ] AC-6: An `event_announcements` ledger row with `kind='member_match_t_minus_7'` is created after the first tick.

## Seed Fixtures Required

| Fixture | Description |
|---|---|
| `uat-event-t7-window` | Published `meetup`-format event in `uz`, `starts_at = now + 7d` (inside T-7 window `[6.5d, 7.5d]`). Seed must compute `starts_at` relative to now. |
| `uat-match-member-a` | Member, `appear_in_matches=true`, registered for `uat-event-t7-window`, interests: `['LLMs', 'Python']` |
| `uat-match-member-b` | Member, `appear_in_matches=true`, registered for `uat-event-t7-window`, interests: `['LLMs', 'MLOps']` |
| `uat-match-member-c` | Member, `appear_in_matches=true`, registered for `uat-event-t7-window`, interests: `['MLOps', 'Python']` |
| `uat-match-member-opt-out` | Member, `appear_in_matches=false`, registered for `uat-event-t7-window` — should be excluded |
| `UAT_INTERNAL_API_TOKEN` | Exposed in `.env.test`. |
| Mail catcher | Running at `http://localhost:8025`. |

## Steps

### Step 001 — Auth guard check

**AC ref:** AC-5

**Precondition:** API is reachable.

**Action:** POST to `http://localhost:3000/v1/internal/event-matches/tick` WITHOUT `x-internal-auth` header.

**Expected UI state:** HTTP 401. No dispatch fires.

**Screenshot label:** `step-001-no-auth-401`

---

### Step 002 — Trigger T-7 matching tick (first run)

**AC ref:** AC-1, AC-6

**Precondition:** `uat-event-t7-window` has `starts_at` in the T-7 window. All four members are registered. No `event_announcements` ledger row yet.

**Action:** POST to `http://localhost:3000/v1/internal/event-matches/tick` with `x-internal-auth: <UAT_INTERNAL_API_TOKEN>`.

**Expected UI state:** HTTP 200. Response body contains `dispatched` array with an entry for `uat-event-t7-window` showing `kind='member_match_t_minus_7'` and `recipientCount=3` (the three opted-in members; `uat-match-member-opt-out` is excluded).

**Screenshot label:** `step-002-tick-dispatched`

---

### Step 003 — Verify match emails in mail catcher

**AC ref:** AC-1, AC-2, AC-4

**Precondition:** Step 002 completed. Mail catcher running.

**Action:** Navigate to `http://localhost:8025`. Check emails sent to `uat-match-member-a`, `uat-match-member-b`, and `uat-match-member-c`.

**Expected UI state:**
- Each of the three opted-in members has received exactly one `member_match` email.
- `uat-match-member-opt-out` has received NO email.
- Each email names up to 3 other attendees. Crucially, `uat-match-member-opt-out`'s name does NOT appear in any email.
- The names in each email reflect the interest-overlap ranking (e.g., member-a's email lists member-b and member-c, who share at least one tag with member-a).

**Screenshot label:** `step-003-match-emails`

---

### Step 004 — Verify ledger row created

**AC ref:** AC-6

**Precondition:** Step 002 completed.

**Action:** In Directus admin, open `event_announcements`. Filter by `kind='member_match_t_minus_7'` and `event=<uat-event-t7-window-id>`.

**Expected UI state:** Exactly 1 row with `sent_at` populated and `recipient_count=3`.

**Screenshot label:** `step-004-ledger-row`

---

### Step 005 — Second tick is idempotent

**AC ref:** AC-3

**Precondition:** Step 002 completed. Ledger row exists.

**Action:** POST to `/v1/internal/event-matches/tick` again immediately.

**Expected UI state:** HTTP 200. `uat-event-t7-window` appears in `skipped` with `reason='already_dispatched'`. No new emails in mail catcher for any of the three members.

**Screenshot label:** `step-005-second-tick-idempotent`

---

## Negative Scenarios

### Negative 001 — Opted-out member not named in any match email

**AC ref:** AC-4

**Precondition:** Step 003 completed. Emails are visible in mail catcher.

**Action:** Open each of the three match emails. Search the email body for `uat-match-member-opt-out`'s display name.

**Expected rejection:** `uat-match-member-opt-out`'s name does not appear in any of the three emails. Their profile is excluded from the scoring algorithm entirely.

**Screenshot label:** `neg-001-opt-out-not-named`

---

### Negative 002 — Event outside T-7 window not dispatched

**AC ref:** AC-1

**Precondition:** An event with `starts_at = now + 14d` (outside the `[6.5d, 7.5d]` window).

**Action:** Trigger the tick. Observe the response.

**Expected rejection:** The 14-day-out event does NOT appear in the `dispatched` array. It may appear in `skipped` with a reason like `outside_window`, or simply not appear at all.

**Screenshot label:** `neg-002-outside-window-not-dispatched`

---

### Negative 003 — Fewer than 2 opted-in attendees produces no dispatch

**AC ref:** AC-1

**Precondition:** A separate published event in the T-7 window with only 1 opted-in registered member (no other opted-in attendees to match with).

**Action:** Trigger the tick.

**Expected rejection:** That event appears in the `skipped` array with reason `no_eligible_attendees` (or is absent from `dispatched`). No match email is sent. No ledger row is created for it.

**Screenshot label:** `neg-003-no-eligible-attendees`

---

## Notes

- The T-7 window is `starts_at ∈ [now+6.5d, now+7.5d]`. `uat-event-t7-window` must be seeded with `starts_at = now + exactly 7 days` relative to seed execution. If the seed and UAT run are separated by more than 12 hours, the event may drift outside the window.
- Email personalisation (AC-2) verification requires reading email bodies in the mail catcher. The ranking by shared-interest-tag count can be spot-checked: member-a (`LLMs, Python`) should rank member-b (`LLMs, MLOps` — 1 shared) and member-c (`MLOps, Python` — 1 shared) equally. Exact ordering tiebreaks by first name; UATRunner records the names seen and notes whether the algorithm produced a plausible ranking.
- The T+3 post-registration trigger (F-S1.5b, endpoint `/v1/internal/event-matches-post-reg/tick`) is a separate cron and is not tested here — it shares the same `member_match_dispatches` ledger so the two are mutually exclusive per `(user, event)`.
