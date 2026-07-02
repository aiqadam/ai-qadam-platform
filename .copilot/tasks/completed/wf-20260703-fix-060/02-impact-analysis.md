# 02 — Impact Analysis (wf-20260703-fix-060)

## Validated Requirement

ISS-UAT-013-12 — rewrite Neg 004 of the BP-UAT-013 Playwright spec
(`apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts`) to use the proven
`emailInput.fill()` + `submit.click()` pattern (already used by Step 001
and verified to pass against the live stack) instead of the broken
`setReactInputValue(...)` + `form.requestSubmit()` sequence.

## Affected Layers

### API (NestJS) — UNCHANGED

The product behaviour is correct. No NestJS controller, service, DTO, or
schema changes required. The api's `emailField()` zod refinement
(`apps/api/src/lib/email-schema.ts`) correctly rejects plus-addressed
emails with `Plus-addressed emails (name+tag@…) are not allowed.` and
returns 400 BadRequest. Verified live during pre-flight.

### DB Changes Required

**No.** No schema change, no migration, no entity change. The fix is
purely a Playwright interaction-sequence correction.

### Shared Types

**No changes.** `packages/shared-types/` is not touched.

### Frontend (apps/web) — UNCHANGED

`apps/web/src/components/LeadCaptureForm.tsx` continues to render the
form, the `error` phase `<p>`, and the same submit-button enable logic
that gates on `form.email.trim().length === 0`. The test rewrite is on
the consumer side, not the producer side.

### Bot

**No changes.** `apps/bot/` is unrelated.

### Workers

**No changes.** `apps/workers/` is unrelated.

## Affected Files

| File | Change | Reason |
|---|---|---|
| `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` | Rewrite the body of `Neg 004` (lines ~432–465). | Replace `setReactInputValue` + `form.requestSubmit()` with `emailInput.fill()` + `submit.click()`. Add comment block at the top of the test documenting the React-18 state-commit race. |

**Files unchanged:**

- `apps/web/src/components/LeadCaptureForm.tsx` — product code is correct.
- `apps/api/src/lib/email-schema.ts` — zod refinement is correct.
- The `setReactInputValue` helper at spec lines 139–161 — **kept** because
  Neg 001 still uses it for the hidden honeypot field
  (`<input name="company" style="left:-9999px; opacity:0">`, which
  Playwright's `.fill()` refuses to interact with). Deleting it would
  break Neg 001.

## API Surface Changes

**None.** No HTTP route, request body, response body, or status code
changes. The 400 + `fieldErrors.email` contract is preserved.

## Cross-Module Calls

**None.** No new or changed cross-module calls. The api surface and the
web form contract are both unchanged.

## Risk Flags

| Risk | Mitigation |
|---|---|
| Deleting `setReactInputValue` would break Neg 001 (honeypot test) | Helper is kept; only Neg 004's interaction sequence is rewritten. |
| Playwright `.fill()` on a hidden honeypot field | Neg 001's honeypot field uses `setReactInputValue` precisely because `.fill()` cannot target a CSS-hidden input. No change. |
| Race in Neg 004 is intrinsic to `setReactInputValue` + `requestSubmit` | The new body uses `fill()` (awaits value commit) + `click()` (awaits button enable). Both waits are conditional, not timer-based, so the test is robust to React's commit timing. |
| Live infrastructure availability for the BP-UAT-013 re-run | Pre-flight curl confirmed: api (`:3000` /health 200), web (`:4321` 200), mailpit (`:8025` 200), directus (`:8200` 200), authentik (`:9000` port listening). Step 002/003/004 of the happy path will continue to depend on `RESEND_API_KEY` (intentionally empty for this UAT) — that is a separate known constraint, unchanged by this fix. Neg 004 and the other Neg tests do not depend on email delivery. |
| Other Neg tests sharing a describe block may pick up the helper change | Neg 001 is the only other test in the same describe that uses `setReactInputValue`. Its body is unchanged. No regression risk. |

## Test Scope

| Test tier | Required | Reasoning |
|---|---|---|
| Unit | No | The change is a Playwright interaction sequence in an existing spec. No new production function. |
| Integration (Testcontainers) | No | No DB or service change. |
| **E2E (Playwright)** | **Yes — BP-UAT-013 Neg 004 in isolation, then full re-run** | The rewrite IS the test. The acceptance criterion requires "BP-UAT-013 re-run reports Neg 004 PASSING". |

## Acceptance Criteria → Test Mapping

| AC (from ISS-UAT-013-12) | Test |
|---|---|
| Neg 004 rewritten to use `emailInput.fill()` + `submit.click()` | Spec diff inspection — verified by TestDesigner / QualityGate |
| Comment block at top of Neg 004 documents the React-18 state-commit race | Spec diff inspection |
| BP-UAT-013 re-run reports Neg 004 PASSING | `pnpm --filter @aiqadam/e2e exec playwright test --config apps/e2e/playwright.uat.config.ts --grep "Neg 004"` then full suite |
| `setReactInputValue` helper kept (Neg 001 still uses it) | `grep -n setReactInputValue apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` must still match the helper definition AND the Neg 001 call site |

## Architecture Rule Compliance

- [x] **Simple control flow** (AGENTS.md §1.1) — test body remains a linear
  AAA: goto page → fill email → click submit → assert error visible.
- [x] **Functions fit on one screen** (§1.4) — Neg 004 stays under 30 lines.
- [x] **At least one assertion per function** (§1.5) — three assertions:
  error `<p>` visible, no success `<p>`, mailpit silent.
- [x] **No new color tokens / no gradients / Lucide only** (AGENTS.md §11) —
  N/A (test file, no UI authored).
- [x] **Small PR rule** (§4) — 1 file, well under 400 lines.
- [x] **Production-readiness / no deferred tests** (§6.1) — every AC will
  be verified by an actual Playwright run inside this workflow.

## Gate Result

```yaml
gate_result:
  status: passed
  attempt: 1
  timestamp: 2026-07-03T00:00:00Z
  summary: >-
    Single-file Playwright test rewrite. No API / DB / shared-types / product
    changes. Live infra (api, web, mailpit, directus, authentik) confirmed up
    during pre-flight. setReactInputValue helper kept (Neg 001 still uses it).
  output_file: ".copilot/tasks/active/wf-20260703-fix-060/02-impact-analysis.md"
```
