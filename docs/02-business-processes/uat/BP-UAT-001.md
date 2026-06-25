---
code: BP-UAT-001
name: "Event publication broadcast"
status: Ready
process_ref: "docs/02-business-processes/operations/event-publication-broadcast.md"
environment: "http://localhost:4321"
seed_required: true
last_run: ""
---

# BP-UAT-001 — Event Publication Broadcast

## Purpose

Verifies that when an operator publishes an event, the system dispatches a
`event_announce` notification to all members in the event's country who have
`events` consent. Also verifies idempotency (re-saving a published event does
not re-broadcast) and the no-audience edge case. Source runbook:
[event-publication-broadcast.md](../operations/event-publication-broadcast.md).

## Acceptance Criteria

- [ ] AC-1: Publishing a draft event triggers exactly one `event_announce` dispatch to consented country members.
- [ ] AC-2: The `event_announcements` ledger row is created with correct `kind='published'`, `recipient_count`, and `sent_at`.
- [ ] AC-3: Re-saving a published event (no status change) does NOT create a second dispatch.
- [ ] AC-4: A member without `events` consent is NOT included in the recipient count.
- [ ] AC-5: An unauthenticated user cannot access the operator event control panel.

## Seed Fixtures Required

| Fixture | Description |
|---|---|
| `uat-operator` | Operator account (`uat-operator@aiqadam.test`, password from `.env.test`), country=`uz` |
| `uat-member-consented` | Member account (`uat-member-c@aiqadam.test`), country=`uz`, `member_consents.purpose='events'` active |
| `uat-member-no-consent` | Member account (`uat-member-nc@aiqadam.test`), country=`uz`, no `member_consents` row for `events` |
| `uat-event-draft-uz` | Event in `uz` tenant, `status='draft'`, capacity=20, 0 registrations |

## Steps

### Step 001 — Operator sign-in

**AC ref:** AC-5

**Precondition:** User is not signed in.

**Action:** Navigate to `/auth/sign-in`. Fill `email` with `uat-operator@aiqadam.test` and `password` with the `.env.test` value. Click **Sign in**.

**Expected UI state:** Redirected to `/workspace`. Operator dashboard is visible with navigation items including **Events**.

**Screenshot label:** `step-001-operator-signed-in`

---

### Step 002 — Open draft event

**AC ref:** AC-1

**Precondition:** Step 001 completed. Operator is on `/workspace`.

**Action:** Navigate to `/workspace/events`. Click on the event named `uat-event-draft-uz`.

**Expected UI state:** Event control panel opens. Status badge shows `DRAFT`. Edit fields (title, status, capacity) are visible.

**Screenshot label:** `step-002-event-detail-draft`

---

### Step 003 — Publish the event

**AC ref:** AC-1, AC-2

**Precondition:** Step 002 completed. Event is in `DRAFT` status.

**Action:** Change the **Status** field from `Draft` to `Published`. Click **Save**.

**Expected UI state:** Success toast/confirmation appears. Status badge updates to `PUBLISHED`. No error banner.

**Screenshot label:** `step-003-event-published`

---

### Step 004 — Verify ledger row via API

**AC ref:** AC-2

**Precondition:** Step 003 completed.

**Action:** In the browser, navigate to `http://localhost:3000/v1/workspace/events/<uat-event-draft-uz-id>/announce-ledger` with the operator's bearer token (use browser devtools network tab to copy it). Alternatively, observe the network panel for a response from the PATCH `/v1/workspace/events/:id` that returned 200.

**Expected UI state:** The PATCH response body shows `status: 'published'`. In the network panel, no second dispatch request fires. The page shows the event remains in `PUBLISHED` state.

**Screenshot label:** `step-004-patch-response-visible`

---

### Step 005 — Re-save published event (idempotency check)

**AC ref:** AC-3

**Precondition:** Step 003 completed. Event is already `PUBLISHED`.

**Action:** Without changing the status, click **Save** again (if Save is enabled) OR change the **title** to `UAT Event UZ (updated)`, click **Save**, then open the network tab to observe the outgoing requests.

**Expected UI state:** Only a single PATCH to `/v1/workspace/events/:id` fires. No second `event_announcements` ledger row is created (observable by the absence of a second dispatch in network logs or by checking the Directus admin panel). Success toast appears.

**Screenshot label:** `step-005-no-second-broadcast`

---

### Step 006 — Verify consented member count

**AC ref:** AC-1, AC-4

**Precondition:** Step 003 completed.

**Action:** Open browser devtools → Network tab. Re-navigate to `/workspace/events` then back to the event detail. Observe the `recipient_count` value visible in any operator summary (or inferred from event response).

**Expected UI state:** The event control panel shows the event is published. No error banner. The broadcast has fired once (visible in network or via manual ledger check). The `uat-member-no-consent` user is NOT in the recipient list (cannot verify in UI directly — record this as `expected: 1 recipient (uat-member-consented only)`).

**Screenshot label:** `step-006-event-detail-post-publish`

---

## Negative Scenarios

### Negative 001 — Unauthenticated access to operator panel

**AC ref:** AC-5

**Precondition:** User is not signed in (no active session cookie).

**Action:** Navigate directly to `/workspace/events`.

**Expected rejection:** Redirected to `/auth/sign-in` (or equivalent auth wall). The workspace event list is NOT visible.

**Screenshot label:** `neg-001-unauth-redirect`

---

### Negative 002 — Re-publish does not duplicate broadcast

**AC ref:** AC-3

**Precondition:** The `uat-event-draft-uz` is already `PUBLISHED` (Step 003 complete). A `event_announcements` ledger row exists for `(event, kind='published')`.

**Action:** Navigate to the Directus admin at `http://localhost:8055` (engineer session). Open the `event_announcements` collection and count rows for the event. Then return to the operator panel and click Save again.

**Expected rejection:** Still only 1 `event_announcements` row for `(event, kind='published')`. The second save does NOT insert a second row.

**Screenshot label:** `neg-002-single-ledger-row`

---

## Notes

- The broadcast fires best-effort (`.catch()` on the service side) — the PATCH response returns 200 even if dispatch fails. A failed dispatch shows in api logs but NOT as a UI error. UATRunner should note if the network panel shows any 5xx from the API during publish.
- `uat-member-no-consent` receipt verification requires checking the `deliveries` collection in Directus admin or api logs — not surfaced in the operator UI in v1.
- Seed must ensure the `uat-event-draft-uz` event's `country='uz'` matches the operator's country scope.
