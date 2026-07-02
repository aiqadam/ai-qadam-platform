# 04-security-review.md — wf-20260701-uat-045-mailpit-resend

| Field | Value |
|---|---|
| Workflow | wf-20260701-uat-045-mailpit-resend |
| Issue | ISS-UAT-013-7 |
| Agent | SecurityReviewer |
| Date | 2026-07-01 |
| Branch | fix/ISS-UAT-013-7-mailpit-resend-key (off `main@b3dbba0`) |

## Code Changes Reviewed

- `apps/api/src/health/health.controller.ts` — `EmailHealthResponse` extended with `mode` field
- `apps/api/src/modules/email/email.service.ts` — new `getMode()` method
- `apps/api/test/health-email.spec.ts` — extended to 6 cases
- `apps/api/test/email-service-mode.spec.ts` — NEW, 6 cases
- `scripts/uat-preflight-email.sh` — NEW, bash probe
- `scripts/uat-env-setup.sh` — Step 5 wiring (one new line at L256)

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1 Tenant isolation | No | pass | `/health/email` is a platform-level probe (analogous to `GET /health`); not tenant-scoped. No new query path, no new table. The existing `req.tenant` reference in `check()` is untouched. |
| INV-2 Secrets by reference | Yes | pass | Diff reviewed line-by-line for `password`/`secret`/`apiKey`/`token`/`Bearer`. None present. `RESEND_API_KEY` is referenced only inside `email.service.ts` constructor via the existing `env.*` indirection — never interpolated into the response. The new `mode` field exposes only the tri-state string `'production' \| 'uat' \| 'disabled'`. |
| INV-3 Auth at controller level | Yes | pass | `GET /health/email` is intentionally unauthenticated — same as `GET /health`. The endpoint sits behind `ObserveThrottlerGuard` globally, and `shouldSkip()` exempts the `/health/` prefix (`observe-throttler.guard.ts:31`). Documented in the controller header; mirrors existing `/health` semantics. No new authenticated endpoint introduced. |
| INV-4 Validation at boundaries | No | pass | No new external input is accepted. The endpoint is a GET with no query/path/body params; the response is a fixed-shape literal-union object built from two service getters. The bash script validates the response body shape explicitly with `jq -e has($f)` per field — three boundary assertions, satisfying INV-4's spirit at the script boundary. |
| INV-5 No cross-schema queries | No | pass | No queries added. The endpoint is a pure in-memory aggregation of two service methods. |
| INV-6 Rate limiting | Yes | pass | Inherits the global `ObserveThrottlerGuard` and `/health/*` skip-list (no rate limiting). This matches the existing `GET /health` policy and is the right trade-off for a liveness-style probe. If `RATE_LIMIT_ENFORCE` is flipped to `true` in a future PR, `/health/email` remains exempt. |
| INV-7 CSRF protection | No | pass | GET-only endpoint, no state-changing operation. No browser form posts land here. |
| INV-8 No `dangerouslySetInnerHTML` | No | pass | No frontend code touched. The web app does not consume this endpoint. |
| INV-9 No N+1 queries | No | pass | No queries added. |
| INV-10 Drizzle parameterization | No | pass | No SQL touched. |
| INV-11 HttpOnly tokens (web) | No | pass | No web frontend change; no token handling. |

### Targeted checks (user-flagged focus areas)

**1. Operational-state leak via `mode` field — DOCUMENTED, ACCEPTED.**
The new field exposes one of three literals — `production` / `uat` / `disabled` — plus the existing `configured` boolean and `provider` enum. An attacker probing `GET /health/email` can infer "no transport configured" (provider=none) and "email intentionally off" (mode=disabled). This is the **same information class** already exposed by `GET /health` (which already discloses `service: 'api'` and any tenant info if present). Operationally, the value of pre-flight-failing a misconfigured UAT box far outweighs the operational-state disclosure. Recommendation: **document** the disclosure in the controller's JSDoc so future readers don't accidentally add it to authenticated endpoints (the prose on `getMode()` already does this — the controller itself is missing a one-liner). Not a blocker for this PR.

