# Workflow: Business Process Development

**Version:** 1.0
**Orchestrator reference for `workflow_type`:** `business-process-development`

---

## Overview

Takes a raw concept or idea (e.g. a GitHub issue like "there is no admin
panel") — something upstream of a formalized requirement — and produces:
business process document(s) under `docs/02-business-processes/`, an
independent audit of those documents, one or more formalized requirements
(`FR-<MODULE>-N`), and a not-yet-runnable BP-UAT script per new process.

**This workflow ends at requirements + UAT script.** It does not write code.
Each generated FR is picked up by a separate `requirement-development`
workflow run (triggered immediately after, or later, at the Orchestrator's
or user's discretion) — see "Handoff to requirement-development" below.

Fully autonomous — no human gate mid-workflow, consistent with this
project's general "decide and proceed" default (`AGENTS.md` §16).

**Retry limits, gate status values, and counter semantics:** see
`.copilot/schemas/protocol.md` and `handoff.yaml.retry_limits`. Do not
restate here — read from those sources.

**Autonomous Issue Resolution (no human in the loop):** every
`failed-escalate` gate follows the same nested `issue-resolution` subworkflow
pattern as `requirement-development.md` — see that file's "Autonomous Issue
Resolution" section, which applies here unchanged.

---

## Why this is a separate workflow, not a `requirement-development` prefix

`requirement-development.md` starts from already-scoped requirement text —
RequirementAnalyst's job is to formalize and check feasibility, not to
invent the underlying business process. A raw concept is one or more steps
upstream of that, and a concept can plausibly fan out into multiple
processes and multiple FRs (e.g. "admin panel" → tenant-provisioning process
+ user-management process, two FRs minimum). This workflow owns that
fan-out; `requirement-development` stays focused on shipping one FR at a
time.

---

## Step → Agent → Output File Map

| Step | Agent | Output file | Notes |
|---|---|---|---|
| 0 | Orchestrator | — | branch + handoff init |
| 0.5 | Orchestrator (direct) | — | context drift check; blocking |
| 1 | BusinessAnalyst | `01-business-process-draft.md` | drafts process doc(s) from concept |
| 2 | BusinessProcessAuditor | `02-business-process-audit.md` | independent review |
| 3 | RequirementAnalyst | `03-requirements.md` | one or more FRs, one invocation per process |
| 4 | BusinessAnalyst | `04-uat-script-draft.md` | BP-UAT script(s) for the new process(es) |
| 5 | Orchestrator | — | commit/push/PR via `scripts/workflow-finish.sh` |
| 5.5 | Orchestrator (direct) | — | merge + verify + archive |
| 6 | Orchestrator (direct) | — | queue `requirement-development` for each generated FR |

---

## Steps

### Step 0: Initialize (Orchestrator, direct)

```bash
git status --porcelain   # Must be empty — refuse if dirty
git fetch origin main
git checkout main
git pull --rebase origin main
git checkout -b docs/BP-<MODULE>-<N>-<slug>
# slug: 3–5 word kebab-case summary of the concept
```

Read and increment `.copilot/meta/next-workflow-id`. Create the task
directory and `handoff.yaml`. Set `handoff.yaml.requirement_text` to the raw
concept (e.g. the GitHub issue body). If the concept originated as a GitHub
Issue, set `handoff.yaml.github_issue_url` the same way
`issue-resolution.md` Step 1 does.

**Gate:** Branch exists in local repo → proceed.

---

### Step 0.5: Context Sync (blocking)

Identical procedure to `requirement-development.md` Step 0.5 — same script,
same inputs, same gate. Not restated here.

---

### Step 1: Draft Business Process(es)

**Agent:** BusinessAnalyst (Step 0 of its own agent definition —
`.copilot/agents/business-process-auditor.md`'s sibling entry point in
`.copilot/agents/business-analyst.md`)

**Inputs:**
- `handoff.yaml.requirement_text` — the raw concept
- `docs/02-business-processes/README.md`
- `docs/02-business-processes/business-process-gaps.md`

**Output file:** `01-business-process-draft.md` (cover note) + the actual new
`docs/02-business-processes/**` file(s) it produces.

**Gate:**
- `passed` → Step 2
- `failed-escalate` (re-litigates a deliberately deferred gap) → register
  issue, NEEDS_REVIEW, stop. This is a genuine human/PM call — do not
  attempt the nested-subworkflow autonomous recovery for this specific
  gate reason (a `business-process-gaps.md` entry exists precisely because
  a human already decided to pause it; only a human reopens it).

---

### Step 2: Audit Business Process(es)

**Agent:** BusinessProcessAuditor
**Inputs:**
- `01-business-process-draft.md`
- The new `docs/02-business-processes/**` file(s) it references
- `docs/02-business-processes/README.md`, `business-process-gaps.md`
- `docs/04-development/architecture/architecture.md`
- `docs/02-business-processes/uat/registry.md`

**Output file:** `02-business-process-audit.md`

**Gate:**
- `passed` → Step 3
- `failed-retry` (BLOCKER fixable by revising the draft) → return to Step 1,
  increment BusinessAnalyst retry counter (max 2 retries)
- `failed-escalate` (needs a human/architectural decision) → register issue,
  NEEDS_REVIEW, stop

---

### Step 3: Formalize Requirement(s)

**Agent:** RequirementAnalyst
**Inputs:**
- `01-business-process-draft.md`
- `02-business-process-audit.md` (MAJOR findings become constraints/notes
  carried into the FR's Acceptance Criteria — e.g. an operational-cost
  MAJOR finding might become an explicit AC bounding scope)
- `docs/03-requirements/` — for conflicts and next FEAT number
- `docs/04-development/architecture/architecture.md`

One invocation per distinct process identified in Step 1 — if the concept
fanned out into N processes, RequirementAnalyst runs N times (or once
producing N `FEAT-<MODULE>-n` sections; either is acceptable as long as each
process gets its own clearly-scoped FR, per its own agent definition's
existing "scoped to one module layer" completeness criterion).

Each resulting `FR-<CODE>.md` MUST set `business_process` frontmatter to the
new `BP-UAT-NNN` code that Step 4 is about to create — since the code isn't
assigned yet at this point, RequirementAnalyst reserves the next available
`BP-UAT-NNN` from `docs/02-business-processes/uat/registry.md` and records
it in both places; Step 4 then authors the file at that reserved code.

**Output file:** `03-requirements.md` — index of all FRs produced this run,
each with a link to its full `FR-<CODE>.md`.

**Gate:**
- `passed` → Step 4
- `failed-retry` (per-FR, max 1 retry each — same limit as
  `requirement-development.md` Step 1) → retry the specific FR
- `failed-escalate` (architectural conflict) → register issue, NEEDS_REVIEW, stop

---

### Step 4: Author BP-UAT Script(s)

**Agent:** BusinessAnalyst (Step 4 of its own agent definition)
**Inputs:**
- `01-business-process-draft.md`
- `03-requirements.md`
- `docs/02-business-processes/uat/BP-UAT-template.md`
- `docs/02-business-processes/uat/registry.md`

**Output file:** `04-uat-script-draft.md` + the new `BP-UAT-NNN.md` file(s),
`status: Draft`, at the code(s) reserved in Step 3.

**Gate:**
- `passed` → Step 5
- `failed-retry` (template contract violated) → retry Step 4 (max 2 retries)

---

### Step 5: Commit, Push, Create PR (Orchestrator, direct)

Delegate to `scripts/workflow-finish.sh` per the Workflow-Finish Protocol in
`.copilot/schemas/protocol.md`. This PR is docs-only (business process
docs + FR files + BP-UAT script) — no code, no `04-security-review.md` /
`07-test-results.md` pre-push gate checks apply (those files don't exist for
this workflow type; skip that check).

**MANDATORY:** Output the PR URL to the user as a markdown link.

**Default: autonomous merge**, same rule as `requirement-development.md`
Step 11 — proceed to Step 5.5 once CI is green, unless
`handoff.yaml.merge_mode: manual`.

---

### Step 5.5: Merge, Pull, Verify (Orchestrator, direct)

Same procedure as `requirement-development.md` Step 11.5 (merge, update
local main, move task dir to `completed/`, close-out PR if the ruleset
requires it). Verification substitutes the FR-status check with:

- Each new `FR-<CODE>.md` exists on `main` with `status: Proposed` (not yet
  `Implemented` — that flip happens later, in the FR's own
  `requirement-development` run).
- Each new `BP-UAT-NNN.md` exists on `main` with `status: Draft`.
- `docs/02-business-processes/uat/registry.md` and
  `docs/03-requirements/requirements-registry.md` both show the new rows.

**Gate:**
- `passed` → Step 6
- `failed-retry` → verification mismatch, re-pull, re-check (max 2 retries)
- `needs-review` → merge failed or verification failed

---

### Step 6: Queue Requirement-Development for Each FR (Orchestrator, direct)

For each `FR-<CODE>` produced in Step 3, the Orchestrator MUST surface it to
the user as a ready-to-start unit of work — this workflow does not
auto-spawn `requirement-development` runs (per the "end at requirements"
scope decision), but it also does not leave them undiscoverable.

1. List all generated FRs with a one-line summary each in the final
   response to the user.
2. Ask whether to start `requirement-development` now for any/all of them,
   or leave them queued in `docs/03-requirements/requirements-registry.md`
   (status `Proposed`) for a later session.
3. If the user says to start one or more now: begin
   `requirement-development.md` Step 0 for each, in the same session,
   sequentially (not parallel — each needs its own clean-tree branch cycle).

**Gate:** Workflow complete once the FR list has been surfaced to the user,
regardless of whether any `requirement-development` run was started —
starting one is a separate workflow instance with its own lifecycle.

---

## Failure Recovery

Same as `requirement-development.md` "Failure Recovery" — read
`handoff.yaml.current_step`, resume, do not re-run completed steps unless
their output files are missing.

---

## Autonomous Issue Resolution (Subworkflow Spawning)

Identical mechanics to `requirement-development.md`'s section of the same
name — nested `issue-resolution` subworkflow on `failed-escalate`, except
for the Step 1 gap-re-litigation case noted above, which is a direct
NEEDS_REVIEW (no subworkflow attempt) because the underlying block is a
human decision, not a fixable defect.
