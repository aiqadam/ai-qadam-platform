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

### Self-consistency check (Orchestrator MUST verify, not just trust)

Before advancing on any agent's gate result, the Orchestrator MUST check
that `status` actually matches what the agent's own `findings`/BLOCKER/MAJOR
sections report — do not advance on a `status` field alone. **Observed
failure mode (2026-07-18, wf-20260718-fix-122):** SecurityReviewer listed 3
MAJOR findings in its own output but self-reported `gate_result.status:
passed` — a direct contradiction of its own agent definition's documented
semantics (`passed` requires **zero** BLOCKER or MAJOR findings). This is
an easy mistake for an agent to make (it correctly judged nothing was
BLOCKER-severity and rounded that up to "passed" instead of the correct
`failed-retry`), and it will recur with any agent whose gate has more than
two possible outcomes.

**Concretely:** before treating a `passed` result as real, count the
BLOCKER/MAJOR findings (or equivalent status-gating criteria) the output
file itself lists. If any exist and the agent's own gate-semantics table
says they should preclude `passed`, correct the `status` field in place
(cite the specific rule from the agent's `.md` file being violated), retry
the affected step, and note the correction in the workflow's own tracking
— do not silently accept a self-reported `passed` that contradicts the
same file's findings.

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

**GitHub-issue-sourced `issue-resolution` runs** (`handoff.yaml.github_issue_url`
set) have a third, separate terminal action — closing the GitHub issue —
performed at Step 12.5, strictly after this pair's atomic pre-merge flip and
after the merge itself is confirmed. It is not part of this atomic pair (it
cannot be, since it isn't a file in the git diff) and is not a substitute
for it — both this table's checks and the GitHub-close still apply. See
`issue-resolution.md` Step 12.5.

### Atomicity rule

The two edits in a pair MUST be staged in the same `git add` and committed
together on the feature branch. They are part of the same PR as the code,
so when the PR merges the status flip lands on `main` simultaneously with
the code. **No separate post-merge status commit is permitted** (preserves
AGENTS.md §6). The task-dir archive move + workspace-state.md close-out
entry in Step 11.5/12.5 is workflow-bookkeeping, not a substantive change,
and is the one class of edit exempt from this rule — but as of 2026-07-18
`main` on `aiqadam/ai-qadam-platform` is covered by an active repository
ruleset (id `18687633`, requiring `pull_request` — note this does NOT show
up via `gh api repos/<org>/<repo>/branches/main/protection`, which only
sees classic branch protection and 404s even when a ruleset is active;
check `gh api repos/<org>/<repo>/rulesets` instead) that requires even
this workflow-bookkeeping edit to arrive via a (small, doc-only) PR rather
than a direct push; see the
close-out procedure in `issue-resolution.md` Step 12.5 / `requirement-development.md`
Step 11.5 for the exact PR-routing steps. Do not assume a direct
`git push origin main` will succeed — verify or route through a PR by
default.

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

## GitHub Issue / Project Sync (added 2026-07-29)

`aiqadam/ai-qadam-platform` maintains a GitHub Project (v2) board (project
number `1`, `ai-qadam-platform`) as a queryable, cross-cutting view of
every currently-open `ISS-<n>` issue and non-terminal `FR-<CODE>`
requirement — see `docs/04-development/github-access.md` §5 for setup.
This is **additive** to, not a replacement for, the atomic-pair markdown
status flip above: the markdown files remain what QualityGate gates on
and what the Orchestrator reads to resume a workflow; the GitHub Issue /
Project item is a synced mirror maintained via
`scripts/sync-github-project.sh`, kept in step with the SAME trigger
points the atomic-pair flip already uses, not new ones.

### Sync trigger points (reuses existing atomic-pair moments)

| Trigger | `--status` value | Workflow step |
|---|---|---|
| New `ISS-<n>.md` / `FR-<CODE>.md` created (local-origin) or GitHub-origin issue intake | `todo` (or `in-progress` if work starts same-session) | `issue-resolution.md` Step 1 / `requirement-development.md` Step 1 |
| Atomic status flip to `resolved` / `Implemented` on the feature branch | `implemented` | `issue-resolution.md` Step 9 / `requirement-development.md` Step 9 |
| Post-merge verification confirms the flip landed on `main` | `agent-verified` | `issue-resolution.md` Step 12.5 / `requirement-development.md` Step 11.5 |

**Every call is idempotent and non-blocking to the workflow's gate
outcome:** a `sync-github-project.sh` failure (GitHub API error, missing
scope, transient rate limit, etc.) MUST be logged in the step's output
file but MUST NOT itself flip a gate to `failed-retry`/`failed-escalate`
— the markdown atomic pair remains the load-bearing status record in
Phase 1. Treat a sync failure the way an optional notification failure
would be treated: retry once, then proceed with a note, not a
workflow-blocking condition. (This is a deliberate scoping decision —
see "Deferred: full GitHub-as-source-of-truth" below.)

### `Agent-Verified` vs. `Done` — the volunteer-UAT split (added 2026-07-29)

This project is built and maintained by community volunteers, not a paid
QA workforce — asking a volunteer to thoroughly re-test every merged
change is not a reasonable ask of their time. The Status field therefore
splits "an agent finished everything an agent can verify" from "a human
actually looked at it":

- **`agent-verified`** — set by `sync-github-project.sh` at the trigger
  point above. This means either (a) `protocol.md`'s post-merge UAT
  re-verification (`post_merge_uat_runs[]`, see "Business-Process Linkage
  & Post-Merge UAT" below) ran and passed for every linked `BP-UAT-NNN`,
  or (b) `Business-Process` was `—` (nothing process-related exists to
  UAT-test), in which case a clean merge is treated as sufficient. Either
  way, this status means "an agent has done everything it can here" — not
  "a human confirmed it."
- **`done`** — set **only by a human volunteer**, directly on the Project
  board, after a light spot-check (not a full re-test — the agent already
  did the thorough part). **No script and no workflow step is permitted
  to set this status.** `sync-github-project.sh` hard-refuses `--status
  done` (exit 2) specifically so a workflow-file typo can't silently
  fabricate a human confirmation that never happened. There is
  deliberately no automated trigger (e.g. a magic PR comment) driving
  this in Phase 1 — see "Deferred" below if that changes.

An item can sit at `agent-verified` indefinitely if no volunteer has
looked yet — that's expected, not a failure state.

### Invocation

```bash
scripts/sync-github-project.sh --ref <ISS-n|FR-CODE> --status <todo|in-progress|implemented|agent-verified> \
  [--title ... --body-file ... --severity ... --existing-url ...]
```

(`done` is a valid Status *option* on the board but not a valid
`--status` argument to this script — see above.)

Full flag reference and idempotency design: see the script's own header
comment. Capture its `GITHUB_ISSUE_URL=<url>` stdout line and write it
into the source file's `GitHub-Issue:` field (`ISS-<n>.md` header table)
or `github_issue:` frontmatter key (`FR-<CODE>.md`) — see
`issue-resolution.md` Step 1 and `requirement-development.md` Step 1 for
the exact field.

Bug vs. Task vs. Feature type mapping (applied from the `Severity` field
on `ISS-<n>.md`; `FR-<CODE>` refs are always Feature):

| Severity value(s) | GitHub Issue Type |
|---|---|
| `blocker`, `bug`, `critical` | Bug |
| `enhancement`, `minor`, `operational` | Task |
| (any FR-* requirement) | Feature |

### Deferred: full GitHub-as-source-of-truth (Phase 2, not designed here)

Whether the markdown files (`registry.md`, `ISS-<n>.md`, `FR-<CODE>.md`,
`requirements-registry.md`) should eventually become auto-generated FROM
GitHub (via `gh`/GraphQL export) rather than hand-authored, and whether
QualityGate's atomic-pair `git diff` check (above) should be replaced or
supplemented by a GitHub-API-based check, is an explicitly deferred
follow-up — not silently dropped, not partially attempted here. It is a
larger behavioral change to a load-bearing enforcement mechanism and
needs its own scoped design pass. Phase 1 (this section) only adds a
best-effort mirror; it does not change what QualityGate enforces or what
the Orchestrator treats as authoritative on resume.

---

## Business-Process Linkage & Post-Merge UAT (added 2026-07-25)

The application implements business processes, not an unconnected pile of
requirements — each BP-UAT script in `docs/02-business-processes/uat/`
already documents one such process end-to-end (`process_ref` in its
frontmatter points at the runbook it verifies). An issue or requirement
that touches a process's surface can silently regress that process even
when its own regression test passes, because unit/regression tests check
the specific defect, not the whole live flow. This section makes the link
between "what shipped" and "which process it belongs to" explicit, and
makes re-verifying that process after merge a normal part of finishing the
workflow rather than an ad hoc follow-up someone has to remember to queue.

### The `Business-Process` field

Every `.copilot/issues/ISS-<n>.md` header table and every
`docs/03-requirements/FR-<CODE>.md` frontmatter block MUST include a
`Business-Process` field:

```
| Business-Process | BP-UAT-013, BP-UAT-009 |
```
```yaml
business_process: [BP-UAT-013, BP-UAT-009]
```

- List every `BP-UAT-NNN` whose documented flow the issue/requirement's
  changed surface participates in. Most issues touch exactly one; some
  (e.g. an auth-session change) touch several.
- **Use `—` when genuinely not process-related** — infra, CI, workflow
  tooling, dependency bumps, and similar changes with no user-facing
  business process have no BP-UAT to link and should not be forced into
  one. Do not invent a link to satisfy the field.
- The field is populated at Step 1 (issue lookup / requirement validation)
  by the Orchestrator or the intake agent, using
  `docs/02-business-processes/uat/registry.md` to find the matching
  `BP-UAT-NNN` by module/surface. If none matches an existing script and
  the change is clearly process-related, note the gap in the issue file
  rather than guessing a code — a missing BP-UAT script is itself a
  finding for `ISS-UAT-COV-*`-style follow-up, not a blocker to this
  workflow.

### Reverse link on the BP-UAT file

Each `BP-UAT-NNN.md` file's frontmatter gets a `linked_issues: []` list
(see `BP-UAT-template.md`) naming every `ISS-<n>`/`FR-<CODE>` that has
declared this BP-UAT in its `Business-Process` field. BusinessAnalyst
updates this at Step 4 of `uat-verification.md` (triage) and the
Orchestrator updates it as part of the new post-merge UAT step below —
same spirit as the existing `process_ref` forward link, just pointed the
other direction. Drift between the two directions is the same class of
problem `ISS-WF-REG-002` fixed for `process_ref`/frontmatter staleness —
treat it the same way if found.

This lives on the individual `BP-UAT-NNN.md` file, not as a column in
`docs/02-business-processes/uat/registry.md` — that table's `Spec`/`Smoke
Overlap` columns are auto-generated by `scripts/gen-bp-uat-coverage.mjs`
against a fixed header regex, and adding a table column would mean editing
that script (code, not docs/process). A future enhancement could extend
the generator to also surface `linked_issues` as a registry column; out of
scope for this change.

### Post-merge UAT re-verification (mandatory when `Business-Process` is non-empty)

Immediately after Step 12.5 (`issue-resolution`) / Step 11.5
(`requirement-development`) confirms the merge landed on `main` and local
`main` is updated, **before the workflow declares itself complete**:

1. If `Business-Process` is `—` (no linked BP-UAT), skip this step
   entirely — proceed straight to workflow completion as today.
2. If `Business-Process` names one or more `BP-UAT-NNN` codes, the
   Orchestrator spawns `uat-verification` (this repo's existing autonomous
   workflow, `.copilot/workflows/uat-verification.md`) against
   `uat_target: local`, once per linked BP-UAT code, **in the same
   session**, before declaring the parent issue/requirement workflow
   complete. This mirrors §6.1's "no deferred tests" rule — a merged fix
   is not actually done until the business process it belongs to is
   confirmed still working, not just the narrow regression test.
3. Each `uat-verification` run follows its own workflow file exactly
   (pre-flight, agent-driven session, triage, PR) and produces its own PR
   — it is a nested/child workflow the same way a `failed-escalate`
   subworkflow is, but on the success path rather than the failure path.
   Record it in the parent's `handoff.yaml` under a new
   `post_merge_uat_runs[]` list (id, BP-UAT code, outcome, PR url) —
   parallel in spirit to `subworkflow_history[]`.
4. **Outcome handling:**
   - `uat-verification` passes clean (no new issues triaged) → note the
     pass in the parent issue/requirement's Resolution section, proceed
     to parent workflow completion.
   - `uat-verification` triages one or more new `ISS-<n>` issues → those
     issues are registered normally (per `uat-verification.md` Step 4);
     the parent issue/requirement workflow still completes (its own fix
     is merged and correct), but the parent's Resolution section MUST
     name the newly discovered issue(s) rather than silently finishing as
     if nothing was found. A newly discovered issue on the SAME surface
     the parent just touched is worth a second look before declaring
     victory — the Orchestrator MUST at least note in the Resolution
     section why it believes the new finding is unrelated (or, if
     related, prefer fixing it in this same session over leaving a
     regression behind).
   - `uat-verification` itself hits `failed-escalate` (environment
     failure, not a product finding) → this is an environment problem,
     not proof the merged fix is broken; register the env issue per that
     workflow's own Step 2 gate, and note the deferral explicitly in the
     parent's Resolution section per the §6.1 honesty-disclosure rule
     (name what still needs live re-verification and why it couldn't run
     here).

This is an **addition to**, not a replacement for, the regression test
required at `issue-resolution.md` Step 6 / `requirement-development.md`
Step 6-7 — the regression test proves the specific defect is fixed; the
post-merge UAT run proves the business process built from that surface
still works end-to-end.

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
