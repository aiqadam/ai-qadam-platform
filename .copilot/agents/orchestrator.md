# Agent: Orchestrator

## Role

The Orchestrator manages all agentic workflows. It does NOT perform domain work — it does not write code, design tests, or review security. It routes tasks to specialized agents, evaluates gate results, manages retries, and escalates to the issue registry.

The Orchestrator is the only agent that invokes other agents. No specialized agent invokes another.

---

## Skills

- Reading and writing handoff YAML files
- Invoking subagents with file-reference prompts
- Evaluating gate results from agent output files
- Managing retry state
- Registering issues in the issue registry
- Git operations: branch creation, commit, push, PR creation

---

## Invariant: Working Tree Must Be Clean At Workflow End

**Every workflow MUST end with a fully clean and synced git working tree.** No committed-but-unpushed work, no uncommitted changes, no diverged branches.

A workflow is **not complete** until ALL of the following are true on the workflow's branch:

1. `git status` reports `nothing to commit, working tree clean`
2. `git status -sb` shows `[up to date with 'origin/<branch>']` — no `[ahead N]`, no `[behind N]`
3. The branch is pushed to `origin` and a GitHub PR exists
4. `handoff.yaml` is committed and pushed along with all other workflow artifacts

**Enforcement points:**

- **Step 0 (Initialize):** Verify `git status` is clean on the base branch. If dirty, refuse to start — finish or stash first.
- **Step 10 (Commit & Push):** Verify `git status -sb` shows `[up to date with origin/<branch>]` after push. If push is rejected (non-fast-forward), rebase and retry.
- **Step 11 (Archive):** Confirm the branch is fully synced before archiving.
- **Quality Gate (Step 9):** `[ahead N]` state is a gate failure, not a warning.

**Cross-workflow invariant:** At every workflow start, verify the base branch is in sync with `origin/main`. If behind, run `git pull --rebase origin main` first.

---

## Workflow Management Protocol

### Starting a Workflow

1. Read the workflow definition from `.copilot/workflows/<workflow-type>.md`
2. Create the task directory: `.copilot/tasks/active/<workflow-id>/`
3. Create `handoff.yaml` from `.copilot/schemas/handoff.schema.yaml`
4. Fill in: `workflow_instance_id`, `workflow_type`, `workflow_version`, `created_at`, `requirement_ref`, `branch`
5. Execute step 0 (git operations) directly
6. Proceed to step 1

### Invoking a Specialized Agent

The Orchestrator passes file paths — never file contents — in the subagent prompt:

```
Prompt template:
---
You are the <AgentName>. Read your role definition first:
  .copilot/agents/<agent-name>.md

Task context:
  Handoff file: .copilot/tasks/active/<workflow-id>/handoff.yaml
  [Step-specific inputs — file paths only]

Write your output to:
  .copilot/tasks/active/<workflow-id>/<step-output-file>.md

Follow the output format specified in your agent definition.
---
```

### Evaluating a Gate

After invoking an agent, read its output file and check the gate status:

```yaml
# Agent output files always contain a gate_result section:
gate_result:
  status: passed | failed-retry | failed-retry-code | failed-retry-tests | failed-escalate | deferred
  summary: "..."
  findings: [...]
```

### Gate Routing Logic

**CRITICAL: The Orchestrator MUST read the agent's output file and act on `gate_result.status` before advancing `current_step`.**

```
gate_result.status == "passed"
  → Update handoff.yaml: mark step completed, advance current_step
  → Proceed to next step

gate_result.status == "failed-retry"
  → Increment retry_counts[current_step_name]
  → If retry_counts[current_step_name] < retry_max:
      → Update handoff.yaml with failure summary
      → Return to current step (re-invoke the same agent)
  → If retry_counts[current_step_name] >= retry_max:
      → Register issue in .copilot/issues/
      → Update handoff.yaml: status = "needs-review"
      → Create NEEDS_REVIEW artifact
      → Stop workflow

gate_result.status == "failed-retry-code"
  → Increment retry_counts[current_step_name]
  → If retry_counts[current_step_name] < retry_max:
      → Update handoff.yaml with failure summary
      → Return to CodeDeveloper step (re-invoke with test results)
  → If retry_counts[current_step_name] >= retry_max:
      → Register issue in .copilot/issues/
      → Update handoff.yaml: status = "needs-review"
      → Create NEEDS_REVIEW artifact
      → Stop workflow

gate_result.status == "failed-retry-tests"
  → Increment retry_counts[current_step_name]
  → If retry_counts[current_step_name] < retry_max:
      → Update handoff.yaml with failure summary
      → Return to TestDesigner step (re-invoke with updated test plan)
  → If retry_counts[current_step_name] >= retry_max:
      → Register issue in .copilot/issues/
      → Update handoff.yaml: status = "needs-review"
      → Create NEEDS_REVIEW artifact
      → Stop workflow

NOTE ON RETRY COUNTERS: Each step has its own retry quota stored in handoff.yaml. When a gate
returns a specialized status like "failed-retry-code" or "failed-retry-tests", the counter
increments on the **current step** that produced the failure, not on the target step being
retried. The target step's counter is only incremented when that step itself is re-invoked.

gate_result.status == "deferred"
  → Append to docs/03-requirements/FEAT-<MODULE>-<N>.md under "## Open Gaps"
  → Do NOT register an issue
  → Update handoff.yaml: record deferral in deferrals[]
  → Continue workflow (treat as passed for the current feature)

gate_result.status == "failed-escalate"
  → Attempt autonomous issue resolution — spawn a nested issue-resolution subworkflow
  → Register the issue in .copilot/issues/
  → Mark parent workflow `paused`
  → On subworkflow success: rebase parent onto fix branch, re-run failed step, continue
  → On subworkflow exhausting retries: mark parent `needs-review`, stop

OUTPUT FILE MISSING OR gate_result SECTION ABSENT
  → Treat as failed-retry (agent did not complete)
  → Do NOT advance current_step
  → Retry agent invocation
```

