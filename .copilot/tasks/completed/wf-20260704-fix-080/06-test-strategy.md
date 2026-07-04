# 06 — Test Strategy (Step 6)

**Workflow:** wf-20260704-fix-080
**Issue:** [ISS-UAT-009-5](.copilot/issues/ISS-UAT-009-5.md)
**Branch:** fix/ISS-UAT-009-5-bp-uat-009-neg-001-redirect-spec
**Date:** 2026-07-04
**Agent:** TestStrategist

---

## Strategy

This is a **test-only** change. The strategy is to:

1. Run the modified BP-UAT-009 Neg 001 step 3 times against the live stack to verify AC-1 (deterministic pass).
2. Run the full BP-UAT-009 spec to verify AC-2 (no regression to other steps — Steps 001-006 plus Neg 002, Neg 003).
3. Cross-check the new test structure against the doc contract at `docs/02-business-processes/uat/BP-UAT-009.md` for AC-3.

## What's already in place

| Layer | Status | Notes |
|---|---|---|
| Unit tests | N/A | The change is to e2e tests, not application code. No unit-test surface introduced. |
| Integration tests | N/A | Same — no app code touched. |
| E2E / Playwright (UAT) | Pre-existing | `apps/e2e/tests/uat/BP-UAT-009.spec.ts` is the test surface; `playwright.uat.config.ts` is the runner. |
| Visual review | N/A | No UI changes. |
| Typecheck | Already enforced | `apps/e2e/tsconfig.json` inherits from `tsconfig.json` (strict: true). The change uses only existing imports. |

## Run plan

### Step 1 — local-typecheck gate

```bash
cd apps/e2e
pnpm exec tsc --noEmit
```

Expected: 0 errors. The change adds only expression-level constructs that already exist elsewhere in the same file.

### Step 2 — pre-flight (live stack health)

Already verified earlier in this workflow: `apps/web` on :4321, Directus on :8200, Authentik on :9000, Postgres on :5433, Mailpit on :8025.

### Step 3 — targeted Neg 001 runs (AC-1 determinism)

```bash
cd apps/e2e
pnpm exec playwright test --config=playwright.uat.config.ts \
  --grep "BP-UAT-009 — negative scenarios › Neg 001 — Protected page"
```

Run **3 times consecutively** (warm-cache determinism check). Acceptance: all 3 pass, exit 0.

### Step 4 — full BP-UAT-009 (AC-2 no regression)

```bash
cd apps/e2e
pnpm exec playwright test --config=playwright.uat.config.ts \
  --grep "BP-UAT-009"
```

Acceptance: Steps 001-006 + Neg 001-003 status unchanged from before this workflow. (Neg 002, Neg 003 pre-existing failures — if any — are *not* caused by this diff and remain out-of-scope here.)

### Step 5 — cross-check with doc (AC-3)

```bash
diff <(grep -E "redirects to /auth/sign-in" docs/02-business-processes/uat/BP-UAT-009.md) \
     <(grep -E "auth/sign-in|api/v1/auth/login" apps/e2e/tests/uat/BP-UAT-009.spec.ts | head -5)
```

Manual review: confirm test's expected URL surfaces match the doc's stated contract.

## Block / escalation criteria

| Symptom | Action |
|---|---|
| Neg 001 fails on all 3 runs with the *same* error | Diagnose the underlying infra or app bug; do not loop on the test. Register a new issue, queue a follow-up workflow. |
| Neg 001 fails 1/3 (still flaky) | Register a *new* issue; this fix did not fully resolve determinism. |
| Steps 001-006 start failing | Revert; my edit introduced regression. |
| Typecheck fails | Revert; my edit introduced a type error. |

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Test-only change. Run plan is 5 steps: typecheck, pre-flight (already done), 3× Neg 001 determinism, full BP-UAT-009 no-regression, doc cross-check. Block/escalation criteria spelled out. AC-2 trivially satisfied since the diff is contained to lines 573-608."
  findings:
    - "Strategy is light by necessity — no app code, no unit surface, no new fixtures."
    - "3× Neg 001 determinism is the load-bearing step; failure modes are classified."
    - "Doc cross-check is mechanical (text-grep) since the test now explicitly states the URL surfaces in its expect.soft message."
```