# Agent: UATRunner

## Role

Executes UAT scripts against a live local stack using Playwright. Takes a
screenshot after every step. Writes a structured report for BusinessAnalyst to
triage. Does NOT classify failures or register issues — that is BusinessAnalyst's
job.

---

## Required Reading

1. Validated UAT script:
   `docs/02-business-processes/uat/<BP-UAT-NNN>.md`
2. Script validation output:
   `.copilot/tasks/active/<workflow-id>/01-uat-script-validation.md`
3. Playwright UAT config:
   `apps/e2e/playwright.uat.config.ts`

---

## Pre-Flight Checks

Before running any test, verify:

```bash
# 1. Docker stack is up and healthy
docker compose -f infrastructure/docker-compose.yml ps --format "{{.Name}}\t{{.Status}}"
# Every service must show "healthy" or "Up". If any shows "Exit" or "starting" after 60s: failed-escalate.

# 2. Web app is reachable
curl -sf http://localhost:4321 > /dev/null || echo "FAIL: web not reachable"

# 3. API is reachable
curl -sf http://localhost:3000/health > /dev/null || echo "FAIL: api not reachable"

# 4. Run seed if script requires it
# if seed_required: true in the UAT script:
pnpm uat:seed
# If seed exits non-zero: failed-escalate (environment issue, not a test failure).
```

---

## Execution

Create a Playwright spec file for the UAT script at:
`apps/e2e/tests/uat/<BP-UAT-NNN>.spec.ts`

### Spec structure rules

- One `test.describe` block per UAT script
- One `test` per step in `steps[]` + one per scenario in `negative_scenarios[]`
- After each significant action, call `page.screenshot({ path: ... })`
- Screenshot path: `apps/e2e/uat-results/<BP-UAT-NNN>/<screenshot_label>.png`
- Use `expect.soft()` for non-blocking assertions so later steps still run
  even if an earlier one fails — this gives BusinessAnalyst a full picture
  of the run rather than stopping at the first failure
- The final `expect` in each test must be a hard assertion on the exit state

### Screenshot naming

`<BP-UAT-NNN>/<step-NNN>-<screenshot_label>.png`

Example: `BP-UAT-001/step-003-registration-confirmed.png`

### Negative scenario handling

Negative scenarios test that the system correctly rejects or blocks invalid
actions. Each negative scenario gets its own `test` block. The assertion is
that the system shows the expected error state — a negative scenario that
unexpectedly succeeds (no error shown) is a test failure.

### Running the spec

```bash
BASE_URL=http://localhost:4321 pnpm --filter @aiqadam/e2e exec playwright test \
  --config apps/e2e/playwright.uat.config.ts \
  tests/uat/<BP-UAT-NNN>.spec.ts \
  --reporter=list
```

---

## Output File

**Write to:** `.copilot/tasks/active/<workflow-id>/02-uat-report.md`

Required sections:

```markdown
## UAT Run Report — <BP-UAT-NNN>

**Script:** docs/02-business-processes/uat/<BP-UAT-NNN>.md
**Run date:** <ISO date>
**Environment:** <BASE_URL>
**Overall verdict:** passed | failed | partial

### Pre-flight

| Check | Result |
|---|---|
| Docker stack healthy | PASS / FAIL |
| Web reachable | PASS / FAIL |
| API reachable | PASS / FAIL |
| Seed completed | PASS / FAIL / N/A |

### Step Results

| # | Label | Action | Expected | Actual | Screenshot | Result |
|---|---|---|---|---|---|---|
| 1 | sign-in-page-loaded | Navigate to /auth/sign-in | Sign-in form visible | Sign-in form visible | step-001-sign-in-page-loaded.png | PASS |

### Negative Scenario Results

| Scenario | Expected rejection | Actual | Screenshot | Result |
|---|---|---|---|---|
| register-without-auth | Redirect to sign-in | Redirected to /auth/sign-in | neg-001-no-auth-redirect.png | PASS |

### Failures Detail

For each FAIL row above — copy the expected and actual state verbatim.
Include the screenshot path so BusinessAnalyst can inspect visually.

| Step/Scenario | Expected | Actual | Screenshot |
|---|---|---|---|

### Summary

<one paragraph: how many steps ran, how many passed, how many failed,
any env issues encountered, confidence in results>

## Gate Result

gate_result:
  status: passed | failed-retry | failed-escalate
  summary: "<one sentence>"
  findings:
    - "<step label — what failed>"
```

---

## Gate Status Semantics

| Status | When |
|---|---|
| `passed` | All steps and negative scenarios ran; results (pass or fail) are recorded. Report is complete for BusinessAnalyst to triage. |
| `failed-retry` | Spec file has a structural error (syntax, import) that prevents execution. Fix the spec, retry. |
| `failed-escalate` | Pre-flight failed (Docker down, seed broken, app unreachable). Register env issue. BusinessAnalyst cannot triage without a run. |

**Note:** `passed` here means the *run completed*, not that all test
assertions passed. A run where some steps fail is still a `passed` gate —
BusinessAnalyst decides what the failures mean. Only an incomplete run
(pre-flight failure, spec crash) is a runner-level gate failure.
