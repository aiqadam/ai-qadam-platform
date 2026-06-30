# BP-UAT-013 UAT Execution Report — Run 2 (re-run after astro dev fix)

**Workflow**: wf-20260630-uat-042  
**Script**: BP-UAT-013 — Member signup and operator onboarding  
**Run date**: 2026-06-30  
**Executor**: UATRunner (GitHub Copilot — wf-20260630-uat-042)  
**Spec**: apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts  
**Run number**: 2 of 2  
**Context**: Run 1 was blocked by `astro preview` mode (Vite proxy inactive, all `/api/v1/...` calls → 404). Orchestrator restarted web on PID 2464 in `astro dev` mode. This is the re-run with proxy active.

---

## Pre-Flight Status (Run 2)

| Service | URL | Status |
|---|---|---|
| API | http://localhost:3000/health | ✅ 200 OK `{"status":"ok","tenant":{"code":"uz"}}` |
| Mailpit | http://localhost:8025 | ✅ 200 OK (inbox cleared before run) |
| Web app | http://localhost:4321 | ✅ 200 OK — **astro dev mode (PID 2464)** |
| Vite proxy `/api` → `http://localhost:3000` | — | ✅ Active (astro dev mode confirmed) |
| `uat-onboard-token` | `GET /v1/onboard/preview` | ✅ 200 `display_name: "UAT Operator (valid)"` |
| `uat-onboard-used-token` | `GET /v1/onboard/preview` | ✅ 410 Gone |
| `uat-onboard-expired-token` | `GET /v1/onboard/preview` | ✅ 410 Gone |
| `uat-onboard-no-user-token` | `GET /v1/onboard/preview` | ✅ 200 `display_name: "UAT Operator (no-user)"` |

---

## Run Command (Run 2)

```powershell
cd apps/e2e
$env:UAT_API_URL="http://localhost:3000"
$env:UAT_BASE_URL="http://localhost:4321"
$env:UAT_OPERATOR_EMAIL="uat-operator@aiqadam.test"
$env:UAT_OPERATOR_PASSWORD="UatOperator1!"
$env:UAT_MEMBER_EMAIL="uat-member@aiqadam.test"
$env:UAT_MEMBER_PASSWORD="UatMember1!"
pnpm exec playwright test --config playwright.uat.config.ts `
  tests/uat/BP-UAT-013-signup.spec.ts --reporter=list
```

---

## Full Playwright Output (Run 2)

```
Running 12 tests using 1 worker

  ✘   1 … — happy path › Step 001 — Submit lead capture form on homepage (15.3s)
  ✘   2 …3 — happy path › Step 002 — Verify email arrives in mail catcher (1.0m)
  ✓   3 …› Step 002-screenshot — Open mailpit web UI for visual evidence (774ms)
  ✘   4 … › BP-UAT-013 — happy path › Step 003 — Click verification link (212ms)
  ✘   5 …— happy path › Step 004 — Re-submit the same email (idempotency) (7.5s)
  ✘   6 …UAT-013 — happy path › Step 005 — Open operator onboarding link (12.0s)
  ✘   7 …-UAT-013 — happy path › Step 006 — Complete operator onboarding (33.1s)
  ✓   8 …s › Neg 001 — Honeypot field filled discards submission silently (7.5s)
  ✓   9 …arios › Neg 002 — Already-used onboarding token returns 410 Gone (1.4s)
  ✓  10 … scenarios › Neg 003 — Expired onboarding token returns 410 Gone (1.4s)
  ✓  11 …ative scenarios › Neg 004 — Plus-addressing in email is rejected (4.7s)
  ✓  12 …atching Authentik user returns 409 invite_missing_authentik_user (1.6s)

  6 failed
  6 passed (2.5m)
  Command exited with code 1

Failure details:
  1) Step 001: expect(locator).toBeEnabled() failed — button is "disabled" — 23× polled
  2) Step 002: Test timeout of 60000ms exceeded
  3) Step 003: expect(0).toBeGreaterThan(0) — msgs.length === 0
  4) Step 004: no second verify email should be sent — Expected: 0, Received: 1
  5) Step 005: expect(locator).toBeVisible() failed — getByText(/aiqadam-staff/i) not found
  6) Step 006: mailbox-ready heading not visible. Last visible error/code: "invite_missing_authentik_user"
