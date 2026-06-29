---
code: BP-UAT-013
name: "Member signup and operator onboarding"
status: Ready
process_ref: "docs/03-requirements/FR-USR-001.md"
environment: "http://localhost:4321"
seed_required: true
last_run: ""
---

# BP-UAT-013 — Member Signup and Operator Onboarding

## Purpose

Verifies two entry-point flows:

1. **Lead capture:** an anonymous visitor submits the lead form on the homepage,
   receives an email verification link, and clicking it marks them as verified.
   Honeypot anti-spam and idempotent re-submission are also tested.

2. **Operator onboarding:** an invited operator uses a token-gated `/onboard` link
   to accept their invite, set a password, and accept the AUP. A used or expired
   token returns 410.

Source: [FR-USR-001](../../03-requirements/FR-USR-001.md).

## Acceptance Criteria

- [ ] AC-1: Lead capture form on `/` submits successfully; the submitter receives a verification email within 60 seconds.
- [ ] AC-2: Clicking the verify link transitions `email_verified` from `false` to `true` and shows `/leads/verified`.
- [ ] AC-3: Submitting the lead form a second time with the same email returns 202 without sending a second email.
- [ ] AC-4: A honeypot field value causes the submission to be silently discarded (202 but no row created).
- [ ] AC-5: The operator `/onboard?token=<valid>` page shows invite details and accepts password + AUP.
- [ ] AC-6: Using an already-accepted onboarding token returns a 410 Gone page.
- [ ] AC-7: Using an expired onboarding token returns a 410 Gone page.

## Seed Fixtures Required

The `uat-seed.sh` script seeds four `operator_invites` rows for BP-UAT-013.
All three happy-path rows (valid, used, expired) share the same Authentik
user email so the api can resolve them at accept-time. The fourth row
deliberately uses an email with no matching Authentik user to exercise
the api's `invite_missing_authentik_user` error path. Tokens are static
public test fixtures — never used in production.

| Fixture | Email | `display_name` | Description |
|---|---|---|---|
| `uat-onboard-token` | `uat-operator@aiqadam.test` | `UAT Operator (valid)` | A valid, unused operator invite token. Exposed as `UAT_ONBOARD_TOKEN` in `.env.test`. |
| `uat-onboard-used-token` | `uat-operator@aiqadam.test` | `UAT Operator (used)` | An operator invite token that has already been accepted (`used_at` is set). Exposed as `UAT_ONBOARD_USED_TOKEN`. |
| `uat-onboard-expired-token` | `uat-operator@aiqadam.test` | `UAT Operator (expired)` | An operator invite token with `expires_at` in the past. Exposed as `UAT_ONBOARD_EXPIRED_TOKEN`. |
| `uat-onboard-no-user-token` | `uat-operator+no-user@aiqadam.test` | `UAT Operator (no-user)` | An operator invite row whose email has no matching Authentik user; exercises the api's `invite_missing_authentik_user` (409) error path. Exposed as `UAT_ONBOARD_NO_USER_TOKEN`. |
| Mail catcher | — | — | Local mail-catcher (e.g., Mailpit at `http://localhost:8025`) is running to capture outbound emails. |

## Steps

### Step 001 — Submit lead capture form on homepage

**AC ref:** AC-1

**Precondition:** User is not signed in. Mail catcher is running.

**Action:** Navigate to `http://localhost:4321`. Locate the lead capture form (embedded on the homepage). Fill **Email** with `uat-lead-new@aiqadam.test`. Click **Submit** (or equivalent CTA).

**Expected UI state:** Success message appears ("Check your inbox" or equivalent). No error banner. The form is cleared or shows a success state.

**Screenshot label:** `step-001-lead-form-submitted`

---

### Step 002 — Verify email arrives in mail catcher

**AC ref:** AC-1

**Precondition:** Step 001 completed.

**Action:** Navigate to the mail catcher UI at `http://localhost:8025`. Find the email sent to `uat-lead-new@aiqadam.test`.

**Expected UI state:** An email with subject containing "verify" or "confirm" is present. The email body contains a link to `/v1/leads/verify?token=...` or `http://localhost:4321/leads/verify?token=...`.

**Screenshot label:** `step-002-verify-email-in-mailcatcher`

---

### Step 003 — Click verification link

**AC ref:** AC-2

**Precondition:** Step 002 completed. Verification link extracted from the email.

**Action:** Click the verification link from the email (or navigate to the URL directly).

**Expected UI state:** Browser lands at `http://localhost:4321/leads/verified`. Page shows a success confirmation ("Your email is verified" or equivalent). No error.

**Screenshot label:** `step-003-lead-verified`

---

### Step 004 — Re-submit the same email (idempotency)

**AC ref:** AC-3

**Precondition:** Step 001 completed. `uat-lead-new@aiqadam.test` is already in the system.

**Action:** Navigate back to `http://localhost:4321`. Submit the lead form again with the same email `uat-lead-new@aiqadam.test`.

**Expected UI state:** Success message appears (same as Step 001 — the API returns 202 idempotently). Navigate to mail catcher — only one verify email exists for this address (no second email sent).

**Screenshot label:** `step-004-idempotent-lead-resubmit`

---

### Step 005 — Open operator onboarding link

**AC ref:** AC-5

**Precondition:** `UAT_ONBOARD_TOKEN` is set. User is not signed in.

