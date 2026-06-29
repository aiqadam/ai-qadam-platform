# Step 6: Test Strategy — wf-20260629-fix-036

**Workflow:** wf-20260629-fix-036
**Issue:** ISS-UAT-013-4
**Date:** 2026-06-29
**Agent:** TestStrategist

---

## Strategy

The fix is entirely in bash shell scripts. No TypeScript, NestJS, or React surface changed. Test levels:

| Level | Applicable | Rationale |
|---|---|---|
| Bats unit | YES | Primary — test `ensure_operator_invite` logic + structural invariants |
| Testcontainers integration | NO | Directus REST interaction covered by live-stack `pnpm uat:seed` run |
| E2E Playwright | NO | `BP-UAT-013-signup.spec.ts` already covers the end-to-end invite flow |

## Regression Test Requirement

**Must have:** at least one test that would fail before the fix and pass after.

Before fix: `scripts/uat-seed.sh` had no `ensure_operator_invite` function. After fix: it does.

Regression anchor: `AC-1 (mock mode)` — runs the seed script and verifies 3 `operator_invite (mock)` lines appear in output. On the OLD code (no function, no step [4/4]), zero such lines would appear and the count assertion `[ "$count" -eq 3 ]` would fail.

## Planned Tests

| ID | Description | Type | Regression? |
|---|---|---|---|
| AC-1a | Mock mode runs successfully with 3 operator_invite mock lines | bats | YES — primary regression |
| AC-1b | Mock mode summary lists all 3 token names | bats | YES |
| AC-2 | DIRECTUS_TOKEN guard exists (static grep) | bats | structural |
| AC-3 | token_hash idempotency GET check exists (static grep) | bats | structural |
| AC-4a/b/c | uat-env-setup.sh contains UAT_ONBOARD_TOKEN/USED/EXPIRED (static grep) | bats | YES — missing before fix |

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "7 bats tests planned: 2 regression (AC-1a, AC-1b), 3 env-var structural (AC-4a/b/c), 2 code-structural (AC-2, AC-3). All are runnable without a live stack."
  findings:
    - "Primary regression: AC-1a verifies ensure_operator_invite is called 3 times in mock mode."
    - "AC-4a/b/c verify uat-env-setup.sh contains the three UAT_ONBOARD_* vars."
    - "No integration or E2E tests needed — shell-only fix, existing E2E spec covers the invite flow."
```
