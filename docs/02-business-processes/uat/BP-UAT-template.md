---
code: BP-UAT-NNN
name: "<short process name>"
status: Draft          # Draft | Ready | Implemented | Deferred
process_ref: "docs/02-business-processes/operations/<runbook>.md"
environment: "http://localhost:4321"
seed_required: true    # true | false
last_run: ""           # ISO date, filled by BusinessAnalyst after each run
---

# BP-UAT-NNN — <Process Name>

## Purpose

One paragraph: what business process this script tests and why it matters.
Link to the source runbook or FR that defined the process.

## Acceptance Criteria

List the ACs being verified. Every AC must map to at least one step or
negative scenario below.

- [ ] AC-1: <criterion>
- [ ] AC-2: <criterion>

## Seed Fixtures Required

Only relevant when `seed_required: true`. List exactly what state the
`pnpm uat:seed` script must create before this test runs.

| Fixture | Description |
|---|---|
| `test-operator` | Operator account (`uat-operator@aiqadam.test`, password from `.env.test`) |
| `test-member` | Member account (`uat-member@aiqadam.test`, password from `.env.test`) |
| `test-event-uz` | Published event in `uz` tenant, capacity 10, 0 registrations |

## Steps

Each step maps to one Playwright `test` block. `screenshot_label` becomes the
filename: `apps/e2e/uat-results/BP-UAT-NNN/step-NNN-<label>.png`.

### Step 001 — <Label>

**AC ref:** AC-1

**Precondition:** User is not signed in.

**Action:** Navigate to `<path>`.

**Expected UI state:** `<what should be visible/readable on screen>`

**Screenshot label:** `step-001-<kebab-label>`

---

### Step 002 — <Label>

**AC ref:** AC-1

**Precondition:** Step 001 completed.

**Action:** Fill `<field>` with `<value>` and click `<button>`.

**Expected UI state:** `<what should appear>`

**Screenshot label:** `step-002-<kebab-label>`

---

<!-- Add more steps following the same pattern -->

## Negative Scenarios

Each negative scenario gets its own Playwright `test` block. Screenshots go to
`apps/e2e/uat-results/BP-UAT-NNN/neg-NNN-<label>.png`.

### Negative 001 — <Label>

**AC ref:** AC-2

**Precondition:** `<state that sets up the invalid condition>`

**Action:** `<what the actor attempts to do>`

**Expected rejection:** `<error message, redirect, or blocked UI that proves the system rejected the action>`

**Screenshot label:** `neg-001-<kebab-label>`

---

<!-- Add more negative scenarios following the same pattern -->

### Negative-scenario assertion rule (mandatory)

**Negative scenarios must assert the API contract, not just the UI.**
When the user-facing component falls back to a generic error panel on
**any** non-OK response (as `OnboardingForm` does with `<GonePanel>`),
a UI-only assertion can be visually satisfied by a misconfigured proxy
returning 404. Without an API-level assertion, the test silently passes
against the wrong service.

Always include, alongside any UI assertion for a negative scenario:

```typescript
// API-level disambiguation — the UI alone cannot distinguish a real
// rejection from a coincidental 404. Do NOT remove.
const apiRes = await page.request.get('<expected-call>');
expect(apiRes.status(), '<why this status is the contract>').toBe(<expected>);
```

UI assertions are still useful for human-readable failure messages and
screenshot evidence — but the API assertion is the source of truth.

Additionally, **vacuous UI assertions are forbidden.** A test that only
checks "no success panel" passes whether the action was rejected or
the system was down. Always assert what *should* be visible (an error
message, a redirect, a 4xx response body) — never rely on the absence
of a success state as the sole evidence of rejection.

---

## Notes

Any caveats, timing sensitivities, known flakiness, or things BusinessAnalyst
should watch for when triaging the report.
