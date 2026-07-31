# Workflow: Requirement Development

**Version:** 1.0
**Orchestrator reference for `workflow_type`:** `requirement-development`

---

## Overview

Takes a raw requirement from input to a committed, tested, documented feature on a Git branch with a GitHub PR open. Fully autonomous — no human gates mid-workflow.

**Retry limits, gate status values, and counter semantics:** see
`.copilot/schemas/protocol.md` and `handoff.yaml.retry_limits`. Do not restate
here — read from those sources.

**Autonomous Issue Resolution (no human in the loop):**
- Every `failed-escalate` gate MUST first attempt a nested `issue-resolution` subworkflow
- UAT (user review) is the only human touchpoint — NEEDS_REVIEW is the terminal state when autonomous recovery is exhausted

## Step → Agent → Output File Map

The workflow uses two parallel numbering schemes. **Step numbers** drive flow;
**file numbers** drive artifact naming. They do not match — see the table.

| Step | Agent | Output file | Notes |
|---|---|---|---|
| 0 | Orchestrator | — | branch + handoff init |
| 0.5 | Orchestrator (direct) | — | context drift check; blocking |
| 1 | RequirementAnalyst | `01-requirement-validation.md` | |
| 2 | ImpactAnalyzer | `02-impact-analysis.md` | |
| 3 | DBMigrationAuthor | `05-migration-plan.md` | conditional; file prefix `05` |
| 4 | CodeDeveloper | `03-code-summary.md` | |
| 5 | SecurityReviewer | `04-security-review.md` | |
| 6 | TestStrategist | `06-test-strategy.md` | |
| 7 | TestDesigner | `06-test-design.md` | shares prefix `06` with strategist |
| 8 | TestRunner | `07-test-results.md` | |
| 9 | DocWriter | `08-doc-update.md` | atomic FR status flip (FEAT-WORKFLOW-003) |
| 10 | QualityGate | `09-quality-gate.md` | includes status-consistency check (FEAT-WORKFLOW-003) |
| 11 | Orchestrator | — | commit/push/PR via `scripts/workflow-finish.sh` |
| 11.5 | Orchestrator (direct) | — | merge + verify + archive (FEAT-WORKFLOW-003) |
| 13 | Orchestrator (direct) | — | post-merge UAT re-verification, conditional (added 2026-07-25) |

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

### Step 0.5: Context Sync (blocking)

**Agent:** Orchestrator (direct — no specialized agent)

**Purpose:** Detect drift between project-level state files and `origin/<base>`
*before* any other step runs. Drift at this checkpoint means the agentic
workflow layer's bookkeeping has diverged from git history and the workflow
must not advance until the divergence is reconciled.

**Inputs:**
- `.copilot/context/workspace-state.md`
- `.copilot/issues/registry.md`
- `docs/03-requirements/requirements-registry.md`
- `origin/main` (or `origin/<base>` from `handoff.yaml.base_branch`)

**Action:**
```bash
scripts/check-workflow-state.sh --base "origin/${BASE_BRANCH:-main}"
```

The script compares state-file content against `git show origin/<base>:<file>`
(NOT the working tree or local HEAD — see `02-impact-analysis.md` R-3
mitigation). It checks for:

1. **Orphaned workflow IDs** — rows in `workspace-state.md` Active Workflows
   table pointing to `.copilot/tasks/{active,completed}/<wf-id>/` that do
   not exist on disk or in git history.
2. **Missing `Last updated` frontmatter** on `workspace-state.md`.
3. **Orphaned FR references** — `FR-<MODULE>-<NNN>` ids listed in
   `requirements-registry.md` whose `FR-*.md` file is missing on the base ref.
4. **Orphaned ISS references** — `ISS-*` ids listed in `issues/registry.md`
   whose `ISS-*.md` file is missing on the base ref.

**Gate:**
- Script exits 0 → Step 1.
- Script exits 1 → workflow MUST NOT advance. Orchestrator MUST reconcile
  the offending state file (or run `scripts/check-workflow-state.sh --skip`
  with explicit user override) and re-run Step 0.5 until it passes.
- Script exits 2 → invocation error (e.g., base ref not fetched); fix and retry.

