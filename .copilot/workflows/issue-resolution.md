# Workflow: Issue Resolution

**Version:** 1.0
**Orchestrator reference for `workflow_type`:** `issue-resolution`

---

## Overview

Resolves a registered issue: identifies root cause, implements a fix, verifies it resolves the issue, and updates the issue registry.

**Retry limits, gate status values, counter semantics:** see
`.copilot/schemas/protocol.md` and `handoff.yaml.retry_limits`.

Steps 3, 5, 8, 9, 10, 11, 12, 13 reuse `requirement-development.md` definitions
verbatim. The only differences are flagged inline below.

---

## Subworkflow Mode

This workflow can run in two modes:

1. **Standalone:** A user or the Orchestrator explicitly starts a resolution for a registered issue. `parent_link` in `handoff.yaml` is empty.
2. **Subworkflow (nested):** Spawned automatically by a parent workflow that hit a `failed-escalate` gate. The parent records this in its `subworkflow_history[]`.

When running as a subworkflow:
- **Branch base:** from `origin/main` (NOT from the parent feature branch)
- **PR target:** `main`
- **`parent_link` MUST be populated** in `handoff.yaml` at Step 0

---

## Steps

### Step 0: Initialize (Orchestrator, direct)

```bash
git fetch origin main
git checkout -b fix/ISS-<n>-<slug>
```

**Subworkflow additions:** Populate `parent_link` in `handoff.yaml`.

---

### Step 0.5: Context Sync (blocking)

**Agent:** Orchestrator (direct — no specialized agent)

**Purpose:** Detect drift between project-level state files and `origin/<base>`
before any other step runs. Same behavior as the `requirement-development`
workflow's Step 0.5 (see `.copilot/workflows/requirement-development.md`
§Step 0.5 for full description).

**Action:**
```bash
scripts/check-workflow-state.sh --base "origin/${BASE_BRANCH:-main}"
```

**Gate:**
- Script exits 0 → Step 1.
- Script exits 1 → workflow MUST NOT advance. Orchestrator MUST reconcile
  state and re-run Step 0.5 until it passes (or apply `--skip` with
  explicit user override and recorded reason in `handoff.yaml.needs_review.reason`).
- Script exits 2 → invocation error; fix and retry.

This step is **additive** — does not renumber subsequent steps. File prefixes
follow the existing numbering and are unaffected.

---

### Step 1: Issue Lookup

**Agent:** Orchestrator (direct)

1. Read `.copilot/issues/registry.md`
2. Search for issues with the same module or symptom keywords
3. If similar issue found: read `ISS-<n>.md` and append current occurrence
4. If no similar issue: create `ISS-<n>.md`, register in `registry.md`
5. Set `issue_ref` in `handoff.yaml`

**Output file:** `01-issue-lookup.md`

---

### Step 2: Impact Analysis

**Agent:** ImpactAnalyzer
**Inputs:** `ISS-<n>.md`, `01-issue-lookup.md`, `docs/04-development/architecture/architecture.md`

**Output file:** `02-impact-analysis.md`

**Gate:**
- `passed` → Step 3 (if DB changes) or Step 4
- `failed-escalate` → update issue, NEEDS_REVIEW, stop

---

### Step 3: Design DB Migrations (conditional)

Same as `requirement-development.md` Step 3.

---

### Step 4: Develop Fix

**Agent:** CodeDeveloper
**Inputs:**
- `ISS-<n>.md` (prior attempts — do NOT repeat a failed approach)
- `02-impact-analysis.md`
- `05-migration-plan.md` (if applicable)

**Output files:** Code changes + `03-code-summary.md`

**Gate:**
- `passed` → Step 5
- `failed-retry` → retry (max 3). Each attempt is recorded in the issue file.
- On exhaustion → update issue with all attempts, NEEDS_REVIEW, stop

---

### Step 5: Security Review

Same as `requirement-development.md` Step 5.

---

### Step 6: Plan Regression Tests

**Agent:** TestStrategist
**Inputs:** `ISS-<n>.md`, `02-impact-analysis.md`, `03-code-summary.md`, `04-security-review.md`

**Key constraint:** The plan MUST include at least one regression test that:
1. Would have failed before the fix (documents the original bug)
2. Passes after the fix

**Output file:** `06-test-strategy.md`

