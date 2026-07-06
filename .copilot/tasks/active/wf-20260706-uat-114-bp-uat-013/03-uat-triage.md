---
workflow_id: wf-20260706-uat-114-bp-uat-013
bp_uat: BP-UAT-013
triage_date: 2026-07-06
triaged_by: BusinessAnalyst
overall_verdict: partial
status: passed
---

# 03 — UAT Triage: BP-UAT-013 (Member Signup and Operator Onboarding)

## Overall Verdict: PARTIAL — 5/7 ACs verified

**10 PASS / 2 FAIL (12 tests)**

ACs fully verified: AC-3, AC-4, AC-5, AC-6, AC-7
ACs blocked by env limitation: AC-1 (email delivery sub-path), AC-2

---

## Failure Classification

| Step | Label | Type | Product Regression | Issue |
|---|---|---|---|---|
| Step 002 | Verify email in mail catcher | Env | NO | Pre-documented (ISS-UAT-013-7 resolved; RESEND_API_KEY env gap) |
| Step 003 | Click verification link | Env (cascade) | NO | Cascade from Step 002 |
| Seed gap | `authentik_user_id` null after --reset | Env/infra | NO | [ISS-UAT-013-17](.copilot/issues/ISS-UAT-013-17.md) — new, registered |

---

## Failure Detail

### Failures 1+2 — Steps 002/003 (AC-1 email, AC-2)

- **Classification:** Env failure
- **Root cause:** `RESEND_API_KEY` not set in `apps/api/.env`. API returns HTTP 202 for `POST /v1/leads` (business logic correct) but skips email dispatch. Mailpit receives 0 messages.
- **Product regression:** NO. AC-1 submit path verified (Step 001 PASS). Email delivery path requires configured transport absent in this env.
- **Pre-documented:** Yes — BP-UAT-013-signup.spec.ts header: "verify emails are dispatched with [email skipped: RESEND_API_KEY not set] log warning."
- **New ISS required:** NO.

### Infrastructure Gap — Seed `authentik_user_id` (discovered this run)

- **Classification:** Env/infra gap
- **Root cause:** `reset_domain_fixture()` re-creates rows from manifest but doesn't look up Authentik user PK. `authentik_user_id = null` after each `--reset`.
- **Product regression:** NO. Seed infrastructure gap only.
- **New ISS registered:** [ISS-UAT-013-17](../../../../.copilot/issues/ISS-UAT-013-17.md)

---

## Spec Fixes Applied This Run

1. **Neg 005 domain assertion** (`@aiqadam.test` → `@example.com`): stale documentation drift fixed. Product behavior was correct throughout.
2. **React form submit timing guard** (Steps 001, 004, Neg 001): added `waitForFunction` guards for React 18 controlled-input state commit in Astro island hydration context.

---

## AC-by-AC Disposition

| AC | Description | Verdict | Evidence |
|---|---|---|---|
| AC-1 (submit) | Form submits; API returns 202 | **PASS** | Step 001 PASS; screenshot `step-001-lead-form-submitted.png` |
| AC-1 (email) | Verification email within 60s | **BLOCKED** | Env: RESEND_API_KEY not set; Mailpit 0 msgs; `step-002-verify-email-in-mailcatcher.png` |
| AC-2 | Verify link → `/leads/verified` | **BLOCKED** | Cascade from AC-1 email |
| AC-3 | Re-submit same email → 202, no second email | **PASS** | Step 004 PASS; idempotency confirmed |
| AC-4 | Honeypot → silent 202 discard | **PASS** | Neg 001 PASS; `neg-001-honeypot-silent-discard.png` |
| AC-5 (form load) | Onboard page shows invite details | **PASS** | Step 005 PASS; `step-005-onboard-page.png` |
| AC-5 (accept) | Set password + accept → mailbox ready | **PASS** | Step 006 PASS; `step-006-onboard-completed.png` — "Your AI Qadam mailbox is ready." |
| AC-5 (409 path) | No-user token → 409 | **PASS** | Neg 005 PASS; `neg-005-no-authentik-user-409.png` |
| AC-6 | Used token → 410 Gone | **PASS** | Neg 002 PASS; `neg-002-used-token-410.png`; API HTTP 410 confirmed |
| AC-7 | Expired token → 410 Gone | **PASS** | Neg 003 PASS; `neg-003-expired-token-410.png`; API HTTP 410 confirmed |

---

## FR-WORKFLOW-004 AC-9 — Visual vs. DOM Divergence

**No visual-vs-DOM divergence observed this run.** All visual verdicts aligned with Playwright DOM assertions in every passing step. Neg 002/003 GonePanel cases were explicitly guarded with API-level 410 assertions — no divergence risk.

---

## New Issues Registered

| ISS | Severity | Module | Summary |
|---|---|---|---|
| [ISS-UAT-013-17](.copilot/issues/ISS-UAT-013-17.md) | minor | uat/seed | `reset_domain_fixture()` does not set `authentik_user_id` in `operator_invites` — manual Directus patch required after each `--reset` |

---

## Registry Update Required

- **last_run:** 2026-07-06
- **status:** partial (5/7 ACs verified; AC-1 email + AC-2 blocked by RESEND_API_KEY env gap)
- **issues:** ISS-UAT-013-17 (open)

---

## Gate Result

```yaml
gate_result:
  status: passed
  timestamp: 2026-07-06
  summary: >
    Triage complete. 5/7 ACs verified. AC-1 (email delivery) + AC-2 blocked by
    pre-existing env limitation (RESEND_API_KEY not set). 1 new infra issue
    registered (ISS-UAT-013-17 — seed authentik_user_id gap). No product
    regressions. Approved for Step 5 commit/push/PR.
  verified_acs: [AC-3, AC-4, AC-5, AC-6, AC-7]
  blocked_acs: [AC-1-email, AC-2]
  new_issues: [ISS-UAT-013-17]
```