**2. Bash injection from `API_BASE_URL` env var — NONE.**
I traced every use of `API_BASE_URL` end-to-end. All usages are properly quoted; no `--data`/`-e`/`-K`/`-F` curl flags; all `jq` invocations use `--arg`; all `printf`/`echo` use single-quoted format strings. **Conclusion:** the script has no injection surface. A hostile `API_BASE_URL` would simply produce a noisy curl error, not arbitrary code execution.

**3. `getMode()` side-effect analysis — NONE.**
Three reads of immutable `env.*` constants, three early returns, no `this` reference, no I/O, no logging, no mutation. Idempotence is explicitly proved by case #6 of `email-service-mode.spec.ts`.

**4. `email-service-smtp.spec.ts` regression analysis — UNAFFECTED.**
Diff is purely additive. The 7 SMTP/Resend/disabled path cases are guaranteed to behave identically pre/post this PR.

## BLOCKER Findings

None.

## MAJOR Findings

### MAJOR-1 (non-blocking, addressed in this same PR)

**File:** `scripts/uat-preflight-email.sh`
**Severity:** minor (not blocking; the script is safe as written)
**Recommendation:** Add a scheme validation for `API_BASE_URL` early in `main()` and rename the misnamed `MODE_OK_NOT_DISABLED_PREFIX` constant. Both are 1-line changes; addressed inline.

## Minor / Advisory Observations

1. **Operational state disclosure** — Acceptable for a `/health`-class probe; same disclosure class as the existing `GET /health`. Addressed by adding a JSDoc note to `HealthController.emailHealth()`.

## Verdict

All 11 invariants pass or are not applicable. There are no BLOCKER findings. The single MAJOR suggestion is addressed in this same PR (scheme validation + constant rename + JSDoc note). The change is observability-only: a `mode` enum on an unauthenticated platform probe, a pure env-read helper, a unit-tested derivation, and a bash script that validates the response shape. No new attack surface; no secrets touched; no .env modifications; no cross-schema / cross-module writes; no destructive operations.

---

## Gate Result

gate_result:
  status: passed
  summary: >-
    All 11 security invariants pass. Pure observability addition: a tri-state
    `mode` field on GET /health/email, a side-effect-free getMode() helper on
    EmailService, two extended/new test specs, and a bash pre-flight that uses
    curl + jq safely (no injection surface from API_BASE_URL). MAJOR-1
    (scheme validation + constant rename) addressed in this same PR.
  findings:
    - "INV-2 (Secrets by reference): No password/secret/apiKey/token/Bearer literals in the diff. RESEND_API_KEY never appears in a response string."
    - "INV-3 (Auth at controller level): GET /health/email is unauthenticated by design, same as GET /health. ObserveThrottlerGuard.shouldSkip() exempts /health/* prefix (observe-throttler.guard.ts:31) — verified."
    - "INV-6 (Rate limiting): Endpoint inherits global ObserveThrottlerGuard; exempted via /health/* prefix."
    - "Mode-field operational-state leak (e.g. revealing SEND_EMAILS=false) is acceptable for a /health-class probe — same disclosure class as the existing GET /health endpoint. JSDoc note added to HealthController.emailHealth() per recommendation."
    - "Bash script injection surface: none. All API_BASE_URL usages are quoted, no --data/-e/-K/-F curl flags, all jq values passed via --arg, all printf uses single-quoted format. API_BASE_URL can be hostile without leading to code execution."
    - "getMode() is a pure read of env.SEND_EMAILS and env.NODE_ENV — three early returns, no I/O, no logging, no mutation. Idempotence proven by email-service-mode.spec.ts case #6."
    - "Existing email-service-smtp.spec.ts (7 cases) is unaffected — diff is purely additive; same vi.hoisted mock-isolation pattern; constructor and send() unchanged."
    - "MAJOR-1 (non-blocking): Scheme validation added; MODE_OK_NOT_DISABLED_PREFIX renamed to JQ_MODE_FILTER_PREFIX; one-line JSDoc added to HealthController.emailHealth()."
    - "uat-env-setup.sh Step 5 wiring is exactly one new line (L256) — diff is minimal and surgical."
  retry_target: null
  deferred_to_feature: null
  deferred_reason: null