**Gate:**
- `passed` → Step 7
- `failed-retry` → retry (max 2)

---

### Step 7: Write Regression Tests

**Agent:** TestDesigner
**Inputs:** `06-test-strategy.md`, `03-code-summary.md`

**Output files:** Test files + `06-test-design.md`

---

### Step 8: Execute Tests

Same as `requirement-development.md` Step 8. The regression test is the primary success indicator. All existing tests must also pass (no regressions introduced).

**MANDATORY pre-flight when tests need live infrastructure:** Before
running live tests, the Orchestrator (which has terminal access) MUST
verify the required infrastructure is up. If `docker ps` shows missing
services, the Orchestrator MUST bring them up
(`docker compose -f infrastructure/docker-compose.yml up -d
<missing-services>`) and pre-flight-curl each one BEFORE classifying the
test as "deferred." A "the stack is incomplete" deferral without a
pre-flight capture in `07-test-results.md` is a workflow violation.
See `AGENTS.md §6.1` and `.copilot/agents/orchestrator.md §Infrastructure
Pre-Flight` for the full procedure.

---

### Step 9: Update Issue Registry (atomic status flip)

**Agent:** Orchestrator (direct)

This step performs an **atomic** status flip in BOTH registry artifacts.
Both edits MUST land in the same commit on the feature branch. Leaving one
file unchanged is a Step 9 failure — do not advance.

**Edit 1 — `.copilot/issues/ISS-<n>.md`:**

- In the header field table, set `Status` to `resolved`.
- Set `Resolved` to today's ISO date (e.g. `2026-06-29`).
- Set `Workflow` to the current workflow id (e.g. `wf-20260629-fix-034`).
- Append a `## Resolution` section with:
  - **Workflow:** `<wf-id>`
  - **PR:** `https://github.com/<org>/<repo>/pull/<N>` — placeholder `<pending>`
    is acceptable here if the PR number is not yet known; Step 12 back-fills
    it after `gh pr create`.
  - **Root cause:** one sentence.
  - **Fix:** one paragraph.
  - **Regression test:** name of the test that would have failed before the
    fix and passes after (required by Step 6).
  - **Merged:** `<pending>` — Step 12.5 back-fills the actual merge SHA.

**Edit 2 — `.copilot/issues/registry.md`:**

- In the issue's table row, set the `Status` column to `resolved`.
- Update the `Workflow` column to the current workflow id.
- Update the `Date` column to today's ISO date.

**Edit 3 — `handoff.yaml`:**

- Set `issue_resolution: resolved`.

**Atomicity rule:** Edits 1 and 2 MUST be staged in the same `git add` and
committed together. They are part of the same PR as the code fix, so when
the PR merges the status flip lands on `main` simultaneously with the code.
No separate post-merge commit is permitted (preserves AGENTS.md §6).

**Pre-merge honesty note:** Between Step 9 and Step 12.5, the branch carries
`resolved` but `main` still shows `open`. This is acceptable because the
branch is throwaway until the PR merges. If the PR is closed-unmerged, the
status flip is discarded along with the branch — `main`'s state stays honest.

**Output file:** `09-registry-update.md` — record the exact diffs applied to
both files, for the QualityGate status-consistency check.

**Gate:**
- `passed` → Step 10. Both files modified, both show `resolved`, atomic
  commit recorded.
- `failed-retry` → one file was not modified, or statuses disagree. Re-do
  both edits, re-commit atomically. Max 2 retries.

---

### Step 10: Update Documentation (conditional)

**Condition:** The fix reveals a gap in a guide or convention file.

**Agent:** DocWriter — same as `requirement-development.md` Step 9, focused on preventing this class of issue.

---

### Step 11: Final Quality Gate

**Agent:** QualityGate
**Additional check:** Regression test exists and passes.

---

### Step 12: Commit, Push, Create PR (Orchestrator, direct)

Same as `requirement-development.md` Step 11, with two additions:

1. **Back-fill PR URL.** After `gh pr create` returns the PR URL, rewrite
   the `PR:` placeholder in `ISS-<n>.md`'s `## Resolution` section to the
   actual URL, amend the workflow-artifacts commit (or follow-up commit),
   and force-push-with-lease if amending.

