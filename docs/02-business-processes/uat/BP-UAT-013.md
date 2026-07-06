---
code: BP-UAT-013
name: "Member signup and operator onboarding"
status: Implemented
process_ref: "docs/03-requirements/FR-USR-001.md"
environment: "http://localhost:4321"
seed_required: true
last_run: "2026-07-02"
# FR-WORKFLOW-004 pilot fields (added 2026-07-06; extended 2026-07-06)
external_hops:
  - url: "http://localhost:8025"
    justification: "Mailpit mail catcher is on a different origin. Steps 002 and 003 require opening it to read the verification email sent to uat-lead-new@... — there is no UI path on the main app to reach the inbox."
    steps: ["002", "003"]
  - url: "http://localhost:4321/onboard?token=..."
    justification: "Operator invite links are not emailed by the product (FR-ADM-005 §3: a Super Admin generates a one-time invite_url in the admin UI and hands it to the operator out-of-band — Slack, in person, etc.). There is no UI path on the main app that leads to /onboard?token=...; a real operator always arrives at this URL from outside the app, the same way a person pastes a link a colleague sent them. This hop covers Steps 005, 006 and Negatives 002, 003, 005."
    steps: ["005", "006", "neg-002", "neg-003", "neg-005"]
session_budget:
  max_steps: 40
  max_screenshots: 60
  wall_clock_minutes: 20
teardown_policy:
  action: clean-up
  removes:
    - item: "lead row for uat-lead-new@... (created by Step 001)"
      how: "DELETE via Directus admin or API; or pnpm uat:seed --reset BP-UAT-013 which resets operator_invites only — lead row must be deleted separately via the Directus items API"
    - item: "operator_invites rows (consumed state from Step 006)"
      how: "pnpm uat:seed --reset BP-UAT-013 — restores all 4 rows to their declared initial state"
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

`id` maps 1:1 to `scripts/uat-fixtures/BP-UAT-013.json`'s fixture ids and to
`scripts/uat-seed.sh`'s existing token constants — `--reset BP-UAT-013`
deletes and recreates each row from the manifest's payload. The "Mail
catcher" row is infrastructure, not a Directus/Authentik-backed fixture, so
its `id` cell is `—` (it is intentionally absent from the JSON manifest).

| `id` | Fixture | Email | `display_name` | Description |
|---|---|---|---|---|
| `uat-onboard-token` | `uat-onboard-token` | `uat-operator@example.com` | `UAT Operator (valid)` | A valid, unused operator invite token. Exposed as `UAT_ONBOARD_TOKEN` in `.env.test`. |
| `uat-onboard-used-token` | `uat-onboard-used-token` | `uat-operator@example.com` | `UAT Operator (used)` | An operator invite token that has already been accepted (`used_at` is set). Exposed as `UAT_ONBOARD_USED_TOKEN`. |
| `uat-onboard-expired-token` | `uat-onboard-expired-token` | `uat-operator@example.com` | `UAT Operator (expired)` | An operator invite token with `expires_at` in the past. Exposed as `UAT_ONBOARD_EXPIRED_TOKEN`. |
| `uat-onboard-no-user-token` | `uat-onboard-no-user-token` | `uat-operator+no-user@example.com` | `UAT Operator (no-user)` | An operator invite row whose email has no matching Authentik user; exercises the api's `invite_missing_authentik_user` (409) error path. Exposed as `UAT_ONBOARD_NO_USER_TOKEN`. |
| `—` | Mail catcher | — | — | Local mail-catcher (e.g., Mailpit at `http://localhost:8025`) is running to capture outbound emails. |

## Steps

Per FR-WORKFLOW-004 §1/§4.2: exactly one `Navigate to <URL>` action is the
plain landing-page visit (Step 001, using the session's single permitted
`goto()`). Every other `Navigate to <URL>` action in this script is a
**declared external hop** from the front-matter `external_hops` table — either
opening the mail catcher on its own origin (Steps 002, 004) or arriving at an
onboarding link the way a real operator would, pasted from outside the app
(Steps 005/006, Negatives 002/003/005). None of these are the forbidden
mid-session deep-link shortcut; each is named and justified in the front-matter.

