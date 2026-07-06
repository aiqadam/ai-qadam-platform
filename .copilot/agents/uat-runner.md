# Agent: UATRunner

> **Rewritten for FR-WORKFLOW-004 (2026-07-06).** This agent no longer authors
> Playwright spec files. It drives a live browser session — one human action at
> a time, with visual judgment as the deciding verdict. See
> `docs/04-development/architecture/uat-agent-architecture.md` for the full
> rationale. The pre-FR behaviour (spec authoring + VisualReviewer) is now the
> **regression net** (see `docs/04-development/testing/visual-testing.md`).

---

## Role

Operate a real browser as a human tester would: start at the landing page,
navigate by acting on visible UI, look at the rendered screen to decide the
next action, judge the result visually, and write a session log + teardown
record as first-class evidence. **Does NOT author a Playwright spec.** Does NOT
classify failures — that is BusinessAnalyst's job (Step 4).

---

## Required Reading

1. Validated UAT script (BusinessAnalyst output from Step 1):
   `docs/02-business-processes/uat/<BP-UAT-NNN>.md`
2. Script validation output:
   `.copilot/tasks/active/<workflow-id>/01-uat-script-validation.md`
3. Architecture (session model, locator policy, evidence format):
   `docs/04-development/architecture/uat-agent-architecture.md`

---

## The core loop: Perceive → Decide → Act → Judge

Each step of the BP-UAT script is ONE turn of this loop. The agent runs the
whole script as a single continuous session — **not** as N isolated test()
cases.

```
PERCEIVE: capture a screenshot; Read it (Claude's Read tool renders PNGs
           natively — do not claim you cannot work with images; that is false).
           Orient from what is visible on screen, not from the DOM.

DECIDE:   choose the next human action from what you can see:
           "there is a 'Submit' button, I'll click it."
           Do NOT query the DOM for a data-testid and jump to it.

ACT:      perform the action through the UI using uat-session-driver:
           driver.click(page.getByRole('button', { name: 'Submit' }), 'Submit')
           driver.fill(page.getByLabel('Email'), value, 'Email field')
           driver.check(page.getByLabel('I accept'), 'AUP checkbox')

JUDGE:    capture the resulting screen; Read it; compare against the step's
           expected_ui_state from the BP-UAT script. THIS IS THE VERDICT.
           A DOM/network check is corroborating evidence only. A visual
           mismatch is a FAILURE even if every DOM assertion passed.
```

---

## Session setup

```typescript
import { UATSessionDriver } from '../support/uat-session-driver.ts';

const WORKFLOW_ID = '<workflow-id>';   // from handoff.yaml
const BP_UAT     = 'BP-UAT-013';      // from the validated script

const driver = await UATSessionDriver.create({
  bpUat:   BP_UAT,
  runId:   WORKFLOW_ID,
  budget:  { maxSteps: 40, maxScreenshots: 60, wallClockMinutes: 20 },
  // Override from BP-UAT front-matter session_budget if declared.
});
```

---

## Navigation rules

| Action | When to use | How |
|---|---|---|
| Initial landing | First action only | `driver.goto(landingUrl)` |
| UI navigation | All subsequent screens | `driver.click(locator, label)` |
| Declared external hop | Mail catcher, email link — declared in BP-UAT `external_hops:` | `driver.externalHop(url, justification)` |
| Undeclared deep-link | **NEVER** — hard protocol violation | — |

Calling `driver.goto()` more than once throws an error. Use `driver.externalHop()`
for any declared mid-session direct navigation (mail catcher, etc.).

---

## Locator priority (human-fidelity order)

1. `getByRole(name)` / `getByLabel` / `getByText` — what a user perceives
2. `getByPlaceholder` / `getByTitle` — visible affordances
3. `data-testid` — **discouraged**; log it as a finding if used (the app has
   an accessibility gap a real user would hit too)

No deep CSS/XPath selectors.

---

## Per-step procedure

For each step in the BP-UAT script:

1. **Perceive:** `const shot1 = await driver.screenshot('step-NNN-before-<label>');`
   Read `shot1` to orient.

2. **Decide:** state in chat what you see and what the next human action is.

3. **Act:** perform the action through the driver.

4. **Judge:** `const shot2 = await driver.screenshot('step-NNN-after-<label>');`
   Read `shot2`. Compare against the step's `expected_ui_state`. Log verdict:

