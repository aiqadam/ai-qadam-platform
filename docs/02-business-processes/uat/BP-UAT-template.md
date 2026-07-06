---
code: BP-UAT-NNN
name: "<short process name>"
status: Draft          # Draft | Ready | Implemented | Deferred
process_ref: "docs/02-business-processes/operations/<runbook>.md"
environment: "http://localhost:4321"
seed_required: true    # true | false
last_run: ""           # ISO date, filled by BusinessAnalyst after each run
# FR-WORKFLOW-004 fields — required for every script migrated to the
# agent-driven session model (see docs/04-development/architecture/
# uat-agent-architecture.md). Omit only for scripts not yet migrated.
external_hops:
  # Every URL the session reaches by means OTHER than the single initial
  # landing-page goto() or a click on visible UI must be declared here with
  # a justification and the step/negative-scenario ids it covers. Typical
  # cases: a mail catcher on a different origin, a link that arrives by
  # email, a link a human hands the actor out-of-band (e.g. an admin-panel
  # copy-paste that the product never emails). An UNDECLARED mid-session
  # deep-link is a protocol violation (FR-WORKFLOW-004 AC-2) and fails the
  # session gate — see uat-navigation-check.sh.
  - url: "<url or url pattern>"
    justification: "<why the UI cannot reach this by clicking>"
    steps: ["<step-or-negative-id>", "..."]
session_budget:
  # Runaway-session guard-rails, not tuned numbers — override per script only
  # if the v1 defaults (FR-WORKFLOW-004 §12.4) are clearly too small.
  max_steps: 40
  max_screenshots: 60
  wall_clock_minutes: 20
teardown_policy:
  # Every session ends with an explicit clean-up or hand-off decision
  # (FR-WORKFLOW-004 AC-6). A script with no teardown_policy fails BusinessAnalyst
  # Step 1 validation.
  action: clean-up       # clean-up | hand-off
  removes:                # required when action: clean-up
    - item: "<what this session's run creates or consumes>"
      how: "<UI path if one exists, otherwise the seed/admin path used>"
  # hands_off_to: "<downstream BP-UAT-NNN>"   # required when action: hand-off
  # leaves:
  #   - item: "<named state left behind>"
  #     why: "<which downstream script consumes it>"
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

The `id` column is a stable fixture identifier matching the corresponding
entry in `scripts/uat-fixtures/<BP-UAT-NNN>.json` (when this BP-UAT has a
manifest file — see FR-WORKFLOW-003). Infra rows that have no
Directus/Authentik-backed fixture (e.g. "mail catcher is running") are
exempt from needing an `id` — leave that cell as `—`. BP-UAT files with
richer fixture tables (e.g. extra `Email`/`display_name` columns) still
gain this same `id` column, positioned first.

| `id` | Fixture | Description |
|---|---|---|
| `test-operator` | Operator account | Operator account (`uat-operator@aiqadam.test`, password from `.env.test`) |
| `test-member` | Member account | Member account (`uat-member@aiqadam.test`, password from `.env.test`) |
| `test-event-uz` | Published event | Published event in `uz` tenant, capacity 10, 0 registrations |

## Steps

Each step is one turn of the agent's perceive → decide → act → judge loop
(FR-WORKFLOW-004 / `docs/04-development/architecture/uat-agent-architecture.md`
§3) run in a single continuous browser session — **not** a Playwright `test`
block per step. `screenshot_label` becomes the filename:
`apps/e2e/uat-results/BP-UAT-NNN/<run-id>/step-NNN-<label>.png`.

**Navigation:** exactly one `Navigate to <URL>` action is permitted for the
whole session — the initial landing-page visit, normally Step 001. Every other
"reach a new URL" action must be either (a) a UI action (click a visible link
or button) or (b) a **declared external hop** listed in front-matter
`external_hops` with a named justification. An undeclared mid-session
deep-link fails the session gate (AC-2) — do not write a step whose Action is
"Navigate to `<deep link>`" unless that URL is in `external_hops`.

**Expected UI state:** write this as the literal judgment target the agent's
Judge step compares the rendered screen against — name the specific banner
text, heading, or element that must be visible, not a vague "success message
appears (or equivalent)". Looseness here becomes an unreliable visual verdict.

### Step 001 — <Label>

**AC ref:** AC-1

**Precondition:** User is not signed in.

**Action:** Navigate to `<landing-page-path>` — the session's one permitted direct navigation. (For any later step reaching a new URL: describe the UI action — "click the `<Label>` link/button" — or mark it a declared external hop per front-matter.)

**Expected UI state:** `<the exact heading/banner/element text that must be visible — this is the Judge's comparison target, not a loose description>`

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

Each negative scenario is judged in the same continuous session as the steps
above — not a separate Playwright `test` block. Screenshots go to
`apps/e2e/uat-results/BP-UAT-NNN/<run-id>/neg-NNN-<label>.png`.

### Negative 001 — <Label>

**AC ref:** AC-2

**Precondition:** `<state that sets up the invalid condition>`

**Action:** `<what the actor attempts to do>`

**Expected rejection:** `<error message, redirect, or blocked UI that proves the system rejected the action>`

**Screenshot label:** `neg-001-<kebab-label>`

---

<!-- Add more negative scenarios following the same pattern -->

### Negative-scenario assertion rule (mandatory)

**The visual verdict is still the deciding judgment (FR-WORKFLOW-004 §3.4) —
but negative scenarios additionally require an API-level corroboration.**
When the user-facing component falls back to a generic error panel on
**any** non-OK response (as `OnboardingForm` does with `<GonePanel>`), a
visual MATCH alone is not sufficient evidence: a misconfigured proxy
returning 404 renders identically to the real rejection (ISS-UAT-013-6).
State explicitly, in the scenario's **Expected rejection** field, which API
call and status code corroborates the visual verdict — record both in the
step's logged verdict (`corroborating_evidence` field, per
`uat-agent-architecture.md` §3.4).

```typescript
// API-level corroboration — the rendered screen alone cannot distinguish a
// real rejection from a coincidental 404. Record the result in the verdict's
// corroborating_evidence field; do NOT let it silently substitute for the
// visual comparison, and do NOT omit it for this class of negative scenario.
const apiRes = await driver.page.request.get('<expected-call>');
// apiRes.status() must equal <expected> — a mismatch here with a
// visually-MATCHing screen is itself a finding worth logging.
```

The screenshot and visual verdict remain the decision; the API check is
what makes that decision trustworthy for this specific defect class.

Additionally, **vacuous UI assertions are forbidden.** A test that only
checks "no success panel" passes whether the action was rejected or
the system was down. Always assert what *should* be visible (an error
message, a redirect, a 4xx response body) — never rely on the absence
of a success state as the sole evidence of rejection.

---

## Notes

Any caveats, timing sensitivities, known flakiness, or things BusinessAnalyst
should watch for when triaging the report.
