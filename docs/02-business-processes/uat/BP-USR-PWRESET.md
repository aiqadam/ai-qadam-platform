---
code: BP-USR-PWRESET
name: "Member password recovery (Authentik Recovery Flow)"
status: Ready
process_ref: "docs/02-business-processes/operations/member-password-reset.md"
environment: "http://localhost:4321"
seed_required: true
last_run: ""
# FR-WORKFLOW-004 pilot fields (added 2026-07-06; mirrors BP-UAT-013)
external_hops:
  - url: "http://localhost:9000/if/flow/recovery/"
    justification: "The recovery flow lives on Authentik's own origin, not on the app. There is no UI path on apps/web or apps/web-next that lands the user on this URL — the only entry point is Authentik's own login UI, which renders a 'Forgot password?' link once Brand.flow_recovery is bound. Steps 002 and 003 navigate there directly to submit the email + new password."
    steps: ["001", "002", "003", "006"]
  - url: "http://localhost:8025"
    justification: "Mailpit mail catcher is on a different origin. Step 002 reads the recovery email from Mailpit's HTTP API to extract the reset link and confirm the subject is branded. There is no UI path on the main app to reach the inbox."
    steps: ["002", "004"]
session_budget:
  max_steps: 30
  max_screenshots: 40
  wall_clock_minutes: 15
teardown_policy:
  action: clean-up
  removes:
    - item: "uat-member password (rotated by Step 002 happy path)"
      how: "Re-seed via pnpm uat:seed --reset BP-USR-PWRESET (resets uat-member's password back to UAT_MEMBER_PASSWORD) OR run scripts/provision-authentik-recovery-flow.sh with the operator's bearer token to set the password via Authentik admin API"
    - item: "Mailpit messages from this run"
      how: "DELETE http://localhost:8025/api/v1/messages — clears the inbox between runs"
---

# BP-USR-PWRESET — Member Password Recovery

## Purpose

Verifies that a member who has forgotten their password can recover access
to their account through Authentik's Recovery Flow:

1. Authentik's login UI surfaces a "Forgot password?" link once
   `Brand.flow_recovery` is bound by
   [`scripts/provision-authentik-recovery-flow.sh`](../../../../scripts/provision-authentik-recovery-flow.sh).
2. Submitting a known email sends a recovery email into Mailpit with the
   branded subject **"Reset your AI Qadam password"**.
3. The link inside the email resolves at `${AUTHENTIK_URL}/if/flow/recovery/`,
   lets the user set a new password, and returns the user to a state where
   they can sign in with the new password.
4. An unknown email yields Authentik's neutral copy without leaking user
   enumeration, and does not produce an email into Mailpit.
5. Existing sign-in flow (`BP-UAT-009`) is not regressed.

Source:
[`docs/02-business-processes/operations/member-password-reset.md`](../operations/member-password-reset.md)
(member-facing runbook) and
[`ISS-USR-PWRESET-001`](../../../copilot/issues/ISS-USR-PWRESET-001.md).

## Acceptance Criteria

- [ ] AC-1: Authentik Recovery Flow is bound on the default brand;
      `GET http://localhost:9000/if/flow/recovery/` returns HTTP 200 (and
      rendered HTML includes an identifier stage).
- [ ] AC-2: A "Forgot password?" link is rendered on Authentik's login
      UI at `${AUTHENTIK_URL}/if/flow/default-authentication-flow/`,
      visible to anonymous visitors, with `href` ending in
      `/if/flow/recovery/`.
- [ ] AC-3 (happy path): submitting `uat-member@aiqadam.test` through
      the Recovery Flow results in an email landing in Mailpit at
      `http://localhost:8025` with subject **"Reset your AI Qadam
      password"**; clicking the link inside sets a new password; signing
      in with the new password succeeds and lands at `/me`.
- [ ] AC-4 (negative): submitting an email that does not match any
      Authentik user renders Authentik's neutral copy ("if an account
      with this email exists, you'll receive an email shortly") AND
      Mailpit has received **zero** new messages for that address.
- [ ] AC-5: existing sign-in flow is not regressed — re-running
      [`BP-UAT-009`](./BP-UAT-009.md) (sign-in + sign-out) exits 0.
- [ ] AC-6: the recovery flow is idempotent — re-running
      `scripts/provision-authentik-recovery-flow.sh` against a stack
      where the binding is already in place issues no PATCH (no-op)
      and exits 0; both `Brand.flow_recovery` and the
      `default-email-recovery` template's `subject` field are preserved.
- [ ] AC-7: the recovery email template's `subject` is **"Reset your AI
      Qadam password"** (branded), not Authentik's default
      `"Password Recovery"` plain text.

## Seed Fixtures Required

