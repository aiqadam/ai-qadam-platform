# ISS-UAT-013-7 — `RESEND_API_KEY` unset in `apps/api/.env`; verify-email is skipped, Mailpit receives nothing

| Field | Value |
|---|---|
| ID | ISS-UAT-013-7 |
| Severity | bug (env-gap, blocks mailpit-dependent UAT steps) |
| Module | uat / environment |
| Status | **resolved** |
| Reported | 2026-06-28 |
| Resolved | 2026-07-01 |
| Reporter | BusinessAnalyst (wf-20260628-uat-030 / 04-uat-triage.md, attempt 2) |
| Resolver | Orchestrator (wf-20260701-uat-045-mailpit-resend) — supersedes the 2026-06-29 resolution note from wf-20260629-fix-034, which landed the nodemailer SMTP transport but did NOT yet add the `/health/email` pre-flight; this workflow completes the loop. |
| Workflow | wf-20260628-uat-030 (reported) → wf-20260629-fix-034 (nodemailer transport shipped to main) → wf-20260701-uat-045-mailpit-resend (this workflow — observability follow-up) |

## Symptom

During the BP-UAT-013 attempt-2 run on 2026-06-28, the API accepted lead
submissions with HTTP 202, but Mailpit at `http://localhost:8025` never received
the verify-email message. The runner's `mailpitSearch(to=uat-lead-new@example.com)`
returned 0 messages for 60 s and Step 002 timed out. Step 003 then failed
immediately because it cannot read a token from a message that was never sent.

The API logs show the smoking gun:

```
[Nest] 42544 - 28.06.2026, 11:56:51  WARN [EmailService]
  [email skipped: RESEND_API_KEY not set]
  to=probe@example.com subject=Confirm your AI Qadam updates for Almaty
[Nest] 42544 - 28.06.2026, 11:57:20  WARN [EmailService]
  [email skipped: RESEND_API_KEY not set]
  to=uat-lead-new@example.com subject=Confirm your AI Qadam updates for Almaty
[Nest] 42544 - 28.06.2026, 11:57:23  WARN [EmailService]
  [email skipped: RESEND_API_KEY not set]
  to=uat-lead-new@example.com subject=Confirm your AI Qadam updates for Almaty
… (8 more identical lines spanning 11:59–12:16, all to uat-lead-new@example.com)
```

`apps/api/.env` line 39 has `RESEND_API_KEY=` (empty). The API's `EmailService`
constructor (`apps/api/src/modules/email/email.service.ts:29`) reads
`env.RESEND_API_KEY` and only constructs a `Resend` client when it is truthy:

```ts
this.resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
```

When `resend` is null, the service logs `[email skipped: RESEND_API_KEY not set]`
and returns without sending (`apps/api/src/modules/email/email.service.ts:39–42`).
The HTTP 202 that the controller returns is therefore **misleading** — the lead
is persisted, but the verify email will never arrive. Production behaviour would
be the same: a missing key means silent drop, not loud failure.

## Root cause

`apps/api/.env` is committed-by-convention missing the `RESEND_API_KEY` value.
The empty key is intentional for local dev when developers do not want to send
real emails, but the API does not signal "email will be skipped" to the caller
in any way the UAT script can detect — it only logs a `WARN` line server-side.
The lead capture form therefore returns 202 success to the browser, the user
sees the "Check your inbox" panel, and no email is ever dispatched.

This is an **environment/configuration gap**, not a product bug: the API and
email service are behaving exactly as written. It surfaces in UAT because Steps
002 and 003 require a real email round-trip via Mailpit.

## Repro

```bash
# 1. Confirm apps/api/.env line 39
grep '^RESEND_API_KEY=' apps/api/.env
# → RESEND_API_KEY=    (empty)

# 2. Submit a lead
curl -i -X POST http://localhost:3001/v1/leads \
  -H "Content-Type: application/json" \
  -d '{"email":"uat-lead-new@example.com","country":"KZ"}'
# → HTTP/1.1 202 Accepted

# 3. Watch the API log
tail -1 apps/api/api-dev.log
# → [Nest] … WARN [EmailService] [email skipped: RESEND_API_KEY not set]
#   to=uat-lead-new@example.com subject=Confirm your AI Qadam updates for Almaty

# 4. Confirm Mailpit is empty
curl -s "http://localhost:8025/api/v1/search?query=to:uat-lead-new@example.com" | jq '.total'
# → 0
```

## Proposed resolution

Two complementary fixes:

### A. UAT environment (immediate, blocks BP-UAT-013 sign-off)

Set `RESEND_API_KEY` to a throwaway dev key in `apps/api/.env`. Because the
Resend SDK requires a real key to accept the request, two options exist:

