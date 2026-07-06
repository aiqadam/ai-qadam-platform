# Session Log — BP-UAT-013 (wf-20260706-uat-114-bp-uat-013)

**Session date:** 2026-07-06
**Run by:** UATRunner agent + Playwright spec `BP-UAT-013-signup.spec.ts`
**Config:** `apps/e2e/playwright.uat.config.ts`
**Stack:**
- Web: http://localhost:4321 (astro.mjs dev, PID 8664) — verified process identity
- API: http://localhost:3001 (apps/api/dist/main, PID 20524) — verified process identity
- Mailpit: http://localhost:8025 — healthy
- Seed: `pnpm uat:seed --reset BP-UAT-013` — 4 fixtures, `authentik_user_id=6` patched

**Total duration:** ~1.5m
**Final result:** 10 PASS / 2 FAIL (12 tests)

---

## Action Trace

**ACTION-TRACE:** GOTO url="http://localhost:4321" type=landing step=initial
**ACTION-TRACE:** FILL target="email input" url="http://localhost:4321"
**ACTION-TRACE:** CLICK target="Send me a confirmation" url="http://localhost:4321"
**ACTION-TRACE:** HOP url="http://localhost:8025" justification="Mailpit mail catcher — declared external hop per BP-UAT-013 front-matter steps 002/003"
**ACTION-TRACE:** FILL target="email input (re-submit)" url="http://localhost:4321"
**ACTION-TRACE:** CLICK target="Submit re-submit" url="http://localhost:4321"
**ACTION-TRACE:** HOP url="http://localhost:4321/onboard?token=..." justification="Operator invite link (token=uat-onboard-token) — declared external hop per BP-UAT-013 front-matter steps 005/006"
**ACTION-TRACE:** FILL target="password input" url="http://localhost:4321/onboard?token=..."
**ACTION-TRACE:** CLICK target="Set password and accept" url="http://localhost:4321/onboard?token=..."
**ACTION-TRACE:** HOP url="http://localhost:4321/onboard?token=..." justification="Used invite link (token=uat-onboard-used-token) — declared external hop per BP-UAT-013 front-matter neg-002"
**ACTION-TRACE:** HOP url="http://localhost:4321/onboard?token=..." justification="Expired invite link (token=uat-onboard-expired-token) — declared external hop per BP-UAT-013 front-matter neg-003"
**ACTION-TRACE:** FILL target="email input (honeypot)" url="http://localhost:4321"
**ACTION-TRACE:** FILL target="honeypot company field" url="http://localhost:4321"
**ACTION-TRACE:** CLICK target="Submit with honeypot" url="http://localhost:4321"
**ACTION-TRACE:** FILL target="email input (plus-addressing)" url="http://localhost:4321"
**ACTION-TRACE:** CLICK target="Submit plus-addressed email" url="http://localhost:4321"
**ACTION-TRACE:** HOP url="http://localhost:4321/onboard?token=..." justification="No-user invite link (token=uat-onboard-no-user-token) — declared external hop per BP-UAT-013 front-matter neg-005"

---

## Session Steps

### Step 001 — Submit lead capture form

**ACTION-TRACE:** GOTO url="http://localhost:4321" type=landing step=initial
**SCREENSHOT:** step-001-lead-form-pre-submit.png url="http://localhost:4321"
**Screenshot:** step-001-lead-form-pre-submit.png before-submit
**SCREENSHOT:** step-001-lead-form-submitted.png url="http://localhost:4321"
**Screenshot:** step-001-lead-form-submitted.png after-submit