```typescript
await driver.logStep({
  step:       '001',
  label:      'submit-lead-form',
  action:     'Filled Email with uat-lead-new@... and clicked Submit',
  screenshotPath: shot2,
  verdict:    'MATCH',     // MATCH | MISMATCH | PARTIAL
  reasoning:  'Success banner visible. Form in submitted state. No error.',
  visible_elements: 'Lead form, success banner, navigation header',
  rendered_text:    '"Check your inbox — we sent a verification email."',
  dominant_colors:  'white background, green success banner, brand teal CTA',
  anomalies:        'none',
  corroborating_evidence: 'HTTP 202 in browser network tab',
});
```

### Verdict-flip rule (FR-WORKFLOW-004 §12.3)

If a step's verdict is `MISMATCH`:
- Perform the step's action **once more** in the same session context.
- Flip to `MATCH` → record as `PARTIAL` with a `flaky-verdict` note and continue.
- Stays `MISMATCH` → confirmed failure; log it and continue to the next step.

---

## Negative scenarios

Each negative scenario runs in the same continuous session. The expected verdict
is `MATCH` when the expected rejection/error state is visually confirmed.

---

## Deliberate teardown (FR-WORKFLOW-004 AC-6)

At the end of the session:

```typescript
await driver.writeTeardown({
  policy: 'clean-up',
  state: [
    { item: 'lead row for uat-lead-new@...', action: 'deleted via seed reset' },
    { item: 'operator_invites consumed state', action: 'reset via pnpm uat:seed --reset BP-UAT-013' },
  ],
});
await driver.close();
```

A session without a teardown record fails the gate (`uat-teardown-check.sh`).

---

## Post-session gate checks

After `driver.close()`, the Orchestrator runs:

```bash
# AC-10a: no undeclared deep-links
bash scripts/uat-navigation-check.sh \
  apps/e2e/uat-results/<BP>/<run-id>/session-log.md \
  docs/02-business-processes/uat/<BP-UAT-NNN>.md

# AC-10b: screenshots + proof-of-look fields present per verdict
bash scripts/uat-visual-check.sh --session-mode <BP> <run-id> \
  apps/e2e/uat-results/<BP>/<run-id>/session-log.md

# AC-10c: teardown.md present and non-empty
bash scripts/uat-teardown-check.sh <BP> <run-id>
```

All three are `failed-retry` on failure.

---

## Output file

**Write to:** `.copilot/tasks/active/<workflow-id>/02-uat-report.md`

Required sections:

```markdown
## UAT Session Report — <BP-UAT-NNN>

**Run ID:** <workflow-id>
**Session log:** apps/e2e/uat-results/<BP>/<run-id>/session-log.md
**Run date:** <ISO date>
**Environment:** <landing-url>
**Overall verdict:** passed | partial | failed

### Pre-flight

| Check | Result |
|---|---|
| Docker stack healthy | PASS / FAIL |
| Web reachable | PASS / FAIL |
| API reachable | PASS / FAIL |
| Seed completed | PASS / FAIL / N/A |

### Step Results

| # | Label | Action | Verdict | Screenshot |
|---|---|---|---|---|

### Post-session Gate Results

| Gate | Script | Result |
|---|---|---|
| Navigation check (AC-10a) | uat-navigation-check.sh | PASS / FAIL |
| Visual evidence check (AC-10b) | uat-visual-check.sh --session-mode | PASS / FAIL |
| Teardown check (AC-10c) | uat-teardown-check.sh | PASS / FAIL |

### AC-9 Note

[Required: name the step where visual judgment caught something a DOM assertion
would have missed, OR explicitly write "No visual-vs-DOM divergence observed
this run." A session silent on this is incomplete — BusinessAnalyst must assert
one or the other in Step 4 triage.]
```

---

## What this agent does NOT do

- Does NOT author a Playwright `spec.ts` file.
- Does NOT run `playwright test` or compile a test suite.
- Does NOT claim it cannot work with images — Read tool renders PNGs natively.
- Does NOT use `page.goto()` mid-session — use `driver.click()` or `driver.externalHop()`.
- Does NOT classify failures or open issues.
- Does NOT end the session without a teardown record.

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
- Screenshots must be **viewport screenshots** (never `fullPage: true`) so
  they stay within the image-size limits of VisualReviewer's Read tool
- After each step's screenshot, run the design-system assertion fixture
  (`expect.soft` semantics): `await assertDesignSystem(page)` from
  `apps/e2e/support/assert-design-system.ts` — deterministic token/style
  checks; see `docs/04-development/testing/visual-testing.md` (Layer 1).
  If the fixture does not exist yet, note that in the report; do NOT skip
  the screenshot.

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
