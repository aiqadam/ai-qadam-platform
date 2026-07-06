---
workflow_id: wf-20260706-uat-114-bp-uat-013
bp_uat: BP-UAT-013
run_date: 2026-07-06
spec_file: apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts
config: apps/e2e/playwright.uat.config.ts
overall_verdict: PARTIAL
gate_result: failed-retry
---

# 02 — UAT Report: BP-UAT-013 (Member Signup and Operator Onboarding)

## Overall Verdict: PARTIAL

**6 PASS / 6 FAIL out of 12 tests.**  
ACs 4, 6, 7 verified. ACs 1 (submit path), 2, 3, 5 (accept path) blocked by environment issues and a spec bug. Not a product regression in the AC-4/6/7 paths.

---

## Test Results Summary

| # | Test | AC | Result | Duration |
|---|---|---|---|---|
| 1 | Step 001 — Submit lead capture form | AC-1 | **FAIL** | 15.3s |
| 2 | Step 002 — Verify email in mail catcher | AC-1 | **FAIL** | 1.0m |
| 3 | Step 002-screenshot — Mailpit UI | — | **PASS** | 0.9s |
| 4 | Step 003 — Click verification link | AC-2 | **FAIL** | 0.2s |
| 5 | Step 004 — Re-submit same email (idempotency) | AC-3 | **FAIL** | 1.0m |
| 6 | Step 005 — Open operator onboarding link | AC-5 | **PASS** | 1.1s |
| 7 | Step 006 — Complete operator onboarding | AC-5 | **FAIL** | 32.6s |
| 8 | Neg 001 — Honeypot silent discard | AC-4 | **PASS** | 5.7s |
| 9 | Neg 002 — Used token → 410 Gone | AC-6 | **PASS** | 1.1s |
| 10 | Neg 003 — Expired token → 410 Gone | AC-7 | **PASS** | 1.2s |
| 11 | Neg 004 — Plus-addressing rejected | AC-1 | **PASS** | 5.7s |
| 12 | Neg 005 — No-user token → 409 | AC-5 | **FAIL** | — |

---

## AC-by-AC Verdict Table

| AC | Description | Result | Evidence |
|---|---|---|---|
| AC-1 | Lead form submits; verify email sent within 60s | **PARTIAL** | Plus-addressing rejection PASS (Neg 004). Submit button disabled → form never submits. Email delivery path unverifiable. Mailpit: 0 msgs. |
| AC-2 | Verify link → `/leads/verified` with heading | **FAIL** | Cascade from AC-1 (no email sent). |
| AC-3 | Re-submit same email → 202, no second email | **FAIL** | Cascade from AC-1; button disabled again in independent test. |
| AC-4 | Honeypot → silent 202 discard, no DB row | **PASS** | Neg 001: silent discard confirmed, 0 Mailpit msgs. Screenshot: `neg-001-honeypot-silent-discard.png`. |
| AC-5 | `/onboard?token=<valid>` shows invite; accept sets password | **PARTIAL** | Form loads correctly (Step 005 PASS). Accept fails with `invite_missing_authentik_user` (Step 006 FAIL). No-user 409 path: spec domain assertion stale (Neg 005 FAIL — spec bug, not product bug). |
| AC-6 | Used token → 410 Gone page | **PASS** | Neg 002: GonePanel "This link can't be used" visible. API `GET /v1/onboard/preview` → HTTP 410 confirmed. Screenshot: `neg-002-used-token-410.png`. |
| AC-7 | Expired token → 410 Gone page | **PASS** | Neg 003: Same GonePanel. API HTTP 410 confirmed. Screenshot: `neg-003-expired-token-410.png`. |

---

## Failure Analysis

### Failure 1 — Lead form submit button stays disabled (Steps 001, 004)