| Fixture | Description |
|---|---|
| `uat-member` | Member account (`uat-member@aiqadam.test`, password `UAT_MEMBER_PASSWORD` from `.env.test`), active Authentik user. Required by AC-3 and AC-5. |
| Authentik bearer token | `AK_API_TOKEN` written by `scripts/provision-authentik-recovery-flow.sh` and `scripts/uat-env-setup.sh` STEP 7b/9 to `/tmp/aiqadam-secrets-AK_API_TOKEN`. Required by AC-1, AC-6, AC-7 (bats-level probes against `/api/v3/core/brands/` and `/api/v3/core/email-templates/`). |
| Authentik stack | `infrastructure/authentik/` containers running with the recovery flow binding in place — i.e. `scripts/uat-env-setup.sh` has completed through STEP 7b/9 without error. |

## Steps

### Step 001 — Anonymous user lands on Authentik login UI and sees the "Forgot password?" link

**AC ref:** AC-2

**Precondition:** User is not signed in. Authentik is up at
`http://localhost:9000`; the recovery flow is bound (pre-flight
`curl -fsS http://localhost:9000/if/flow/recovery/ -o /dev/null -w '%{http_code}'`
returns 200).

**Action:** Navigate directly to `${AUTHENTIK_URL}/if/flow/default-authentication-flow/`
(this is the **declared external hop** — see front-matter `external_hops`).

**Expected UI state:** Authentik's login form is rendered with an
email field, a password field, and a visible **Forgot password?**
link. The link's `href` ends with `/if/flow/recovery/`.

**Screenshot label:** `step-001-forgot-link-visible`

---

### Step 002 — Happy path: known email receives recovery email, reset succeeds, new password signs in

**AC ref:** AC-3, AC-7 (E2E companion)

**Precondition:** Step 001 completed. The "Forgot password?" link was
visible. `uat-member@aiqadam.test` is seeded in Authentik.

**Action:** Click the **Forgot password?** link. On the recovery flow's
identifier stage, fill the email field with `uat-member@aiqadam.test`
and submit. Poll Mailpit's HTTP API
(`GET http://localhost:8025/api/v1/messages` — this is the **declared
external hop** for the Mailpit origin, see front-matter `external_hops`)
until a new message arrives, with subject **"Reset your AI Qadam
password"** (AC-7 assertion lives here as well). Extract the reset URL
from the email body (regex on `http://localhost:9000/if/flow/recovery/[^"]*`),
navigate to that URL, fill the new-password field with
`UatMemberReset2!`, confirm on the repeat field, and submit. When
Authentik shows the success page, sign out, then sign in again at
`/auth/sign-in` with the new password.

**Expected UI state:** After the second sign-in, the browser lands at
`http://localhost:4321/me`. The member dashboard is visible. The
`aiqadam-refresh` cookie is present and `HttpOnly`. Mailpit holds one
new message addressed to `uat-member@aiqadam.test` with subject
**"Reset your AI Qadam password"**.

**Screenshot labels:**
- `step-002a-recovery-email-received.png` — Mailpit inbox showing the
  branded recovery email
- `step-002b-happy-reset-complete.png` — `/me` after signing in with
  the new password

---

### Step 003 — Negative path: unknown email returns neutral copy without leaking user enumeration

**AC ref:** AC-4

**Precondition:** Step 001 completed. Note the current Mailpit message
count (`GET /api/v1/messages` → `total` field).

**Action:** Click the **Forgot password?** link. On the recovery flow's
identifier stage, fill the email field with
`nobody-here-${Date.now()}@example.com` (a random address that does
not exist in Authentik) and submit. Then poll Mailpit
(`GET /api/v1/messages`) for ~10 seconds.

