# Quality Gate — FEAT-WORKFLOW-001

> Output for: `.copilot/tasks/active/wf-20260623-feat-004/09-quality-gate.md`
> Agent: QualityGate
> Workflow: wf-20260623-feat-004
> Feature: FEAT-WORKFLOW-001 — Context drift guard for the agentic workflow layer
> Date: 2026-06-23
> Branch: feature/FEAT-WORKFLOW-001-context-drift-guard
> Decision: **failed-retry** (retry_target: 11-workflow-finish)

---

## Workflow Instance

| Field | Value |
|---|---|
| `workflow_instance_id` | `wf-20260623-feat-004` |
| `workflow_type` | `requirement-development` |
| `requirement_ref` | `FEAT-WORKFLOW-001` |
| `branch` | `feature/FEAT-WORKFLOW-001-context-drift-guard` |
| `base_branch` | `main` |
| `current_step` | 10 (Final Quality Gate) |
| `workflow_status` (handoff) | `running` |
| `github_pr_url` | `""` (empty) |

---

## Step Completion Check

Read from `handoff.yaml.agent_assignments` and the eight artifact files in the workflow directory.

| Step | Agent | Artifact | Status (in artifact) | Gate Result | QualityGate Note |
|---|---|---|---|---|---|
| 01 | RequirementAnalyst | `01-requirement-validation.md` | passed | passed | WORKFLOW module code resolved by Orchestrator. |
| 02 | ImpactAnalyzer | `02-impact-analysis.md` | passed | passed | R-1 [Medium] (marker in gitignored dir) resolved via Option B. |
| 03 | CodeDeveloper | `03-code-summary.md` | passed | passed | 8 files; ~566 net LOC (above §4 cap but atomic by design). |
| 03.5 | DBMigrationAuthor | _(skipped)_ | n/a | n/a | `02-impact-analysis.md` Migration Plan: no DB changes required. Correctly skipped. |
| 04 | SecurityReviewer | `04-security-review.md` | passed | passed | Zero BLOCKER/MAJOR; 3 INFO findings (documented behaviours). `--force-with-lease` confirmed; no secrets. |
| 06 | TestStrategist | `06-test-strategy.md` | passed | passed | bats-core + shellcheck CI deferred to FEAT-WORKFLOW-002. |
| 06 | TestDesigner | `06-test-design.md` | passed | passed | Three `.bats` files designed; F.5 refactor (extract to function) required for testability. |
| 07 | TestRunner | `07-test-results.md` | passed | passed | 9/9 v1 smoke tests pass; 6 ACs deferred to FEAT-WORKFLOW-002. |
| 08 | DocWriter | `08-doc-update.md` | passed | passed | FR file created; row 62 added with Shipped; context_update block emitted for Step F.5. |

(Note: Steps 5 and 9 are not separate agents in this workflow's protocol. Step 5 is the DBMigrationAuthor slot — correctly skipped. Step 9 in the workflow doc table is `DocWriter` but the file naming used here is `08-doc-update.md`. This is consistent with the workflow file's "Step → Agent → Output File Map".)

---

## Traceability Check

**Feature ID reference in code summary:** PASS

- `03-code-summary.md` heading line: `# Code Summary — FEAT-WORKFLOW-001` (line 3).
- `requirement_ref` in `handoff.yaml`: `"FEAT-WORKFLOW-001"` (line 13).
- `code: FEAT-WORKFLOW-001` in `docs/03-requirements/FR-WORKFLOW-001.md` (line 3, frontmatter).
- `branch: "feature/FEAT-WORKFLOW-001-context-drift-guard"` — matches the GitHub branch name pattern `feature/FEAT-WORKFLOW-001-*`.

**Acceptance criteria mapped to tests:** PASS

