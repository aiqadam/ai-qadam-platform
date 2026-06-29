# Multi-Agent Protocol — Shared Definitions

**Single source of truth** for constructs reused across agents and workflows.
Every agent and workflow file references this instead of restating these rules.

---

## Gate Result Format

Every agent output file MUST end with a `gate_result` block in this exact shape:

```markdown
## Gate Result

gate_result:
  status: <status-value>
  summary: "<one sentence>"
  findings:
    - "<finding>"
  # Optional fields (status-dependent):
  retry_target: <step-name>           # when status == failed-retry
  deferred_to_feature: "FEAT-<MODULE>-<N>"  # when status == deferred
  deferred_reason: "<one sentence>"   # when status == deferred
```

---

## Gate Status Values

All agents use this shared enum. An agent only emits the values relevant to its role.

| Status | Meaning | Orchestrator action |
|---|---|---|
| `passed` | Step complete, advance. | Advance `current_step`. |
| `failed-retry` | Same agent can fix it. | Re-invoke same step (counter on current step). |
| `failed-retry-code` | CodeDeveloper must fix. | Route to CodeDeveloper step (counter on current step). |
| `failed-retry-tests` | TestDesigner must fix. | Route to TestDesigner step (counter on current step). |
| `deferred` | Out of scope, belongs to a known future feature. | Record in `deferrals[]`, continue. |
| `failed-escalate` | Architectural / infrastructure; needs issue. | Register issue, spawn subworkflow or NEEDS_REVIEW. |

### Counter semantics

- Each step has its own retry quota (see Retry Limits below).
- When a gate returns `failed-retry-code` / `failed-retry-tests`, the counter
  increments on the **current step that produced the failure**, not on the
  target step being retried.
- On exhaustion: register issue in `.copilot/issues/`, set
  `workflow_status: needs-review`, write `NEEDS_REVIEW.md`, stop.

---

## Retry Limits

Authoritative source: `handoff.yaml.retry_limits`. Do not restate per-step in
workflow prose — read from the handoff.

| Agent | Limit |
|---|---|
| RequirementAnalyst | 1 |
| DBMigrationAuthor | 2 |
| CodeDeveloper | 3 (shared with security/test bouncebacks) |
| TestStrategist | 2 |
| TestDesigner | 3 |
| DocWriter | 2 |
| QualityGate | routes to indicated `retry_target`; target step's own counter applies |
| Subworkflow (nested issue-resolution) | 3 per parent workflow |

---

## Workflow-Finish Protocol (Commit / Push / PR)

All git and PR operations for the final step of every workflow are delegated to
`scripts/workflow-finish.sh`. This is the canonical last action.

**Invocation:**
```bash
scripts/workflow-finish.sh
scripts/workflow-finish.sh --workflow-dir .copilot/tasks/active/wf-20260622-feat-001
scripts/workflow-finish.sh --push-only   # commit + push, skip PR creation
GITHUB_TOKEN=ghp_... scripts/workflow-finish.sh  # enables REST API PR creation
```

| Step | Action | Idempotent? |
|------|--------|-------------|
| A | Resolve workflow dir (handoff.yaml) | Yes |
| B | Verify clean tree + on workflow branch | Yes — refuses if dirty |
| C | Commit any pending workflow artifacts | Yes — no-op if already clean |
| D | Push with rebase+retry on non-fast-forward (max 3) | Yes |
| E | Create PR via `gh` CLI → REST API → web URL fallback | Yes — 409/existing PR reused |
| F | Write PR URL back into `handoff.yaml`, commit + push | Yes |
| F.5 | **Context Sync amendment** (FEAT-WORKFLOW-001) — if `09-quality-gate.md` shows `status: passed` AND `08-doc-update.md` contains a `context_update:` fenced YAML block: apply the block (registry row + workspace-state row), commit, and push with rebase+retry. Uses `--amend` only when `git rev-list --count origin/<branch>..HEAD` equals 1; otherwise follows up with `chore(context-sync): update state files for <FEAT-ID>`. Push uses `--force-with-lease` on the amend path. If no `context_update:` block is present, this step is a no-op. | Yes |
| G | `git checkout main` + `pull --rebase` | Yes |

