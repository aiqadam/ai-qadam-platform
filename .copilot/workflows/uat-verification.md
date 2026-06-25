# Workflow: UAT Verification

**Version:** 1.0
**Orchestrator reference for `workflow_type`:** `uat-verification`

---

## Overview

Verifies that a documented business process works end-to-end in a live local
environment with visual evidence (screenshots). Fully autonomous — no human
gates mid-workflow. Produces a pass/fail verdict per business process and
registers issues for any failures.

This workflow runs against a local stack (`localhost`). It NEVER targets
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
| 3 | UATRunner | `02-uat-report.md` | execute UAT script, capture screenshots |
| 4 | BusinessAnalyst | `03-uat-triage.md` | triage report, register issues |
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

**Gate:** Branch exists → proceed.

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

Orchestrator runs these checks directly — no subagent:

```bash
# 1. Docker stack
docker compose -f infrastructure/docker-compose.yml ps \
  --format "{{.Name}}\t{{.Status}}" | grep -v "healthy\|Up"
# Any unhealthy service: start it and wait up to 60s for healthy status.
# If still unhealthy: register env issue, failed-escalate.

# 2. App reachability
curl -sf http://localhost:4321 > /dev/null   # web
curl -sf http://localhost:3000/health > /dev/null  # api

# 3. Seed (if UAT script declares seed_required: true)
pnpm uat:seed
# Non-zero exit: failed-escalate (env issue).
```

**Gate:**
- All checks pass → Step 3
- Any check fails → register env issue in `.copilot/issues/`, `failed-escalate`

---

### Step 3: Execute UAT Script (UATRunner)

**Inputs:**
- `docs/02-business-processes/uat/<BP-UAT-NNN>.md`
- `01-uat-script-validation.md`

**Output file:** `02-uat-report.md`
**Screenshot dir:** `apps/e2e/uat-results/<BP-UAT-NNN>/`

**Gate:**
- `passed` (run completed, results recorded) → Step 4
- `failed-retry` (spec syntax error) → fix spec, retry (max 2)
- `failed-escalate` (pre-flight re-failed mid-run) → register issue, NEEDS_REVIEW

---

### Step 4: Triage Report (BusinessAnalyst)

**Inputs:**
- `02-uat-report.md`
- `docs/02-business-processes/uat/registry.md`
- `.copilot/issues/registry.md` (to get next ISS number)

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
- Screenshot directory `apps/e2e/uat-results/<BP-UAT-NNN>/`
- Updated `apps/e2e/tests/uat/<BP-UAT-NNN>.spec.ts`

Delegate to `scripts/workflow-finish.sh` per the **Workflow-Finish Protocol**
in `.copilot/schemas/protocol.md`.

**Pre-push gate checks:**
```bash
test -f 03-uat-triage.md && grep -q "status: passed" 03-uat-triage.md
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

- **Never target production.** `environment` in the UAT script must be `localhost`.
- **Screenshots are evidence, not decorations.** Every step must have one.
- **Negative tests are mandatory.** A UAT script with no negative scenarios
  fails Step 1 validation.
- **Issues registered here feed the standard `issue-resolution` workflow.**
  The `ISS-<n>.md` format is shared — no UAT-specific issue format.