This step is **additive** — it does not renumber subsequent steps. File
prefixes (01–09) follow the existing numbering and are unaffected.

---

### Step 1: Validate Requirement

**Agent:** RequirementAnalyst
**Inputs:**
- Raw requirement text (from `handoff.yaml.requirement_text`)
- `docs/03-requirements/` — for conflicts and next FEAT number
- `docs/04-development/architecture/architecture.md`

**Output file:** `01-requirement-validation.md`

**Additional required output:** RequirementAnalyst sets the `business_process`
frontmatter field on the new/updated `FR-<CODE>.md` — see
`.copilot/schemas/protocol.md` "Business-Process Linkage & Post-Merge UAT".
Cross-reference `docs/02-business-processes/uat/registry.md` by the
requirement's module/surface to find matching `BP-UAT-NNN` code(s); use `—`
only when the requirement is genuinely not process-related (rare for a
product requirement — most FRs implement or extend a business process).
This field drives the mandatory post-merge UAT re-verification at Step 13.

**`github_issue` field (new 2026-07-29) — mirrors `issue-resolution.md`
Step 1's `GitHub-Issue:` header field, adapted for FR frontmatter.** Add a
`github_issue:` key to `FR-<CODE>.md`'s YAML frontmatter block (alongside
`code`, `name`, `status`, `module`, `phase`) — empty/absent until the sync
call below populates it. This is the FR-file equivalent of `ISS-<n>.md`'s
`GitHub-Issue:` table field; same purpose (durable link, not derived from
`handoff.yaml`), different file format (frontmatter, not a markdown
table), because that's how `FR-<CODE>.md` is already structured.

**GitHub sync (new 2026-07-29):** See `.copilot/schemas/protocol.md`
"GitHub Issue / Project Sync". As the last action of this step:
```bash
scripts/sync-github-project.sh --ref FR-<CODE> --status todo \
  --title "<FR-<CODE>.md frontmatter name>" \
  --body-file <path to a temp file with the Description section>
```
(No `--severity` — the script infers Issue Type `Feature` from the `FR-`
prefix automatically.) Write the returned `GITHUB_ISSUE_URL` into the new
`github_issue:` frontmatter key. Best-effort — a failure here does not
block this step's gate.

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

**MANDATORY infrastructure pre-flight (AGENTS.md §6.1):** Before
classifying any AC as "deferred," the Orchestrator (terminal access)
MUST capture `docker ps` output showing the missing services, run
`docker compose -f infrastructure/docker-compose.yml up -d
<missing-services>`, and pre-flight-curl each required endpoint.
Only after that sequence is documented in `07-test-results.md` may
the Orchestrator record a deferral — and only when a follow-up
workflow is queued with a named ID in the issue's Resolution section.
**"The stack is incomplete" is NOT a valid reason to skip the test.**
See `.copilot/agents/orchestrator.md §Infrastructure Pre-Flight`.

**Output file:** `07-test-results.md`

**Gate:**
- `passed` → Step 9
- `failed-retry-code` → return to Step 4, increment CodeDeveloper retry counter
- `failed-retry-tests` → return to Step 7, increment TestDesigner retry counter
  - If TestDesigner retry exhausted AND all findings are test-error → route to Step 4 (CodeDeveloper). Do NOT register an issue.
  - If TestDesigner retry exhausted AND any finding is code-bug → register issue, NEEDS_REVIEW, stop
- `failed-escalate` → register issue, spawn nested `issue-resolution` subworkflow

---

### Step 9: Update Documentation (atomic FR status flip)

**Agent:** DocWriter
**Inputs:**
- `01-requirement-validation.md`
- `03-code-summary.md`
- `07-test-results.md`
- Relevant current documentation files

**Required updates (do not skip):**

1. **Atomic FR status flip.** Both edits below MUST land in the same commit
   on the feature branch. Leaving one unchanged is a Step 9 failure.
   - Update `docs/03-requirements/FR-<CODE>.md` — change `status` frontmatter
     from current value to `Implemented`.
   - Update `docs/03-requirements/requirements-registry.md` — change the
     Status column for that FR in the implementation order table from
     current value to `Shipped`.
   - Confirm `business_process` (set at Step 1) still matches the final
     diff's actual surface — implementation sometimes narrows or widens the
     affected BP-UAT(s) versus the original intake guess. Update it if so.