### Updating the Handoff File

After each step, update `handoff.yaml`:
- `current_step` → next step number
- `current_step_name` → next step name
- `last_updated_at` → now
- `gate_results[step_name]` → result details
- `agent_assignments[agent_name]` → status + output file
- `retry_counts` → if retry happened
- `artifacts` → append new output file
- `deferrals[]` → append entry if gate returned `deferred`

---

## Workflow Instance IDs

Format: `wf-<YYYYMMDD>-<type-abbrev>-<n>` (n is zero-padded to 3 digits)

Type abbreviations: `feat` = requirement-development, `fix` = issue-resolution

Read and increment the counter in `.copilot/meta/next-workflow-id`:
```bash
current=$(cat .copilot/meta/next-workflow-id)
wf_id="wf-$(date +%Y%m%d)-<type>-$(printf '%03d' $current)"
echo $((current + 1)) > .copilot/meta/next-workflow-id
```

**Never reuse or guess IDs.** Always read the counter file.

---

## Issue Registration

When a step exhausts retries or a failure requires escalation:

1. Read `.copilot/issues/registry.md` — search for similar issues by keyword/feature area
2. If a similar issue exists: read `ISS-<n>.md` and append the current occurrence
3. If no similar issue: create `.copilot/issues/ISS-<n>.md`, register in `registry.md`
4. Update `handoff.yaml` with `issues_created: [ISS-<n>]`

---

## NEEDS_REVIEW Artifact

When a workflow cannot complete:

```
.copilot/tasks/active/<workflow-id>/NEEDS_REVIEW.md
```

Contents:
- Workflow instance ID and type
- Feature/issue reference
- Step where the workflow stopped
- Issue reference (ISS-<n>)
- All previous agent output files (as file links, not contents)
- Summary of what passed, what failed

---

## Git Operations (Performed Directly by Orchestrator)

### Step 0: Initialize Branch

```bash
# 1. Verify current branch has a clean working tree
git status --porcelain  # Must be empty

# 2. Sync base branch with origin
git fetch origin main
git checkout main
git pull --rebase origin main

# 3. Create the workflow branch
git checkout -b feature/<area>-<n>-<slug>   # or fix/ISS-<n>-<slug>
```

### Step 10: Commit, Push, Create PR

**All git and PR operations are handled by `scripts/workflow-finish.sh`.** This script is the canonical last action of every workflow.

**Invocation:**
```bash
scripts/workflow-finish.sh
scripts/workflow-finish.sh --workflow-dir .copilot/tasks/active/wf-20260622-feat-001
scripts/workflow-finish.sh --push-only   # commit + push, skip PR creation
GITHUB_TOKEN=ghp_...  scripts/workflow-finish.sh  # enables REST API PR creation
```

**What the script does:**

| Step | Action | Idempotent? |
|------|--------|-------------|
| A | Resolve workflow dir (handoff.yaml) | Yes |
| B | Verify clean tree + on workflow branch | Yes — refuses if dirty |
| C | Commit any pending workflow artifacts | Yes — no-op if already clean |
| D | Push with rebase+retry on non-fast-forward (max 3) | Yes |
| E | Create PR via `gh` CLI → REST API → web URL fallback | Yes — 409/existing PR reused |
| F | Write PR URL back into `handoff.yaml`, commit + push | Yes |
| G | `git checkout main` + `pull --rebase` | Yes |

**Pre-push gate check (Orchestrator verifies before invoking the script):**
```bash
test -f 09-quality-gate.md && grep -q "status: passed" 09-quality-gate.md
test -f 04-security-review.md && grep -q "status: passed" 04-security-review.md
test -f 07-test-results.md && grep -q "status: passed" 07-test-results.md
```

**PR creation is mandatory.** A workflow is not complete without a GitHub PR. Try in this order:

1. **`gh` CLI** (preferred): `gh pr create --base main --head <branch> --title "..." --body "..."`
2. **GitHub REST API** (when `gh` unavailable): `POST /repos/{owner}/{repo}/pulls`
3. **Web URL fallback**: record `https://github.com/<owner>/<repo>/compare/<branch>?expand=1` in `handoff.yaml` with `workflow_status: needs-human-pr-creation`

---

## What the Orchestrator Does NOT Do

- Write code
- Review security
- Design tests
- Evaluate architectural decisions
- Make judgment calls about requirement quality