**Action:** Navigate to `http://localhost:4321/onboard?token=<UAT_ONBOARD_TOKEN>`.

**Expected UI state:** Onboarding page loads. Invite details are visible (invitee email, invited-by name, role). A form to set password and accept AUP is present. A **Set password and accept** button (or equivalent) is visible. All three invite rows point to the seeded `uat-operator@aiqadam.test` Authentik user; rows are distinguished by token + `display_name` ("UAT Operator (valid/used/expired)").

**Screenshot label:** `step-005-onboard-page`

---

### Step 006 — Complete operator onboarding

**AC ref:** AC-5

**Precondition:** Step 005 completed. The api will find the matching Authentik user (`uat-operator@aiqadam.test`) for the invite row — Step 006 should now succeed end-to-end.

**Action:** Fill **Password** with `UAT_ONBOARD_PASSWORD` (a valid password meeting Authentik's policy). Check the AUP acceptance checkbox. Click **Set password and accept**.

**Expected UI state:** Onboarding completes successfully. Browser redirects to `/me` or a welcome page. The invite token is now marked as used.

**Screenshot label:** `step-006-onboard-completed`

---

## Negative Scenarios

### Negative 001 — Honeypot field filled discards submission silently

**AC ref:** AC-4

**Precondition:** User is on the homepage lead capture form.

**Action:** Use Playwright to programmatically set the hidden honeypot field (`name="company"`) to a non-empty value (e.g., `"bot-value"`). Submit the form with a new email `uat-lead-honeypot@aiqadam.test`.

**Expected rejection:** The form returns a 202 response (same as success — silent discard). No email arrives in mail catcher for `uat-lead-honeypot@aiqadam.test`. No `directus_users` row is created for this email (verify via Directus admin or API).

**Screenshot label:** `neg-001-honeypot-silent-discard`

---

### Negative 002 — Already-used onboarding token returns 410

**AC ref:** AC-6

**Precondition:** `UAT_ONBOARD_USED_TOKEN` is an already-accepted token.

**Action:** Navigate to `http://localhost:4321/onboard?token=<UAT_ONBOARD_USED_TOKEN>`.

**Expected rejection:** Page shows a 410 Gone error ("This invitation has already been used" or equivalent). The onboarding form is NOT shown.

**Screenshot label:** `neg-002-used-token-410`

---

### Negative 003 — Expired onboarding token returns 410

**AC ref:** AC-7

**Precondition:** `UAT_ONBOARD_EXPIRED_TOKEN` has `expires_at` in the past.

**Action:** Navigate to `http://localhost:4321/onboard?token=<UAT_ONBOARD_EXPIRED_TOKEN>`.

**Expected rejection:** Page shows a 410 Gone error ("This invitation has expired" or equivalent). The onboarding form is NOT shown.

**Screenshot label:** `neg-003-expired-token-410`

---

### Negative 004 — Plus-addressing in email is rejected

**AC ref:** AC-1

**Precondition:** Lead form is visible.

**Action:** Submit the lead form with `uat-lead+tag@aiqadam.test` (plus-addressing).

**Expected rejection:** Form shows a validation error rejecting the plus-addressed email. No row is created. No email sent.

**Screenshot label:** `neg-004-plus-addressing-rejected`

---

### Negative 005 — Invite email without matching Authentik user returns 409

**AC ref:** AC-5

**Precondition:** `UAT_ONBOARD_NO_USER_TOKEN` is set. The seeded `uat-onboard-no-user-token` row has email `uat-operator+no-user@aiqadam.test`, which intentionally has no matching Authentik user.

**Action:** Navigate to `http://localhost:4321/onboard?token=<UAT_ONBOARD_NO_USER_TOKEN>`. The page should still load (preview succeeds) and render the welcome form. Fill the password, accept the AUP, and click **Set password and accept**.

**Expected rejection:** The api's `POST /v1/onboard/accept` returns **HTTP 409 Conflict** with a structured error body containing `message: "invite_missing_authentik_user"` (see `apps/api/src/modules/admin-invites/admin-invites.service.ts`, `consumeInvite()`). The form stays mounted in the `auth_error` phase and renders an inline `<code>invite_missing_authentik_user</code>` indicator under the password input. The GonePanel ("This link can't be used") must NOT render — that is reserved for 410. The "✓ Your AI Qadam mailbox is ready" terminal panel must NOT render. No mailbox is provisioned.

**Screenshot label:** `neg-005-no-authentik-user-409`

---

## Notes

- Steps 001–004 (lead capture) require a running mail catcher. If none is configured, Steps 002 and 003 should be marked `deferred` with a note. Step 001 can still be verified via HTTP response (202 status).
- Step 006 sets a password via the Authentik admin API (`POST /v1/onboard/accept`). This will fail if Authentik is not running or if the password doesn't meet Authentik's complexity requirements. Check `.env.test` for `AUTHENTIK_MIN_PASSWORD_LENGTH` or equivalent.
- The lead verify token uses `JWT_SECRET` (same as access tokens). Rotating `JWT_SECRET` between seed and test run will cause Step 003 to return a 401 — this is an env issue, not a product bug.
- Honeypot verification (Negative 001) requires confirming no row was created. This means either Directus admin access or a debug API endpoint. Mark as `deferred` if neither is available.
