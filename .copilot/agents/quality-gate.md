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
10. **UI components only:** `docs/04-development/design-system/Design system for AI agents/readme.md` — brand tokens, component classes, copy rules, icon policy (Lucide only), color rules (no raw hex, no gradients, no new tokens)

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

### 8. Status-Consistency Check (FEAT-WORKFLOW-003)

This check verifies that the workflow's status flip was applied **atomically
to both files in the pair** and that the **values agree**. It catches the
failure mode where Step 9 / Step 11 updates one file but leaves the other
stale (the wf-20260628-fix-033 bug).

**Inputs:** `handoff.yaml.workflow_type`, `handoff.yaml.issue_ref` or
`requirement_ref`, `handoff.yaml.expects_registry_update`.

**Skip condition:** if `expects_registry_update` is `false` or missing,
skip this check entirely (opt-out for documentation-only follow-ups and
subworkflows).

**Determine the pair from `workflow_type`:**

| Workflow type | File A | File B | Field A | Field B | Terminal value |
|---|---|---|---|---|---|
| `issue-resolution` | `.copilot/issues/ISS-<n>.md` | `.copilot/issues/registry.md` | header `Status` row | table `Status` column | `resolved` |
| `requirement-development` | `docs/03-requirements/FR-<CODE>.md` | `docs/03-requirements/requirements-registry.md` | frontmatter `status` | table `Status` column | `Implemented` / `Shipped` |

**Sub-checks (all must pass):**

8a. **Both files in the pair appear in the PR diff.** Run:
    ```bash
    git diff --name-only "origin/${base_branch:-main}...HEAD" -- <file-A> <file-B>
    ```
    Both file paths MUST appear. Missing either → failure.

8b. **Status values agree and equal the terminal value.**
    - For `issue-resolution`:
      - File A: `grep -E '^\| Status \| resolved \|' ISS-<n>.md` MUST match.
      - File B: the row matching `ISS-<n>` in `registry.md` MUST have
        `resolved` in the Status column.
    - For `requirement-development`:
      - File A: `grep -E '^status: (Implemented|Shipped)' FR-<CODE>.md`
        MUST match.
      - File B: the row matching `FR-<CODE>` in `requirements-registry.md`
        MUST have `Shipped` (or `Implemented`) in the Status column.

8c. **Atomicity.** Both edits SHOULD be in the same commit on the feature
    branch. Verify by running `git log --oneline origin/<base>..HEAD --
    <file-A> <file-B>` and checking the most recent commit touching each
    file is the same SHA. If they differ, this is a warning (not a hard
    failure) — the values still agree, so the workflow can proceed, but
    note the non-atomicity in `09-quality-gate.md` for future hygiene.

**Failure handling:**

If 8a or 8b fails and `expects_registry_update` is `true`: **GATE FAILURE**
with `retry_target: 09-doc-update` (or the workflow's equivalent DocWriter
step) and message:
`"Status-consistency check failed: <which sub-check, which file, expected vs actual>"`

This check is **additive** to checks 1–7. The post-merge verification in
Step 11.5 / 12.5 re-runs sub-check 8b against `main` after the merge lands.

### 7. Branch and Commit Readiness
- **CLEAN TREE INVARIANT (mandatory):** Run `git status -sb` and verify output shows `[up to date with 'origin/<branch>']`. A state of `[ahead N]`, `[behind N]`, or diverged is a **GATE FAILURE**.
- **FORMATTER CLEANLINESS (mandatory):** Run `pnpm biome check .` and verify no output. Any dirty file is a GATE FAILURE even if the tree is otherwise clean. This guards against formatter drift that only surfaces after commit.
- Verify `handoff.yaml.branch` matches `git rev-parse --abbrev-ref HEAD`.
- **`github_pr_url` must be non-empty** for `workflow_status: completed`. No PR = gate failure.

### 7.5 Production-Readiness / AC Verification (AGENTS.md §6.1) — HARD GATE

This is a **blocking check**, not advisory. Every AC listed in the issue's
"Acceptance criteria" (or derived equivalent for `feature/<area>-*`
workflows) MUST be marked in this section as one of:

- **`verified`** — confirmed by an actual run (test, curl, manual click,
  etc.) captured in `07-test-results.md` or equivalent. Cite the command
  output.
- **`deferred-with-followup-workflow-ID-and-queue-position`** — only
  acceptable when ALL of the following are true:
  1. The follow-up workflow ID is named in the PR description's "Risks"
     section **AND** in the issue file's Resolution section's "Honesty
     disclosures" subsection.
  2. The follow-up workflow's task directory exists at
     `.copilot/tasks/active/<follow-up-id>/` (i.e. it is **queued**,
     not just named) **OR** a TODO entry exists in
     `.copilot/context/workspace-state.md` "Open Issues" with the
     follow-up ID, queue position, and concrete verification commands.
  3. The deferral is **bounded** — it documents what concrete
     verification the follow-up will perform (commands, expected
     output).

**Any AC marked `deferred` without a queued follow-up ID is a GATE FAILURE.**
**Any AC that is unmarked (neither `verified` nor `deferred-with-...`)
is a GATE FAILURE.**

Additionally, verify the **Infrastructure-Pre-Flight Invariant:**

- If the AC requires live infrastructure (Docker stack, services), and
  `07-test-results.md` records a "deferred" status for that AC, verify
  in the working tree that the Orchestrator ran the pre-flight:
  - `docker ps` output captured BEFORE the deferral was recorded, showing
    missing containers.
  - `docker compose up -d <missing-services>` invocation captured.
  - Pre-flight curl against each required service captured.
- **If the Orchestrator recorded a deferral WITHOUT first running the
  pre-flight and showing the missing infrastructure**, the gate fails —
  the deferral is invalid.

**Exception (rare, project-level out-of-scope only):** when the
infrastructure requirement is documented as out-of-scope at the project
level (e.g. production UAT against aiqadam.com is handled by a separate
human-facing runbook, not by the agentic workflow). In that case the
issue file MUST cite the runbook or ADR; otherwise the gate fails.

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
- `## Status-Consistency Check` (FEAT-WORKFLOW-003) — both files in pair present in diff; status values agree; terminal value correct; atomicity noted
- `## Final Assessment` — one paragraph
- `## Gate Result` — per `.copilot/schemas/protocol.md` format

### Gate status semantics (this agent)

- `passed`: all checks pass. Orchestrator may commit and push.
- `failed-retry`: a specific gap found (missing test, open security finding, formatter drift, no PR URL). Include exact gap and `retry_target`.