**Expected UI state:** Authentik renders the canonical neutral copy —
text matching the regex `/if an account (with this email )?exists.*you.*receive an email/i`
(per Authentik 2024.x's default recovery flow wording). Mailpit's
`total` count is unchanged (i.e. **zero** new messages addressed to
the unknown recipient).

**Screenshot label:** `step-003-negative-neutral-copy`

---

### Step 004 — Recovery email subject is branded (E2E companion to AC-7)

**AC ref:** AC-7 (E2E side)

**Precondition:** Step 002 reached Mailpit; the recovery email is in
the inbox.

**Action:** `GET http://localhost:8025/api/v1/message/<ID>` for the
message captured in Step 002 (this is the **declared external hop**
for Mailpit, see front-matter `external_hops`). Read the `Subject`
header.

**Expected UI state:** `Subject === "Reset your AI Qadam password"`. If
the subject is the Authentik default (`Password Recovery`), AC-7 is
violated — escalate, do not silently retry.

**Screenshot label:** `step-004-email-subject-branded`

---

### Step 005 — Existing BP-UAT-009 sign-in flow not regressed (AC-5)

**AC ref:** AC-5

**Precondition:** Provisioning of the recovery flow has been applied
to the same Authentik instance that BP-UAT-009 runs against.

**Action:** Run
`pnpm --filter e2e playwright test apps/e2e/tests/uat/BP-UAT-009.spec.ts`
as a separate Playwright invocation. This BP does **not** re-implement
BP-UAT-009's assertions inside this spec; the BP-UAT-009 spec is the
contract of record for AC-5.

**Expected UI state:** BP-UAT-009 spec exits 0. All 7 ACs of
BP-UAT-009 (sign-in redirect, post-login destination, HttpOnly cookie,
sign-out, protected-page redirect, open-redirect block, post-logout
landing) remain green.

**Screenshot label:** *(inherited from BP-UAT-009 — `step-002-signed-in-me-page`)*

---

### Step 006 — Anonymous user lands on recovery flow at expected URL with no app-side redirect (AC-1, UI side)

**AC ref:** AC-1 (UI side)

**Precondition:** Authentik is up at `http://localhost:9000`; the
recovery flow is bound (the provision script has been run by
`scripts/uat-env-setup.sh` STEP 7b/9).

**Action:** Navigate directly to `http://localhost:9000/if/flow/recovery/`
(this is the **declared external hop** for the Authentik origin, see
front-matter `external_hops`).

**Expected UI state:** Authentik renders the identifier stage
(`input[name="uidField"]` or `input[name="email"]` is visible). The
browser URL stays at `${AUTHENTIK_URL}/if/flow/recovery/` — there is
**no** application-side redirect to `default-authentication-flow` and
no redirect to apps/web or apps/web-next.

**Screenshot label:** `step-006-recovery-direct-url`

---

## Negative Scenarios

### Negative 001 — Host allow-list rejects unknown host

**AC ref:** (security USR-2)

**Precondition:** Authentik is up at `http://localhost:9000`. The
provision script is available at
`scripts/provision-authentik-recovery-flow.sh`.

**Action:** Invoke the script with
`AUTHENTIK_URL=https://attacker.example.com` and any bearer token.

**Expected rejection:** Script exits non-zero (exit code 4) and stderr
contains `not in allow-list`. No PATCH is issued against Authentik.

**Screenshot label:** *(no UI; bats-level probe only)*

---

### Negative 002 — Email-template body wiped (regression guard for PATCH-vs-PUT)

**AC ref:** AC-7 (safety)

**Precondition:** Authentik is up; the `default-email-recovery`
template is seeded by Authentik's bootstrap yaml.

**Action:** Run the provision script twice. Between runs, GET the
template body field via
`/api/v3/core/email-templates/<default-email-recovery uuid>/`.

**Expected rejection:** The body field still contains the canonical
reset-link Jinja (`{% if link %}` or equivalent). If a future change
accidentally switches the script's `ak_patch` to `ak_put` on the
template, this probe catches the body-wipe.

**Screenshot label:** *(no UI; bats-level probe only)*

---

## Notes

- **Provision script idempotency.** `scripts/provision-authentik-recovery-flow.sh`
  caches the default Brand UUID to
  `/tmp/aiqadam-secrets-AUTHENTIK_BRAND_UUID`. If a human re-creates
  the brand in Authentik's admin UI, the cache holds a stale UUID and
  the next PATCH will 404. The fix is
  `rm /tmp/aiqadam-secrets-AUTHENTIK_BRAND_UUID` and re-run the script.
- **Post-reset redirect target.** Authentik's `default-recovery-flow`
  has no override applied in this workflow; the default redirect
  lands on `/if/user/#/settings`, not on `/me`. Members reach `/me` by
  clicking the **AI Qadam** logo after the reset — this is documented
  in the member-facing runbook at
  [`member-password-reset.md`](../operations/member-password-reset.md)
  under "After you've reset."
- **Mailpit polling cadence.** Recovery emails arrive in well under
  5 seconds during local UAT (Mailpit captures synchronously). A
  200 ms backoff with a 30-second ceiling is the recommended polling
  shape, matching the pattern in
  [`scripts/uat-preflight-email.sh`](../../../../scripts/uat-preflight-email.sh).
- **No app-side UI changes.** This BP deliberately exercises the
  Authentik login UI directly rather than navigating from
  apps/web or apps/web-next: both Astro sign-in surfaces are
  redirect-only and do not render the "Forgot password?" link
  themselves. Authentik's login UI does, once `Brand.flow_recovery`
  is bound. Re-implementing the link client-side is explicitly **not**
  in scope (see
  [`ISS-USR-PWRESET-001`](../../../copilot/issues/ISS-USR-PWRESET-001.md)
  impact analysis).
- **Prod-host assertion against `https://auth.aiqadam.org/if/flow/recovery/`.**
  The provision script's host allow-list accepts `auth.aiqadam.org`,
  but the UAT infrastructure only has `localhost:9000`. A prod-host
  reachability assertion is queued against the future
  Prod Bootstrap workflow and is **not** a blocker for closing this
  BP.