## What
Replaces the flaky `setReactInputValue` + `form.requestSubmit()` interaction in Neg 004 of `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` with the proven `fill() + click()` pattern (already used by Step 001). The race was a React 18 batched-setState commit: the form sat in `idle` for ~10s, then the matcher timed out.

## Why
The api's plus-addressing rejection works correctly (verified live: `400` + `fieldErrors.email = "Plus-addressed emails (name+tag@...) are not allowed."`). Only the **test** was racing. Pattern is the proven Step-001 pattern.

## How
- `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` Neg 004:
  - new sequence: `fill(LEAD_PLUS) → expect(submit).toBeEnabled() → click()`
  - defensive assertion: `toHaveCount(0)` for success panel + Mailpit dispatch-absence check
  - 24-line comment block documents the race and why `setReactInputValue` is NOT used
- `setReactInputValue` helper kept (Neg 001 still uses it for an off-screen hidden honeypot that `.fill()` refuses)
- Issue file + registry: `Status | resolved`, Workflow `wf-20260703-fix-060`, Date `2026-07-03`

## Risks
Low. Test-only change. The api payload and the api contract are unchanged. If the React form behavior changes in `apps/web/src/components/LeadCaptureForm.tsx` (product code), this test will catch it.

## Testing
- `pnpm exec playwright test --grep "Neg 004"` → **1 passed (11.1s)** (was timing out at 10s)
- Full `UAT_API_URL=http://localhost:3000 pnpm exec playwright test --grep "BP-UAT-013"` → 8/12 passed; Neg 004 PASS
- 4 remaining failures (`Step 002/003/005/006`) are PRE-EXISTING env constraints (empty `RESEND_API_KEY`, stale seed `operator_invites` row). Filed separately as ISS-UAT-013-13.
- `pnpm biome check apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts .copilot/issues/` → clean
- `pnpm tsc --noEmit -p apps/e2e/tsconfig.json` → clean

## Honesty disclosures
- The 4 unrelated pre-existing BP-UAT-013 failures are NOT regressions from this PR. They are env-state issues (Mailpit/Resend key + seed data freshness). They will be addressed in the BP-UAT-013 re-run workflow that closes ISS-UAT-013-13.
- This PR fixes ONLY the test code for Neg 004. It does NOT touch the API or the form component, both of which behave correctly.

## Checklist
- [x] Tests added / updated (the rewrite IS the test)
- [x] Docs updated if behavior changed (issue + registry)
- [x] No new dependencies
- [x] Manually tested locally (Neg 004 runs green; full BP-UAT-013 proves no regression)