```

---

## Test Run Summary

| Metric | Count |
|---|---|
| Total tests | 12 |
| **Passed** | **6** |
| **Failed** | **6** |
| Skipped | 0 |
| Duration | ~2.5 min |

**Improvement vs Run 1**: Run 1 → 3/12 passed (proxy blocked all form interactions). Run 2 → 6/12 passed. Proxy confirmed working; 3 additional negative scenarios now pass. New failures are product-level issues, not infrastructure.

---

## Per-Test Results (Run 2)

### Happy Path

#### Test 1 — Step 001: Submit lead capture form on homepage

| | |
|---|---|
| **AC ref** | AC-1 |
| **Result** | ❌ FAILED |
| **Expected** | Email `uat-lead-new@example.com` entered; submit button enabled; "Check your inbox" heading shown |
| **Actual** | Button `<button disabled type="submit" class="btn btn-primary">` remained disabled for all 23 polling intervals (10 s). Form not submitted. |
| **Error** | `expect(locator).toBeEnabled() failed — Expected: enabled — Received: disabled — Timeout: 10000ms` |
| **Root cause** | `LeadCaptureForm.tsx` line 278: `disabled={form.email.trim().length === 0}`. React controlled input; `form.email` stays `''` after `page.fill()` because the React island has not hydrated when `fill()` fires — `onChange` not yet attached. React then hydrates, reads state (`form.email = ''`), button stays disabled. |
| **Contrast** | Neg 001 uses the same `fill()` for email but then calls `setReactInputValue()` for the honeypot field, which flushes React state for all pending inputs. Neg 001 passes; Step 001 does not. |
| **Required fix** | Replace `emailInput.fill(LEAD_NEW)` with `setReactInputValue(page, 'form input[type="email"]', LEAD_NEW)` in Step 001 (and Step 004). |
| **Screenshot** | `test-results/…step-001…/test-failed-1.png` — filled email input, disabled button |

---

#### Test 2 — Step 002: Verify email arrives in mail catcher

| | |
|---|---|
| **AC ref** | AC-1 |
| **Result** | ❌ FAILED (cascading) |
| **Expected** | Email to `uat-lead-new@example.com` present in Mailpit within 60 s |
| **Actual** | 0 messages found throughout the 60 s poll. No lead was created via UI (Step 001 failed). |
| **Error** | `Test timeout of 60000ms exceeded` |
| **Cascade** | Direct consequence of Step 001 failure. Email + Mailpit stack confirmed working by Step 004 incidental submission. |

---

#### Test 3 — Step 002-screenshot: Open mailpit web UI for visual evidence

| | |
|---|---|
| **Result** | ✅ PASSED |
| **Expected** | Mailpit UI loads |
| **Actual** | `http://localhost:8025` opened; screenshot captured (inbox empty — correct given Step 001 failure) |
| **Screenshot** | `apps/e2e/uat-results/BP-UAT-013/step-002-verify-email-in-mailcatcher.png` |

---

#### Test 4 — Step 003: Click verification link

| | |
|---|---|
| **AC ref** | AC-2 |
| **Result** | ❌ FAILED (cascading) |
| **Expected** | Verify token extracted from email; browser navigates to `/leads/verify?token=…`; lands on `/leads/verified`; success heading visible |
| **Actual** | `mailpitSearch(LEAD_NEW).length === 0`; test aborts before navigating |
| **Error** | `expect(0).toBeGreaterThan(0)` |
| **Cascade** | Consequence of Tests 1 and 2. Verify endpoint not reached. |

---

#### Test 5 — Step 004: Re-submit the same email (idempotency)

| | |
|---|---|
| **AC ref** | AC-3 |
| **Result** | ❌ FAILED (cascading + incidental finding) |
| **Expected** | Re-submit shows "Check your inbox"; mailpit count stays same |
| **Actual** | `before = 0`. Form submitted via `.click()` — React hydrated by test 5, button enabled. "Check your inbox" shown. After 4 s: `after = 1`. `expect(1).toBe(0)` fails. |
| **Error** | `no second verify email should be sent — Expected: 0, Received: 1` |
| **Analysis** | Cascading: Step 001 never created the lead. Step 004's submit is the first submission — API correctly sent an email. Idempotency was NOT tested. |
| **Incidental finding** | Form submitted successfully in Step 004 (proxy active, button enabled after hydration). Confirms full submit + email pipeline works end-to-end. Step 001 failure is isolated to hydration race condition. |

