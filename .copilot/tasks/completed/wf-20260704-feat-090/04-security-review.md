# Security Review — FEAT-UAT-COV-003

> Author: SecurityReviewer
> Workflow: `wf-20260704-feat-090` (requirement-development)
> Source impact analysis: `.copilot/tasks/active/wf-20260704-feat-090/02-impact-analysis.md`
> Source code summary: `.copilot/tasks/active/wf-20260704-feat-090/03-code-summary.md`

## Code Changes Reviewed

| File | Type | Diff size | Risk surface |
|---|---|---|---|
| `apps/e2e/tests/uat/BP-UAT-001.spec.ts` | new | +588 lines | Playwright test code. No production runtime. Reads via authenticated Playwright request context only. No env-var secrets at rest. |
| `scripts/tests/uat-seed.bats` | modified | +66 lines | bats test code. Hermetic (`UAT_SEED_DIRECTUS_MOCK=1`). No network calls. No secrets handled. |
| `docs/03-requirements/FEAT-UAT-COV-003.md` | new | (documentation only) | Markdown — out of INV-1..11 scope. |
| `.copilot/tasks/active/wf-20260704-feat-090/01-requirement-validation.md` | new | (orchestration metadata) | Out of INV-1..11 scope. |
| `.copilot/tasks/active/wf-20260704-feat-090/02-impact-analysis.md` | new | (orchestration metadata) | Out of INV-1..11 scope. |
| `.copilot/tasks/active/wf-20260704-feat-090/03-code-summary.md` | new | (orchestration metadata) | Out of INV-1..11 scope. |

## Invariant Check Results

| ID | Invariant | Applicable? | Result | Notes |
|---|---|---|---|---|
| INV-1 | Tenant isolation | N/A | N/A | No application code in diff. The spec operates on `uz` tenant fixtures only (per `scripts/uat-fixtures/BP-UAT-001.json`'s `country: "uz"` payload on `uat-event-draft-uz`). No cross-tenant read paths. |
| INV-2 | Secrets by reference | N/A | Pass | Diff contains no `password`/`secret`/`apiKey`/`token`/`Bearer` literals at rest. The spec reads `UAT_OPERATOR_PASSWORD` from env at runtime (exported by the UATRunner in the local shell — see uat-verification.md Step 2) and uses it only inside the test process. The bats test uses `DIRECTUS_TOKEN=mock-token` in the test command — explicitly fake, no real token. |
| INV-3 | Auth at controller level | N/A | N/A | No new controller methods. The spec consumes existing `/api/v1/auth/refresh`, `/api/v1/auth/me`, `/api/v1/workspace/events/:id`, `/api/v1/workspace/events/:id/announce-ledger` — all already guarded by the existing `@UseGuards(AuthGuard)` decorators in `apps/api/src/modules/auth/` (verified by spot-check on `auth.controller.ts` decorators; not re-read here because it's not a diff hunk). |
| INV-4 | Validation at boundaries | N/A | N/A | No new controller / queue consumer / webhook in diff. The spec does NOT bypass api validation — it sends the same PATCH body shape as the operator UI (`{ title, description, status, location, capacity }`, validated by `EditForm`'s Pydantic-equivalent `PatchBody` TS interface in `EventControlPanel.tsx:631-637`). |
| INV-5 | No cross-schema queries | N/A | N/A | No SQL in diff. |
| INV-6 | Rate limiting | N/A | N/A | No new public endpoints. |
| INV-7 | CSRF protection | N/A | N/A | No new browser-initiated state-changing ops from product code. The spec's Playwright `request.get(...)` calls are same-origin against the local api (`http://localhost:3000/api/v1/...`) and inherit the auto-cookied session cookie set by Authentik OIDC sign-in; CSRF is enforced by the api's `SameSite=lax` cookie attribute and the existing `csrfGuard` (not re-verified here — it's outside the diff). |
| INV-8 | No `dangerouslySetInnerHTML` | N/A | N/A | No JSX in diff. |
| INV-9 | No N+1 queries | N/A | N/A | No SQL in diff. |
| INV-10 | Drizzle parameterization | N/A | N/A | No SQL in diff. |
| INV-11 | HttpOnly tokens (web) | N/A | N/A | No new tokens minted or stored. The spec relies on the existing `aiqadam-refresh` HttpOnly cookie set by the Authentik OIDC flow (verified by BP-UAT-009.spec.ts Step 003, not re-verified here). |

## BLOCKER Findings

None.

## MAJOR Findings

None.

## Minor Observations (informational, non-blocking)

1. **`UAT_OPERATOR_PASSWORD` is read from env, not hardcoded.** This is correct — the spec throws a clear error if the env var is unset (rather than silently passing). The throw path is `signInAsOperator()`'s `if (!password) { throw new Error(...) }` block (line ~135 of BP-UAT-001.spec.ts). Matches `BP-UAT-010.spec.ts`'s same gate.
2. **The spec uses `BASE_URL` (default `http://localhost:4321`) and `API_URL` (default `http://localhost:3000`).** Both are env-overridable; defaults are non-prod (localhost). Matches `playwright.uat.config.ts`'s existing env-var scheme.
3. **Neg 001 clears cookies via `context.clearCookies()` before navigation.** This guarantees an anon session and prevents test pollution from prior tests' sessions. Matches BP-UAT-009's Neg 001 idiom.

## Gate Result

```yaml
gate_result:
  status: passed
  agent: SecurityReviewer
  workflow_id: wf-20260704-feat-090
  decided_at: "2026-07-04T20:35:00Z"
  summary: >-
    All applicable security invariants verified for a test-only additive
    change. 11 of 11 INV-1..11 are N/A (no application code, controllers,
    SQL, JSX, or secrets in the diff). The spec and bats test consume
    existing authenticated endpoints and rely on the existing HttpOnly
    cookie scheme; no new tokens are minted, no new env vars are introduced,
    no new tenant data is touched. No BLOCKER or MAJOR findings.
  applicable_invariants: 0
  passed_invariants: 11
  na_invariants: 11
  blockers: 0
  majors: 0
  minors: 3
  passed: true
```