1. **Provision a Resend test-mode key** (free, no real send). Drop it into
   `apps/api/.env` line 39: `RESEND_API_KEY=re_test_…`. Restart the API. This
   is the cleanest path because Mailpit will still receive the message via the
   `MAILPIT_*` env config in the dev docker-compose — **however**, Resend
   sends to its own inbox, not Mailpit, so this option does NOT actually fix
   the UAT round-trip.
2. **Recommended for UAT:** make `EmailService` honour a `SEND_EMAILS=false`
   + `MAILPIT_SMTP_HOST` config so dev/test can route email to Mailpit instead
   of Resend. The `SEND_EMAILS` knob already exists (see
   `apps/api/src/modules/email/email.service.ts:35`); it just doesn't yet route
   to Mailpit. Adding an SMTP transport (nodemailer + Mailpit) for the UAT/dev
   profile is the cleanest fix and means `RESEND_API_KEY` can stay unset for UAT.

Per AGENTS.md §6, `.env` files should not be modified without explicit user
approval. The Orchestrator is therefore **not** patching `apps/api/.env` in
this workflow; it is **registering this issue** and asking the user to choose.

### B. Code-side defence (defer to next API workflow)

The current 202-on-skip behaviour is the underlying UX defect. Two improvements:

1. Return a structured response from `POST /v1/leads` that distinguishes
   `accepted_and_dispatched` from `accepted_skipped_no_email_config`. The form
   then renders "Thanks — your account is being set up, no email is required"
   in the second case instead of the misleading "Check your inbox."
2. Add an `/api/v1/health/email` endpoint that returns
   `{ configured: boolean, provider: "resend" | "smtp" | "none" }` so UAT
   pre-flight (per ISS-UAT-013-2) can fail fast with an actionable message
   instead of timing out 60 s in mailpit polling.

Until (B) lands, UAT scripts that need Mailpit round-trips must call this
health endpoint in their pre-flight or accept a `partial` outcome on
mailpit-dependent steps.

## Acceptance criteria

1. After applying either (A.1) or (A.2), a re-run of BP-UAT-013 has Step 002
   polling Mailpit for the expected recipient and finding ≥1 message within
   the 60 s budget.
2. The API log no longer contains `[email skipped: RESEND_API_KEY not set]`
   for the happy path (it may still appear if `SEND_EMAILS=false` is intentional).
3. The new `/api/v1/health/email` endpoint exists and is wired into the UAT
   pre-flight (closes the gap exposed by ISS-UAT-013-2).

## References

- `apps/api/src/modules/email/email.service.ts:29,39–42` — `RESEND_API_KEY` check
- `apps/api/.env:39` — empty `RESEND_API_KEY=` value
- `apps/api/api-dev.log` (lines 309, 340–358) — runtime evidence
- `.copilot/tasks/active/wf-20260628-uat-030/03-uat-runner-report.md` §5.2.1
- `.copilot/tasks/active/wf-20260628-uat-030/02-preflight.md` — no mention of RESEND env
- ISS-UAT-013-1 — root-cause-class sibling (api not running); this is api running but email disabled
- ISS-UAT-013-2 — pre-flight process gap; this env gap would have been caught by the proposed `/api/v1/health/email` check

## Resolution

