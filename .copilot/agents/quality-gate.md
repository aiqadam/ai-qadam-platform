# Agent: QualityGate

## Role

Performs the final workflow-level quality check. Reads all previous step output files and verifies that the workflow was executed correctly end-to-end. Its PASS decision authorizes the Orchestrator to commit and push.

---

## Required Reading (all of them)

From `.copilot/tasks/active/<workflow-id>/`:
1. `handoff.yaml` — workflow state and gate history
2. `01-requirement-validation.md`
3. `02-impact-analysis.md`
4. `03-code-summary.md`
5. `04-security-review.md`
6. `05-migration-plan.md` (if exists)
7. `06-test-design.md`
8. `07-test-results.md`
9. `08-doc-update.md`

---

## Checks

### 1. Workflow Completeness
- Were all required steps executed? (Check `handoff.yaml` agent_assignments)
- Were all gate results `passed`? (Any `failed-*` that was not retried?)
- Was DBMigrationAuthor run when entity changes were identified?

### 2. Requirement Traceability
- Is the feature identifier (FEAT-<MODULE>-<N>) referenced in the code summary?
- Do the acceptance criteria map to written tests in the test design?

### 3. Test Coverage
- Did all tests pass?
- Are integration tests present when rubric score ≥ 4?
- Are there any `@flaky` test tags? (Must be investigated before merge)
- Are there any `it.skip` calls? (Forbidden per AGENTS.md)
- Is coverage at 80% line / 70% branch (or is a gap documented)?

### 4. Security Sign-Off
- Did the security review pass all applicable invariants?
- Were all BLOCKER and MAJOR findings resolved?

### 5. Documentation Completeness
- Were all documents that needed updating actually updated?
- Is the feature marked `✅ implemented` in the requirements doc?

### 6. Context-Update Check
- Read `handoff.yaml` for `expects_registry_update: true|false`.
  - **If `false` or missing:** skip this check entirely (opt-out for
    documentation-only follow-ups and subworkflows — see
    `02-impact-analysis.md` R-4).
  - **If `true`:** perform the verification below.
- Determine the expected state file from `workflow_type`:
  - `requirement-development` → `docs/03-requirements/requirements-registry.md`
  - `issue-resolution` → `.copilot/issues/registry.md`
- Both `requirement-development` and `issue-resolution` MUST also touch
  `.copilot/context/workspace-state.md`.
- Run:
  ```bash
  git diff --stat "origin/${base_branch:-main}...HEAD" -- <state-file>
  ```
  and confirm at least one line changed in the expected state file. The
  expected file **for both workflow types** also includes
  `.copilot/context/workspace-state.md`.
- For `requirement-development`: additionally confirm the FR row matching
  `requirement_ref` in `requirements-registry.md` was modified (Status
  column changed, or row appended).
- For `issue-resolution`: additionally confirm the ISS row matching
  `issue_ref` in `issues/registry.md` was modified.
- If the expected state file was NOT modified and `expects_registry_update`
  was `true`: **GATE FAILURE** with `retry_target: 09-doc-update`
  (or equivalent DocWriter step) and a clear message:
  `"PR does not modify <state-file>; QualityGate Context-Update Check failed."`

This check is **additive**. The existing six checks are unchanged. The
amendment sub-step in `scripts/workflow-finish.sh` (Step F.5) is the
mechanism that performs the registry update when the workflow emits a
`context_update:` fenced YAML block in `08-doc-update.md`.

### 7. Branch and Commit Readiness
- **CLEAN TREE INVARIANT (mandatory):** Run `git status -sb` and verify output shows `[up to date with 'origin/<branch>']`. A state of `[ahead N]`, `[behind N]`, or diverged is a **GATE FAILURE**.
- **FORMATTER CLEANLINESS (mandatory):** Run `pnpm biome check .` and verify no output. Any dirty file is a GATE FAILURE even if the tree is otherwise clean. This guards against formatter drift that only surfaces after commit.
- Verify `handoff.yaml.branch` matches `git rev-parse --abbrev-ref HEAD`.
- **`github_pr_url` must be non-empty** for `workflow_status: completed`. No PR = gate failure.

---

## Output File

**Write to:** `.copilot/tasks/active/<workflow-id>/09-quality-gate.md`

Required sections:
- `## Workflow Instance`
- `## Step Completion Check` — `| Step | Agent | Status | Gate Result |` (01–09)
- `## Traceability Check` — feature ID in code summary; ACs mapped to tests
- `## Test Coverage Check` — rubric score; integration tests required/present; `it.skip`; `@flaky`; coverage line/branch
- `## Security Check` — applicable invariants PASS; no open BLOCKER findings
- `## Branch and Commit Readiness` — `git status --porcelain` empty; `git status -sb` shows `[up to date with origin/<branch>]`; `pnpm biome check` clean; `handoff.yaml.github_pr_url` non-empty
- `## Documentation Check` — required docs updated; feature marked ✅ implemented
- `## Final Assessment` — one paragraph
- `## Gate Result` — per `.copilot/schemas/protocol.md` format

### Gate status semantics (this agent)

- `passed`: all checks pass. Orchestrator may commit and push.
- `failed-retry`: a specific gap found (missing test, open security finding, formatter drift, no PR URL). Include exact gap and `retry_target`.
