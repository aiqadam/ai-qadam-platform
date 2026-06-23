# Requirement Validation — FEAT-WORKFLOW-001

> Output for: `.copilot/tasks/active/wf-20260623-feat-004/01-requirement-validation.md`
> Agent: RequirementAnalyst
> Status: **passed** (one non-blocking clarification resolved by Orchestrator)

---

## Raw Input

From `handoff.yaml.requirement_text`:

> Prevent the Orchestrator from running workflows that drift from project-level
> state files (workspace-state.md, issues/registry.md, requirements-registry.md).
> Detect drift at workflow start (block) and at workflow end (QualityGate must
> require the PR to have modified the appropriate state file). Add a script
> `scripts/check-workflow-state.sh` that compares git history against the state
> files; add Step 0.5 "Context Sync" to both workflow files; extend QualityGate
> with a "context-update" sub-check.

## Orchestrator Resolution of Clarification

The analyst flagged a module-code question (`WORKFLOW` vs `INFRA`).
**Resolution:** use **`WORKFLOW`** as the module code and **extend the module
code list** in `.copilot/agents/requirement-analyst.md` to include it. This
keeps workflow-internal features in a self-describing module rather than
hiding them under `INFRA`, which is reserved for platform/runtime tooling.
This is a one-line addition to the agent role file and is treated as part
of the same FEAT-WORKFLOW-001 PR.

---

## Analysis

### Completeness Issues Found

The raw input is well-scoped. The analyst filled in details that the
CodeDeveloper would otherwise have to invent, and recorded them as
reasonable assumptions. None are blocking.

| # | Gap | Reasonable assumption |
|---|-----|------------------------|
| C1 | "Compares git history against state files" — exact algorithm | Use `git log -1 --format=%H -- <state-file>` to get the last-touched SHA. Drift = (a) state file has a frontmatter `last_synced_commit: <sha>` that diverges from current HEAD; OR (b) state file references a workflow/FR/ISS ID whose workflow dir does not exist on disk. |
| C2 | Marker file is optional | For workflows without a marker, amendment step is skipped silently; QualityGate end-check still fires. |
| C3 | QualityGate sub-check reads the PR diff | Compare `git diff origin/<base>...HEAD -- <state-file>` against an expected minimum (≥1 changed line referencing the current workflow/FR/ISS ID). |
| C4 | "Amend the PR branch" semantics | Use `git commit --amend --no-edit` if HEAD is the only unpushed commit; otherwise a follow-up commit `chore(context-sync): update state files for <FEAT-ID>`. Push uses the existing rebase+retry logic. |
| C5 | Idempotency | Script is read-only. Exit 0 if no drift, non-zero with diagnostic on stderr if drift. |
| C6 | "If QualityGate passed" gate ordering | Amendment is a Step 11 sub-step that runs only when QualityGate file shows `status: passed` and the marker file is present. |
| C7 | Module code (`WORKFLOW` not in list) | **Resolved by Orchestrator** — extend the module code list to include `WORKFLOW`. |

### Conflicts with Existing Features

- None found. `docs/03-requirements/` has no `FR-WORKFLOW-*` or related entries.
- `.copilot/issues/registry.md` only contains the resolved `ISS-PREEX-001`.
- The QualityGate sub-check is **additive**, not a replacement. The six existing
  checks (Completeness, Traceability, Coverage, Security, Documentation,
  Branch/Commit) remain.

### Architectural Feasibility

- **Stack fit:** Pure developer tooling. One bash script, two workflow markdown
  edits, one agent-definition edit, one script enhancement. Zero blast radius
  to application code (Astro/NestJS/Python/BullMQ).
- **AGENTS.md §1 (Ten Non-Negotiables):** Script must obey §1.3 (named
  constants for paths and frontmatter keys), §1.4 (bash functions ≤ 60 lines),
  §1.5 (assertions via `set -euo pipefail` and `test -f`), §1.7 (exit codes
  and stderr surfaced — never silently swallow drift).
- **AGENTS.md §3 (code quality):** No TypeScript. Bash must pass `shellcheck`
  (already in CI). Marker YAML must be parseable.
- **AGENTS.md §4 (small PR rule):** 5 files; ~250–350 LOC; within cap.
- **AGENTS.md §11 (design system):** Not applicable. No UI.
- **Workflow-finish protocol (`protocol.md`):** Amendment is consistent with
  existing Step D (rebase+retry on push).
- **PowerShell quirk (per `powershell-native-command-stderr.md`):** Script
  sends normal output to stdout, diagnostics to stderr. Header comment records
  this constraint.

### Risks

| Risk | Mitigation |
|---|---|
| Drift-detection false positives | Whitelist internal refactors; skip-by-marker; allow `--skip` flag for emergencies |
| Marker file not written by DocWriter | Update workflow definition files to make marker-file emission an explicit Step 9 sub-step |
| Amended commit changes SHA → SHA drift detection breaks | Compare against `origin/<base>`, not in-flight branch |
| Cross-platform shell differences (Windows Git Bash vs WSL vs Linux) | POSIX bash only; document requirement (consistent with existing `workflow-finish.sh`) |

## Formalized Requirement

**Feature:** **FEAT-WORKFLOW-001** — Context drift guard for the agentic workflow layer.

**Module:** `WORKFLOW` (added to module-code list in
`.copilot/agents/requirement-analyst.md`).

**Scope:** Workflow infrastructure only. No application code, no DB, no UI.

**Statement:**

