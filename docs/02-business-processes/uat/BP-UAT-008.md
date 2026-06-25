---
code: BP-UAT-008
name: "Speaker pipeline and post-event cron"
status: Ready
process_ref: "docs/02-business-processes/operations/event-speaker-pipeline.md"
environment: "http://localhost:4321"
seed_required: true
last_run: ""
---

# BP-UAT-008 — Speaker Pipeline and Post-Event Cron

## Purpose

Verifies two related business processes:

1. **Speaker pipeline (F-S1.1b):** An operator confirms a speaker on an event;
   the system dispatches `speaker_added` to all registered attendees and records
   an idempotency ledger row.

2. **Post-event cron (F-S1.1c):** The post-event tick processes an ended event,
   dispatches `speaker_thanks_with_referral_ask` to confirmed speakers and
   `next_event_teaser` to attendees (when a next event exists), then sets
   `post_event_processed=true`.

Source runbook: [event-speaker-pipeline.md](../operations/event-speaker-pipeline.md).

## Acceptance Criteria

- [ ] AC-1: Confirming a speaker via PATCH dispatches `speaker_added` to all `registered`/`attended` event members.
- [ ] AC-2: Confirming the same speaker again (second PATCH to `confirmed`) does NOT re-dispatch (idempotency on `(event, kind, speaker)` tuple).
- [ ] AC-3: Post-event tick dispatches `speaker_thanks_with_referral_ask` to confirmed speakers of an ended event.
- [ ] AC-4: Post-event tick dispatches `next_event_teaser` to attendees when a subsequent published event exists in the same country.
- [ ] AC-5: After the tick, `events.post_event_processed` is set to `true` and a second tick skips the event.
- [ ] AC-6: The post-event tick endpoint rejects requests without `x-internal-auth` (401).

## Seed Fixtures Required

| Fixture | Description |
|---|---|
| `uat-operator` | Operator account (`uat-operator@aiqadam.test`, password from `.env.test`) |
| `uat-event-live-uz` | Published event in `uz`, `starts_at = now + 7 days`, 2 registered members |
| `uat-speaker` | Speaker profile linked to a user account, not yet on `uat-event-live-uz` |
| `uat-member-registered-1` | Member `registered` for `uat-event-live-uz` |
| `uat-member-registered-2` | Member `registered` for `uat-event-live-uz` |
| `uat-event-past-uz` | Past published event in `uz`, `ends_at = 2 hours ago`, `post_event_processed=false`, 1 confirmed speaker (`uat-speaker-past`), 2 `attended` members |
| `uat-speaker-past` | Confirmed speaker (`status='confirmed'`) on `uat-event-past-uz`, linked to a user with email |
| `uat-event-next-uz` | Next published event in `uz`, `starts_at = now + 14 days` (exists so `next_event_teaser` fires) |
| `UAT_INTERNAL_API_TOKEN` | Exposed in `.env.test` |

## Steps

### Step 001 — Sign in as operator

**AC ref:** AC-1

**Precondition:** User is not signed in.

**Action:** Navigate to `/auth/sign-in`. Authenticate as `uat-operator@aiqadam.test`.

**Expected UI state:** Redirected to `/workspace`. Operator navigation visible.

**Screenshot label:** `step-001-operator-signed-in`

---

### Step 002 — Invite speaker to event

**AC ref:** AC-1

**Precondition:** Step 001 completed. `uat-event-live-uz` exists.

**Action:** Use a Playwright `request.post` to call:
```
POST http://localhost:3000/v1/workspace/events/<uat-event-live-uz-id>/speakers
Authorization: Bearer <operator-token>
{ "speakerId": "<uat-speaker-id>", "talkTitle": "UAT Test Talk" }
```

**Expected UI state:** HTTP 201. Response body: `{ eventSpeaker: { status: 'invited', ... } }`. No `speaker_added` dispatch fires on invite (only on confirm).

**Screenshot label:** `step-002-speaker-invited`

---

### Step 003 — Confirm the speaker (triggers speaker_added dispatch)

**AC ref:** AC-1

**Precondition:** Step 002 completed. Speaker is `invited`.

**Action:** Use Playwright `request.patch` to call:
```
PATCH http://localhost:3000/v1/workspace/events/<uat-event-live-uz-id>/speakers/<eventSpeakerId>
Authorization: Bearer <operator-token>
{ "status": "confirmed" }
```

**Expected UI state:** HTTP 200. Response body: `{ eventSpeaker: { status: 'confirmed', confirmedAt: '<timestamp>' } }`. A `speaker_added` dispatch fires within seconds — check API logs or `interactions` collection for `intent='speaker_added'`.

**Screenshot label:** `step-003-speaker-confirmed`

---

### Step 004 — Verify speaker_added ledger row

**AC ref:** AC-1

**Precondition:** Step 003 completed.

**Action:** In Directus admin, open `event_announcements` and filter by `kind='speaker_added'` and `event=<uat-event-live-uz-id>`.

