# Impact Analysis — FEAT-WORKFLOW-001

> Output for: `.copilot/tasks/active/wf-20260623-feat-004/02-impact-analysis.md`
> Agent: ImpactAnalyzer
> Workflow: wf-20260623-feat-004
> Feature: FEAT-WORKFLOW-001 — Context drift guard for the agentic workflow layer
> Status: **passed** (with one structural recommendation; see Gate Result)

---

## Summary

The proposed change is entirely **inside the `.copilot/` agentic workflow layer**.
It touches six files, none of which are application code, schema, or UI:

| # | File | Type | Layer |
|---|------|------|-------|
| 1 | `scripts/check-workflow-state.sh` | **new** | tooling |
| 2 | `.copilot/workflows/requirement-development.md` | edit | workflow definition |
| 3 | `.copilot/workflows/issue-resolution.md` | edit | workflow definition |
| 4 | `.copilot/agents/quality-gate.md` | edit | agent role |
| 5 | `.copilot/agents/requirement-analyst.md` | one-line edit | agent role |
| 6 | `scripts/workflow-finish.sh` | edit | tooling |

There is **zero blast radius to the application stack** (Astro/NestJS/Python/BullMQ).
There is **no DB migration**, no API surface change, no shared-types change, no
frontend change, no bot change, no worker change.

The change is purely about **internal consistency of the agentic workflow layer
itself**: making the multi-agent system honest about what it has and has not
written to the three project-state files it owns
(`workspace-state.md`, `issues/registry.md`, `requirements-registry.md`).

This analysis surfaces one **Medium-severity structural concern** that the
CodeDeveloper and QualityGate should treat as a hard prerequisite rather than an
implementation detail: the proposed marker file path (`.copilot/tasks/active/<wf-id>/.context-update-marker.yaml`)
sits **inside a `.gitignore`-d directory** (see `.gitignore` line 4: `.copilot/tasks/`).
Any code that wants to amend the PR with marker contents must therefore move the
payload into a tracked location before `git add`. This is **not** a defect in
the requirement; it is a sequencing constraint the implementation must respect.

---

## Affected Modules

| Layer | Touched? | Notes |
|---|---|---|
| Application code (NestJS / Astro / Bot / Workers) | **No** | — |
| Database schema (Drizzle) | **No** | — |
| Database migrations | **No** | — |
| Shared types (`packages/shared-types/`) | **No** | — |
| API endpoints | **No** | — |
| Frontend / UI | **No** | — |
| Bot handlers | **No** | — |
| Worker queues | **No** | — |
| CI / GitHub Actions | **No** | shellcheck already in CI per `01-requirement-validation.md` |
| Documentation (`docs/**`) | **No** | — |
| **Agentic workflow layer** (`.copilot/**`, `scripts/workflow-finish.sh`) | **Yes** | six files |
| **Workflow tooling** (`scripts/check-workflow-state.sh` new) | **Yes** | new script |

**Module-code registration:** `WORKFLOW` is not currently in the module-code
list of `.copilot/agents/requirement-analyst.md` (lines listing
`USERS`, `EVENTS`, `REG`, `SPEAKERS`, `PARTNERS`, `GAMIF`, `NOTIF`, `CONTENT`,
`ADMIN`, `BOT`, `WORKERS`, `WEB`, `INFRA`). The Orchestrator-resolved decision
to add `WORKFLOW` is recorded in `01-requirement-validation.md` §"Orchestrator
Resolution of Clarification" and is part of this PR.

---

## Risk Surface

Severity ratings: **Low / Medium / High / Critical**.
"Concrete failure mode" describes what a user would observe.

### R-1 [Medium] Marker file lives in a `.gitignore`-d directory

