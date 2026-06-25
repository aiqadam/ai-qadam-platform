---
code: BP-UAT-005
name: "Operator announce composer"
status: Ready
process_ref: "docs/02-business-processes/operations/operator-announce-composer.md"
environment: "http://localhost:4321"
seed_required: true
last_run: ""
---

# BP-UAT-005 — Operator Announce Composer

## Purpose

Verifies that an operator can select a saved cohort, compose a message
(subject + body), preview the audience count, and successfully send the
announcement via `/workspace/announce`. Also verifies that the post-send
breakdown (sent / skipped_consent / failed) is visible and that a member
without the matching consent is counted as `skipped_consent`, not delivered.
Source runbook: [operator-announce-composer.md](../operations/operator-announce-composer.md).

## Acceptance Criteria

- [ ] AC-1: Operator can select a saved cohort; member count is shown inline.
- [ ] AC-2: Operator can compose a subject and body and preview the message.
- [ ] AC-3: Clicking Send fires a POST to `/v1/workspace/announce` and shows a confirmation dialog with recipient count.
- [ ] AC-4: After send, a breakdown panel shows sent / skipped_consent / failed counts.
- [ ] AC-5: A member without matching consent is counted as `skipped_consent`, not `sent`.
- [ ] AC-6: Consent basis defaults to `explicit_opt_in` in the UI.

## Seed Fixtures Required

| Fixture | Description |
|---|---|
| `uat-operator` | Operator account (`uat-operator@aiqadam.test`, password from `.env.test`), country=`uz` |
| `uat-cohort-uz-events` | Saved cohort: `uz` country + consent purpose=`events` — contains `uat-member-consented` only |
| `uat-member-consented` | Member in `uz` with active `member_consents.purpose='events'` |
| `uat-member-no-consent` | Member in `uz` with NO `member_consents.purpose='events'` row |

Note: `uat-member-no-consent` should NOT be in `uat-cohort-uz-events` because the cohort filters on consent. This tests that raw audience resolution (which re-checks per-recipient consent inside the dispatcher) correctly skips them if they somehow made it in.

## Steps

### Step 001 — Sign in as operator

**AC ref:** AC-1

**Precondition:** User is not signed in.

**Action:** Navigate to `/auth/sign-in`. Fill credentials for `uat-operator@aiqadam.test`. Click **Sign in**.

**Expected UI state:** Redirected to `/workspace`. Operator navigation visible.

**Screenshot label:** `step-001-operator-signed-in`

---

### Step 002 — Open announce composer

**AC ref:** AC-1

**Precondition:** Step 001 completed.

**Action:** Navigate to `/workspace/announce`.

**Expected UI state:** Announce composer UI is visible with: cohort picker, subject field, body field, consent basis selector, Preview button, Send button.

**Screenshot label:** `step-002-announce-composer`

---

### Step 003 — Select saved cohort

**AC ref:** AC-1

**Precondition:** Step 002 completed.

**Action:** Open the **Cohort** dropdown and select `uat-cohort-uz-events`.

**Expected UI state:** Cohort is selected. Member count shown inline (should reflect 1 — `uat-member-consented`).

**Screenshot label:** `step-003-cohort-selected`

---

### Step 004 — Compose subject and body

**AC ref:** AC-2

**Precondition:** Step 003 completed.

**Action:** Fill **Subject** with `UAT Test Announcement`. Fill **Body** with `This is a UAT test message. Please disregard.`

**Expected UI state:** Both fields are filled. No validation error.

**Screenshot label:** `step-004-message-composed`

---

### Step 005 — Verify consent basis default

**AC ref:** AC-6

**Precondition:** Step 002 completed (composer is open).

**Action:** Observe the **Consent basis** selector without changing it.

**Expected UI state:** Consent basis shows `Explicit opt-in` (or `explicit_opt_in`) as the default selected value.

**Screenshot label:** `step-005-consent-basis-default`

---

### Step 006 — Preview

**AC ref:** AC-2

**Precondition:** Step 004 completed.

**Action:** Click **Preview**.

**Expected UI state:** Preview panel opens showing: current member count for the cohort and the rendered text version of the message body.

**Screenshot label:** `step-006-preview`

---

### Step 007 — Send and confirm dialog

**AC ref:** AC-3

**Precondition:** Step 006 completed.

**Action:** Click **Send**. When the confirmation dialog appears, read the recipient count shown. Click **Confirm** (or equivalent accept button).

**Expected UI state:** Confirmation dialog shows the correct recipient count (≥ 1). After confirm, dialog closes and a success state appears.

**Screenshot label:** `step-007-send-confirmed`

---

### Step 008 — View post-send breakdown

**AC ref:** AC-4, AC-5

**Precondition:** Step 007 completed. Send was accepted.

**Action:** Observe the post-send breakdown panel that appears after send.

**Expected UI state:** Breakdown shows at minimum: `sent: 1` (for `uat-member-consented`), `skipped_consent: 0` (because cohort already filtered by consent), `failed: 0`. An `interactionId` is visible for audit cross-reference.

**Screenshot label:** `step-008-send-breakdown`

---

## Negative Scenarios

### Negative 001 — Send blocked without cohort selected

**AC ref:** AC-1

**Precondition:** Announce composer is open. No cohort selected.

**Action:** Leave the cohort picker empty. Attempt to click **Send** or **Preview**.

**Expected rejection:** **Send** / **Preview** button is disabled or an inline validation error appears ("Please select a cohort"). No POST request fires.

**Screenshot label:** `neg-001-no-cohort-send-blocked`

---

### Negative 002 — Send blocked without subject

**AC ref:** AC-2

**Precondition:** Cohort selected. Body filled. Subject left empty.

**Action:** Click **Send**.

**Expected rejection:** Validation error appears requiring subject. No confirmation dialog. No POST request fires.

**Screenshot label:** `neg-002-no-subject-blocked`

---

### Negative 003 — Consent basis `operational_contract` requires deliberate selection

**AC ref:** AC-6

**Precondition:** Announce composer is open.

**Action:** Observe whether `operational_contract` is the default. If a selector exists, note what interaction is required to switch to it.

**Expected rejection:** `operational_contract` is NOT the default. The operator must actively change the selector to reach it. Default is `explicit_opt_in`.

**Screenshot label:** `neg-003-operational-not-default`

---

## Notes

- The `skipped_consent` scenario (AC-5) where a member in the cohort lacks consent is difficult to test directly through the UI because the cohort used in seed already filters on consent. To test this explicitly, the seed must include a cohort that does NOT filter on consent and contains `uat-member-no-consent`. UATRunner should note this limitation if it cannot be seeded.
- A/B testing, scheduling, drafts, and first-name interpolation are explicitly out of scope for v1 — UATRunner should not test for these features.
- Rich markdown in the body (links, lists, headings) is deferred; plain text only in v1.