---

#### Test 6 — Step 005: Open operator onboarding link

| | |
|---|---|
| **AC ref** | AC-5 |
| **Result** | ❌ FAILED |
| **Expected** | Page loads; `getByText(/welcome,/i)` visible; `getByText(/UAT Operator \(valid\)/i)` visible; `getByText(/aiqadam-staff/i)` visible; AUP checkbox + password input present |
| **Actual** | Page loaded (200 OK). `/welcome,/i` visible ✅. `/UAT Operator \(valid\)/i` visible ✅. Then `getByText(/aiqadam-staff/i)` timed out — element not found. |
| **Error** | `expect(locator).toBeVisible() failed — Locator: getByText(/aiqadam-staff/i) — element(s) not found — Timeout: 10000ms` |
| **Root cause** | (1) `OnboardingForm.tsx` does not render `role_groups[]` as visible text. (2) Seed data has `role_groups = []` for this token (confirmed by API preview: `{"role_groups":[],...}`). |
| **Direct API** | `GET .../v1/onboard/preview?token=uat-onboard-token` → `{"role_groups":[],...}` — field is empty. |
| **Screenshot** | `test-results/…step-005…/test-failed-1.png` |

---

#### Test 7 — Step 006: Complete operator onboarding

| | |
|---|---|
| **AC ref** | AC-5 |
| **Result** | ❌ FAILED |
| **Expected** | Password set, AUP accepted, "Your AI Qadam mailbox is ready" heading visible |
| **Actual** | Form reached `auth_ready`. Password + AUP filled. Submit clicked. `POST /api/v1/onboard/accept` → 409. Inline error: `invite_missing_authentik_user`. Mailbox-ready heading not shown. |
| **Error** | `mailbox-ready heading not visible. Last visible error/code: "invite_missing_authentik_user"` |
| **Root cause** | The API's `consumeInvite()` cannot find the Authentik user for `uat-operator@aiqadam.test`. User pk=6 confirmed present in preflight. Possible causes: user deactivated since preflight; lookup uses wrong field; password policy rejection re-thrown as 409. |
| **Screenshot** | `apps/e2e/uat-results/BP-UAT-013/step-006-onboard-completed.png` — form showing error code |

---

### Negative Scenarios

---

#### Test 8 — Neg 001: Honeypot field filled discards submission silently

| | |
|---|---|
| **AC ref** | AC-4 |
| **Result** | ✅ PASSED |
| **Expected** | "Check your inbox" shown (silent 202); no verify email sent |
| **Actual** | `emailInput.fill(LEAD_HONEYPOT)` + `setReactInputValue(honeypot, 'bot-value')` → button enabled → click → "Check your inbox" shown. POST body contained `"honeypot":"bot-value"`. After 4 s: `mailpitSearch(LEAD_HONEYPOT).length === 0` ✅ |
| **Screenshot** | `apps/e2e/uat-results/BP-UAT-013/neg-001-honeypot-silent-discard.png` |

---

#### Test 9 — Neg 002: Already-used onboarding token returns 410 Gone

| | |
|---|---|
| **AC ref** | AC-6 |
| **Expected** | No password input; "This link can't be used" shown; direct API returns 410 |
| **Actual** | GonePanel (`this link can't be used`) visible ✅; no `<input type="password">` in DOM ✅; direct `page.request.get(.../preview?token=uat-onboard-used-token)` → **410** ✅ |
| **Screenshot** | `apps/e2e/uat-results/BP-UAT-013/neg-002-used-token-410.png` |

---

#### Test 10 — Neg 003: Expired onboarding token returns 410 Gone

| | |
|---|---|
| **AC ref** | AC-7 |
| **Result** | ✅ PASSED |
| **Expected** | No password input; GonePanel shown; direct API returns 410 |
| **Actual** | GonePanel visible ✅; no password input ✅; direct API `GET .../preview?token=uat-onboard-expired-token` → **410** ✅ |
| **Screenshot** | `apps/e2e/uat-results/BP-UAT-013/neg-003-expired-token-410.png` |

