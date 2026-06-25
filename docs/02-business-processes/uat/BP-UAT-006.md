---
code: BP-UAT-006
name: "Event CSAT — capture and operator surface"
status: Ready
process_ref: "docs/02-business-processes/operations/event-csat.md"
environment: "http://localhost:4321"
seed_required: true
last_run: ""
---

# BP-UAT-006 — Event CSAT Capture and Operator Surface

## Purpose

Verifies the end-to-end CSAT flow: a member submits a rating via the public
`/feedback/csat` form using a token-authenticated link, the response is stored
anonymously, and the operator sees the aggregate summary in the post-event
CSAT card at `/workspace/events/[id]`. Also verifies idempotency (one response
per member per event) and anonymity (operator cannot identify who submitted
which score). Source runbook: [event-csat.md](../operations/event-csat.md).

## Acceptance Criteria

- [ ] AC-1: A valid CSAT token link opens the rating form at `/feedback/csat`.
- [ ] AC-2: Submitting a rating 1–5 (with optional comment) returns success and marks the delivery as `responded`.
- [ ] AC-3: Submitting a second rating for the same token returns a 409 "Already responded" error.
- [ ] AC-4: An invalid or expired token returns a 401 error.
- [ ] AC-5: The operator CSAT card at `/workspace/events/[id]` shows count, avg rating, response rate, and distribution.
- [ ] AC-6: The CSAT card does NOT expose any link between a rating and a specific member (anonymity).

## Seed Fixtures Required

| Fixture | Description |
|---|---|
| `uat-operator` | Operator account (`uat-operator@aiqadam.test`, password from `.env.test`) |
| `uat-member` | Member account (`uat-member@aiqadam.test`, password from `.env.test`) |
| `uat-event-past-uz` | Past published event (`ends_at` = 2 days ago, `post_event_processed=true`), country=`uz` |
| `uat-csat-delivery` | Pre-minted CSAT delivery: a `csat`-intent delivery row for `uat-member` for `uat-event-past-uz`, `state='sent'`. The seed script must also mint the HMAC JWT token and expose it as `UAT_CSAT_TOKEN` env var for the test to use. |
| `uat-csat-responded-delivery` | A second CSAT delivery row already in `state='responded'` (to test AC-3 idempotency). Seed exposes its token as `UAT_CSAT_RESPONDED_TOKEN`. |

## Steps

### Step 001 — Open CSAT form with valid token

**AC ref:** AC-1

**Precondition:** `UAT_CSAT_TOKEN` is set in the test environment (from seed).

**Action:** Navigate to `/feedback/csat?t=<UAT_CSAT_TOKEN>`.

**Expected UI state:** CSAT form is visible. Rating selector (1–5 stars or radio buttons) is shown. Optional comment field is visible. Submit button is present.

**Screenshot label:** `step-001-csat-form`

---

### Step 002 — Submit rating 5 with a comment

**AC ref:** AC-2

**Precondition:** Step 001 completed. Form is open.

**Action:** Select rating **5**. Fill the comment field with `UAT test comment — great event`. Click **Submit**.

**Expected UI state:** Success confirmation page or message appears: "Thank you for your feedback." No error. The delivery is now `state='responded'` (not directly visible in UI — inferred from no error).

**Screenshot label:** `step-002-csat-submitted`

---

### Step 003 — Operator views CSAT card

**AC ref:** AC-5, AC-6

**Precondition:** Step 002 completed. Rating was submitted. Operator signs in.

**Action:** Sign in as `uat-operator@aiqadam.test`. Navigate to `/workspace/events` and open `uat-event-past-uz`. Scroll to the **CSAT** card (visible in post-event phase).

**Expected UI state:** CSAT card shows:
- `count` ≥ 1 (the response just submitted)
- `avg` = 5.0 (only one response, rated 5)
- `responseRate` > 0
- `distribution` shows `5: 1`
- Comment preview shows `UAT test comment — great event` with rating `5`
- No member name, email, or user ID visible alongside the rating or comment

**Screenshot label:** `step-003-csat-operator-card`

---

### Step 004 — Verify anonymity: no member identity in card

**AC ref:** AC-6

**Precondition:** Step 003 completed. CSAT card is visible.

**Action:** Inspect the comment list in the CSAT card. Check each comment row for any display of member name, email, handle, or avatar.

**Expected UI state:** Comment rows show only: `rating` (number), `comment` (text), `receivedAt` (timestamp). No member identity field is visible.

**Screenshot label:** `step-004-no-member-identity`

---

## Negative Scenarios

### Negative 001 — Invalid token returns 401

**AC ref:** AC-4

**Precondition:** User is on any page.

**Action:** Navigate to `/feedback/csat?t=this-is-not-a-valid-token`.

**Expected rejection:** Error page or inline error showing "Invalid token" or "401 Unauthorized". The rating form is NOT shown.

**Screenshot label:** `neg-001-invalid-token`

---

### Negative 002 — Already-responded token returns "Already responded"

**AC ref:** AC-3

**Precondition:** `UAT_CSAT_RESPONDED_TOKEN` is set (delivery already in `state='responded'`).

**Action:** Navigate to `/feedback/csat?t=<UAT_CSAT_RESPONDED_TOKEN>`. If the form loads, attempt to submit any rating.

**Expected rejection:** Error message "Already responded" (409). The form either does not load, or submitting it shows the error. The `interaction_responses` table does NOT gain a second row for this delivery.

**Screenshot label:** `neg-002-already-responded`

---

### Negative 003 — Missing token returns "Missing token" error

**AC ref:** AC-1

**Precondition:** User is on any page.

**Action:** Navigate to `/feedback/csat` (no `?t=` query param).

**Expected rejection:** Error page or inline message indicating the token is missing. The rating form is NOT shown.

**Screenshot label:** `neg-003-missing-token`

---

## Notes

- The CSAT token (`UAT_CSAT_TOKEN`) must be minted by the seed script using the same `JWT_SIGNING_SECRET` as the running API. If `JWT_SIGNING_SECRET` is different from the seed-time value, all token verifications will fail with 401 — this is an env issue, not a product bug. UATRunner should flag this as `failed-escalate` if Step 001 returns 401.
- The anonymity check (AC-6 / Step 004) is a UI-level check only. The deeper invariant (operator API never traverses `delivery → recipient_user`) is verified in unit tests, not here.
- The CSAT card is only visible when the event phase = `post` (`ends_at < now`). If `uat-event-past-uz` seed has `ends_at` in the future, the card will not render — this is an env issue.
