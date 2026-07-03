# Step 6 — Test Strategy

**Workflow:** wf-20260704-fix-073
**Issue:** ISS-UAT-009-1
**Date:** 2026-07-04

## Requirement

ISS-UAT-009-1 — Sign-out lands on Authentik's RP-Initiated Logout
confirmation interstitial instead of auto-redirecting to
`/auth/signed-out`, despite a valid `id_token_hint`.

**Resolution path chosen: Path B** — Update `auth.service.ts` comment +
BP-UAT-009 Step 004 expected state + AC-7 wording to reflect that the
Authentik confirmation interstitial is the expected UX with the current
Authentik configuration.

## Rubric Score

| Criterion | Points |
|---|---|
| Touches tenant-scoped data | 0 |
| New API endpoint | 0 |
| Business rule with edge cases | 0 |
| Cross-module service call | 0 |
| New database query | 0 |
| Pure function / utility | 0 |
| UI-only change (no logic) | 0 |
| **Documentation-only change** | **0** |

**Total: 0.** Pure documentation change; no code paths modified.

**Required test levels (per rubric):** Unit tests sufficient. The integration
test score does not trigger and the E2E test score does not trigger.

**However**, the issue itself is a real user-facing UX inconsistency that
**BP-UAT-009 Step 004** Playwright spec already exercises (it failed on
2026-07-02 and is the source of the issue). Live re-running the existing
BP-UAT-009 Playwright spec against the updated expected-state is part of
the **verification path**, not a new test design — this strategy just
acknowledges it.

## Required Test Levels

- [x] Unit (doc-coverage regression: 4 assertions in
  `apps/api/test/auth-logout-doc-coverage.spec.ts`)
- [x] Unit (drift-detector regression: 1 assertion in
  `scripts/tests/check-workflow-state.bats`)
- [ ] Integration (Testcontainers) — N/A
- [x] E2E (Playwright) — **live re-run of existing BP-UAT-009 spec** for
  AC verification, NOT a new spec design

## Unit Test Plan

| Target | Happy Path | Failure Paths |
|---|---|---|
| `auth.service.ts` `buildLogoutUrl()` comment block | Doc-coverage regression pins the post-fix comment. | If comment regresses to claim "MAY skip … silently", the `not.toMatch` assertion fails. |
| `check-workflow-state.sh` `extract_issue_ids()` regex | bats regression confirms SHA-suffixed IDs (`ISS-CI-OVERRIDE-ebd184b`) do NOT produce phantom `ISS-CI-OVERRIDE-` drift entries. | If regex loses lowercase hex, the regression fails. |

## Integration Test Plan

None — no code paths modified.

## E2E Test Plan

| User Flow | Entry Point | Exit Assertion |
|---|---|---|
| BP-UAT-009 Step 004 (sign out) | `http://localhost:4321` while signed in as `uat-member` | **Interstitial phase:** browser at Authentik's logout confirmation page with the three buttons and "aiqadam-refresh" cookie already cleared. **Post-confirmation phase:** after clicking "Log out of authentik", browser at `http://localhost:4321/auth/signed-out` with AI Qadam branding. |

This is the **live verification** of the spec update — not new test
design. The existing Playwright spec at
`apps/e2e/tests/uat/BP-UAT-009.spec.ts` is reused.

## Acceptance Criteria → Test Mapping

| AC | Test Level | Test Description |
|---|---|---|
| AC-1 ("Root cause confirmed: Authentik provider/flow configuration inspected and the reason the confirmation stage renders despite a valid id_token_hint is identified") | Architecture doc + Issue | `auth-architecture.md` §5.3 step 5 documents the finding; ISS-UAT-009-1 Resolution section will record it. |
| AC-2 ("Either: Authentik flow updated to skip confirmation when hint is valid, OR: `auth.service.ts` comment + BP-UAT-009 Step 004 / AC-7 updated to reflect that the interstitial is expected behavior with this Authentik version") | Unit (doc coverage) | The 4 assertions in `auth-logout-doc-coverage.spec.ts` pin the comment; BP-UAT-009 spec updated. |
| AC-3 ("Step 004 in BP-UAT-009 passes on live re-run (browser lands at `/auth/signed-out` with AI Qadam branding, OR the revised expected state is met)") | E2E (live re-run) | Existing `apps/e2e/tests/uat/BP-UAT-009.spec.ts` re-run against the live stack. Orchestrator pre-flight per AGENTS.md §6.1 (`docker compose up -d` for missing services + per-service `curl` reachability). |

## Honesty disclosure

- The behavioural `buildLogoutUrl` tests (URL construction with/without
  `id_token_hint`) in `apps/api/test/auth-logout-url.spec.ts` are
  preserved unchanged. They are currently blocked by ISS-TEST-WEB-001
  (vitest + vite 8 SSR skew — `ReferenceError: __vite_ssr_exportName__`),
  same failure mode that blocks `leads-service.spec.ts` on `main`. When
  `wf-20260703-fix-066-vitest-bump` lands, those 3 tests will resume
  running. **No test coverage has been lost** by this workflow; the new
  doc-coverage test is additive.

- The "live re-run of BP-UAT-009 Step 004" depends on the local docker
  stack being reachable (api on :3000, web-next on :4321, Authentik on
  :9000). Per AGENTS.md §6.1 the Orchestrator MUST pre-flight these
  services before declaring the test "verified" — if any are missing,
  bring them up (`docker compose -f infrastructure/docker-compose.yml up
  -d <missing>` + per-service `curl`). A "the stack isn't ready" deferral
  without pre-flight capture is a workflow violation.

## Gate Result

gate_result:
  status: passed
  summary: "Rubric score 0 → unit tests sufficient. Doc-coverage regression covers AC-2; bats regression covers the Step 0.5 infrastructure fix; existing BP-UAT-009 Playwright spec reused for AC-3 live verification."
  findings:
    - "No code paths changed → no integration test design needed"
    - "BP-UAT-009 Step 004 E2E re-run is verification, not new design"
    - "Behavioural auth-logout-url tests preserved; blocked by ISS-TEST-WEB-001, not by this workflow"