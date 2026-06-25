---
code: BP-UAT-002
name: "Operator event control panel"
status: Ready
process_ref: "docs/02-business-processes/operations/operator-event-control.md"
environment: "http://localhost:4321"
seed_required: true
last_run: ""
---

# BP-UAT-002 — Operator Event Control Panel

## Purpose

Verifies the full operator event lifecycle in `/workspace/events`: list view
shows correct counts, detail view allows metadata edits and status transitions,
and the post-event followup checklist can be checked and unchecked. Source
runbook: [operator-event-control.md](../operations/operator-event-control.md).

## Acceptance Criteria

- [ ] AC-1: Event list shows registered / waitlisted / attended counts and capacity for each event.
- [ ] AC-2: Operator can edit title, description, status, capacity, and location on the event detail page.
- [ ] AC-3: Status transitions `draft → published → cancelled` (and reverse) are all accepted.
- [ ] AC-4: Post-event followup checklist items can be checked and unchecked; notes survive the toggle.
- [ ] AC-5: Fields not editable through the cabinet (format, country, starts_at, ends_at) are not present as editable inputs.
- [ ] AC-6: The "Open check-in" CTA is only visible during the live-now phase (`starts_at ≤ now ≤ ends_at`).

## Seed Fixtures Required

| Fixture | Description |
|---|---|
| `uat-operator` | Operator account (`uat-operator@aiqadam.test`, password from `.env.test`), country=`uz` |
| `uat-event-draft-uz` | Draft event in `uz`, capacity=20, 0 registrations, `starts_at` = 7 days from now |
| `uat-event-past-uz` | Past event in `uz`, `status='published'`, `ends_at` = 2 days ago, `post_event_processed=false`, 5 registrations with `status='attended'` |

## Steps

### Step 001 — Sign in as operator

**AC ref:** AC-1

**Precondition:** User is not signed in.

**Action:** Navigate to `/auth/sign-in`. Fill `email` with `uat-operator@aiqadam.test` and `password`. Click **Sign in**.

**Expected UI state:** Redirected to `/workspace`. Operator navigation is visible.

**Screenshot label:** `step-001-operator-signed-in`

---

### Step 002 — Verify event list counts

**AC ref:** AC-1

**Precondition:** Step 001 completed.

**Action:** Navigate to `/workspace/events`.

**Expected UI state:** Event list is visible. `uat-event-draft-uz` row shows `Draft` status and `0 / 20` registration count. `uat-event-past-uz` row shows `Published` status and `5 attended`.

**Screenshot label:** `step-002-event-list`

---

### Step 003 — Open draft event detail

**AC ref:** AC-2, AC-5

**Precondition:** Step 002 completed.

**Action:** Click on `uat-event-draft-uz` in the list.

**Expected UI state:** Event detail panel opens. Editable fields visible: title, description, status (dropdown), capacity, location. Fields NOT present as editable inputs: `format`, `country`, `starts_at`, `ends_at`, `eula_id`.

**Screenshot label:** `step-003-event-detail-fields`

---

### Step 004 — Edit title and capacity

**AC ref:** AC-2

**Precondition:** Step 003 completed.

**Action:** Change the title to `UAT Event UZ — Edited`. Change capacity to `25`. Click **Save**.

**Expected UI state:** Success toast appears. Title and capacity update is reflected on the page. No error banner.

**Screenshot label:** `step-004-edit-saved`

---

### Step 005 — Publish the draft event

**AC ref:** AC-3

**Precondition:** Step 004 completed. Event is `Draft`.

**Action:** Change **Status** to `Published`. Click **Save**.

**Expected UI state:** Status badge changes to `PUBLISHED`. No error.

**Screenshot label:** `step-005-status-published`

---

### Step 006 — Cancel the published event

**AC ref:** AC-3

**Precondition:** Step 005 completed. Event is `Published`.

**Action:** Change **Status** to `Cancelled`. Click **Save**.

**Expected UI state:** Status badge changes to `CANCELLED`. No error.

**Screenshot label:** `step-006-status-cancelled`

---

### Step 007 — Restore to draft

**AC ref:** AC-3

**Precondition:** Step 006 completed. Event is `Cancelled`.

**Action:** Change **Status** to `Draft`. Click **Save**.

**Expected UI state:** Status badge changes to `DRAFT`. No error.

**Screenshot label:** `step-007-status-draft-restored`

---

### Step 008 — Open past event and verify post-event phase

**AC ref:** AC-4, AC-6

**Precondition:** Step 001 completed (signed in).

**Action:** Navigate to `/workspace/events`. Click on `uat-event-past-uz`.

**Expected UI state:** Event detail opens in **post-event** phase. Followup checklist is the primary surface (4 items: `retrospective`, `thank_you_sent`, `recap_posted`, `sponsor_report_delivered`). No "Open check-in" CTA visible (event is not live now).

**Screenshot label:** `step-008-post-event-checklist`

---

### Step 009 — Check a followup item with notes

**AC ref:** AC-4

**Precondition:** Step 008 completed. Followup checklist is visible.

**Action:** Click the checkbox for `retrospective`. In the notes text area that appears, type `UAT test retrospective note`. Click **Save notes**.

**Expected UI state:** Checkbox shows checked state. Notes text is saved and visible. No error.

**Screenshot label:** `step-009-followup-checked`

---

### Step 010 — Uncheck the followup item; notes survive

**AC ref:** AC-4

**Precondition:** Step 009 completed. `retrospective` is checked with notes.

**Action:** Click the checkbox for `retrospective` again to uncheck it.

**Expected UI state:** Checkbox returns to unchecked state. The notes text (`UAT test retrospective note`) is still visible in the collapsed notes area. No error.

**Screenshot label:** `step-010-followup-unchecked-notes-survive`

---

## Negative Scenarios

### Negative 001 — Save button disabled when no changes

**AC ref:** AC-2

**Precondition:** Event detail panel open with no pending edits.

**Action:** Do NOT change any field. Observe the **Save** button state.

**Expected rejection:** **Save** button is disabled (greyed out). No save request fires.

**Screenshot label:** `neg-001-save-disabled-no-changes`

---

### Negative 002 — Non-editable fields absent from form

**AC ref:** AC-5

**Precondition:** Step 003 completed. Event detail panel is open.

**Action:** Inspect the DOM or visually scan all form inputs for `format`, `country`, `starts_at`, `ends_at`, and `eula_id` labels.

**Expected rejection:** None of these fields appear as editable inputs. They may appear as read-only display values but not as `<input>` or `<select>` elements.

**Screenshot label:** `neg-002-no-engineer-only-fields`

---

### Negative 003 — Check-in CTA not visible for future event

**AC ref:** AC-6

**Precondition:** `uat-event-draft-uz` has `starts_at` = 7 days from now (pre-event phase).

**Action:** Open the detail page for `uat-event-draft-uz`.

**Expected rejection:** No "Open check-in" button or link is visible on the page.

**Screenshot label:** `neg-003-no-checkin-cta-pre-event`

---

## Notes

- AC-6 for the live-now phase (CTA visible) is intentionally not covered in a positive step because seeding an event with `starts_at ≤ now ≤ ends_at` is timing-sensitive. If the seed can create such an event, add a Step 011 to verify the CTA appears.
- Followup notes and checkbox are independent PUTs. If checkbox flips but notes don't save, it is a product bug (not an env issue). UATRunner should note both operations separately in the report.
