# 02 — Impact Analysis (wf-20260701-uat-045-mailpit-resend)

**Step:** 2
**Agent:** ImpactAnalyzer
**Date:** 2026-07-01
**Branch:** `fix/ISS-UAT-013-7-mailpit-resend-key` (off `main@b3dbba0`)
**Parent workflow:** `wf-20260701-fix-044` (paused at gate `test_run`); this is a queued follow-up per AGENTS.md §6.1.

---

## Validated Requirement

**ISS-UAT-013-7** — Close the gap that PR #66 left open: `EmailService` drops
verify-emails when `RESEND_API_KEY` is unset. The **symbol-level** fix
(nodemailer SMTP transport + `getProvider()` + `GET /health/email` + unit tests)
already shipped on main. What remains:

1. Extend `EmailHealthResponse` with a `mode` field so pre-flight can
   distinguish "no transport configured" from "intentionally disabled"
   (`SEND_EMAILS=false`).
2. Wire a pre-flight that **calls `/v1/health/email` before BP-UAT-013
   starts** and fails fast with an actionable message when `mode` is neither
   `smtp` nor `resend`.
3. Confirm the `EmailService` transport-selection unit test still passes and
   add a regression case for the new `mode` derivation if needed.

> **Important correction to the handoff:** Items (1) "add nodemailer SMTP
> transport" and (4) "add a unit test for the transport-selection branch"
> are **already implemented on `main`**. The EmailService already wires
> `createTransport(...)` when `SMTP_HOST` is set
> ([email.service.ts:39-42](apps/api/src/modules/email/email.service.ts#L39-L42)),
> and `apps/api/test/email-service-smtp.spec.ts` already covers the
> selection branch (5 `describe` blocks, 7 `it` cases).
> The Orchestrator's task description in the user request reflects the
> original handoff before wf-20260629-fix-034 merged — this analysis
> reflects the **actual state on `main@b3dbba0`**.

---

## Affected Layers

### API (NestJS)

| Module | File | Change |
|---|---|---|
| `email` | [apps/api/src/modules/email/email.service.ts](apps/api/src/modules/email/email.service.ts) | **No code change** — already exposes `getProvider()`. May need to expose a new `getMode()` helper if the derivation needs to stay encapsulated. |
| `health` | [apps/api/src/health/health.controller.ts](apps/api/src/health/health.controller.ts) | **Add `mode` to `EmailHealthResponse`.** Currently returns `{ configured, provider }`; needs to return `{ configured, provider, mode: 'production' \| 'uat' \| 'disabled' }`. |
| `email` (tests) | [apps/api/test/email-service-smtp.spec.ts](apps/api/test/email-service-smtp.spec.ts) | **No change** to existing cases. May add a `getMode()` test (TBD by CodeDeveloper). |
| `health` (tests) | [apps/api/test/health-email.spec.ts](apps/api/test/health-email.spec.ts) | **Update all 3 cases** to assert the new `mode` field. Currently asserts `toEqual({ configured, provider })` — must become `toEqual({ configured, provider, mode })`. |
| App wiring | [apps/api/src/app.module.ts](apps/api/src/app.module.ts) | **No change** — `HealthController` and `EmailModule` are already wired. |
| Throttling | [apps/api/src/lib/observe-throttler.guard.ts](apps/api/src/lib/observe-throttler.guard.ts) | **Verify** the `/health/email` path is exempt. Currently `shouldSkip()` checks `req.path === '/health' \|\| req.path.startsWith('/health/')` → `/health/email` matches the prefix → already exempt. ✅ |
| Health endpoint base | `apps/api/src/main.ts` | **Verify** global prefix `/v1` is set so the route resolves at `GET /v1/health/email`. (BP-UAT-013 spec uses `http://localhost:3001`, not `/v1`; need to confirm what `main.ts` actually exposes for health routes today.) |

### DB Changes Required

**No.** No new tables, columns, or constraints. The fix is purely transport
configuration + observability endpoint + shell-script wiring.

### Shared Types

**No.** The `EmailHealthResponse` interface is local to `health.controller.ts`.
If it ever needs to be consumed by the bot or web, promotion to
`packages/shared-types/` would be a follow-up. Out of scope here.

### Frontend

**No.** The web app does not display email transport status. Operators read
it from shell (`curl`) or from the Coolify logs.

### Bot

**No.** The Telegram bot does not query `/v1/health/email`.

### Workers

**No.** Email sending is invoked from the API synchronously (`EmailService.send()`)
in `LeadsService` / `LeadNurtureCronService`. No BullMQ queue or worker
involvement in this change.

---

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| `/health/email` | `GET` | Add `mode: "production" \| "uat" \| "disabled"` field to response body. Existing `{ configured, provider }` keys unchanged. | **Yes for clients that assert `toEqual`** — the existing `health-email.spec.ts` test will fail until updated. No external clients (Mailpit, browser, bot) consume this endpoint today. |
| `/v1/health/email` | `GET` | Same as above (depends on global prefix). | Same as above. |

> **Decision needed at code-step:** does the `mode` derive from `NODE_ENV` only,
> from `SEND_EMAILS` only, or from both? Likely:
> - `SEND_EMAILS=false` → `mode: "disabled"`
> - `NODE_ENV=production` (or `NODE_ENV='production'` with `SEND_EMAILS=true`) → `mode: "production"`
> - otherwise (NODE_ENV in {development, test} with `SEND_EMAILS=true`) → `mode: "uat"`
>
> Recommend this is the derivation; CodeDeveloper should confirm with the
> user before implementing since the spec says "production | uat | disabled"
> without defining the boundaries.

---

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| `HealthController.emailHealth()` | `EmailService.getProvider()` (already wired) | Constructor injection via `EmailModule.exports`. ✅ |
| `EmailService` (constructor) | `env.SMTP_HOST`, `env.SMTP_PORT`, `env.RESEND_API_KEY`, `env.SEND_EMAILS`, `env.EMAIL_FROM` | `apps/api/src/config/env.ts` (Zod-validated). ✅ |
| **NEW** `scripts/uat-preflight-email.sh` (to be added) | `GET /v1/health/email` (or `/health/email` — confirm global prefix) via `curl -fsS` | HTTP from the UAT runner host. |
| **NEW** BP-UAT-013 runner hook | `scripts/uat-preflight-email.sh` | Subprocess invocation from `playwright.uat.config.ts` `globalSetup`, OR from `scripts/uat-env-setup.sh` Step 5 (services healthy). |

No cross-schema queries. No tenant scoping on this endpoint (it's a
platform-level health probe, like `GET /health`).

---

## Risk Flags

### Security Review Required? — **No (with caveats)**

- `/v1/health/email` exposes only boolean provider info (`smtp | resend | none`).
  No credentials, no message bodies, no recipient addresses.
- Pre-flight script is a **read-only** HTTP probe.
- **Caveat 1:** the endpoint currently is **not rate-limit-exempted beyond
  `/health` prefix** — confirm `ObserveThrottlerGuard.shouldSkip()` covers it.
  Verified: line 31 returns `true` for `req.path.startsWith('/health/')`,
  so `/health/email` IS exempt. ✅
- **Caveat 2:** the response reveals operational state ("no email transport
  configured"). An attacker probing the endpoint can infer that production
  deploy is misconfigured. This is acceptable for a health probe (we accept
  the same leak for `GET /health`); document it in the controller header.

### Architecture Rule Risks

- **No cross-schema queries** — N/A.
- **No cross-module service writes** — `HealthController` only reads `EmailService.getProvider()`.
- **Module boundaries preserved** — `HealthController` lives at `apps/api/src/health/`
  (not under `modules/`), separate from `EmailModule`. Constructor injection
  is one-way (health → email). ✅
- **No new dependency** — `nodemailer` is already a dependency of `@aiqadam/api`
  (it was added by wf-20260629-fix-034). The shell pre-flight uses `curl` and
  `jq` which are already on the PATH in UAT.
- **AGENTS.md §6 — `.env` rule:** The handoff explicitly says **do not touch
  `apps/api/.env`**. Confirmed: no change to `apps/api/.env` is required.
  The SMTP transport activates from `SMTP_HOST`/`SMTP_PORT` which are
  **already set** in the file (lines 62-63 of `apps/api/.env`). The pre-flight
  script **does not modify** env files.

### Production-Readiness (AGENTS.md §6.1)

- Every AC for ISS-UAT-013-7 must be verified end-to-end in this workflow.
- **AC-1 (BP-UAT-013 Step 002 polling finds ≥1 message):** requires the
  Mailpit stack to be up and `SMTP_HOST=localhost`/`SMTP_PORT=1025` set on
  the API container. Both conditions are **already true** in
  `scripts/uat-env-setup.sh` Step 2 (`env_set SMTP_HOST localhost`,
  `env_set SMTP_PORT 1025`) and Step 4 (`docker compose up -d ... mailpit`).
- **AC-2 (no `[email skipped: ...]` for happy path):** will hold as long as
  `SEND_EMAILS=true` (already true in `apps/api/.env`) and the SMTP transport
  constructor succeeds. Need a live test that submits a lead and grep's the
  API log.
- **AC-3 (`/v1/health/email` exists and is wired into UAT pre-flight):**
  this is the **only** outstanding code change. Pre-flight wiring is the
  last gap.

### Honesty Disclosure Required at QualityGate

The handoff says ISS-UAT-013-7's registry status is currently `resolved`
but is **factually wrong** because the pre-flight was never wired. The
`Resolution` section of `ISS-UAT-013-7.md` must include a "Honesty
disclosures" bullet naming:

- the pre-flight workflow ID (this one, `wf-20260701-uat-045`),
- its queue position (1 in the parent queue),
- the concrete verification command (`curl -fsS http://localhost:3001/v1/health/email`
  followed by `jq -e '.provider == "smtp" and .mode != "disabled"'`),
- and confirmation that the issue flips to `resolved` **only after** this
  workflow's pre-flight passes live.

---

## Test Scope

### Unit tests (Vitest, in `apps/api/test/`)

| Spec | Coverage needed | Existing? |
|---|---|---|
| `email-service-smtp.spec.ts` | `getProvider()` returns smtp/resend/none; `send()` routes to SMTP when `SMTP_HOST` set; regression guard for Resend path. | **Already exists.** 7 cases. No change unless we add `getMode()`. |
| `email-service-mode.spec.ts` (NEW) | Derive `mode` from `SEND_EMAILS` + `NODE_ENV`: `disabled` when SEND_EMAILS=false; `production` when NODE_ENV=production + SEND_EMAILS=true; `uat` otherwise. | **To add** if `getMode()` is encapsulated on `EmailService`. |
| `health-email.spec.ts` | Update 3 cases to assert the new `mode` field in the response. | **Already exists**, needs update. |

### Integration tests (Testcontainers)

**None.** The endpoint is read-only, no DB access. Live SMTP transport is
exercised by BP-UAT-013 itself (which IS an integration test against the
real Mailpit container).

### E2E (Playwright)

| Spec | Coverage | Existing? |
|---|---|---|
| `BP-UAT-013-signup.spec.ts` Steps 002/003 | Lead submission → Mailpit receives verify email → click verify link → `/leads/verified` page. | **Already exists.** Will be re-run as the live verification gate. |
| **NEW** `uat-email-preflight.spec.ts` (optional) | Hits `/v1/health/email` from the test runner, asserts shape `{ configured, provider, mode }`. | **Optional** — may be skipped in favour of the shell pre-flight. |

### Manual / live verification (gating)

```bash
# 1. Mailpit container up
docker ps --filter "name=aiqadam-mailpit" --format "{{.Status}}"
# 2. API exposes the health endpoint
curl -fsS http://localhost:3001/v1/health/email | jq
# 3. Pre-flight script gates mode != 'disabled'
bash scripts/uat-preflight-email.sh
# 4. End-to-end: submit lead, expect Mailpit capture, click verify link
pnpm --filter @aiqadam/e2e exec playwright test \
  --config apps/e2e/playwright.uat.config.ts \
  apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts
```

---

## Out-of-Scope (intentionally deferred)

1. **Auth on `/v1/health/email`.** Like `/health`, it's an unauthenticated
   platform probe. No change.
2. **BullMQ async email sending.** Already documented in `email.service.ts`
   header comment as a future improvement. Not required to fix this issue.
3. **Structured response from `POST /v1/leads`** distinguishing
   `accepted_and_dispatched` from `accepted_skipped_no_email_config`
   (proposed in ISS-UAT-013-7 §B.1). That's a separate product UX change
   (forms/UI copy). Not needed to make BP-UAT-013 pass — the live integration
   test will prove the dispatched path works.
4. **Cross-platform pre-flight (`probe_process_identity_unix`).** Already
   flagged as TODO in `uat-preflight-check.sh` per AGENTS.md §0 (Windows-first).
5. **Promoting `EmailHealthResponse` to `packages/shared-types/`.** No
   second consumer today.

---

## Open Questions for CodeDeveloper / User

1. **`mode` derivation rule.** Should it be:
   - `SEND_EMAILS=false` → `"disabled"` regardless of `NODE_ENV`; else
     `NODE_ENV=production` → `"production"`, else `"uat"`?
   - Or should `"uat"` require an explicit env flag (e.g. `UAT_MODE=true`)?
   - **Recommended:** the simpler rule above. Confirm with user before coding.
2. **Global URL prefix.** Does `main.ts` mount `/v1` globally? If yes,
   `HealthController` at `@Controller('health')` resolves to `GET /v1/health/email`
   — which matches the handoff. If no, the pre-flight URL is `/health/email`.
   CodeDeveloper should grep `main.ts` for the prefix setup and align the
   pre-flight URL accordingly.
3. **Pre-flight entry point.** Two options:
   - **(a)** New file `scripts/uat-preflight-email.sh` called from
     `scripts/uat-env-setup.sh` Step 5 (after the existing `wait_for_url`
     for Mailpit).
   - **(b)** Inline the check into `BP-UAT-013-signup.spec.ts`
     `test.beforeAll()` so the runner fails fast itself.
   - **Recommended (a).** It keeps the runner focused on user-journey
     assertions and lets shell users run the same check standalone.
4. **Branch state.** The handoff says `Branch: fix/ISS-UAT-013-7-mailpit-resend-key from main b3dbba0`.
   CodeDeveloper must verify (i) branch exists locally, (ii) is in sync with
   `origin/main`, (iii) working tree is clean — before writing. If the branch
   is missing, the Orchestrator's Step 0 creates it.

---

## Gate Result

gate_result:
  status: passed
  summary: >-
    Symbol-level fix for ISS-UAT-013-7 already on main (SMTP transport +
    getProvider() + /health/email + unit tests). Remaining scope is
    narrow: add a `mode` field to EmailHealthResponse, extend
    health-email.spec.ts to assert it, and wire scripts/uat-env-setup.sh
    Step 5 to call /v1/health/email via a new scripts/uat-preflight-email.sh
    that fails fast when mode == "disabled". No DB or cross-module impact.
    No new dependencies. No .env modifications. Three open questions for
    CodeDeveloper / user (mode derivation rule, /v1 prefix, pre-flight
    entry point).
  findings:
    - "EmailService already wires nodemailer SMTP transport when env.SMTP_HOST is set (email.service.ts:39-42)."
    - "HealthController.emailHealth() already exists at apps/api/src/health/health.controller.ts:32-37, returning { configured, provider }."
    - "apps/api/test/email-service-smtp.spec.ts and health-email.spec.ts already exist and cover the transport-selection branch (7 + 3 cases)."
    - "scripts/uat-preflight-check.sh is a process-identity probe (not an email-health probe) and does not currently call /v1/health/email — this is the last remaining gap."
    - "apps/api/.env already has SMTP_HOST=localhost and SMTP_PORT=1025 (lines 62-63); uat-env-setup.sh Step 4 already brings up the mailpit container. The only missing piece is the pre-flight script that asserts the mode is not 'disabled'."
    - "Security review not required: endpoint exposes only transport-mode info; no credentials, no message bodies; observe-throttler-guard already exempts /health/* prefix."
    - "AGENTS.md §6 .env rule respected: no apps/api/.env modifications required by this workflow."
  retry_target: null
  deferred_to_feature: null
  deferred_reason: null

---

## Notes for the Orchestrator

- **Update the user's task description.** The handoff's goal list says "add a
  nodemailer SMTP transport" and "add a unit test" — both already shipped.
  The actual work is now narrower (mode field + pre-flight wiring). The
  user-visible PR description should reflect this accurately (AGENTS.md §9 —
  honesty).
- **Status flip in `ISS-UAT-013-7.md`.** The issue currently reads
  `Status: resolved` but per AGENTS.md §6.1 + §9 it must be flipped
  **together** with the registry row in `.copilot/issues/registry.md`
  in the same PR (FEAT-WORKFLOW-003 atomicity rule). The status flip
  is the final action, gated on live verification of BP-UAT-013
  Steps 002/003.
- **Parent workflow `wf-20260701-fix-044`.** Once this workflow's PR
  merges, the parent's QualityGate can be re-run; AC-5 (which has been
  paused with "deferred to wf-20260701-uat-045") will verify cleanly.
