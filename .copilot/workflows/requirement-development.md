# Workflow: Requirement Development

**Version:** 1.0
**Orchestrator reference for `workflow_type`:** `requirement-development`

---

## Overview

Takes a raw requirement from input to a committed, tested, documented feature on a Git branch with a GitHub PR open. Fully autonomous — no human gates mid-workflow.

**Retry limits (default):**
- RequirementAnalyst retry: 1
- DBMigrationAuthor retry: 2
- CodeDeveloper retry: 3
- TestStrategist retry: 2
- TestDesigner retry: 3
- TestRunner → CodeDeveloper: counts against CodeDeveloper's 3
- TestRunner → TestDesigner: counts against TestDesigner's 3
- DocWriter retry: 2
- QualityGate: routes to the indicated step; each step's own counter applies
- Issue-resolution subworkflow: at most 3 per parent workflow

**Autonomous Issue Resolution (no human in the loop):**
- Every `failed-escalate` gate MUST first attempt a nested `issue-resolution` subworkflow
- UAT (user review) is the only human touchpoint — NEEDS_REVIEW is the terminal state when autonomous recovery is exhausted

---

## Steps

### Step 0: Initialize (Orchestrator, direct)

```bash
git status --porcelain   # Must be empty — refuse if dirty
git fetch origin main
git checkout main
git pull --rebase origin main
git checkout -b feature/FEAT-<MODULE>-<N>-<slug>
# slug: 3–5 word kebab-case summary of the requirement
```

Read and increment `.copilot/meta/next-workflow-id`. Create the task directory and `handoff.yaml`.

**Gate:** Branch exists in local repo → proceed.

---

### Step 1: Validate Requirement

**Agent:** RequirementAnalyst
**Inputs:**
- Raw requirement text (from `handoff.yaml.requirement_text`)
- `docs/03-requirements/` — for conflicts and next FEAT number
- `docs/04-development/architecture/architecture.md`

**Output file:** `01-requirement-validation.md`

**Gate:**
- `passed` → Step 2
- `failed-retry` (analyst produced a clarified version) → retry Step 1 (max 1 retry)
- `failed-escalate` (architectural conflict) → register issue, NEEDS_REVIEW, stop

---

### Step 2: Impact Analysis

**Agent:** ImpactAnalyzer
**Inputs:**
- `01-requirement-validation.md`
- `docs/04-development/architecture/architecture.md`
- Codebase structure

**Output file:** `02-impact-analysis.md`

**Gate:**
- `passed` → Step 3 (if entity changes) or Step 4 (if no entity changes)
- `failed-escalate` → register issue, NEEDS_REVIEW, stop

---

### Step 3: Design DB Migrations (conditional)

**Condition:** Impact report has `DB Changes Required: yes`
**Agent:** DBMigrationAuthor
**Inputs:**
- `02-impact-analysis.md` (entity changes section)
- `apps/api/src/modules/<affected>/schema.ts`
- `apps/api/drizzle/` (latest migration for sequence)
- `docs/04-development/standards.md` §VI

**Output files:** Updated schema.ts + generated migration SQL + `05-migration-plan.md`

**Gate:**
- `passed` → Step 4
- `failed-retry` → retry Step 3 (max 2 retries)
- `failed-escalate` → register issue, NEEDS_REVIEW, stop

---

### Step 4: Develop Code

**Agent:** CodeDeveloper
**Inputs:**
- `01-requirement-validation.md`
- `02-impact-analysis.md`
- `05-migration-plan.md` (if exists)
- `docs/04-development/standards.md`
- `docs/04-development/architecture/architecture.md`

**Output files:** Code changes + `03-code-summary.md`

**Gate:**
- `passed` → Step 5
- `deferred` → Orchestrator appends gap to `docs/03-requirements/` for the target feature, records in `handoff.yaml.deferrals[]`, continues to Step 5
- `failed-retry` → retry Step 4 (max 3, shared with security/test bouncebacks). Formatter failures (`pnpm biome check` non-clean) are automatic `failed-retry` — CodeDeveloper must fix and re-validate.
- On retry-limit exhaustion → register issue, NEEDS_REVIEW, stop

---

### Step 5: Security Review

**Agent:** SecurityReviewer
**Inputs:**
- `02-impact-analysis.md`
- `03-code-summary.md`
- Changed files (listed in code summary)
- `docs/04-development/security/security.md`

**Output file:** `04-security-review.md`

**Gate:**
- `passed` → Step 6
- `failed-retry` (MAJOR finding, fixable by CodeDeveloper) → return to Step 4, increment CodeDeveloper retry counter
- `failed-escalate` (BLOCKER architectural violation) → register issue, NEEDS_REVIEW, stop

---

### Step 6: Plan Tests

**Agent:** TestStrategist
**Inputs:**
- `01-requirement-validation.md`
- `02-impact-analysis.md`
- `03-code-summary.md`
- `04-security-review.md`