2. Other doc updates per DocWriter's standard table (architecture, ADRs,
   runbooks, etc.) as needed.
3. **GitHub sync (best-effort, non-blocking):**
   ```bash
   scripts/sync-github-project.sh --ref FR-<CODE> --status implemented \
     --existing-url "<github_issue frontmatter value>"
   ```
   Per `.copilot/schemas/protocol.md`'s "GitHub Issue / Project Sync"
   section, skip silently if `github_issue` is unset; failure here does
   not change this step's `gate_result`.

**Atomicity rule:** The two FR-status edits MUST be staged in the same
`git add` and committed together. They are part of the same PR as the code,
so when the PR merges the status flip lands on `main` simultaneously with
the code. No separate post-merge status commit is permitted (preserves
AGENTS.md §6).

**Output file:** `08-doc-update.md`

**Gate:**
- `passed` → Step 10. Both FR files modified, both show terminal status,
  atomic commit recorded.
- `failed-retry` → one file was not modified, or statuses disagree. Re-do
  both edits, re-commit atomically. Max 2 retries.

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

Delegate to `scripts/workflow-finish.sh` per the **Workflow-Finish Protocol** in
`.copilot/schemas/protocol.md`. Do not reimplement commit/push/PR logic here.
Run the pre-push gate checks defined in the protocol before invoking the script.

