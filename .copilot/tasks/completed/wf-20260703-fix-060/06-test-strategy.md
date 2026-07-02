# 06 — Test Strategy (wf-20260703-fix-060)

## Requirement

ISS-UAT-013-12 — rewrite the Neg 004 interaction sequence in
`apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` so that the test reliably
exercises the api's `Plus-addressed emails (name+tag@…) are not allowed.`
zod validation. The api is already correct; the bug is purely in the
test's interaction sequence.

## Rubric Score

| Criterion | Points | Applies? |
|---|---|---|
| Touches tenant-scoped data | +2 | No — no production code changed |
| New API endpoint | +2 | No |
| Business rule with edge cases | +2 | No — the rule itself is unchanged; the test was just unreliable |
| Cross-module service call | +1 | No |
| New database query | +1 | No |
| Pure function / utility | 0 | n/a |
| UI-only change (no logic) | 0 | n/a (the test is at the E2E boundary, not a UI change) |

**Total: 0.** By the rubric, this is "unit tests sufficient" — but the
change itself IS a Playwright test. The required test tier is therefore
"the rewritten E2E test in BP-UAT-013 Neg 004."

## Required Test Levels

- [ ] Unit (no new production function)
- [ ] Integration / Testcontainers (no DB change)
- [x] **E2E (Playwright) — Neg 004 in isolation, then full BP-UAT-013 re-run**

## Unit Test Plan

n/a — no production function was added or modified.

## Integration Test Plan

n/a — no NestJS service, controller, or DB query was added or modified.

## E2E Test Plan

| User Flow | Entry Point | Exit Assertion |
|---|---|---|
| `Neg 004 — Plus-addressing in email is rejected` (apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts) | `page.goto(BASE_URL)` → `emailInput.fill(LEAD_PLUS)` → `submit.click()` | (1) `await expect(page.getByText(/check your inbox/i)).toHaveCount(0, { timeout: 5_000 })` — the form must NOT show the success panel. (2) `await expect(errorBanner).toBeVisible({ timeout: 10_000 })` — the error `<p>` must surface within 10s, matching `plus.?addressed\|plus-addressing\|not allowed\|invalid email\|\b400\b`. (3) `expect((await mailpitSearch(LEAD_PLUS)).length).toEqual(0)` — Mailpit must NOT receive a message for the rejected recipient. |
| Full BP-UAT-013 re-run | Same spec file, full `describe` block | All 12 tests in the file PASS (Step 001–006, Neg 001–005, plus the 2 screenshot tests). Neg 004 must report PASS. |

## Acceptance Criteria → Test Mapping

| AC (from ISS-UAT-013-12) | Test Level | Test Description |
|---|---|---|
| AC-1: Neg 004 rewritten to use `emailInput.fill()` + `submit.click()` (no `setReactInputValue` or `form.requestSubmit()` for Neg 004) | E2E | Spec diff inspection — `git diff` of `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` shows the body of the `Neg 004` test references `emailInput.fill`, `submit.click`, and does NOT reference `setReactInputValue` or `form.requestSubmit`. |
| AC-2: A comment block at the top of Neg 004 documents the React-18 state-commit race and the reason for not using `setReactInputValue` | E2E | Spec diff inspection — the Neg 004 test is preceded by a multi-paragraph `// Retry-3 (ISS-UAT-013-12)` comment block that names the race and explains the chosen pattern. |
| AC-3: BP-UAT-013 re-run reports Neg 004 PASSING | E2E | `pnpm --filter @aiqadam/e2e exec playwright test --config apps/e2e/playwright.uat.config.ts --grep "Neg 004"` exits 0; then full BP-UAT-013 re-run (`--grep "BP-UAT-013"`) exits 0 with all tests passing. |
| AC-4: `setReactInputValue` helper deleted from the spec if no other test references it | E2E | The helper definition remains because Neg 001 still uses it for the hidden honeypot field. `grep -n setReactInputValue apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` returns 2 matches: the helper definition (lines ~139–161) and the Neg 001 call site (line ~353). This is the documented exception in the issue's proposed resolution ("if no other test references them" — Neg 001 does, so the helper stays). |

## Regression Test Plan

The original bug (the React-18 state-commit race) is regression-tested
by **the rewritten Neg 004 itself**: if a future refactor reintroduces
the `setReactInputValue + form.requestSubmit` pattern (or otherwise
relies on a non-conditional timer wait), Neg 004 will fail again because
the form will sit in `idle` and the matcher will time out.

Additionally, a **defence-in-depth** check: if a future code change
accidentally removes the api's `emailField()` plus-addressing zod
refinement, Neg 004 will now fail with a clean assertion error
("plus-addressed email must NOT show success panel" — the form would
transition to `success` instead of `error`). This is the regression
the issue's "Expected state" section is asking for.

## Gate Result

```yaml
gate_result:
  status: passed
  attempt: 1
  timestamp: 2026-07-03T00:00:00Z
  summary: >-
    Single-E2E-test rewrite. Rubric score 0 (no production change), but the
    rewrite IS the test. Three explicit assertions cover the api's 400 +
    fieldErrors contract, the absence of a success panel, and the absence
    of a Mailpit dispatch.
  output_file: ".copilot/tasks/active/wf-20260703-fix-060/06-test-strategy.md"
```