> The AI Qadam multi-agent workflow system MUST detect drift between git
> history and three project-state files —
> `.copilot/context/workspace-state.md`, `.copilot/issues/registry.md`, and
> `docs/03-requirements/requirements-registry.md` — and refuse to proceed
> when drift is detected. Drift is detected at two checkpoints:
>
> 1. **Workflow start (Step 0.5 "Context Sync", blocking):** Before any
>    other workflow step runs, the Orchestrator MUST execute
>    `scripts/check-workflow-state.sh`. If the script exits non-zero, the
>    workflow MUST NOT advance; the Orchestrator MUST reconcile state and
>    re-run the check before Step 1.
> 2. **Workflow end (QualityGate "Context-Update Check", required):** The
>    QualityGate MUST verify that the PR commit set modified the appropriate
>    state file: `registry.md` for `issue-resolution` workflows,
>    `requirements-registry.md` for `requirement-development` workflows, and
>    `workspace-state.md` for both. If unmodified and the workflow is
>    expected to have written to that file, QualityGate MUST fail with a clear
>    `retry_target: 09-doc-update` (or equivalent) message.
>
> To support the end-check, `scripts/workflow-finish.sh` MUST, after PR
> creation, when (a) QualityGate has passed AND (b) a marker file
> `.copilot/tasks/active/<wf-id>/.context-update-marker.yaml` is present,
> automatically amend the PR branch with the registry row + workspace-state
> update described by the marker.

**Cross-references:**

- AGENTS.md §1 (Ten Non-Negotiables) — script obeys §1.3, §1.4, §1.5, §1.7.
- AGENTS.md §3 (code quality) — shellcheck-clean, parseable marker YAML.
- `.copilot/schemas/protocol.md` — Step 0.5 is a new sub-step between Step 0
  and Step 1; uses the same gate semantics (passed → advance; non-zero →
  blocked, requires Orchestrator reconciliation).
- `.copilot/agents/quality-gate.md` — new "Context-Update Check" sub-section
  between existing "Documentation Completeness" and "Branch and Commit
  Readiness".

**Implementation decomposition (for CodeDeveloper):**

| # | File | Change |
|---|------|--------|
| 1 | `scripts/check-workflow-state.sh` | **new** — POSIX bash, ~80–120 LOC. Compares state-file SHAs against `origin/<base>`; checks for orphaned IDs. Exit 0 / non-zero + diagnostic on stderr. |
| 2 | `.copilot/workflows/requirement-development.md` | Insert Step 0.5 "Context Sync" between Step 0 and Step 1. |
| 3 | `.copilot/workflows/issue-resolution.md` | Insert Step 0.5 "Context Sync" between Step 0 and Step 1. |
| 4 | `.copilot/agents/quality-gate.md` | Insert "Context-Update Check" sub-section; add `WORKFLOW` to module codes. |
| 5 | `.copilot/agents/requirement-analyst.md` | Add `WORKFLOW` to module-code list (one-line addition). |
| 6 | `scripts/workflow-finish.sh` | Add amendment sub-step after Step F (PR URL written). Read marker file; apply registry row + workspace-state update; commit (amend if unpushed, else follow-up); push. Keep all existing protocol guarantees. |

This is 6 files; within the §4 small-PR cap.

**Open gaps (non-blocking):**

- Drift-detection algorithm specifics (C1) — frontmatter-based SHA tracking
  with optional manual reconciliation command (`--reconcile`) deferred to
  a later FEAT.
- Marker file schema (C2) — CodeDeveloper chooses within bounds:
  ```yaml
  schema_version: "1.0"
  workflow_id: wf-...
  workflow_type: requirement-development | issue-resolution
  registry:
    file: docs/03-requirements/requirements-registry.md | .copilot/issues/registry.md
    row_markdown: |
      | <n> | <code> | <name> | Shipped | ... | <date> |
  workspace_state_section:
    add_to: Active Workflows | Open Issues
    row_markdown: |
      | <wf-id> | <type> | <feat-id> | <branch> | <pr-url> | <date> |
  ```

## Acceptance Criteria (draft)

TestDesigner will formalize these. Given/when/then:

- **AC-1:** Drift detection at workflow start, drift present — script exits
  non-zero with diagnostic on stderr naming the orphaned reference.
- **AC-2:** Drift detection at workflow start, no drift — script exits 0,
  workflow advances.
- **AC-3:** QualityGate end-check, `requirement-development` type with
  `requirements-registry.md` modified — passes.
- **AC-4:** QualityGate end-check, `requirement-development` type without
  `requirements-registry.md` modified — fails with `retry_target: 09-doc-update`.
- **AC-5:** QualityGate end-check, `issue-resolution` type with `registry.md`
  modified — passes.
- **AC-6:** `workflow-finish.sh` amendment with marker file present — applies
  marker, creates follow-up commit, pushes; PR is updated.
- **AC-7:** `workflow-finish.sh` amendment without marker file — skips
  silently, behaviour unchanged.
- **AC-8:** PowerShell compatibility — when invoked from PowerShell, no
  stderr noise, `$LASTEXITCODE` reflects real exit code.
- **AC-9:** Step 0.5 documented in both workflow files.
- **AC-10:** Script respects `set -euo pipefail` and is shellcheck-clean.

## Gate Result

```markdown
## Gate Result

gate_result:
  status: passed
  summary: "Requirement formalized as FEAT-WORKFLOW-001. Six files, zero blast radius to application code. One non-blocking clarification (WORKFLOW module code) resolved by Orchestrator."
  findings:
    - "WORKFLOW module code added to requirement-analyst.md module list"
    - "Step 0.5 added to both workflow files; QualityGate gets new Context-Update sub-check"
    - "PowerShell-native-command stderr rule (per repo memory) is a hard constraint on the script"
    - "Marker file emission is a Step 9 DocWriter sub-step; workflow definitions will be updated to enforce it"
  deferred_to_feature: ""
  retry_target: ""
```