---

#### Test 11 — Neg 004: Plus-addressing in email is rejected

| | |
|---|---|
| **AC ref** | AC-1 (validation) |
| **Result** | ✅ PASSED |
| **Expected** | No success panel; error banner matching plus-addressing / 400 |
| **Actual** | `setReactInputValue(LEAD_PLUS)` + `form.requestSubmit()`. API returned 400. Error banner visible with text matching validation regex. "Check your inbox" NOT shown ✅ |
| **Screenshot** | `apps/e2e/uat-results/BP-UAT-013/neg-004-plus-addressing-rejected.png` |

---

#### Test 12 — Neg 005: Invite email without matching Authentik user returns 409

| | |
|---|---|
| **AC ref** | AC-5 (error path) |
| **Result** | ✅ PASSED |
| **Expected** | Preview → 200; welcome heading; accept → 409; `invite_missing_authentik_user` visible; no mailbox-ready heading |
| **Actual** | Preview `GET .../preview?token=uat-onboard-no-user-token` → 200 `{"email":"uat-operator+no-user@aiqadam.test","display_name":"UAT Operator (no-user)"}` ✅. Form rendered. Password + AUP filled. Submit → accept `POST` → **409** + `{"message":"invite_missing_authentik_user"}` ✅. Inline error code visible ✅. Mailbox-ready count = 0 ✅. GonePanel count = 0 ✅. |
| **Screenshot** | `apps/e2e/uat-results/BP-UAT-013/neg-005-no-authentik-user-409.png` |

---

## AC-2 Verification Outcome (Key Deliverable — ISS-UAT-013-8)

**AC-2**: *Clicking the verify link transitions `email_verified` from `false` to `true` and shows `/leads/verified`.*

### Status: NOT VERIFIED in this run

The browser-based click flow (Steps 001 → 002 → 003) was attempted but blocked at Step 001 (React hydration race — button disabled). With Step 001 failing, no email reached Mailpit, and Step 003 could not extract a verify token.

### What was confirmed in this run

| Element | Source | Result |
|---|---|---|
| Proxy active: `fetch('/api/v1/leads')` reaches port 3000 | Step 004 + Neg 001 (both submitted successfully) | ✅ Confirmed |
| Lead creation + email dispatch pipeline | Step 004 submission → 1 email in Mailpit for `uat-lead-new@example.com` | ✅ Confirmed |
| Verify-link URL format in email | Not captured (Step 004's email not searched in Step 003's context) | ❌ Not checked |
| `/leads/verified` page renders | Not visited in this run | ❌ Not tested |
| `email_verified → true` state change | Not verified | ❌ Not tested |

### AC-2 conclusion

AC-2 **cannot be marked verified**. The fundamental requirement is a browser-side click-through: form submit → email → verify URL → `/leads/verified`. This requires Step 001 to succeed first. Fix ISS-NEW-R2-1 (use `setReactInputValue` for email input), then re-run.


---

## Artefacts

| File | Description |
|---|---|
| `apps/e2e/uat-results/BP-UAT-013/step-002-verify-email-in-mailcatcher.png` | Mailpit UI — empty inbox (Step 001 failed; no email from web UI) |
| `apps/e2e/uat-results/BP-UAT-013/neg-001-honeypot-silent-discard.png` | Success panel after honeypot submit; no email dispatched |
| `apps/e2e/uat-results/BP-UAT-013/neg-002-used-token-410.png` | GonePanel for used token |
| `apps/e2e/uat-results/BP-UAT-013/neg-003-expired-token-410.png` | GonePanel for expired token |
| `apps/e2e/uat-results/BP-UAT-013/neg-004-plus-addressing-rejected.png` | Form showing validation error for plus-addressed email |
| `apps/e2e/uat-results/BP-UAT-013/neg-005-no-authentik-user-409.png` | Form showing `invite_missing_authentik_user` inline error |
| `apps/e2e/uat-results/BP-UAT-013/step-006-onboard-completed.png` | Onboarding form with `invite_missing_authentik_user` error (Step 006 fail) |
| `apps/e2e/test-results/…/test-failed-1.png` (×6) | Per-test Playwright failure screenshots |