| Field | Value |
|---|---|
| step_id | 001 |
| AC ref | AC-1 |
| action | Navigate to http://localhost:4321, fill email uat-lead-new@example.com, click Submit |
| verdict | **PASS** |
| visible_elements | Lead capture form, email input, submit button (teal), site nav, footer |
| rendered_text | "Get updates", "Check your inbox" (after submit) |
| dominant_colors | Dark background (#0a0a0a), teal button (#3CA29E), white card |
| anomalies | CORS errors for Google Fonts (non-fatal, x-aiqadam-uat header) |
| Verdict: | MATCH — form submits, API returns 202, success shown |

---

### Step 002 — Verify email in mail catcher

**ACTION-TRACE:** HOP url="http://localhost:8025" justification="Mailpit mail catcher — declared external hop per BP-UAT-013 front-matter steps 002/003"
**SCREENSHOT:** step-002-verify-email-in-mailcatcher.png url="http://localhost:8025"
**Screenshot:** step-002-verify-email-in-mailcatcher.png mailpit-inbox

| Field | Value |
|---|---|
| step_id | 002 |
| AC ref | AC-1 (email delivery) |
| action | Poll Mailpit API for email to uat-lead-new@example.com (60s timeout) |
| verdict | **FAIL** |
| visible_elements | Mailpit UI "No messages in your mailbox" |
| rendered_text | "No messages in your mailbox" |
| dominant_colors | White/light grey Mailpit UI |
| anomalies | RESEND_API_KEY not set in apps/api/.env — documented known env limitation in spec header. NOT a product bug. |
| Verdict: | MISMATCH — expected >=1 email, got 0; env limitation |

---

### Step 003 — Click verification link (cascade failure)

**SCREENSHOT:** step-002-verify-email-in-mailcatcher.png url="http://localhost:8025"
**Screenshot:** step-002-verify-email-in-mailcatcher.png cascade-evidence

| Field | Value |
|---|---|
| step_id | 003 |
| AC ref | AC-2 |
| action | Cascade from Step 002 (no email, no link to click) |
| verdict | **FAIL** (cascade) |
| visible_elements | N/A |
| rendered_text | N/A |
| dominant_colors | N/A |
| anomalies | Cascade from Step 002 env limitation. No screenshot taken. |
| Verdict: | MISMATCH — cascade |

---

### Step 004 — Re-submit same email (idempotency)

**SCREENSHOT:** step-004-idempotent-lead-resubmit.png url="http://localhost:4321"
**Screenshot:** step-004-idempotent-lead-resubmit.png idempotent-success

| Field | Value |
|---|---|
| step_id | 004 |
| AC ref | AC-3 |
| action | Navigate back to http://localhost:4321, fill same email, submit |
| verdict | **PASS** |
| visible_elements | "Check your inbox" success state |
| rendered_text | "Check your inbox" |
| dominant_colors | Dark background, teal accent |
| anomalies | Idempotent: before=0 after=0 Mailpit emails (same env limitation, assertion passes 0==0) |
| Verdict: | MATCH — API returns 202 idempotently |

---

### Step 005 — Open operator onboarding link

**ACTION-TRACE:** HOP url="http://localhost:4321/onboard?token=..." justification="Operator invite link (token=uat-onboard-token) — declared external hop per BP-UAT-013 front-matter steps 005/006"
**SCREENSHOT:** step-005-onboard-page.png url="http://localhost:4321/onboard?token=uat-onboard-token"
**Screenshot:** step-005-onboard-page.png onboard-form-loaded

| Field | Value |
|---|---|
| step_id | 005 |
| AC ref | AC-5 |
| action | Navigate to /onboard?token=uat-onboard-token (declared external hop) |
| verdict | **PASS** |
| visible_elements | "Welcome, UAT Operator (valid)", password input, AUP checkbox, "Set password and accept" button, "aiqadam-staff" badge |
| rendered_text | "Welcome, UAT Operator (valid)", "aiqadam-staff", "Accept the Acceptable Use Policy" |
| dominant_colors | Dark card, teal badge, white form elements |
| anomalies | None |
| Verdict: | MATCH — invite details correct, form renders |

---

### Step 006 — Complete operator onboarding

**SCREENSHOT:** step-006-onboard-pre-submit.png url="http://localhost:4321/onboard?token=uat-onboard-token"
**Screenshot:** step-006-onboard-pre-submit.png onboard-pre-submit
**SCREENSHOT:** step-006-onboard-completed.png url="http://localhost:4321/onboard?token=uat-onboard-token"
**Screenshot:** step-006-onboard-completed.png onboard-success
**SCREENSHOT:** neg-001-honeypot-silent-discard.png url="http://localhost:4321"
**Screenshot:** neg-001-honeypot-silent-discard.png honeypot-pass
**SCREENSHOT:** neg-002-used-token-410.png url="http://localhost:4321/onboard?token=uat-onboard-used-token"
**Screenshot:** neg-002-used-token-410.png gone-panel-used
**SCREENSHOT:** neg-003-expired-token-410.png url="http://localhost:4321/onboard?token=uat-onboard-expired-token"
**Screenshot:** neg-003-expired-token-410.png gone-panel-expired
**SCREENSHOT:** neg-004-plus-addressing-rejected.png url="http://localhost:4321"
**Screenshot:** neg-004-plus-addressing-rejected.png plus-addr-rejected
**SCREENSHOT:** neg-005-no-authentik-user-409.png url="http://localhost:4321/onboard?token=uat-onboard-no-user-token"
**Screenshot:** neg-005-no-authentik-user-409.png no-user-409

| Field | Value |
|---|---|
| step_id | 006 |
| AC ref | AC-5 |
| action | Fill password UAT_Operator_2024!, check AUP, click "Set password and accept" |
| verdict | **PASS** |
| visible_elements | "Your AI Qadam mailbox is ready.", webmail URL, username uat.operator.valid@aiqadam.org, "Go to /workspace" button |
| rendered_text | "Your AI Qadam mailbox is ready.", "uat.operator.valid@aiqadam.org", "https://webmail.aiqadam.org/" |
| dominant_colors | Dark card, teal "Go to /workspace" button |
| anomalies | None |
| Verdict: | MATCH — onboarding completed, success panel rendered |

Negative 002: GonePanel "This link can't be used." with invite_consumed code. API corroborated: HTTP 410. MATCH.
Negative 003: GonePanel "This link can't be used." with invite_expired code. API corroborated: HTTP 410. MATCH.
Negative 004: Error message "POST /api/v1/leads -> 400". Plus-addressing rejected. MATCH.
Negative 005: Inline invite_missing_authentik_user error, no GonePanel. API: HTTP 409. MATCH.

Negative 001 visible_elements: "Check your inbox" success banner; no DB row created; Mailpit 0 msgs for honeypot address. anomalies: None. rendered_text: "Check your inbox". dominant_colors: Dark, teal accent. Verdict: MATCH.

---

## FR-WORKFLOW-004 AC-9: Visual vs. DOM Divergence

No visual-vs-DOM divergence observed this run. Neg 002/003 GonePanel guarded with explicit API-level 410 assertions.

---

## Summary

10 PASS / 2 FAIL — both failures are env limitations (RESEND_API_KEY not set), not product regressions.
