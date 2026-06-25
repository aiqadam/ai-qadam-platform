---
code: BP-UAT-016
name: "Member referral programme"
status: Ready
process_ref: "docs/02-business-processes/operations/member-referrals.md"
environment: "http://localhost:4321"
seed_required: true
last_run: ""
---

# BP-UAT-016 — Member Referral Programme

## Purpose

Verifies the full referral attribution chain: a member mints a referral code at
`/me/referrals`, shares a `?ref=<code>` URL, a new visitor lands on it (cookie
set), the visitor registers for an event, and `registrations.referred_by` is
stamped with the referrer's ID. Also verifies idempotent code minting and that
self-referral is blocked. Source:
[member-referrals.md](../operations/member-referrals.md),
[FR-USR-005](../../03-requirements/FR-USR-005.md).

## Acceptance Criteria

- [ ] AC-1: A member can mint a referral code at `/me/referrals`; the code appears in the list.
- [ ] AC-2: Minting again returns the same active code (idempotent).
- [ ] AC-3: A visitor landing on `/?ref=<code>` has the `aiqadam-ref-owner` cookie set.
- [ ] AC-4: When the visitor registers for an event after landing via the referral URL, `registrations.referred_by` is set to the referrer's user ID.
- [ ] AC-5: Self-referral (referrer registers using their own code) is discarded — `referred_by` is not set.
- [ ] AC-6: A bogus or expired code silently resolves to null (`referred_by` not set); no error shown to visitor.

## Seed Fixtures Required

| Fixture | Description |
|---|---|
| `uat-referrer` | Member account (`uat-referrer@aiqadam.test`, password from `.env.test`), country=`uz` |
| `uat-referee` | Member account (`uat-referee@aiqadam.test`, password from `.env.test`), country=`uz` — will register via referral link |
| `uat-event-open-uz` | Published event in `uz`, capacity available, `starts_at` = 7 days from now |

## Steps

### Step 001 — Mint a referral code

**AC ref:** AC-1

**Precondition:** Signed in as `uat-referrer@aiqadam.test`.

**Action:** Navigate to `/me/referrals`. Click **Mint my code** (or equivalent button).

**Expected UI state:** A 6-character referral code appears in the list (e.g., `AB12CD`). A share URL is shown: `http://localhost:4321/?ref=AB12CD`.

**Screenshot label:** `step-001-code-minted`

---

### Step 002 — Mint again is idempotent

**AC ref:** AC-2

**Precondition:** Step 001 completed. Code `AB12CD` is visible.

**Action:** Click **Mint my code** again.

**Expected UI state:** The same code `AB12CD` is shown — no second code is created. The list still has one active code.

**Screenshot label:** `step-002-idempotent-mint`

---

### Step 003 — Land on referral URL as visitor (sets cookie)

**AC ref:** AC-3

**Precondition:** Step 001 completed. Referral URL is `http://localhost:4321/?ref=<code>`. Open a new browser context (incognito or a second browser context) so there is no existing session or attribution cookie.

**Action:** In the new browser context, navigate to `http://localhost:4321/?ref=<code>`.

**Expected UI state:** Homepage loads normally. In browser devtools → Application → Cookies, the `aiqadam-ref-owner` cookie is set with the referrer's user ID as the value.

**Screenshot label:** `step-003-referral-cookie-set`

---

### Step 004 — Referred visitor registers and referred_by is stamped

**AC ref:** AC-4

**Precondition:** Step 003 completed. `aiqadam-ref-owner` cookie is present in the visitor's browser context. Visitor is `uat-referee@aiqadam.test`.

**Action:** In the same browser context (cookie still present), sign in as `uat-referee@aiqadam.test`. Navigate to `uat-event-open-uz` detail page. Click **Register**.

**Expected UI state:** Registration succeeds — sidebar shows "You're registered ✓". In the background, `POST /v1/events/:id/register` was called with `referredBy: <referrer-user-id>` from the cookie. The `registrations` row for `uat-referee` on `uat-event-open-uz` has `referred_by = <uat-referrer-id>`.

**Screenshot label:** `step-004-referral-registration`

---

### Step 005 — Verify referred_by in registration record

**AC ref:** AC-4

**Precondition:** Step 004 completed.

**Action:** In Directus admin, open the `registrations` collection and find the row for `uat-referee` on `uat-event-open-uz`. Check the `referred_by` field.

**Expected UI state:** `referred_by` = the UUID of `uat-referrer`. Not null, not `uat-referee`'s own ID.

**Screenshot label:** `step-005-referred-by-in-db`

---

## Negative Scenarios

### Negative 001 — Self-referral is discarded

**AC ref:** AC-5

**Precondition:** `uat-referrer`'s code is known from Step 001.

**Action:** In a new browser context, navigate to `http://localhost:4321/?ref=<code>`. Sign in as `uat-referrer@aiqadam.test` (the code owner). Register for a different available event.

**Expected rejection:** The registration row for `uat-referrer` has `referred_by = null`. The server-side self-referral check (`input.referredBy !== directusUserId`) discards the attribution silently. Registration still succeeds.

**Screenshot label:** `neg-001-self-referral-discarded`

---

### Negative 002 — Bogus ref code resolves silently to null

**AC ref:** AC-6

**Precondition:** New browser context with no cookies.

**Action:** Navigate to `http://localhost:4321/?ref=XXXXXX` (code that does not exist).

**Expected rejection:** Homepage loads normally. No error shown to the visitor. The `aiqadam-ref-owner` cookie is either absent or set to null/empty. A subsequent registration would have `referred_by = null`.

**Screenshot label:** `neg-002-bogus-code-no-error`

---

### Negative 003 — First-touch attribution is not overwritten

**AC ref:** AC-3 (first-touch invariant)

**Precondition:** Browser context already has `aiqadam-attribution` cookie from a prior visit (first touch = `utm_source=telegram`).

**Action:** Land on `http://localhost:4321/?ref=<code>&utm_source=email` in the same browser context.

**Expected rejection:** The `aiqadam-attribution` cookie's `first_touch` field is unchanged (still `utm_source=telegram`). The `last_touch` field updates to `utm_source=email`. First-touch is never overwritten.

**Screenshot label:** `neg-003-first-touch-preserved`

---

## Notes

- Step 005 (Directus admin verification of `referred_by`) requires engineer-level access. UATRunner records the expected result; BusinessAnalyst cross-checks in Directus after the run. Alternatively, a debug API endpoint can expose the registration fields if available.
- Step 004 requires the `aiqadam-ref-owner` cookie to persist from Step 003 into the registration request. Use a single Playwright browser context across Steps 003–004 to ensure the cookie survives. Do NOT use `context.clearCookies()` between these steps.
- The +25 referral point award (when a referred member attends) is described in FR-GAM-001 but requires a check-in to trigger — it is not verified here to keep scope tight. This can be added as a follow-up step once BP-UAT-011 is passing.
- Cookie TTL is 90 days. In a local test environment, the cookie will persist for the duration of the UAT session without issue.