| AC | Mapped to |
|---|---|
| AC-1 | `check-workflow-state.bats` (`drift_present` test); smoke-tested in `07-test-results.md` — PASS |
| AC-2 | `check-workflow-state.bats` (`clean state` test); `--skip` smoke-tested — PASS |
| AC-3, AC-4, AC-5 | Deferred to FEAT-WORKFLOW-002; registered in `.copilot/issues/registry.md` |
| AC-6 | `workflow-finish-amend.bats` (`amend_with_marker`); deferred implementation |
| AC-7 | `workflow-finish-amend.bats` (`amend_no_marker`); deferred implementation |
| AC-8 | `--help` smoke-tested; stderr empty confirmed — PASS |
| AC-9 | `step-0.5-doc-presence.bats` (`grep -F "Step 0.5"`); smoke-tested with grep — PASS |
| AC-10 | `bash -n` smoke-tested for both scripts — PASS (shellcheck deferred to FEAT-WORKFLOW-002) |

**Verdict:** Traceability complete. Deferrals are documented and registered as a follow-up feature (not silently dropped).

---

## Test Coverage Check

**Rubric score:** Not formally assessed in the workflow artifacts. Test scope is shell-test only (no application code touched). The 9/9 v1 manual smoke tests in `07-test-results.md` cover the core acceptance surface.

**Integration tests required/present:** N/A for this PR — no API endpoints, no DB queries, no UI surfaces touched. The integration-level test (QualityGate Context-Update Check end-to-end on a real PR) is **deferred to FEAT-WORKFLOW-002** with the bats harness.

**`@flaky` test tags:** None.

**`it.skip` calls:** None. The deferred ACs are **deferred to a registered follow-up feature**, which is the correct pattern per AGENTS.md §3 when the test infrastructure itself is the subject of the future feature.

**Coverage line/branch:** N/A (shell scripts have no line/branch coverage tooling configured; shellcheck coverage is the proxy and is deferred to FEAT-WORKFLOW-002).

**Verdict:** Test coverage is acceptable for this PR scope. The deferral pattern is explicit, registered as a follow-up issue.

---

## Security Check

**Applicable invariants:** INV-2 (Secrets), INV-10 (No secrets in logs), INV-11 (bash hardening), INV-12 (`--force-with-lease` not `--force`). INV-3 through INV-9 are N/A (no SQL, no rendered content, no endpoints, no auth controllers, no tenant data, no public endpoints).

| Invariant | Status | Evidence |
|---|---|---|
| INV-2 (Secrets) | PASS | `04-security-review.md` §"INV-2"; `grep -iE 'password\|secret\|apiKey\|token\|bearer'` over the diff returns zero hits. |
| INV-10 (No secrets in logs) | PASS | `04-security-review.md` §"INV-10"; diagnostic messages name fields, never values. |
| INV-11 (`set -euo pipefail`) | PASS | Both new/modified scripts use `set -euo pipefail`. Magic strings are `readonly` constants. Functions ≤ 60 lines. |
| INV-12 (`--force-with-lease`) | PASS | `04-security-review.md` §"INV-12"; amend path uses `--force-with-lease`, follow-up path uses plain `git push` with rebase+retry. |

**BLOCKER findings:** 0.
**MAJOR findings:** 0.
**Open findings:** 3 INFO (documented behaviours; no fix required).

**Verdict:** Security sign-off complete. PR is safe to merge from a security perspective.

---

## Documentation Check

**Feature marked `implemented`:** PASS

- `docs/03-requirements/FR-WORKFLOW-001.md` frontmatter `status: Implemented` (line 4).
- `docs/03-requirements/requirements-registry.md` row 62 added with `Shipped` status (verified in `git diff docs/03-requirements/requirements-registry.md`).

**Required documents updated:** PASS

| Document | Status |
|---|---|
| `docs/03-requirements/FR-WORKFLOW-001.md` | Created (5485 bytes). |
| `docs/03-requirements/requirements-registry.md` | Row 62 added; FR-files table extended with Workflow module row. |
| `.copilot/issues/registry.md` | `FEAT-WORKFLOW-002` follow-up registered. |
| `.copilot/issues/FEAT-WORKFLOW-002.md` | Created (2952 bytes). |
| `docs/04-development/architecture/architecture.md` | Not updated (correctly — out of scope per `08-doc-update.md`). |