**Where:** `scripts/workflow-finish.sh` amendment sub-step (file #6).

**The trap:** The proposed marker path
`.copilot/tasks/active/<wf-id>/.context-update-marker.yaml` is **inside
`.copilot/tasks/`**, which is gitignored (`.gitignore:4`). A naive
`git add .copilot/tasks/active/<wf-id>/.context-update-marker.yaml` is a **no-op**
for git; the file will never be committed and the amendment step will silently
emit an empty diff.

**Concrete failure mode:** The amendment step "succeeds" (exit 0), but the PR
diff contains no state-file changes. The QualityGate end-check (added by this
PR) reads the diff and fails with `retry_target: 09-doc-update`. The workflow
then loops because the QualityGate keeps finding the marker-applied state
absent — but the marker itself is invisible to git, so the developer cannot
inspect what was applied.

**Mitigation options (CodeDeveloper to choose one):**

- **(A) Use tracked marker path:** Place the marker at
  `.copilot/context/context-update/<wf-id>.yaml` (a new tracked directory) and
  ignore that subdirectory from `.gitignore` (or simply add a positive pattern).
  Add it as a single tracked artifact per workflow, mirroring the pattern of
  one output file per step.
- **(B) Apply marker contents inline:** Do not store a marker on disk at all;
  have DocWriter (Step 9) directly write the registry row + workspace-state
  update into the existing workflow artifacts (e.g., into
  `08-doc-update.md` as a fenced `yaml` block). The amendment step then reads
  the artifact (which is already committed by `workflow-finish.sh` Step C).
- **(C) Two-phase commit:** Have the DocWriter also produce a small tracked
  `state-update.patch` in `.copilot/context/pending/` that the amendment step
  `git apply`s, then `git rm`s.

**Recommendation:** **Option (B)** — keep marker file concept internal to
DocWriter's output (`08-doc-update.md` gets a new optional section). This is
the smallest blast-radius fix and aligns with the existing artifact-naming
convention (one output file per step). QualityGate reads the same artifact.

### R-2 [Medium] Amendment can amend the wrong commit

**Where:** `scripts/workflow-finish.sh` Step F → new amendment sub-step.

**Concrete failure mode:** After Step F pushes the initial PR commit, the
amendment step runs `git commit --amend` on HEAD. If between Step F's push and
the amendment, any other process (a CI bot push, a subworkflow branch push,
or a manual `git commit`) has added a commit to the same branch, `--amend`
**silently rewrites the latest commit** instead of appending. The pushed SHA
changes, and `origin/<base>...HEAD` diff for QualityGate is recomputed against
an unintended base — potentially masking or inventing drift.

**Mitigation:**

- Before `git commit --amend`, verify `git log origin/<branch>..HEAD --oneline`
  has **exactly one** commit. If not, fall back to a follow-up commit (already
  part of the requirement text under C4).
- Add `git push --force-with-lease` (not `--force`) for the amend path.
- Hard-coded guard: refuse `--amend` if `git rev-list --count origin/<branch>..HEAD` ≠ 1.

### R-3 [Medium] False-positive drift detection blocks legitimate workflows

**Where:** `scripts/check-workflow-state.sh` (file #1) Step 0.5.

**Concrete failure modes (each separately enumerable):**

- **F-3a — Empty registry at workflow start.** First workflow ever run on a
  fresh clone, the script sees no rows. If the script treats "registry has no
  workflow rows" as drift, it will block the very first workflow after the
  branch is created. **Mitigation:** script only checks references that *exist*
  in the state files; absence of rows is not drift.

- **F-3b — Cross-branch false positive.** A developer is mid-way through
  another feature branch when a new workflow starts on `main`. The new branch's
  Step 0.5 compares state files against `origin/main` but the developer has
  local uncommitted edits to `workspace-state.md`. **Mitigation:** script must
  compare `git show origin/<base>:<state-file>` (the upstream version), not
  working-tree contents.

- **F-3c — Stale frontmatter SHA.** Frontmatter-based SHA tracking (per
  assumption C1) records `last_synced_commit: <sha>` on every state file. If
  the script enforces equality with `HEAD` rather than `origin/<base>`, every
  in-flight branch will look drifted. **Mitigation:** script MUST compare
  against `origin/<base>`, never against `HEAD` or working tree.

- **F-3d — Orphan reference after a workflow archive.** When a workflow is
  archived (Step 12), its task directory is moved to `completed/`, but its row
  in `workspace-state.md` is removed in the same commit. Until that commit
  reaches `origin/main`, a parallel workflow starting on a stale branch sees
  a row referencing a path under `completed/` and flags it as orphaned.
  **Mitigation:** orphaned-reference check must tolerate `completed/` paths
  OR require the state-file SHA to equal `origin/<base>`'s SHA (not the
  local branch's SHA).

### R-4 [Medium] QualityGate end-check denies merge even when there is no drift

**Where:** `.copilot/agents/quality-gate.md` — new "Context-Update Check"
(file #4).

**Concrete failure mode:** The end-check inspects the diff for ≥1 line in
`requirements-registry.md` (or `registry.md` for issue-resolution). For
`requirement-development` workflows where the new feature row **was already
present** (e.g., DocWriter only changed the Status column of an existing row
— which is the current convention per `01-requirement-validation.md` C1/G
mapping), a `git diff` line count is fine. But for **truly documentation-only
follow-ups** (e.g., a typo fix in `docs/`), the workflow does not have a
`requirement-development` FR at all and may legitimately not touch
`requirements-registry.md`. The gate must accept "no FR expected → no
registry update expected."

**Mitigation:** The QualityGate sub-check needs an explicit opt-out path. Two
options:

- (i) The handoff carries `expects_registry_update: true|false`; QualityGate
  reads this and skips the check when false. (Recommended.)
- (ii) The check counts *changes to the row matching `requirement_ref` in the
  registry* rather than any change to the registry file. This is robust but
  more complex; it requires regex parsing of the registry table.

### R-5 [Low] PowerShell false-positive exit code

**Where:** `scripts/check-workflow-state.sh` (file #1).

**Per repo memory `powershell-native-command-stderr.md`:** PowerShell reports
ANY stderr output from a native command as a `NativeCommandError`, even when
the process exits 0. The script must put success summaries on stdout and only
diagnostics on stderr. This is recorded in `01-requirement-validation.md`
under "Risks" and is non-blocking, but the CodeDeveloper should add an explicit
header comment in the script noting the rule and a `set -euo pipefail`
declaration.

### R-6 [Low] `git log -1 --format=%H` ambiguity with rename detection

**Where:** `scripts/check-workflow-state.sh`.

**Concrete failure mode:** If the state file is ever renamed (extremely unlikely
but possible — e.g., renaming `requirements-registry.md` → `requirements.md`),
`git log -1 -- <state-file>` returns nothing, the SHA is empty, and the
comparison logic silently treats it as drift.

**Mitigation:** Use `git log -1 --format=%H --follow -- <state-file>` and
fall back to "file not found" if both return empty.

### R-7 [Low] Concurrent workflow directories

**Concrete failure mode:** Two workflows running concurrently (one
`requirement-development`, one `issue-resolution`) both write to
`workspace-state.md` in their final amendment. The second push's diff may
include the first's changes plus its own, but the first's amendment has
already pushed, so the second's push needs rebase.

**Mitigation:** This is already handled by `workflow-finish.sh` Step D's
rebase+retry logic. The new amendment step inherits this guarantee. No new
code needed, but the QualityGate end-check MUST re-run after amendment (not
just before) to validate the final diff.

### R-8 [Low] Marker file injection via crafted DocWriter output

**Where:** DocWriter's `08-doc-update.md` (file path consumed by amendment).

If Option (B) from R-1 is chosen (marker is a fenced YAML block inside
`08-doc-update.md`), then YAML parsing of the marker is on the critical path.
A malformed YAML block causes the amendment step to fail. **Mitigation:**
parser uses `yq` (already standard in CI) with `safe-load` semantics; on parse
error, the amendment step exits non-zero with a clear diagnostic naming the
malformed field, and QualityGate surfaces the issue as
`retry_target: 09-doc-update`.

### R-9 [Low] Branch name collision on follow-up amendment commit

**Where:** `scripts/workflow-finish.sh` amendment sub-step.

If a follow-up commit (vs amend) is used, the commit message must include the
`FEAT-ID` and a Conventional Commits prefix (`chore(context-sync): …` is
correct per AGENTS.md §10). **Mitigation:** CodeDeveloper hard-codes the
prefix in the amendment step's `git commit` invocation.

### R-10 [Low] Step 0.5 renumbers subsequent steps or breaks the step→file map

**Where:** `.copilot/workflows/requirement-development.md` and `issue-resolution.md`.

The current step table maps Step N → Output file `NN-…`. Inserting a new
"Step 0.5" does **not** renumber the file prefixes (the file prefixes are
already non-sequential — `03-code-summary.md` is Step 4, `04-security-review.md`
is Step 5, etc., per the existing table). **Mitigation:** no code change
needed; document explicitly that "Step 0.5 is a sub-step between Step 0 and
Step 1" and that file numbering is unaffected.

### R-11 [Low] `WORKFLOW` module code added but not propagated

**Where:** `.copilot/agents/requirement-analyst.md`.

`WORKFLOW` is added to the module-code list, but other agents that read
`requirement_ref` (e.g., DocWriter, TestStrategist) may not recognize it.
**Mitigation:** DocWriter's branch-naming convention already accepts any
string (per existing workflows `FR-MIG-003`, `FR-MIG-007`). The only place
that parses the module code is the RequirementAnalyst's own assignment and
the frontmatter in `handoff.yaml`. No downstream breakage expected.

### R-12 [Low] Amendment step doesn't update `handoff.yaml`

`scripts/workflow-finish.sh` Step F writes the PR URL back into `handoff.yaml`
and commits. The new amendment step runs **after** Step F. If the amendment
commit doesn't include a note in `handoff.yaml.notes` or similar, post-hoc
auditability is reduced. **Mitigation:** have the amendment step append a
`context_sync_commits: N` field to `handoff.yaml` in the same commit, so the
PR shows the registry row being added.

---

## Cross-Cutting Concerns

### Does this change any agent's output contract?

**Yes — additive only.** Three contracts change:

| Agent | Old output contract | New contract |
|---|---|---|
| DocWriter (`08-doc-update.md`) | "Required updates" section only | + optional fenced-YAML `context_update:` block describing the registry row + workspace-state update to apply |
| QualityGate (`09-quality-gate.md`) | 6 named checks (Completeness, Traceability, Coverage, Security, Documentation, Branch/Commit) | + 7th check: "Context-Update Check", with `expects_registry_update` flag from handoff |
| RequirementAnalyst (module code list) | 13 codes | + `WORKFLOW` (one-line addition) |

**No** agent's existing field becomes required where it wasn't. **No**
`gate_result.status` value changes. **No** existing artifact becomes
mandatory where it wasn't.

### Does this change `protocol.md` semantics?

**No.** `protocol.md` defines the gate status enum, the workflow-finish
protocol, and the clean-tree invariant. None of those change. Step 0.5 is a
new **sub-step** between Step 0 and Step 1, not a new gate; it uses the
same gate semantics (exit 0 → advance; non-zero → blocked). The pre-push
gate checks at the bottom of `protocol.md` (lines "Pre-push gate checks")
do not need updating because Step 10 (QualityGate) is already in the list.

The new amendment sub-step in `scripts/workflow-finish.sh` is a **new step
inside the Workflow-Finish Protocol**, but it sits between Step F and Step G
in the existing table. To keep the protocol authoritative, the amendment
sub-step should be added as Step F.5 in `protocol.md` "Workflow-Finish
Protocol" table. **Recommendation:** add it. This is a 3-line edit to
`protocol.md` and brings the file count to 7 — still under the small-PR cap.

### Does this change the Orchestrator's invariants?

**Yes — minimally.** The Orchestrator now has two new responsibilities:

1. Run `scripts/check-workflow-state.sh` at the start of every workflow
   (Step 0.5). Output: exit 0 → proceed; non-zero → reconcile and re-run.
2. After Step F, when (a) QualityGate has passed and (b) a tracked
   context-update marker is present, run the amendment sub-step before
   Step G.

Neither responsibility changes the Orchestrator's *invariants*. The clean-tree
invariant is preserved (R-12 mitigation: the amendment commit is part of the
same push as Step F's commit).

---

## Test Strategy Implications

The TestStrategist and TestDesigner agents (Steps 6–7) need to update their
scope for this PR.

### Updates to existing test artifacts

- **`.copilot/agents/test-strategist.md`:** No changes needed (the agent
  already covers shell scripts and YAML markers). The strategy template must
  include **shellcheck** and **bats-core** in scope.
- **`.copilot/agents/test-designer.md`:** Add a section on test isolation for
  shell scripts: use `bats-core` with a temporary HOME / mocked git repo.
- **`.copilot/agents/test-runner.md`:** Add `shellcheck scripts/check-workflow-state.sh`
  to the pre-test suite (parallel to `pnpm biome check .`).

### New tests required

| Test file | What it tests | Owner |
|---|---|---|
| `scripts/tests/check-workflow-state.bats` | AC-1 (drift present → non-zero), AC-2 (no drift → zero), AC-8 (PowerShell stderr rule) | TestDesigner |
| `scripts/tests/workflow-finish-amend.bats` | AC-6 (marker present → amendment), AC-7 (marker absent → no-op), R-2 (no amend when ahead > 1) | TestDesigner |
| `scripts/tests/quality-gate-context.bats` | AC-3, AC-4, AC-5 (registry updated / not updated outcomes) | TestDesigner |
| `scripts/tests/orchestrator-step-0.5.bats` | Workflow-start blocking on drift, advancing on clean state | TestDesigner |
| `tools/architecture-check.ts` extension (optional) | Verify `WORKFLOW` module code is registered before any `FEAT-WORKFLOW-*` exists | CodeDeveloper (defensive) |

### Shellcheck CI gate

`scripts/check-workflow-state.sh` MUST pass `shellcheck -S warning`. If
shellcheck is not yet in CI, add a defensive guard line to `apps/web-next`
(or wherever biome runs) so the check fires on PR.

### Negative tests (bounce-back paths)

- Run workflow on a branch with a deliberately stale `workspace-state.md` →
  Step 0.5 must block, not advance.
- Run workflow-finish.sh with a malformed marker YAML → must exit non-zero
  with diagnostic naming the offending field.
- Run workflow-finish.sh with `git log origin/<branch>..HEAD --oneline | wc -l`
  = 0 (no commits to amend) → must skip amend path gracefully.

---

## Migration Plan

**No database migration required.** This is pure workflow-tooling work;
no Drizzle schema change, no Postgres extension, no Postgres index.

**No DBMigrationAuthor step is invoked.** Step 3 of the requirement-development
workflow is conditional on `DB Changes Required: yes`; for this PR the answer
is unambiguously **no**.

**No `.env` changes.** Script reads git history and tracked files; no
secrets involved.

**No infrastructure changes.** No Docker, no Authentik, no Traefik, no
Drizzle config change.

**One minor `.gitignore` consideration** if Option (A) from R-1 is chosen:
add `.copilot/context/context-update/` to `.gitignore` or remove `.copilot/`
from the existing `.gitignore` line 4 and add specific subdirectory patterns.
Recommend **Option (B)** to avoid touching `.gitignore` at all.

---

## Backwards Compatibility

**Yes — fully backwards compatible for in-flight workflows.**

| Surface | Backwards compatible? | Reason |
|---|---|---|
| Workflows started **before** this PR merges | **Yes** | Step 0.5 is a new step; existing tasks don't have a marker file, so QualityGate's `expects_registry_update` defaults to `false` (or is undefined and treated as opt-out). Amendment sub-step is a no-op when no tracked marker is present (AC-7). |
| In-flight `wf-20260623-feat-2` and `wf-20260623-fix-3` | **Yes** | They complete normally; on next workflow start, Step 0.5 fires. |
| Existing gate status enum (`passed`, `failed-retry`, etc.) | **Yes** | No new status value. Step 0.5 uses existing semantics. |
| Existing `handoff.yaml` schema | **Yes** | New optional fields (`expects_registry_update`, `context_sync_commits`) default sensibly when absent. |
| Existing `scripts/workflow-finish.sh` Step A–G behavior | **Yes** | Step F.5 is inserted; existing steps unchanged. |
| `docs/03-requirements/requirements-registry.md` table | **Yes** | DocWriter continues to update the Status column; the new mechanism is a mirror, not a replacement. |
| `tools/architecture-check.ts` | **Yes** | If extended per test plan, the extension is additive. |

**One caveat:** If `protocol.md` is updated with the new Step F.5 entry (per
"Cross-Cutting Concerns" recommendation), that is also backwards compatible —
existing references to Step F continue to work.

**Migration of in-flight workflows:** None needed. They complete under the
old contract. The first workflow to use the new contract is the next one
started after this PR merges.

---

## Gate Result

```markdown
## Gate Result

gate_result:
  status: passed
  summary: "Six files touched, all inside .copilot/ and scripts/. Zero blast radius to application code. One Medium-severity structural concern (R-1: marker file path is inside .gitignored .copilot/tasks/) flagged for CodeDeveloper to resolve before implementation; not a failed-retry because the requirement itself is sound and the fix is a single design choice between three well-defined options."
  findings:
    - "R-1 [Medium]: .context-update-marker.yaml under .copilot/tasks/ is gitignored. CodeDeveloper must choose option (A) tracked marker path, (B) inline marker in 08-doc-update.md, or (C) two-phase commit. Recommend (B) — smallest blast radius."
    - "R-2 [Medium]: amendment step must refuse `git commit --amend` unless origin/<branch>..HEAD has exactly one commit. Add `--force-with-lease`, not `--force`."
    - "R-3 [Medium]: drift detection at Step 0.5 must compare against `git show origin/<base>:<state-file>`, never against working tree or HEAD. Document this in the script header."
    - "R-4 [Medium]: QualityGate end-check needs an opt-out path for documentation-only follow-ups. Add `expects_registry_update` field to handoff.yaml (default false on read)."
    - "Cross-cutting: add Step F.5 to .copilot/schemas/protocol.md Workflow-Finish Protocol table (3-line edit, keeps protocol authoritative). Brings file count to 7, still under small-PR cap."
    - "Test scope: add bats-core tests under scripts/tests/ for the four new behaviours (drift detection, amendment, QualityGate context check, orchestrator Step 0.5). shellcheck on the new script is mandatory."
    - "Backwards compatible: in-flight workflows wf-20260623-feat-2 and wf-20260623-fix-3 complete under the old contract; new behaviour kicks in for the next workflow started after merge."
  deferred_to_feature: ""
  retry_target: ""
```

**Decision:** **passed.** The structural concern (R-1) is real but is a
**design choice for the CodeDeveloper**, not a flaw in the requirement.
Three valid options exist; the recommendation is Option (B). QualityGate
end-check (Step 10 of this workflow) will validate the chosen implementation
against AC-3, AC-4, AC-5, and AC-6.

The orchestrator should advance `current_step` from 2 to 3.