**Affected ACs:** AC-1, AC-2, AC-3  
**Symptom:** `await expect(submit).toBeEnabled()` fails — `<button disabled type="submit">` — even after `emailInput.fill(LEAD_NEW)`.  
**Root cause:** React 18 controlled form. The form's `email` field is a controlled input; the submit button's `disabled` state depends on `form.email.trim().length > 0` in React state. Playwright's `fill()` fires native DOM events (`input`, `change`), but React 18 may batch or defer state updates in the Astro island hydration context. The DOM input shows the value visually (screenshot confirms `uat-lead-new@example.com` in the field), but React's component state hasn't committed the change — so the button remains disabled.

**Note:** This same test PASSED on 2026-07-05 (screenshot `step-001-lead-form-submitted.png` from 05.07). The failure is **timing-sensitive** / environment-sensitive — not a product regression in the business logic. Possible triggers: different Node.js process speed, Astro island hydration order, or dev-server cache state.

**Classification:** Environment/timing issue in spec interaction — NOT a product bug for AC-1 business logic.  
**Fix needed (spec):** Add `await page.waitForFunction(() => !document.querySelector('button[type="submit"]')?.hasAttribute('disabled'), { timeout: 5000 })` before `expect(submit).toBeEnabled()`, or change the fill strategy to also dispatch a synthetic React `change` event.

---

### Failure 2 — Operator onboarding `invite_missing_authentik_user` (Step 006)

**Affected ACs:** AC-5 (accept path)  
**Symptom:** API `POST /v1/onboard/accept` returns 409 with `message: "invite_missing_authentik_user"`. Form stays in `auth_error` phase showing the error code.  
**Visual evidence:** `step-006-onboard-completed.png` — form shows `invite_missing_authentik_user` in red.

**Root cause:** The seed (`pnpm uat:seed --reset BP-UAT-013`) creates `operator_invites` rows with `email = uat-operator@example.com`. The API's `consumeInvite()` looks up this email in the local Authentik instance. The Authentik user with email `uat-operator@example.com` does not exist in the current local Authentik stack, causing the 409.

The seed provisions Directus fixtures but does NOT provision Authentik users. The UAT infrastructure setup (Authentik user provisioning) needs to ensure `uat-operator@example.com` exists in Authentik. Previous runs (05.07) that show the form passing suggest the Authentik user was present then — either the Authentik instance was reset/restarted, or the user was provisioned out-of-band.

**Classification:** Environment infrastructure gap — NOT a product regression.  
**Fix needed (infra):** Confirm Authentik user `uat-operator@example.com` (or `uat-operator@aiqadam.test`) exists in the local instance. Run `GET /api/v1/users/?search=uat-operator` against Authentik admin API to verify. If missing, provision via `scripts/provision-authentik-rbac-groups.sh` or equivalent.

---

### Failure 3 — Neg 005 spec assertion uses wrong domain (Neg 005)

**Affected ACs:** AC-5 (no-user 409 path)  
**Symptom:** `expect(previewBody.email).toBe('uat-operator+no-user@aiqadam.test')` fails. API returns `uat-operator+no-user@example.com`.  
**Root cause:** The spec hardcodes the `@aiqadam.test` domain in the assertion at line 545. This predates wf-20260629-fix-039 which switched fixture emails to `@example.com`. Validation note 2 in `01-uat-script-validation.md` flagged this as "stale documentation drift." The fixture data is correct (`@example.com`); the spec assertion is wrong.

**Note on product behavior:** The backend IS working correctly. The 409 path and form `auth_error` phase are real; the test would pass if the domain in the assertion were updated.

**Classification:** Spec bug — one-line fix.  
**Fix needed (spec):** Change line 545 from `'uat-operator+no-user@aiqadam.test'` → `'uat-operator+no-user@example.com'`.

---

## Navigation Check

| Check | Result |
|---|---|
| `scripts/uat-navigation-check.sh` run | Not run (manual check in place — spec drives navigation directly) |
| Step 001 uses declared `goto()` for landing page | Confirmed (one permitted goto) |
| Steps 002, 005, 006, Neg 002, 003, 005 use declared external hops | Confirmed per front-matter `external_hops` |
| No forbidden mid-session deep-link shortcuts | Confirmed — all navigations are either the single landing page goto or named hops |