**Pre-push gate checks (Orchestrator verifies before invoking the script):**
```bash
test -f 09-quality-gate.md && grep -q "status: passed" 09-quality-gate.md
test -f 04-security-review.md && grep -q "status: passed" 04-security-review.md
test -f 07-test-results.md && grep -q "status: passed" 07-test-results.md
```

**PR creation is mandatory.** Fallback order: `gh` CLI → GitHub REST API →
record web URL in `handoff.yaml` with `workflow_status: needs-human-pr-creation`.

**MANDATORY: After workflow-finish.sh completes, the Orchestrator MUST output
the PR URL to the user as a markdown link.** Read `github_pr_url` from
`handoff.yaml` and surface it in the final response. Example:

```
Workflow complete. Open the PR here:
https://github.com/org/repo/pull/123
```

If `github_pr_url` is empty, report the fallback URL from the script output
and flag this for investigation.

---

## Clean-Tree Invariant

Every workflow MUST end with a fully clean, synced git working tree. A workflow
is **not complete** until all of the following hold on its branch:

1. `git status` reports `nothing to commit, working tree clean`
2. `git status -sb` shows `[up to date with 'origin/<branch>']` — no `[ahead N]`, no `[behind N]`
3. Branch is pushed to `origin` and a GitHub PR exists
4. `handoff.yaml` is committed and pushed with all other workflow artifacts

Enforcement points: Step 0 (refuse if dirty), Step 10/11 (verify sync after push),
Quality Gate (`[ahead N]` is a failure, not a warning).

**Cross-workflow:** at every workflow start, verify base branch is in sync with
`origin/main`; if behind, `git pull --rebase origin main` first.

---

## Status-Consistency Check (FEAT-WORKFLOW-003)

Every workflow that flips a status field MUST flip **both** artifacts atomically,
and both flips MUST ride the same PR as the substantive change. This prevents
the failure mode where a workflow "finishes" with one file updated and the other
left stale.

### Required atomic pairs

| Workflow type | File A (header/frontmatter) | File B (table row) | Terminal status |
|---|---|---|---|
| `issue-resolution` | `.copilot/issues/ISS-<n>.md` (Status field) | `.copilot/issues/registry.md` (Status column) | `resolved` |
| `requirement-development` | `docs/03-requirements/FR-<CODE>.md` (status frontmatter) | `docs/03-requirements/requirements-registry.md` (Status column) | `Implemented` / `Shipped` |

### Atomicity rule

The two edits in a pair MUST be staged in the same `git add` and committed
together on the feature branch. They are part of the same PR as the code,
so when the PR merges the status flip lands on `main` simultaneously with
the code. **No separate post-merge status commit is permitted** (preserves
AGENTS.md §6). The only permitted direct-to-main commit is the task-dir
archive move in Step 11.5/12.5.

### QualityGate enforcement

The QualityGate MUST verify, before `passed`:

1. Both files in the pair appear in `git diff origin/<base>...HEAD` — at
   least one line changed in each.
2. The two status values agree (both `resolved`, or both terminal-FR-status).
3. For `issue-resolution`: the ISS row in `registry.md` matching
   `handoff.yaml.issue_ref` was modified.
4. For `requirement-development`: the FR row in `requirements-registry.md`
   matching `handoff.yaml.requirement_ref` was modified.

If any of these fail and `handoff.yaml.expects_registry_update` is `true`,
it is a gate failure with `retry_target: 09-doc-update` (or equivalent
DocWriter step) and message:
`"Status-consistency check failed: <specific mismatch>"`.

### Post-merge verification (Step 11.5 / 12.5)

After the PR merges and local `main` is updated, the Orchestrator MUST
re-verify the status pair on `main` (not just on the feature branch). If
the values disagree on `main`, set `workflow_status: needs-review` and
stop — do not attempt in-place fixes on `main`.

---

## Rules Are in AGENTS.md — Do Not Restate

Agent files reference AGENTS.md sections by number rather than copying rules:

| Topic | AGENTS.md section |
|---|---|
| Code quality, TypeScript strictness, testing policy | §3 |
| Security baseline (11 invariants expanded in SecurityReviewer) | §5 |
| Architecture: module boundaries, tenant scoping, no cross-schema | §1, §3, §9 |
| Final priorities when in conflict | §12 |

Agents expand these into a **name-only checklist** relevant to their domain;
they do not re-explain the rule.
