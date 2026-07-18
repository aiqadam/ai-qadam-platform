# Workflow: UAT Verification

**Version:** 1.0
**Orchestrator reference for `workflow_type`:** `uat-verification`

---

## Overview

Verifies that a documented business process works end-to-end in a live local
environment with visual evidence (screenshots). Fully autonomous — no human
gates mid-workflow. Produces a pass/fail verdict per business process and
registers issues for any failures.

This workflow runs against `local` (default) or `qa` (FR-WORKFLOW-005,
explicit opt-in, read-only — see "Scope Constraints"). It NEVER targets
production — UAT writes state (registrations, approvals, etc.) that would
corrupt real data.

**Retry limits, gate status values, counter semantics:** see
`.copilot/schemas/protocol.md`.

---

## Step → Agent → Output File Map

| Step | Agent | Output file | Notes |
|---|---|---|---|
| 0 | Orchestrator | — | branch + handoff init |
| 0.5 | Orchestrator (direct) | — | context drift check; blocking |
| 1 | BusinessAnalyst | `01-uat-script-validation.md` | validate UAT script completeness |
| 2 | Orchestrator (direct) | — | pre-flight: stack health + seed |
| 3 | UATRunner | `02-uat-report.md` + run-scoped `session-log.md` + teardown | **agent-driven live browser session** (FR-WORKFLOW-004) |
| 4 | BusinessAnalyst | `03-uat-triage.md` | triage report + visual findings (now embedded in session log) |
| 5 | Orchestrator | — | update registry, commit, push, PR |

---

## Steps

### Step 0: Initialize (Orchestrator, direct)

```bash
git status --porcelain   # Must be empty — refuse if dirty
git fetch origin main
git checkout main
git pull --rebase origin main
# UAT runs may branch or run on main; for issue registration always use a branch:
git checkout -b uat/<BP-UAT-NNN>-<slug>
```

Read and increment `.copilot/meta/next-workflow-id`. Create task directory and
`handoff.yaml`. Set `workflow_type: uat-verification`.

**Target selection (FR-WORKFLOW-005):** `uat_target` is read from the workflow
invocation (or defaults to `local` when not specified) and validated against
the allowlist `local`, `qa` at this step. Any other value (including `prod`,
`aiqadam.org`, `www.aiqadam.org`, or the production host) is rejected
immediately with `failed-escalate` — see "Scope Constraints" below. Record
the validated value in `handoff.yaml`'s `uat_target` field
(`.copilot/schemas/handoff.schema.yaml`).

**Gate:** Branch exists and `uat_target` is a valid allowlisted value → proceed.

---

### Step 0.5: Context Sync (blocking)

```bash
scripts/check-workflow-state.sh --base "origin/main"
```

Same semantics as `requirement-development` workflow. See that workflow's
Step 0.5 for detail.

---

### Step 1: Validate UAT Script (BusinessAnalyst)

**Inputs:**
- `docs/02-business-processes/uat/<BP-UAT-NNN>.md`
- `docs/02-business-processes/uat/registry.md`

**Output file:** `01-uat-script-validation.md`

**Gate:**
- `passed` → Step 2
- `failed-retry` → correct gaps in the UAT script, retry (max 1)
- `failed-escalate` → referenced business process file missing → NEEDS_REVIEW

---

### Step 2: Pre-Flight (Orchestrator, direct)

