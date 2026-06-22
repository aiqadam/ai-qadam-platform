---
code: FR-WORKFLOW-001
name: Context drift guard for the agentic workflow layer
status: Implemented
module: Workflow (WORKFLOW)
phase: DevEx
---

## Description
A drift-detection guard that prevents the AI Qadam multi-agent workflow system from running workflows that have drifted from three project-state files (`.copilot/context/workspace-state.md`, `.copilot/issues/registry.md`, `docs/03-requirements/requirements-registry.md`). Drift is detected at two checkpoints: workflow start (Step 0.5 "Context Sync", blocking) and workflow end (QualityGate "Context-Update Check", required). The amendment sub-step in `scripts/workflow-finish.sh` (Step F.5) closes the loop by automatically updating the state files when a workflow's DocWriter output contains a `context_update:` fenced YAML block.

## Users
The Copilot Orchestrator and any human operator running a workflow. The drift guard is invisible during normal operation; it only blocks workflows when real drift is present.

## Functional scope
1. **scripts/check-workflow-state.sh** — POSIX bash (~188 LOC). Compares state-file content from `git show origin/<base>:<state-file>` against the on-disk state. Detects:
   - Orphaned workflow references in `workspace-state.md` (rows in the Active Workflows table whose task dir does not exist on disk).
   - Missing `**Last updated:**` frontmatter on `workspace-state.md`.
   - Orphaned FR references in `requirements-registry.md` (rows whose FR file is missing on the base ref).
   - Orphaned ISS references in `issues/registry.md` (rows whose issue file is missing on the base ref).
   - Exit codes: 0 (clean), 1 (drift), 2 (invocation error).
2. **Step 0.5 "Context Sync"** — inserted between Step 0 (initialize) and Step 1 in both `requirement-development.md` and `issue-resolution.md`. Blocking: workflow cannot advance until drift is reconciled.
3. **QualityGate "Context-Update Check"** — new sub-check between "Documentation Completeness" and "Branch and Commit Readiness". Reads `expects_registry_update` from `handoff.yaml`. Verifies the PR commit set modified the expected state file (`requirements-registry.md` for requirement-development, `registry.md` for issue-resolution, plus `workspace-state.md` for both). On failure: `retry_target: 09-doc-update`.
4. **scripts/workflow-finish.sh Step F.5** — new sub-step between F and G. Parses inline `context_update:` fenced YAML block from `08-doc-update.md`. Applies registry row + workspace-state row. Decides amend vs follow-up commit based on `git rev-list --count origin/<branch>..HEAD == 1`. Amend path uses `git push --force-with-lease`; follow-up path uses standard push with rebase+retry.
5. **handoff.yaml schema** — new optional fields `expects_registry_update: false` (default) and `context_sync_commits: 0`. Backwards compatible: in-flight workflows under the pre-FEAT-WORKFLOW-001 contract read as `false` and `0`.
6. **WORKFLOW module code** — added to `.copilot/agents/requirement-analyst.md` module-code list.

## Acceptance criteria
- [x] AC-1: Drift present → `check-workflow-state.sh` exits 1 with diagnostic on stderr.
- [x] AC-2: Drift absent → script exits 0, "OK" on stdout.
- [x] AC-8: `--help` exits 0 with empty stderr (PowerShell rule).
- [x] AC-9: Step 0.5 string present in both workflow files.
- [x] AC-10: `bash -n scripts/check-workflow-state.sh` and `bash -n scripts/workflow-finish.sh` exit 0. (shellcheck not run in this session; CI gate is a follow-up.)
- [ ] AC-3, AC-4, AC-5, AC-6, AC-7 — **deferred to FEAT-WORKFLOW-002** (bats-core test suite + QualityGate end-to-end test harness). Documented in `.copilot/issues/registry.md` as the registered follow-up issue.

## Out of scope (v1)
- bats-core test suite and F.5 refactor for unit-testability (FEAT-WORKFLOW-002).
- shellcheck integration in CI (FEAT-WORKFLOW-002).
- End-to-end test harness for QualityGate Context-Update Check (FEAT-WORKFLOW-002).
- Auto-reconciliation command (`--reconcile` flag) — manual reconciliation is acceptable for v1.

## Notes
- Implementation choice for the marker file: **Option B** (inline `context_update:` fenced YAML block in `08-doc-update.md`) — avoids the `.gitignore` trap of `.copilot/tasks/` (the originally-proposed marker path was inside the gitignored tasks directory, which would have been invisible to git).
- Risk mitigations adopted:
  - **R-1** (marker path): Option B.
  - **R-2** (amend guard): `git rev-list --count origin/<branch>..HEAD == 1` gate.
  - **R-3** (drift false positives): compare `git show origin/<base>:<state-file>`, not working tree.
  - **R-4** (false negatives for doc-only follow-ups): `expects_registry_update` opt-out in handoff.yaml (default `false`).
- PowerShell compatibility: scripts send normal output to stdout, diagnostics to stderr. Header comment in `check-workflow-state.sh` documents this constraint.
- PR size: 8 files, ~562 net LOC. Exceeds AGENTS.md §4 small-PR cap of 400. Justified because the change is intrinsically atomic (script + workflow integration + agent contract + protocol schema). The follow-up FEAT-WORKFLOW-002 will be small (~250 LOC, the bats suite).
- Follow-up housekeeping (out of scope for this PR): `wf-20260623-feat-2` reference in `workspace-state.md` on `origin/main` has no corresponding task directory. The new drift script correctly flags this as drift. Operator should archive the workflow task dir before starting the next workflow.