**Inline `context_update:` block for Step F.5 amendment:** Present at line 77 of `08-doc-update.md`. Block correctly references `registry_file: docs/03-requirements/requirements-registry.md` and the row 62 content.

**Verdict:** Documentation complete.

---

## Branch and Commit Readiness — **GATE FAILURE**

### CLEAN TREE INVARIANT — FAIL

`git status -sb` output (verified):

```
## feature/FEAT-WORKFLOW-001-context-drift-guard
 M .copilot/agents/quality-gate.md
 M .copilot/agents/requirement-analyst.md
 M .copilot/issues/registry.md
 M .copilot/schemas/handoff.schema.yaml
 M .copilot/schemas/protocol.md
 M .copilot/workflows/issue-resolution.md
 M .copilot/workflows/requirement-development.md
 M docs/03-requirements/requirements-registry.md
 M scripts/workflow-finish.sh
?? .copilot/issues/FEAT-WORKFLOW-002.md
?? .memories/
?? docs/03-requirements/FR-WORKFLOW-001.md
?? scripts/check-workflow-state.sh
```

- Header line is `## feature/FEAT-WORKFLOW-001-context-drift-guard` — **does NOT contain `[up to date with 'origin/<branch>']`**.
- 9 modified files + 4 untracked = **13 unstaged/uncommitted items** in the working tree.
- `git rev-list --count origin/main..HEAD` returns **0** — branch is zero commits ahead of `origin/main`.
- The branch has **never been pushed to origin**. There is no commit on the branch; everything exists only in the working tree.

Per `quality-gate.md` §7 and `protocol.md` Clean-Tree Invariant:

> A workflow is **not complete** until all of the following hold on its branch:
> 1. `git status` reports `nothing to commit, working tree clean`
> 2. `git status -sb` shows `[up to date with 'origin/<branch>']` — no `[ahead N]`, no `[behind N]`
> 3. Branch is pushed to `origin` and a GitHub PR exists
> 4. `handoff.yaml` is committed and pushed with all other workflow artifacts

Conditions 1, 2, 3, and 4 are all violated.

### FORMATTER CLEANLINESS — PASS (scoped to PR diff)

`pnpm biome check .copilot/` and `pnpm biome check docs/03-requirements/requirements-registry.md` both return biome's standard "No files were processed in the specified paths" error because biome 1.9.4 does not lint `.md` or `.yaml` files. This is **not a code-quality failure of the PR's changes** — `03-code-summary.md` self-validation documented this exact behavior. `bash -n` on both modified scripts returns 0 (verified: `$LASTEXITCODE = 0` for both).

`pnpm biome check .` does surface pre-existing `lint/suspicious/noConsoleLog` warnings on `apps/api/src/db/migrate.ts:58:7` and `tools/gen/page.ts:53:1` / `:54:1`. These files are **not in the PR diff** (verified: `git diff origin/main --name-only apps/api tools` returns nothing; last commit to those files is `4d4a3562` pre-existing on `origin/main`). These warnings are pre-existing repository state, not introduced by this PR.

The QualityGate protocol's "FORMATTER CLEANLINESS" rule is intended to "guard against formatter drift that only surfaces after commit." Since the PR diff contains zero files in biome's include scope (`*.ts`/`*.tsx`/`*.js`/`*.json`), there is no formatter drift risk from this PR.

**Verdict on formatter cleanliness:** PASS for PR scope; pre-existing findings not in scope.

### PR URL — FAIL

`handoff.yaml.github_pr_url` is `""` (empty). Per the agent file: `github_pr_url` must be non-empty for `workflow_status: completed`. No PR = gate failure.

`handoff.yaml.workflow_status` is `"running"` — not `"completed"`. No PR has been created.

### Branch name match — PASS

`handoff.yaml.branch: "feature/FEAT-WORKFLOW-001-context-drift-guard"` matches `git rev-parse --abbrev-ref HEAD`. Branch is on `main` base.