Pre-flight MUST verify both **port reachability** (curl) AND **process
identity** (the helper script) — see [ISS-UAT-013-2](../issues/ISS-UAT-013-2.md).
A bare `curl` is insufficient: a foreign service squatting on `:3000` (e.g.
a sibling project's dev server) would make the proxy land on the wrong
backend without any visible error. Use `scripts/uat-preflight-check.sh` to
confirm the PID listening on the port has a CommandLine matching the
expected service.

Orchestrator runs these checks directly — no subagent. Branch on `uat_target`
(read from `handoff.yaml`, set at Step 0):

#### `target: local` (default — unchanged from pre-FR-WORKFLOW-005 behavior)

```bash
# 1. Docker stack
docker compose -f infrastructure/docker-compose.yml ps \
  --format "{{.Name}}\t{{.Status}}" | grep -v "healthy\|Up"
# Any unhealthy service: start it and wait up to 60s for healthy status.
# If still unhealthy: register env issue, failed-escalate.

# 2. App reachability AND process identity (per ISS-UAT-013-2)
# Bare `curl` is insufficient: a foreign service squatting on :3000 would
# make the proxy land on the wrong backend (see BP-UAT-013 attempt 1).
# Use the process-identity helper to verify the PID listening on the port
# is actually the expected service.
bash scripts/uat-preflight-check.sh web  :4321 "@astrojs/node"
bash scripts/uat-preflight-check.sh api  :3000 "@aiqadam/api"

# 3. Seed (if UAT script declares seed_required: true)
# If the BP-UAT being run has a manifest under scripts/uat-fixtures/
# (currently: BP-UAT-001, BP-UAT-013 — see FR-WORKFLOW-003), use --reset so
# the fixtures are restored to their declared initial state regardless of
# what a prior run left behind:
pnpm uat:seed --reset <BP-UAT-NNN>
# For any other BP-UAT (no manifest yet — all except BP-UAT-001/013 as of
# FR-WORKFLOW-003), keep using the plain create-if-missing invocation until
# a manifest is authored for it in a future FR:
pnpm uat:seed
# Non-zero exit (either form): failed-escalate (env issue) — matches this
# step's existing pre-flight gate semantics below. A non-zero exit from
# --reset specifically means either the manifest was missing/invalid or the
# localhost guard tripped; both are env issues, not product bugs.
```

#### `target: qa` (FR-WORKFLOW-005 — read-only)

```bash
# Docker/localhost checks above do NOT apply — there is no local process to
# check or identify. Run the QA reachability pre-flight script instead:
bash scripts/uat-qa-preflight-check.sh
# Checks HTTPS reachability (2xx/3xx required) of:
#   https://qa.aiqadam.org        (app under test / session landing URL)
#   https://auth.qa.aiqadam.org   (Authentik IdP subdomain)
# Non-zero exit: failed-escalate (env issue). The script's own output names
# which host failed.

# AC-3c: seed/reset is NEVER invoked for target: qa. Do not run
# `pnpm uat:seed` (with or without --reset) — QA UAT sessions read and
# interact with whatever state already exists on the deployment. This is
# out of scope for FR-WORKFLOW-005 (candidate for a separate future FR).
# scripts/uat-qa-preflight-check.sh contains no invocation of the
# fixture-seeding pnpm script anywhere in its source (structural guard,
# not just documentation — see scripts/tests/uat-qa-preflight-check.bats).
```

**Gate:**
- All checks pass → Step 3
- Any check fails → register env issue in `.copilot/issues/`, `failed-escalate`.
  On a `target: local` process-identity mismatch, the message includes the
  foreign PID and CommandLine so the operator can stop the conflicting
  process. A non-zero exit from `pnpm uat:seed --reset <BP-UAT-NNN>` is
  `failed-escalate` under this same rule.
  On a `target: qa` reachability failure, `scripts/uat-qa-preflight-check.sh`
  names the unreachable host(s) in its `failed-escalate` message.

---

### Step 3: Drive UAT Session (UATRunner) — FR-WORKFLOW-004

> **Rewritten 2026-07-06 for FR-WORKFLOW-004.** UATRunner no longer authors a
> Playwright spec. It operates a live browser session—one human action at a
> time—with visual judgment as the deciding verdict per step. See
> `docs/04-development/architecture/uat-agent-architecture.md` for the model.

**Inputs:**
- `docs/02-business-processes/uat/<BP-UAT-NNN>.md` (with `external_hops`,
  per-step `expected_ui_state`, `teardown_policy`, `session_budget` front-matter)
- `01-uat-script-validation.md`

**Output file:** `02-uat-report.md`
**Run-scoped evidence dir:** `apps/e2e/uat-results/<BP-UAT-NNN>/<workflow-id>/`
  - `session-log.md` — ordered perceive/decide/act/judge transcript
  - `step-NNN-<label>.png` — one viewport screenshot per meaningful action
  - `teardown.md` — what was removed or retained (required; gate failure if absent)

**What UATRunner does:**
1. Creates a `UATSessionDriver` (one persistent browser context for the whole session).
2. Calls `driver.goto(landingUrl)` — the **only** permitted direct navigation.
3. Loops through every step and negative scenario in the BP-UAT script:
   - **Perceive:** `driver.screenshot()` + Read the PNG.
   - **Decide:** from visible content, choose the next human action.
   - **Act:** `driver.click()` / `driver.fill()` / `driver.check()` / `driver.externalHop()`.
   - **Judge:** `driver.screenshot()` + Read; compare vs `expected_ui_state`; call `driver.logStep()` with full proof-of-look fields and verdict.
4. Calls `driver.writeTeardown()` + `driver.close()`.
5. Writes `02-uat-report.md`.

**Post-session gate (Orchestrator runs immediately after UATRunner returns):**

```bash
# AC-10a: no undeclared deep-links in the action trace
bash scripts/uat-navigation-check.sh \
  apps/e2e/uat-results/<BP>/<workflow-id>/session-log.md \
  docs/02-business-processes/uat/<BP-UAT-NNN>.md

# AC-10b: screenshots present + all proof-of-look fields per verdict block
bash scripts/uat-visual-check.sh --session-mode <BP> <workflow-id> \
  apps/e2e/uat-results/<BP>/<workflow-id>/session-log.md

# AC-10c: teardown.md present and names at least one state item
bash scripts/uat-teardown-check.sh <BP> <workflow-id>
```

All three scripts exit 0 = proceed to Step 4.

**Gate:**
- `passed` (session completed + all 3 enforcement scripts exit 0) → Step 4
- `failed-retry` (enforcement script fails: undeclared deep-link, missing proof-of-look field, absent teardown) → fix and re-run session, max 2
- `failed-escalate` (pre-flight re-failed mid-session; stack went unhealthy) → register env issue, NEEDS_REVIEW

---

### Step 4: Triage Report (BusinessAnalyst)

**Inputs:**
- `02-uat-report.md`
- `apps/e2e/uat-results/<BP-UAT-NNN>/<workflow-id>/session-log.md` (visual
  findings embedded per-step; visual verdicts carry the same weight as
  DOM-assertion failures. A step can PASS its DOM assertion and still produce
  a UI-bug issue from a visual `MISMATCH`.)
- `docs/02-business-processes/uat/registry.md`
- `.copilot/issues/registry.md` (to get next ISS number)

**AC-9 requirement (FR-WORKFLOW-004):** The triage MUST include an explicit
statement of either:
(a) the specific step + session-log entry where visual judgment caught something
    a DOM assertion would have gotten wrong, OR
(b) "No visual-vs-DOM divergence observed this run."
A triage silent on AC-9 is incomplete.

**Output file:** `03-uat-triage.md`

For each failed step or scenario:
1. Classify failure (UI / data / flow / env)
2. Create `.copilot/issues/ISS-<n>.md`
3. Add to `.copilot/issues/registry.md`

Update `docs/02-business-processes/uat/registry.md`:
- `last_run`, `status`, `issues` columns for this BP-UAT

**Gate:**
- `passed` → Step 5 (even if issues were registered — triage completed is the gate)
- `failed-retry` → unclassifiable failure; BusinessAnalyst needs more context (max 1 retry)
- `failed-escalate` → systemic env failure that makes all results unreliable → NEEDS_REVIEW

---

### Step 5: Commit, Push, Create PR (Orchestrator, direct)

Stage and commit:
- All task artifacts (`01-uat-script-validation.md`, `02-uat-report.md`, `03-uat-triage.md`, `handoff.yaml`)
- Updated `docs/02-business-processes/uat/registry.md`
- Updated `.copilot/issues/registry.md` + any new `ISS-<n>.md` files
- Run-scoped evidence directory `apps/e2e/uat-results/<BP-UAT-NNN>/<workflow-id>/`
  (includes `session-log.md`, step screenshots, `teardown.md`)
- Updated `apps/e2e/tests/uat/<BP-UAT-NNN>.spec.ts`

Delegate to `scripts/workflow-finish.sh` per the **Workflow-Finish Protocol**
in `.copilot/schemas/protocol.md`.

**Pre-push gate checks:**
```bash
test -f 03-uat-triage.md && grep -q "status: passed" 03-uat-triage.md
# Post-session enforcement scripts must have been run (Orchestrator records results in 02-uat-report.md):
grep -q 'Navigation check.*PASS' 02-uat-report.md
grep -q 'Visual evidence check.*PASS' 02-uat-report.md
grep -q 'Teardown check.*PASS' 02-uat-report.md
```
(Security review and test results gates do not apply to UAT verification —
this workflow has no code changes.)

**MANDATORY:** Output the PR URL to the user as a markdown link after
`workflow-finish.sh` completes.

**Gate:** Push succeeds, PR created, local branch is `main` → workflow complete.

---

## Failure Recovery

If workflow was interrupted:
1. Read `handoff.yaml` for `current_step`
2. Resume from `current_step`
3. Re-run pre-flight before resuming Step 3 — stack state may have changed

---

## Scope Constraints

- **Target allowlist (FR-WORKFLOW-005).** Three distinct states — do not use
  "localhost" as a synonym for "non-production"; QA is non-production but is
  not localhost:
  - `local` (default) — `http://localhost:4321`, Docker/localhost pre-flight,
    seed/reset permitted per FR-WORKFLOW-003.
  - `qa` (explicit opt-in via `uat_target: qa`) — `https://qa.aiqadam.org`,
    HTTPS reachability pre-flight (`scripts/uat-qa-preflight-check.sh`),
    seed/reset **never** invoked (read-only).
  - **Everything else is hard-blocked.** Any `uat_target` value other than
    `local` or `qa` — including any variant resolving to `aiqadam.org`,
    `www.aiqadam.org`, the production host, or `prod` — is rejected at
    Step 0 with `failed-escalate` before any browser session starts.
- **Screenshots are evidence, not decorations.** Every step must have one,
  and every screenshot must be *opened and reviewed* by VisualReviewer
  (Step 3.5). A workflow that captures screenshots nobody looks at has not
  performed visual verification. Enforced by `scripts/uat-visual-check.sh`.
- **Negative tests are mandatory.** A UAT script with no negative scenarios
  fails Step 1 validation.
- **Issues registered here feed the standard `issue-resolution` workflow.**
  The `ISS-<n>.md` format is shared — no UAT-specific issue format.