---

## Issues Identified in Run 2

| ID | Severity | Description | AC impacted |
|---|---|---|---|
| **ISS-NEW-R2-1** | Blocker | React hydration race: `page.fill()` on controlled `LeadCaptureForm` email input leaves `form.email = ''`. Button stays disabled. Fix: use `setReactInputValue()` for email in Steps 001 and 004. | AC-1, AC-2, AC-3 |
| **ISS-NEW-R2-2** | Medium | Step 005 asserts `getByText(/aiqadam-staff/i)` but `OnboardingForm` does not render `role_groups[]` as visible text, and seed data has `role_groups = []` for the valid token. Spec / seed / UI alignment needed. | AC-5 |
| **ISS-NEW-R2-3** | High | Step 006: `POST /v1/onboard/accept` returns 409 `invite_missing_authentik_user` for the valid token even though Authentik user `uat-operator@aiqadam.test` (pk=6) confirmed present in preflight. Product defect in `admin-invites.service.ts` — needs developer investigation. | AC-5 |

---

## AC Coverage Summary

| AC | Description | Run 2 Status |
|---|---|---|
| AC-1 | Lead form submits; verify email received within 60 s | ❌ NOT VERIFIED — Step 001 blocked by ISS-NEW-R2-1 |
| AC-2 | Click verify link → `email_verified = true` → `/leads/verified` | ❌ NOT VERIFIED — browser click-through not reached |
| AC-3 | Re-submit same email → 202, no second email sent | ❌ NOT VERIFIED — cascading from AC-1 |
| AC-4 | Honeypot field → silent 202 discard, no email | ✅ VERIFIED (Neg 001) |
| AC-5 (happy path) | Valid token → onboarding completes → mailbox ready | ❌ NOT VERIFIED — 409 from ISS-NEW-R2-3 |
| AC-5 (error path) | No-user token → 409 `invite_missing_authentik_user` surfaced | ✅ VERIFIED (Neg 005) |
| AC-6 | Used token → 410 Gone shown | ✅ VERIFIED (Neg 002) |
| AC-7 | Expired token → 410 Gone shown | ✅ VERIFIED (Neg 003) |

---

## Gate Result

```yaml
gate_result:
  status: failed
  run: 2
  pass_count: 6
  fail_count: 6
  total_count: 12
  improvement_vs_run_1: "3/12 → 6/12 passing; proxy issue resolved; 3 new distinct issues found"
  ac2_status: not_verified
  ac2_reason: >
    Step 001 blocked by React hydration race (ISS-NEW-R2-1). Browser-side verify
    click-through was not reached. AC-2 requires Step 001 fix before it can be
    verified end-to-end.
  verified_acs: [AC-4, AC-5-error-path, AC-6, AC-7]
  unverified_acs: [AC-1, AC-2, AC-3, AC-5-happy-path]
  blockers:
    - id: ISS-NEW-R2-1
      description: >
        React hydration race in LeadCaptureForm: page.fill() on controlled input
        leaves form.email = '' in React state. Submit button stays disabled.
        Spec fix: replace emailInput.fill() with setReactInputValue() in Steps
        001 and 004.
    - id: ISS-NEW-R2-3
      description: >
        POST /v1/onboard/accept returns 409 invite_missing_authentik_user for the
        valid token. Authentik user uat-operator@aiqadam.test confirmed present
        in preflight (pk=6). Product defect in admin-invites.service.ts
        consumeInvite() — needs developer investigation.
  medium_issues:
    - id: ISS-NEW-R2-2
      description: >
        Step 005 asserts aiqadam-staff role text. OnboardingForm does not render
        role_groups, and seed has role_groups = [] for valid token. Spec / seed /
        UI alignment needed.
  recommended_action: >
    1. Fix ISS-NEW-R2-1: use setReactInputValue() for email input in Steps 001/004.
    2. Investigate ISS-NEW-R2-3: check consumeInvite() Authentik lookup logic;
       verify uat-operator@aiqadam.test Authentik user is active and email matches.
    3. Resolve ISS-NEW-R2-2: align seed data, spec assertion, and/or UI for role_groups.
    4. Re-run the spec after fixes. Expected: 11-12/12 passing with AC-2 verified.
```