### Side observation: `.memories/repo/issue-resolution-workflow-issues.md`

The working tree contains a new file `.memories/repo/issue-resolution-workflow-issues.md` (untracked, not in PR scope per the CodeDeveloper artifact list). `git check-ignore -v .memories` exits 1 (not ignored), so this file would be picked up by `git add -A` if not explicitly excluded.

This is a developer-machine memory artifact from a prior workflow run (`wf-20260623-fix-3`), not a file the PR should commit. The Orchestrator should add `.memories/` to `.gitignore` or explicitly exclude it from `git add` when running `workflow-finish.sh`.

---

## Context-Update Check — PASS (per workflow prompt override)

The standard agent file's Context-Update Check (§6) reads `handoff.yaml.expects_registry_update`. That field is **not present** in `handoff.yaml` for this workflow (per `grep expects_registry_update handoff.yaml` -> no matches). Per the standard agent rule, the check would skip (default opt-out).

**However**, the QualityGate was invoked with a workflow-specific override that instructs the gate to verify the **EXPECTED state file modifications** based on `workflow_type` and `requirement_ref`, since the `workspace-state.md` amendment is the planned **Step F.5** of `scripts/workflow-finish.sh` (which runs *after* this QualityGate passes — see protocol.md "Workflow-Finish Protocol").

| Verification | Source of truth | Status |
|---|---|---|
| `requirement_ref` is `FEAT-WORKFLOW-001` | `handoff.yaml:13` | verified |
| `workflow_type` is `requirement-development` | `handoff.yaml:7` | verified |
| Expected registry file `docs/03-requirements/requirements-registry.md` is modified in working tree | `git diff docs/03-requirements/requirements-registry.md` | verified — row 62 added |
| Expected workspace-state file `.copilot/context/workspace-state.md` is modified | not in working tree (uncommitted) | expected — Step F.5 amendment target per `08-doc-update.md` line 77-87 |
| `context_update:` fenced YAML block present in `08-doc-update.md` | `08-doc-update.md:77` | verified — block includes `registry_file: docs/03-requirements/requirements-registry.md` and row-62 content |

The `08-doc-update.md` step explicitly states the registry row is **already present** in the working tree (DocWriter wrote it directly), and the `context_update:` block is the **belt-and-braces mechanism** that the new Step F.5 amendment sub-step will use to write the row again post-merge.

**Verdict on Context-Update Check:** PASS. The expected state files are in scope of the planned amendment; the registry row is already in the working tree; the `context_update:` marker is present and well-formed.

**Caveat:** This QualityGate does **not** verify the `context_update:` block parses correctly with `apply_context_sync_update()` from `workflow-finish.sh` (the bats test for AC-6 is deferred to FEAT-WORKFLOW-002). If Step F.5 amendment fails at PR time, the workflow will retry — but the registry row is already committed via DocWriter.

---

## Final Assessment

The feature **FEAT-WORKFLOW-001** is well-designed, well-documented, and well-tested at the smoke-test level. All eight workflow artifacts report `passed` gate results. Security review, documentation update, requirement traceability, and the new Context-Update Check all pass. The script-level deferrals (AC-3 through AC-7) are correctly registered as the follow-up feature `FEAT-WORKFLOW-002` rather than hidden.

**However**, the workflow has not progressed through Step 11 (commit, push, PR creation). All 13 file changes exist only in the working tree; the branch has zero commits ahead of `origin/main`; no PR exists; `handoff.yaml.github_pr_url` is empty; `git status -sb` shows no `[up to date with origin/<branch>]` indicator. Per `protocol.md` Clean-Tree Invariant and `quality-gate.md` §7, this is a **GATE FAILURE** that blocks merge authorization.

The retry path is unambiguous: the Orchestrator must run **Step 11** — invoke `scripts/workflow-finish.sh` to commit the 13 working-tree changes, push the branch to `origin`, create a PR, write the PR URL back into `handoff.yaml`, run Step F.5 to apply the `context_update:` block (workspace-state.md row), and then advance to Step 12 (archive task directory).