### Step 001 — Submit lead capture form on homepage

**AC ref:** AC-1

**Precondition:** User is not signed in. Mail catcher is running.

**Action:** Navigate to `http://localhost:4321` — the session's one permitted direct navigation (the landing page). Locate the lead capture form embedded on the homepage. Fill the **Email** field with `uat-lead-new@aiqadam.test`. Click the **Submit** button.

**Expected UI state:** A success banner reading "Check your inbox" (or the exact copy currently shipped — record the literal rendered text in the visual verdict) appears. No error banner is visible. The form is either cleared or replaced by the success state.

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

**Precondition:** Step 002 completed. Verification link visible in the opened email (Step 002's screen).

**Action:** Click the verification link inside the opened email in the mail-catcher UI. Do NOT construct or navigate to the URL directly — the link must be clicked from the rendered email body, the way the lead actually receives and uses it.

**Expected UI state:** Browser lands at `http://localhost:4321/leads/verified`. Page shows the heading "Your email is verified" (or the exact copy currently shipped — record the literal rendered text in the visual verdict). No error banner is visible.

**Screenshot label:** `step-003-lead-verified`

---

### Step 004 — Re-submit the same email (idempotency)

**AC ref:** AC-3

**Precondition:** Step 003 completed. `uat-lead-new@aiqadam.test` is already in the system. Browser is on `/leads/verified` (Step 003's landing screen).

**Action:** Click the site logo or a "Home"/brand-link in the header to return to `http://localhost:4321` — do NOT call a second `goto()`; the one-goto rule (FR-WORKFLOW-004 §1) permits exactly one direct navigation for the whole session, already used in Step 001. Submit the lead form again with the same email `uat-lead-new@aiqadam.test`.

**Expected UI state:** The same success message from Step 001 appears (the API returns 202 idempotently). Return to the mail-catcher UI (declared external hop, same as Step 002) — only one verify email exists for this address; no second email has arrived.

**Screenshot label:** `step-004-idempotent-lead-resubmit`

---

### Step 005 — Open operator onboarding link (declared external hop)

**AC ref:** AC-5

**Precondition:** `UAT_ONBOARD_TOKEN` is set. User is not signed in.

**Action:** This is a **declared external hop** (see front-matter `external_hops`), not a mid-session deep-link shortcut: a real operator receives `http://localhost:4321/onboard?token=<UAT_ONBOARD_TOKEN>` from a Super Admin out-of-band (copy-pasted from the admin's one-time invite panel per FR-ADM-005 — the product has no email-delivery path for this URL). Navigate directly to it, the way the operator would paste the link into their browser.

**Expected UI state:** Onboarding page loads. Invite details are visible: invitee email, invited-by name, role. A password field, an AUP-acceptance checkbox, and a **Set password and accept** button are all visible and enabled. The three happy-path invite rows (valid/used/expired) all resolve to the same seeded `uat-operator@aiqadam.test` Authentik user; this row's `display_name` reads "UAT Operator (valid)".

**Screenshot label:** `step-005-onboard-page`

---

### Step 006 — Complete operator onboarding

**AC ref:** AC-5

**Precondition:** Step 005 completed; browser is still on the onboarding form from Step 005 (same continuous session — no navigation needed to reach this step). The api will find the matching Authentik user (`uat-operator@aiqadam.test`) for the invite row.

**Action:** Fill the **Password** field with `UAT_ONBOARD_PASSWORD` (a valid password meeting Authentik's policy). Check the AUP-acceptance checkbox. Click **Set password and accept**.

**Expected UI state:** A terminal success panel renders (the "✓ Your AI Qadam mailbox is ready" state, or the exact copy currently shipped — record the literal rendered text in the visual verdict) OR the browser redirects to `/me`. Record which of the two actually happens; both count as MATCH for AC-5 but the verdict reasoning must name which one occurred, since a divergence here is itself worth noting. The onboarding form is no longer mounted. The invite token is now marked as used (corroborate via `operator_invites.used_at` if inspectable; this corroboration is optional evidence, not the verdict).

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

**Action:** Declared external hop (same class as Step 005 — a used-invite link an operator might revisit or retry after a failed attempt): navigate directly to `http://localhost:4321/onboard?token=<UAT_ONBOARD_USED_TOKEN>`.

**Expected rejection:** Page shows a 410 Gone error. The rendered copy is the literal "This link can't be used" GonePanel text (record it verbatim in the visual verdict). The onboarding form (password field, AUP checkbox) is NOT mounted anywhere on screen.

**UI-only assertion is insufficient (see BP-UAT-template.md "Negative-scenario assertion rule"):** `OnboardingForm`'s `GonePanel` renders identically on **any** non-OK API response, not just 410 — a misconfigured proxy returning 404 would look the same on screen (ISS-UAT-013-6). The visual verdict alone is not sufficient evidence for this scenario; corroborate with the API-level response code (`GET /api/v1/onboard/preview` must return exactly `410`) as supporting evidence recorded alongside the visual verdict.

**Screenshot label:** `neg-002-used-token-410`

---

### Negative 003 — Expired onboarding token returns 410

**AC ref:** AC-7

**Precondition:** `UAT_ONBOARD_EXPIRED_TOKEN` has `expires_at` in the past.

**Action:** Declared external hop (same class as Negative 002): navigate directly to `http://localhost:4321/onboard?token=<UAT_ONBOARD_EXPIRED_TOKEN>`.

**Expected rejection:** Page shows a 410 Gone error with the same literal "This link can't be used" GonePanel text as Negative 002. The onboarding form is NOT mounted.

**Same corroboration requirement as Negative 002** — the visual mismatch class this guards against (ISS-UAT-013-6) is identical: confirm `GET /api/v1/onboard/preview` returns exactly `410`, not a coincidental 404.

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

**Action:** Declared external hop (same class as Step 005): navigate directly to `http://localhost:4321/onboard?token=<UAT_ONBOARD_NO_USER_TOKEN>`. The page loads normally and renders the welcome form (the preview call succeeds — this token is valid and unused, only the downstream Authentik lookup will fail). Fill the password field, check the AUP-acceptance checkbox, and click **Set password and accept**.

**Expected rejection:** The api's `POST /v1/onboard/accept` returns **HTTP 409 Conflict** with a structured error body containing `message: "invite_missing_authentik_user"` (see `apps/api/src/modules/admin-invites/admin-invites.service.ts`, `consumeInvite()`). The form stays mounted in the `auth_error` phase and renders an inline `<code>invite_missing_authentik_user</code>` indicator under the password input. The GonePanel ("This link can't be used") must NOT render — that is reserved for 410. The "✓ Your AI Qadam mailbox is ready" terminal panel must NOT render. No mailbox is provisioned.

**Screenshot label:** `neg-005-no-authentik-user-409`

---

## Notes

- Steps 001–004 (lead capture) require a running mail catcher. If none is configured, Steps 002 and 003 should be marked `deferred` with a note. Step 001 can still be verified via HTTP response (202 status).
- Step 006 sets a password via the Authentik admin API (`POST /v1/onboard/accept`). This will fail if Authentik is not running or if the password doesn't meet Authentik's complexity requirements. Check `.env.test` for `AUTHENTIK_MIN_PASSWORD_LENGTH` or equivalent.
- The lead verify token uses `JWT_SECRET` (same as access tokens). Rotating `JWT_SECRET` between seed and test run will cause Step 003 to return a 401 — this is an env issue, not a product bug.
- Honeypot verification (Negative 001) requires confirming no row was created. This means either Directus admin access or a debug API endpoint. Mark as `deferred` if neither is available.