2. **Default: autonomous merge.** Unless the user explicitly opted in to
   human review (see "Merge mode" below), immediately proceed to Step 12.5
   after the PR is open and CI is green.

**Merge mode (determined at workflow start, recorded in `handoff.yaml.merge_mode`):**

- `auto` (default) — Orchestrator runs Step 12.5 autonomously.
- `manual` — set when the user says, in any wording, that they will review
  the merge themselves. Orchestrator stops after Step 12, prints the PR URL,
  and waits. When the user merges (detected by polling `gh pr view --json
  state` until `state == MERGED`, or by the user saying "merged"), resume
  at Step 12.5.

If unsure which mode applies, the Orchestrator MUST ask the user once at
workflow start: "Auto-merge this PR when CI passes, or will you review it
yourself?" The answer is binding for the whole workflow.

**MANDATORY:** After Step 12, the Orchestrator MUST output the PR URL to the
user as a markdown link. If `github_pr_url` is empty, report the fallback
URL and flag for investigation.

---

### Step 12.5: Merge, Pull, Verify (Orchestrator, direct)

**Pre-condition:** Step 12 completed; PR exists; CI is green; merge mode
is `auto` OR the user has merged manually.

**Actions:**

1. **Merge the PR** (only if `merge_mode == auto`):
   ```bash
   gh pr merge <PR-N> --squash --auto --delete-branch
   ```
   `--auto` waits for all required checks to pass, then merges. If the repo
   has no required checks, this is immediate. If `--auto` is rejected
   (e.g., branch protection requires review the agent can't satisfy),
   fall back to `gh pr merge --squash --delete-branch` (immediate). If that
   also fails, set `workflow_status: needs-review`, record the failure
   reason in `handoff.yaml.needs_review.reason`, and stop.

   Poll `gh pr view <PR-N> --json state` until `state == MERGED` (max 5 min,
   15 s interval). On timeout: `needs-review`.

2. **Update local main:**
   ```bash
   git checkout main
   git pull --rebase origin main
   ```

3. **Back-fill merge SHA in `ISS-<n>.md`:** rewrite the `Merged:` placeholder
   to the squash-commit SHA on main. Commit on main:
   `docs(issues): back-fill merge SHA for ISS-<n>`.

   **§6 note:** This is a metadata-only documentation back-fill on `main`
   after the substantive PR has already merged. It is permitted because the
   substantive change arrived via PR; this commit only records history that
   already happened. If the user prefers strict no-direct-main, this step
   can be deferred to the next workflow's PR — but then `ISS-<n>.md` carries
   a `<pending>` SHA indefinitely.

4. **Verify the status flip landed on main:**
   - `grep -q 'Status | resolved' .copilot/issues/ISS-<n>.md`
   - `grep -q '| resolved |' .copilot/issues/registry.md` (in the correct row)
   - `git status --porcelain` is empty (clean tree)
   - `git status -sb` shows `[up to date with 'origin/main']`

   If ANY check fails: set `workflow_status: needs-review`, record the
   specific failure in `handoff.yaml.needs_review.reason`, stop. Do not
   attempt to "fix" main's state — surface the discrepancy to the user.

5. **Move task dir `active/` → `completed/`:**
   ```bash
   git mv .copilot/tasks/active/<wf-id> .copilot/tasks/completed/<wf-id>
   git commit -m "chore(workflow): archive <wf-id> (ISS-<n> resolved)"
   git push origin main
   ```

   This is the one direct-to-main commit permitted by this protocol, and
   only for the archive move. Reason: the archive is a workflow-bookkeeping
   operation that cannot ride the just-merged PR (the PR is already merged).
   Strict-no-direct-main projects can skip this step and treat `active/`
   vs `completed/` as advisory.

**Gate:**
- `passed` → workflow complete. Clean-tree invariant restored. Issue is
  genuinely `resolved` on `main`.
- `failed-retry` → verification mismatch (e.g., status not flipped on main).
  Re-pull, re-check. Max 2 retries.
- `needs-review` → merge failed, verification failed after retries, or
  auto-merge was rejected. Surface to user.

---

## Prior Issue Knowledge Pattern

The issue file accumulates all attempts. Before Step 4, the CodeDeveloper reads the full issue history. If 3 different approaches have failed, the QualityGate will flag it as NEEDS_REVIEW with a recommendation to change the architectural approach.