**Important pre-existing housekeeping note (not a blocker for this PR):** the new drift script correctly detects that `wf-20260623-feat-2` in `.copilot/context/workspace-state.md` on `origin/main` references a task directory that was never archived. This is a real bug from a prior workflow run. The new script is working as designed — surfacing real drift. The fix is out of scope for this PR and should be handled by a follow-up housekeeping task; however, **before this PR is merged**, the user should reconcile this drift on `main`, otherwise the next workflow started after merge will block at Step 0.5.

**Note on `.memories/` directory:** The working tree contains an untracked `.memories/repo/issue-resolution-workflow-issues.md` file. This is a developer-machine memory artifact (per the prior `wf-20260623-fix-3` workflow's husky-bypass workaround). It is **not in PR scope** but is not gitignored either. The Orchestrator's `workflow-finish.sh` invocation must explicitly exclude `.memories/` from `git add` (or add it to `.gitignore` before running).

---

## Gate Result

```markdown
## Gate Result

gate_result:
  status: failed-retry
  summary: "All six content checks (Workflow Completeness, Requirement Traceability, Test Coverage, Security Sign-Off, Documentation Completeness, Context-Update Check) pass. Check 7 (Branch and Commit Readiness) FAILS: 13 unstaged file changes exist in the working tree only; branch has zero commits ahead of origin/main; no PR created; handoff.yaml.github_pr_url is empty. workflow-finish.sh (Step 11) has not yet been invoked."
  retry_target: 11-workflow-finish
  findings:
    - "Check 1 PASS: 8 workflow artifacts all report gate_result.status=passed; DBMigrationAuthor correctly skipped (no DB changes)."
    - "Check 2 PASS: FEAT-WORKFLOW-001 referenced consistently across handoff.yaml, code-summary.md, FR file, and branch name; ACs mapped to smoke tests (5/10 verified, 5 deferred to registered FEAT-WORKFLOW-002)."
    - "Check 3 PASS (with explicit deferrals): 9/9 v1 smoke tests pass; 6 ACs deferred to FEAT-WORKFLOW-002 (bats harness + shellcheck CI + QualityGate e2e); deferral is registered in .copilot/issues/registry.md, not hidden."
    - "Check 4 PASS: zero BLOCKER/MAJOR security findings; --force-with-lease confirmed; bash hardening present in both scripts; no secrets; no SQL."
    - "Check 5 PASS: FR-WORKFLOW-001.md created with status Implemented; requirements-registry.md row 62 added with Shipped; FEAT-WORKFLOW-002 follow-up registered; context_update block emitted in 08-doc-update.md line 77 for Step F.5 consumption."
    - "Check 6 PASS (per workflow prompt override): requirement_ref=FEAT-WORKFLOW-001 verified in handoff.yaml:13; workflow_type=requirement-development verified in handoff.yaml:7; expected registry file docs/03-requirements/requirements-registry.md is modified in working tree (row 62 added); expected workspace-state.md amendment is the planned Step F.5 hook (08-doc-update.md line 77-87)."
    - "Check 7 FAIL: branch has never been pushed; 13 unstaged/uncommitted items in working tree; git status -sb does not show [up to date with origin/<branch>]; handoff.yaml.github_pr_url is empty; workflow_status is 'running' not 'completed'. Step 11 (scripts/workflow-finish.sh) has not been invoked."
    - "Hygiene: .memories/repo/issue-resolution-workflow-issues.md is untracked and not gitignored. Must be excluded from git add in Step 11 or added to .gitignore before invocation."
    - "Housekeeping (out of scope, pre-merge recommended): wf-20260623-feat-2 row in workspace-state.md on origin/main references a missing task directory. The new drift script correctly detects this. Reconcile on main before merging this PR to avoid blocking the next workflow at Step 0.5."
  deferred_to_feature: ""
```