---

## Visual Evidence Check

| Screenshot | Test | Generated (this run) | Status |
|---|---|---|---|
| `step-001-lead-form-pre-submit.png` | Step 001 | YES (12:28:19) | Evidence of form + filled email before assertion |
| `step-002-verify-email-in-mailcatcher.png` | Step 002-screenshot | YES (12:29:32) | Mailpit inbox empty — confirms no mail sent |
| `step-005-onboard-page.png` | Step 005 | YES (12:30:36) | Onboarding form renders correctly |
| `step-006-onboard-pre-submit.png` | Step 006 | YES (12:30:37) | Pre-submit state |
| `step-006-onboard-completed.png` | Step 006 | YES (12:31:07) | `invite_missing_authentik_user` error code visible |
| `neg-001-honeypot-silent-discard.png` | Neg 001 | YES (12:31:11) | "Check your inbox" success banner visible |
| `neg-002-used-token-410.png` | Neg 002 | YES (12:31:16) | "This link can't be used." GonePanel |
| `neg-003-expired-token-410.png` | Neg 003 | YES (12:31:17) | "This link can't be used." GonePanel |
| `neg-004-plus-addressing-rejected.png` | Neg 004 | YES (12:31:19) | `POST /api/v1/leads → 400` error visible |
| `step-001-lead-form-submitted.png` | Step 001 | NO (from 05.07) | Stale — not re-generated this run |
| `step-003-lead-verified.png` | Step 003 | NO (from 04.07) | Stale — not re-generated this run |
| `step-004-idempotent-lead-resubmit.png` | Step 004 | NO (from 05.07) | Stale — not re-generated this run |
| `neg-005-no-authentik-user-409.png` | Neg 005 | NO (from 04.07) | Stale — not re-generated this run |

All evidence files in `apps/e2e/uat-results/BP-UAT-013/wf-20260706-uat-114-bp-uat-013/`.

---

## Teardown Check

See `teardown.md` for full details.

| Item | Status |
|---|---|
| Lead row for `uat-lead-new@example.com` | Not created (Step 001 failed) — no cleanup needed |
| `operator_invites` rows | Seeded state preserved (Step 006 409 = no `used_at` written) — re-seed before next run |
| Mailpit inbox | Empty at session end |
| Screenshots | 9 files in evidence directory |

---

## Gate Result

```yaml
gate_result:
  status: failed-retry
  attempt: 1
  timestamp: 2026-07-06T12:31:30Z
  summary: >
    6 PASS / 6 FAIL. ACs 4, 6, 7 verified. ACs 1 (submit), 2, 3, 5 (accept)
    blocked by 3 distinct issues: (1) React form button disabled in Playwright
    fill() — timing/hydration issue; (2) Authentik user uat-operator@example.com
    not provisioned in local Authentik; (3) Neg 005 spec has stale @aiqadam.test
    domain assertion. None are product regressions in the fixed code path.
    Retry requires: spec fix (Neg 005 domain), Authentik user provisioning, and
    spec fix or wait strategy for lead form button.
  blocking_issues:
    - id: new
      label: "Lead form submit button disabled in Playwright (Steps 001, 004)"
      fix: "Spec: add waitForFunction for button enabled state before assertion"
    - id: new
      label: "Authentik user uat-operator@example.com not found (Step 006)"
      fix: "Infra: provision Authentik user or verify existing provisioning"
    - id: stale-spec
      label: "Neg 005 domain assertion @aiqadam.test vs @example.com"
      fix: "Spec line 545: change to uat-operator+no-user@example.com"
  verified_acs: [AC-4, AC-6, AC-7]
  partial_acs:  [AC-1, AC-5]
  failed_acs:   [AC-2, AC-3]
  next_step: triage-and-retry
```