**Output file:** `06-test-strategy.md`

**Gate:**
- `passed` → Step 7
- `failed-retry` → retry Step 6 (max 2 retries)

---

### Step 7: Write Tests

**Agent:** TestDesigner
**Inputs:**
- `06-test-strategy.md` ← primary input
- `03-code-summary.md` ← for function signatures only

**Output files:** Test files + `06-test-design.md`

**Gate:**
- `passed` → Step 8
- `deferred` → record in `handoff.yaml.deferrals[]`, continue to Step 8
- `failed-retry` → retry Step 7 (max 3 retries)

---

### Step 8: Execute Tests

**Agent:** TestRunner
**Inputs:**
- `06-test-design.md`
- `03-code-summary.md`

**Execution order:**
1. `pnpm typecheck` — must pass before any test run
2. `pnpm biome check .` — formatter check (mandatory defensive guard). If non-clean: `failed-retry-code` → return to Step 4.
3. `pnpm test` — all unit tests
4. `INTEGRATION_TEST=1 pnpm test:integration` — integration tests with Testcontainers. **MANDATORY before commit.** If Docker unavailable: register issue, `failed-escalate`.

**Output file:** `07-test-results.md`

**Gate:**
- `passed` → Step 9
- `failed-retry-code` → return to Step 4, increment CodeDeveloper retry counter
- `failed-retry-tests` → return to Step 7, increment TestDesigner retry counter
  - If TestDesigner retry exhausted AND all findings are test-error → route to Step 4 (CodeDeveloper). Do NOT register an issue.
  - If TestDesigner retry exhausted AND any finding is code-bug → register issue, NEEDS_REVIEW, stop
- `failed-escalate` → register issue, spawn nested `issue-resolution` subworkflow

---

### Step 9: Update Documentation

**Agent:** DocWriter
**Inputs:**
- `01-requirement-validation.md`
- `03-code-summary.md`
- `07-test-results.md`
- Relevant current documentation files

**Output file:** `08-doc-update.md`

**Gate:**
- `passed` → Step 10
- `failed-retry` → retry Step 9 (max 2 retries)

---

### Step 10: Final Quality Gate

**Agent:** QualityGate
**Inputs:** All previous output files (01 through 08)

**Output file:** `09-quality-gate.md`

**Gate:**
- `passed` → Step 11
- `failed-retry` → return to `retry_target` step indicated in output

---

### Step 11: Commit, Push, Create PR (Orchestrator, direct)

**All git and PR operations are delegated to `scripts/workflow-finish.sh`.**

**Invocation:**
```bash
scripts/workflow-finish.sh
# With explicit workflow dir:
# scripts/workflow-finish.sh --workflow-dir .copilot/tasks/active/wf-20260622-feat-001
```

**Pre-script gate checks (Orchestrator verifies before invoking):**
```bash
test -f 09-quality-gate.md && grep -q "status: passed" 09-quality-gate.md
test -f 04-security-review.md && grep -q "status: passed" 04-security-review.md
test -f 07-test-results.md && grep -q "status: passed" 07-test-results.md
```

**Gate:** Push succeeds, PR is created, `handoff.yaml.github_pr_url` is non-empty, local branch is `main` → workflow complete.

---

### Step 12: Archive Task (Orchestrator, direct)

**Pre-archive invariant check:**
```bash
git status -sb
# MUST show main with clean tree.
# Task directories (.copilot/tasks/) are excluded by .gitignore — never in git.
```

**Actions:**
```bash
mv .copilot/tasks/active/<workflow-id> .copilot/tasks/completed/<workflow-id>
```

**Final invariant check:**
```bash
git status -sb  # MUST show: ## main...origin/main [up to date]
```

**Gate:** Directory moved, local `git status` is clean → workflow complete.

---

## Failure Recovery

If the workflow was interrupted (crash, context loss):
1. Read `handoff.yaml` to find `current_step` and retry state
2. Resume from `current_step`
3. Do not re-run completed steps unless their output files are missing

---

## Autonomous Issue Resolution (Subworkflow Spawning)

When a gate returns `failed-escalate`, the Orchestrator:

1. Registers the issue in `.copilot/issues/`
2. Marks the parent workflow `paused` (not `needs-review`)
3. Creates a fix branch from `origin/main` (NOT the feature branch)
4. Spawns a nested `issue-resolution` subworkflow
5. On subworkflow success: rebases the parent onto the fix branch, re-runs the failed step
6. On subworkflow exhaustion (3 attempts): marks parent `needs-review`, creates NEEDS_REVIEW artifact, stops

Parent handoff state during pause:
```yaml
workflow_status: paused
paused_at_step: 8
paused_at_gate: failed-escalate
blocking_issue: ISS-<n>
subworkflow_id: wf-<date>-fix-<n>
subworkflow_branch: fix/ISS-<n>-<slug>
subworkflow_retry_count: 0  # 0..3
```