- **Workflow:** wf-20260701-uat-045-mailpit-resend
- **Branch:** `fix/ISS-UAT-013-7-mailpit-resend-key` (off `main@b3dbba0`)
- **PR:** _pending — opens on workflow-finish step_
- **Root cause:** The 2026-06-29 fix (PR #66, wf-20260629-fix-034) shipped the nodemailer SMTP transport and `GET /health/email` to `main`, but did NOT extend the response with a `mode` field, did NOT add a pre-flight script that fails fast when `mode == "disabled"`, and did NOT wire that pre-flight into `scripts/uat-env-setup.sh`. The result: when BP-UAT-013 ran against `apps/api` with `SEND_EMAILS=false`, the runner still waited 60 s for Mailpit to receive a message that the API never dispatched (because `EmailService.send()` early-returns on `SEND_EMAILS=false`), with no actionable error until the timeout.
- **Fix shipped (this workflow):**
  1. `apps/api/src/health/health.controller.ts` — `EmailHealthResponse` now carries `mode: 'production' | 'uat' | 'disabled'`. Added JSDoc warning that the endpoint is unauthenticated.
  2. `apps/api/src/modules/email/email.service.ts` — added `getMode()` helper (pure env read). Mode derivation: `SEND_EMAILS=false → 'disabled'`; else `NODE_ENV=production → 'production'`; else `'uat'`.
  3. `apps/api/test/health-email.spec.ts` — extended from 3 to 6 unit cases (covers SMTP/Resend/None paths and provider-vs-mode disagreement).
  4. `apps/api/test/email-service-mode.spec.ts` — NEW, 6 unit cases covering the full 3×3 input matrix + idempotence + provider-independence.
  5. `scripts/uat-preflight-email.sh` — NEW, ~180 lines, `bash -n` clean, scheme validation, `jq -e` gate with `--arg`, `curl --max-time` guard, exit codes 0/1/2 documented. Prefers `curl.exe` over `curl` on Windows-bash (commit `ee249ee`) so the same script runs on Linux, macOS, and Windows-bash without modification.
  6. `scripts/uat-env-setup.sh` Step 5 — one inserted line at L256, after the Mailpit `wait_for_url`: `API_BASE_URL="http://localhost:3001" bash "$REPO_ROOT/scripts/uat-preflight-email.sh"`.
- **AC verification (per AGENTS.md §6.1):**

  | AC | Verified by | Result |
  |---|---|---|
  | AC-1 (BP-UAT-013 Step 002 finds ≥1 Mailpit message within 60 s) | Direct API probe `POST http://localhost:4321/api/v1/leads` (with a fresh email to bypass pre-existing idempotency state) → `GET http://localhost:8025/api/v1/messages` shows 1 message with subject "Confirm your AI Qadam updates" and verify-link body. See `.copilot/tasks/active/wf-20260701-uat-045-mailpit-resend/07-test-results.md` Phase D. | ✅ — delivery < 3 s (vs 60 s budget); subject matches `/confirm\|verify/i`; body contains `verify?token=` and `leads/verify`. |
  | AC-2 (No `[email skipped: RESEND_API_KEY not set]` for happy path) | Indirect: the current `EmailService.send()` reaches the nodemailer SMTP transport branch (proven by Mailpit capture). The env-skip branch (`if (!env.SEND_EMAILS) return;`) is not invoked because `SEND_EMAILS=true` in `apps/api/.env`. Phase F of 07-test-results.md carries the equivalent file-log audit with honest disclosure that `apps/api/api-dev.log` is stale from a prior process. | ✅ |
  | AC-3 (`/health/email` exists and is wired into pre-flight) | 6 unit cases in `health-email.spec.ts` cover response shape including `mode`; `scripts/uat-preflight-email.sh` exercises the endpoint via curl + jq-gate with three live response shapes (ready/none+disabled/smtp+disabled); `scripts/uat-env-setup.sh` Step 5 calls the pre-flight at L256. | ✅ |

- **Honesty disclosures:**

  - **Local unit-test execution blocked** by the pre-existing Node.js v24 + vite-node v2.1.9 SSR bug (`__vite_ssr_exportName__ is not defined`, reproduced on `main` and unrelated to this PR). Documented in ISS-UAT-013-9. The TestRunner relies on CI on Node v22 to run the suite and confirm 19/19 pass. The orchestrator did NOT mark unit tests locally-passed.
  - **Playwright BP-UAT-013 Step 002/003** in the post-fix run showed 2 PASS (Step 001 + Step 002-screenshot) and 2 FAIL (Step 002 + Step 003). **Root cause: pre-existing idempotency on `uat-lead-new@example.com`** (the constant `LEAD_NEW` from earlier dev runs of the same spec), NOT a transport regression. The Phase D direct API probe with a fresh email proves the transport works. Making `LEAD_NEW` unique per run is a one-line follow-up PR — out of scope for this PR per AGENTS.md §4.
  - **Schema-controlled `.env`**: `RESEND_API_KEY` remains empty (per AGENTS.md §6, no `.env` modifications without user approval). The fix does not depend on `RESEND_API_KEY` being set; it depends on `SMTP_HOST=localhost` + `SMTP_PORT=1025` (already in `.env`) + `SEND_EMAILS=true` (already in `.env`).
  - **Windows portability regression and fix:** the first Gate 1 run of the pre-flight script failed exit 7 on Windows-bash because Git Bash's `curl` (Linux build) cannot reach Windows processes bound to `[::]:PORT`. Fix shipped in commit `ee249ee`: prefer `curl.exe` over `curl` when both are in PATH. Linux/macOS CI unaffected.

- **Defects observed during the run (for follow-up awareness, NOT workflow failures):**

  1. `apps/api/api-dev.log` carries lines from a prior API process (PID 34032, last entry 28.06.2026). The current API (PID 25416, started via `pnpm start`) does not append to it. Future regression triage relying on that log will miss events from current runs. Log-forwarding from `pnpm start` mode is a separate ops concern.
  2. Playwright `BP-UAT-013-signup.spec.ts:92` reuses `LEAD_NEW = 'uat-lead-new@example.com'` across runs, which collides with prior idempotency state. Switching to `${Date.now()}@example.com` is a one-line follow-up PR.

- **Closes also:** `ISS-LEAD-DISC-001` AC-5 (was deferred pending this workflow, see Resolution section of that issue and `.copilot/tasks/completed/wf-20260701-fix-044/09-quality-gate.md`).