**Expected UI state:** 1 row visible with `speaker=<uat-speaker-id>`, `recipient_count=2` (the two registered members), `sent_at` populated.

**Screenshot label:** `step-004-speaker-added-ledger`

---

### Step 005 — Confirm speaker again (idempotency)

**AC ref:** AC-2

**Precondition:** Step 003 completed. Speaker is `confirmed`. Ledger row exists.

**Action:** Send the same PATCH again: `{ "status": "confirmed" }`.

**Expected UI state:** HTTP 200 (PATCH succeeds). No second `speaker_added` dispatch fires. Still exactly 1 row in `event_announcements` for `(event, kind='speaker_added', speaker)`.

**Screenshot label:** `step-005-confirm-idempotent`

---

### Step 006 — Verify post-event tick auth protection

**AC ref:** AC-6

**Precondition:** API is reachable.

**Action:** POST to `http://localhost:3000/v1/internal/post-event/tick` without `x-internal-auth`.

**Expected UI state:** HTTP 401. No processing occurs.

**Screenshot label:** `step-006-tick-401`

---

### Step 007 — Trigger post-event tick

**AC ref:** AC-3, AC-4, AC-5

**Precondition:** `uat-event-past-uz` has `ends_at` in the past and `post_event_processed=false`. `uat-speaker-past` is confirmed. 2 members have `status='attended'`. `uat-event-next-uz` exists as a future published event.

**Action:** POST to `http://localhost:3000/v1/internal/post-event/tick` with `x-internal-auth: <UAT_INTERNAL_API_TOKEN>`.

**Expected UI state:** HTTP 200. Response body shows:
```json
{
  "evaluated": 1,
  "processed": [{
    "eventId": "<uat-event-past-uz-id>",
    "speakerThanksRecipients": 1,
    "nextEventTeaserRecipients": 2
  }],
  "errors": []
}
```

**Screenshot label:** `step-007-post-event-tick`

---

### Step 008 — Verify post_event_processed is true

**AC ref:** AC-5

**Precondition:** Step 007 completed.

**Action:** In Directus admin, open the `events` collection and find `uat-event-past-uz`. Check the `post_event_processed` field.

**Expected UI state:** `post_event_processed` = `true`.

**Screenshot label:** `step-008-post-event-processed-true`

---

### Step 009 — Second tick skips the event

**AC ref:** AC-5

**Precondition:** Step 008 completed. `post_event_processed=true`.

**Action:** POST to `/v1/internal/post-event/tick` again with `x-internal-auth`.

**Expected UI state:** HTTP 200. `evaluated = 0` OR `uat-event-past-uz` does NOT appear in the `processed` array. No second dispatch fires.

**Screenshot label:** `step-009-second-tick-skips`

---

## Negative Scenarios

### Negative 001 — Speaker confirm on empty event fires no broadcast

**AC ref:** AC-1

**Precondition:** An event with 0 registered members exists. Speaker is invited.

**Action:** Confirm the speaker on the 0-registration event.

**Expected rejection:** `speaker_added` dispatch fires but `recipient_count=0` in the ledger row. No error from the API — "no-audience" is logged and the ledger row is created with count 0. This is expected behavior, not a failure.

**Screenshot label:** `neg-001-no-audience-zero-dispatch`

---

### Negative 002 — Post-event tick skips future events

**AC ref:** AC-3

**Precondition:** `uat-event-live-uz` has `starts_at = now + 7 days` (not past, `ends_at` in the future).

**Action:** Trigger the post-event tick.

**Expected rejection:** `uat-event-live-uz` does NOT appear in the `processed` array. Only events where `ends_at < now AND post_event_processed=false` are processed.

**Screenshot label:** `neg-002-future-event-not-processed`

---

### Negative 003 — No next_event_teaser when no next event exists

**AC ref:** AC-4

**Precondition:** A separate past event exists in `kz` with no future `kz` events scheduled. `uat-event-next-uz` is a `uz` event and does not count for `kz`.

**Action:** Trigger the post-event tick. Observe the `nextEventTeaserRecipients` for any `kz` event in the `processed` array.

**Expected rejection:** `nextEventTeaserRecipients = 0` for the `kz` event (no next event in same country). The `speaker_thanks_with_referral_ask` may still fire; only `next_event_teaser` is skipped.

**Screenshot label:** `neg-003-no-teaser-no-next-event`

---

## Notes

- Steps 002–009 use direct API calls (`request.post` / `request.patch`) because there is no web UI for speaker management in v1 (the `EventControlPanel` speaker panel is deferred). Playwright's `request` context handles this cleanly.
- The post-event tick processes ALL unprocessed past events, not just `uat-event-past-uz`. If other events exist in the test database with `ends_at < now AND post_event_processed=false`, they will also be processed. Seed should ensure clean state or the `evaluated` count should be treated as ≥ 1, not exactly 1.
- Negative 003 (no teaser when no next event) requires a `kz`-country test event to test cross-country isolation. If such a fixture is impractical to seed, mark this scenario as `deferred` with a note.