**Commit message closing-keyword check (added 2026-07-31, ISS-WF-GH-CLOSE-001):**
Before writing the substantive shipping commit, run:
```bash
scripts/check-closing-keyword.sh --message-file <path-to-drafted-commit-message> --issue-ref FR-<CODE>
```
If it exits 1, the drafted message contains a closing keyword
(`Closes`/`Fixes`/`Resolves #N`) for an FR whose `business_process` is
non-empty — rewrite that line to a neutral `Refs #N` instead before
committing. See `protocol.md`'s "Two independent 'is this done' signals"
subsection for why: closing the GitHub issue via a commit keyword before
Step 13 has run means the issue reads as done while the Project board's
own Status field correctly still says `implemented`, not
`agent-verified` — a real incident (issue #130) shipped this exact drift.

**PR body closing-keyword check (added 2026-07-31, ISS-WF-GH-CLOSE-002)
— run again, separately, before `gh pr create`:** GitHub's auto-close
scanner reads PR body text independently of commit messages — a drafted
PR body's "Why" prose ("Closes #N / FR-CODE...") closes the issue at
merge exactly like a commit-message keyword would, even when the commit
message itself correctly used `Refs #N`. Before calling `gh pr create`:
```bash
scripts/check-closing-keyword.sh --body-file <path-to-drafted-pr-body> --issue-ref FR-<CODE>
```
Same remediation as above (rewrite to `Addresses #N`/`Refs #N`) if it
exits 1. See issue #160 for the motivating incident this half guards
against.

**MANDATORY: After workflow-finish.sh completes, the Orchestrator MUST output
the PR URL to the user in the final response.** Read `handoff.yaml` to extract
`github_pr_url` and surface it as a markdown link. Example:**

```
Workflow complete. Open the PR here:
https://github.com/org/repo/pull/123
```

If `github_pr_url` is empty after the script runs, report the fallback URL
from the script output and flag this for investigation.

**Default: autonomous merge.** Unless the user explicitly opted in to human
review (recorded in `handoff.yaml.merge_mode: manual`), immediately proceed
to Step 11.5 after the PR is open and CI is green. See Step 11.5 for the
merge-mode decision rule.

**MANDATORY:** Output the PR URL to the user as a markdown link.

---

### Step 11.5: Merge, Pull, Verify (Orchestrator, direct)

**Pre-condition:** Step 11 completed; PR exists; CI green; merge mode is
`auto` (default) OR the user has merged manually.

**Merge mode (determined at workflow start, recorded in `handoff.yaml.merge_mode`):**

- `auto` (default) — Orchestrator merges autonomously.
- `manual` — set when the user says, in any wording, that they will review
  the merge themselves. Orchestrator stops after Step 11, prints the PR URL,
  and waits. Resume at Step 11.5 when the user merges (detected by polling
  `gh pr view --json state` until `MERGED`, or when the user says "merged").

If unsure which mode applies, the Orchestrator MUST ask once at workflow
start: "Auto-merge this PR when CI passes, or will you review it yourself?"

**Actions:**

1. **Merge the PR** (only if `merge_mode == auto`):
   ```bash
   gh pr merge <PR-N> --squash --auto --delete-branch
   ```
   `--auto` waits for required checks then merges. Fallback if `--auto`
   rejected: `gh pr merge --squash --delete-branch` (immediate). If both
   fail: `workflow_status: needs-review`, record reason, stop.

   Poll `gh pr view <PR-N> --json state` until `MERGED` (max 5 min,
   15 s interval). On timeout: `needs-review`.

2. **Update local main:**
   ```bash
   git checkout main
   git pull --rebase origin main
   ```

3. **Verify the FR status flip landed on main:**
   - `grep -q '^status: Implemented' docs/03-requirements/FR-<CODE>.md`
   - `grep -q '| Shipped |' docs/03-requirements/requirements-registry.md`
     (in the correct row)
   - `git status --porcelain` is empty
   - `git status -sb` shows `[up to date with 'origin/main']`

   If ANY check fails: `workflow_status: needs-review`, record specific
   failure, stop. Do not "fix" main's state — surface the discrepancy.

4. **Sync GitHub Project Status (best-effort, only if `github_issue`
   frontmatter is set) — value depends on whether Step 13 will run:**
   - **If `business_process` is `—`** (Step 13 will be skipped): sync
     straight to `agent-verified`, since a clean ship is itself sufficient.
     ```bash
     scripts/sync-github-project.sh --ref FR-<CODE> --status agent-verified \
       --existing-url "<github_issue frontmatter value>"
     ```
   - **If `business_process` names one or more `BP-UAT-NNN`** (Step 13
     will run): do NOT sync to `agent-verified` here. Sync to
     `implemented` again instead (a harmless no-op) and let Step 13's own
     gate (below) sync to `agent-verified` once its UAT run actually passes.

   **Never pass `--status done`** — per `.copilot/schemas/protocol.md`'s
   "`Agent-Verified` vs. `Done`" subsection, `done` is human-only; the
   script hard-refuses it. Per `protocol.md`'s "GitHub Issue / Project
   Sync" section, failure here does not block this step's gate.

5. **Move task dir `active/` → `completed/`** and add the
   `.copilot/context/workspace-state.md` close-out entry:
   ```bash
   git mv .copilot/tasks/active/<wf-id> .copilot/tasks/completed/<wf-id>
   # ... edit workspace-state.md to prepend the new entry ...
   git add .copilot/tasks/completed/<wf-id> .copilot/context/workspace-state.md
   git commit -m "chore(workflow): archive <wf-id> (FR-<CODE> shipped)"
   git push origin main
   ```

   **Branch protection note (confirmed 2026-07-18, `aiqadam/ai-qadam-platform`):**
   `main` is covered by an active **repository ruleset** (not classic
   branch protection — `gh api repos/<org>/<repo>/branches/main/protection`
   returns 404 even when this ruleset is enforcing; check
   `gh api repos/<org>/<repo>/rulesets` or
   `gh api repos/<org>/<repo>/rules/branches/main` instead) requiring
   `pull_request` — the direct `git push origin main` above WILL be
   rejected (`GH013: Changes must be made through a pull request`). Route
   through a small close-out PR instead:
   ```bash
   git checkout -b chore/<wf-id>-archive-close-out
   # (the git mv + workspace-state.md edit + commit above happen on this branch)
   git push -u origin chore/<wf-id>-archive-close-out
   gh pr create --title "chore(workflow): archive <wf-id> (FR-<CODE> shipped)" \
     --base main --body "Close-out for FR-<CODE> (PR #<N>, merged): archives the task directory and adds the workspace-state.md summary entry."
   gh pr merge --squash --auto --delete-branch
   ```
   **Poll `gh pr view <close-out-PR-N> --json state` until `state == MERGED`
   (max 5 min, 15s interval) before declaring the workflow complete** —
   `--auto` merges asynchronously once checks pass; do not treat "the merge
   command returned" as "the merge happened," same rule as the main PR
   merge earlier in this step.

   This close-out PR is doc-only (no code) — expect it to merge quickly.
   If a future repo instance genuinely allows direct pushes to `main`,
   simplify back to the direct commit — verify via
   `gh api repos/<org>/<repo>/rulesets` (do NOT rely on `git push --dry-run`,
   which does not reliably reproduce a ruleset rejection; see the parallel
   note in `issue-resolution.md` Step 12.5). Strict-no-direct-main projects
   may skip this step entirely and treat `active/` vs `completed/` as
   advisory.

**Gate:**
- `passed` → proceed to Step 13 (below) if `business_process` is non-empty,
  otherwise workflow complete. Clean-tree invariant restored. FR is
  genuinely `Shipped` on `main`.
- `failed-retry` → verification mismatch. Re-pull, re-check. Max 2 retries.
- `needs-review` → merge failed, verification failed, or auto-merge rejected.

---

### Step 13: Post-Merge UAT Re-Verification (conditional, Orchestrator)

**Condition:** `FR-<CODE>.md`'s `business_process` frontmatter (Step 1/9)
names one or more `BP-UAT-NNN` codes. Skip entirely (workflow complete)
when it is `—`.

**Full procedure:** `.copilot/schemas/protocol.md` "Business-Process
Linkage & Post-Merge UAT". Summary: for each linked `BP-UAT-NNN`, spawn
`uat-verification` (`.copilot/workflows/uat-verification.md`) against
`uat_target: local` in this same session, before declaring this
requirement-development workflow complete — a newly shipped feature is not
done until the business process it belongs to (including this feature) is
confirmed working end-to-end, not just its own unit/integration tests from
Step 8. Record each run in `handoff.yaml.post_merge_uat_runs[]`.

**Gate:**
- All linked BP-UATs pass clean → note the pass(es) in `FR-<CODE>.md`,
  workflow complete. **Sync GitHub Project Status to `agent-verified`**
  (best-effort, only if `github_issue` frontmatter is set):
  ```bash
  scripts/sync-github-project.sh --ref FR-<CODE> --status agent-verified \
    --existing-url "<github_issue frontmatter value>"
  ```
  **Then close the GitHub issue here** (added 2026-07-31,
  `ISS-WF-GH-CLOSE-001` — this is the correct moment, not the earlier
  shipping commit; see `protocol.md`'s "Two independent 'is this done'
  signals" subsection):
  ```bash
  gh issue close <gh-n> --repo aiqadam/ai-qadam-platform \
    --comment "Verified via Step 13 post-merge re-verification of <BP-UAT-NNN> (workflow <wf-id>). Tracked internally as \`FR-<CODE>\`."
  ```
  Skip silently if `github_issue` is unset, or if the issue is already
  closed (e.g. an earlier commit's own keyword already closed it before
  this rule existed — closing an already-closed issue is a harmless
  no-op via `gh issue close`, not an error).
- One or more triaged a new issue → issue registered normally; this
  workflow still completes, but note the new finding(s) in `FR-<CODE>.md`
  and state whether they're believed related to this feature. Do NOT sync
  to `agent-verified` in this case — leave Status at `implemented`. Do
  NOT close the GitHub issue — if it is already closed (see the
  `check-closing-keyword.sh` guard at Step 11, or a pre-existing commit
  from before this rule existed), reopen it with a comment naming the new
  finding(s), mirroring exactly what happened with issue #130.
- A `uat-verification` run itself hit `failed-escalate` (environment, not
  product) → register the env issue per that workflow's own rules, disclose
  the deferral in `FR-<CODE>.md` per AGENTS.md §6.1, workflow completes
  with the disclosure recorded (not silently). Do NOT sync to
  `agent-verified` — nothing was actually verified. Do NOT close the
  GitHub issue for the same reason.

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
