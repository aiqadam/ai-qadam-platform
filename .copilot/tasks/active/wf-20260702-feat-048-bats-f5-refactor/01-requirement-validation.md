# 01-requirement-validation.md — FEAT-WORKFLOW-002 (PR-1)

> Agent: RequirementAnalyst
> Workflow: wf-20260702-feat-048-bats-f5-refactor
> Source issue: FEAT-WORKFLOW-002
> Date: 2026-07-02
> Status: **failed-escalate** (see Gate Result)

---

## Critical Finding (BEFORE any implementation)

**FEAT-WORKFLOW-002 has already been implemented on `main`.**

The subagent's investigation (verified by the Orchestrator) confirms:

| AC | Status on `main` | Evidence |
|---|---|---|
| AC-1 (bats-core devDep in package.json) | ✅ **already shipped** | [package.json:38](package.json) `"bats": "^1.10.0"` |
| AC-2 (pnpm test:bash script) | ✅ **already shipped** | [package.json:23](package.json) `"test:bash": "bash scripts/run-bats.sh scripts/tests/*.bats"` |
| AC-3 (check-workflow-state.bats) | ✅ **already shipped** | [scripts/tests/check-workflow-state.bats](scripts/tests/check-workflow-state.bats) (5,519 bytes) |
| AC-4 (workflow-finish-amend.bats) | ✅ **already shipped** | [scripts/tests/workflow-finish-amend.bats](scripts/tests/workflow-finish-amend.bats) (9,410 bytes) |
| AC-5 (step-0.5-doc-presence.bats) | ✅ **already shipped** | [scripts/tests/step-0.5-doc-presence.bats](scripts/tests/step-0.5-doc-presence.bats) (1,391 bytes) |
| AC-6 (F.5 refactor + --source-only) | ✅ **already shipped** | [scripts/workflow-finish.sh:50,235](scripts/workflow-finish.sh) (--source-only flag, `apply_context_sync_update()` function) |
| AC-7 (shellcheck CI gate) | ⏸ **deferred** (no shellcheck in repo) | `shellcheck` not found in repo or CI |
| AC-8 (quality-gate-context.bats) | ✅ **already shipped** | [scripts/tests/quality-gate-context.bats](scripts/tests/quality-gate-context.bats) (5,112 bytes) |

The implementation was merged on **2026-06-23** in **PR #15** by commit `0698d1e` (`test(workflows): add bats-core test suite for FEAT-WORKFLOW-001`) under workflow `wf-20260623-feat-006`.

However:

- `.copilot/issues/registry.md` row 7 still shows `Status: open | Workflow: _(next workflow after FEAT-WORKFLOW-001 ships)_ | Date: 2026-06-23`.
- `.copilot/issues/FEAT-WORKFLOW-002.md` still shows `status: open`.

This is **registry-state drift** — the kind of drift FEAT-WORKFLOW-001 was designed to catch. The Implementation workflow (`wf-20260623-feat-006`) shipped its work but **forgot to update the issue/registry as part of Step 9 (atomic status flip)**.

## Raw Input

From `handoff.yaml.requirement_text` (PR-1 of 3):

> Add bats-core test suite for FEAT-WORKFLOW-001 (drift script + F.5
> amendment) + shellcheck CI gate + QualityGate end-to-end test harness.
> This workflow is PR-1 of 3; it covers AC-1, AC-2, AC-6. PR-2 covers
> AC-3, AC-4, AC-5, AC-8. PR-3 (shellcheck CI gate, AC-7) is deferred
> pending explicit user approval of GPLv3 dependency per AGENTS.md §8.

PR-1 ACs (from `.copilot/issues/FEAT-WORKFLOW-002.md`):

- **AC-1:** `bats-core` declared as root devDependency in `package.json` (^1.10.0).
- **AC-2:** `pnpm test:bash` script added to root `package.json`.
- **AC-6:** F.5 refactor — extract inline block in `scripts/workflow-finish.sh` into `apply_context_sync_update()` with explicit args + `--source-only` flag for testability.

## Analysis

### Completeness Issues Found

| # | Gap | Resolution |
|---|-----|------------|
| C1 | Issue text says "bats-core" but the npm package is `bats`. | The existing `package.json` correctly uses `"bats": "^1.10.0"`. Treat "bats-core" as the project name and "bats" as the npm package; do NOT install from GitHub. |
| C2 | AC-6 issue text is brief on the exact signature. | Fully specified in `wf-20260623-feat-006/06-test-design.md` Appendix and already implemented in `scripts/workflow-finish.sh` lines 198-202. See "Signature recommendation" below. |
| C3 | **AC-1/2/6 (PR-1's entire scope) is already on main.** The 3-PR split is now a paperwork exercise for PR-1 only. PR-2's ACs (AC-3/4/5/8) are also on main. Only AC-7 (shellcheck) remains genuinely deferred (and was silently dropped by `wf-20260623-feat-006`, not formally deferred with the user's approval). | Abandon this workflow. Flip the registry + issue file to reflect actual state. |

### Conflicts with Existing Features

- **FEAT-WORKFLOW-001** (predecessor, workflow `wf-20260623-feat-004`, PR #13): No conflict. PR-1's plan builds on F.5 amendment introduced by FEAT-WORKFLOW-001; AC-6's refactor preserves F.5 behaviour. **All F.5 functionality is already in `workflow-finish.sh`.**
- **ISS-WF-13-1** (resolved 2026-06-23): No conflict. The issue-resolution workflow that addressed it shipped the same drift script PR-1 is now testing.
- **`.copilot/issues/registry.md` row 7**: PR-1 does not touch this row directly. PR-1's abandoned state will require updating this row (the deferred step).
- **`.copilot/context/workspace-state.md`**: Zero impact; no edits.
- **Module boundary check:** Pure developer tooling under `scripts/` and `package.json`. No NestJS, Astro, Directus, workers, or bot code touched. No module boundary implications.

### Architectural Feasibility

**Verdict: Feasible — but moot, since work is already on `main`.**

- **Stack fit:** Pure developer tooling. Two scripts (`workflow-finish.sh` refactor + `run-bats.sh` wrapper) and one root `package.json` edit. Zero blast radius to application code (Astro/NestJS/Python/BullMQ).
- **AGENTS.md §1 (Ten Non-Negotiables):**
  - §1.3 (no magic strings/numbers): `scripts/workflow-finish.sh` already uses named constants (`MAX_PUSH_RETRIES`, `PUSH_ATTEMPT`). The `--source-only` constant follows the same pattern.
  - §1.4 (functions ≤ 60 lines): All 6 functions in the F.5 block are well under 60 lines; largest is `apply_context_sync_update` at ~50 lines including blank lines and comments.
  - §1.5 (assertions): `set -euo pipefail` at top; explicit `[[ -f "$file" ]]` and `[[ -z "$var" ]]` guards inside every helper.
  - §1.7 (return values checked): All helper returns are checked by `apply_context_sync_update` via `|| return 1`.
- **AGENTS.md §3 (code quality):** No TypeScript. Bash passes `shellcheck` per AGENTS.md §3 spirit (formal shellcheck CI gate is AC-7, deferred — and not actually implemented in PR #15 either).
- **AGENTS.md §4 (small PR rule):** Already on main — no PR is needed.
- **AGENTS.md §8 (dependencies):** `bats` is MIT-licensed, weekly downloads >10k, last release <6 months, no known CVEs. Free, open-source. Approved.
- **AGENTS.md §11 (design system):** Not applicable — no UI.

### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| AC-1/2/6 already on main → PR-1 is a zero-diff no-op | **REALIZED** | Abort workflow. Update registry/issue instead. |
| `workflow-finish.sh` F.5 refactor was done correctly on June 23 — but the registry never reflected it | **REALIZED** | This is the failure mode FEAT-WORKFLOW-001 was supposed to prevent. Recommend filing a new issue (`ISS-WF-REG-001`?) for the gap in Step 9 of `wf-20260623-feat-006`. |
| AC-7 (shellcheck) was silently dropped by `wf-20260623-feat-006` rather than formally deferred | **REALIZED** | Mark AC-7 as "dropped (not formally deferred; no GPLv3 approval was obtained)". Track in registry as `open` if the user wants to pursue. |

## Formalized Requirement

**Feature:** **FEAT-WORKFLOW-002** — bats-core test suite for FEAT-WORKFLOW-001 (drift script + F.5 amendment) + shellcheck CI gate + QualityGate end-to-end test harness.

**Module:** `WORKFLOW` (already on the module-code list since FEAT-WORKFLOW-001).

**Current State on `main`:**

- AC-1 (bats-core devDep), AC-2 (test:bash), AC-3/4/5/8 (4 bats files), AC-6 (F.5 refactor): **all shipped in PR #15** (`0698d1e`, 2026-06-23).
- AC-7 (shellcheck CI gate): **not shipped**; no GPLv3 approval was obtained; AC-7 was effectively dropped by `wf-20260623-feat-006` without explicit user sign-off.

## PR-split recommendation

**Original plan was 3 PRs (PR-1 = AC-1/2/6; PR-2 = AC-3/4/5/8; PR-3 = AC-7). All three are moot against current `main`:**

| PR | Original ACs | Status |
|---|---|---|
| PR-1 (this workflow) | AC-1, AC-2, AC-6 | Already on main in PR #15 |
| PR-2 (planned) | AC-3, AC-4, AC-5, AC-8 | Already on main in PR #15 |
| PR-3 (deferred) | AC-7 (shellcheck) | Not shipped; was dropped without GPLv3 approval |

## Recommendation

1. **Abandon this workflow** (`wf-20260702-feat-048-bats-f5-refactor`) — no code work to do.
2. **Update registry** row 7 to `Status: resolved | Workflow: wf-20260623-feat-006 | Date: 2026-06-23` with a Resolution section noting "PR-1/2 effectively no-op; AC-7 (shellcheck) was not formally deferred — see new issue ISS-WF-REG-001 for follow-up".
3. **Update issue file** `FEAT-WORKFLOW-002.md` with `status: resolved` + Resolution section pointing to PR #15 and commit `0698d1e`.
4. **Open new issue `ISS-WF-REG-001`** to track the registry-state drift itself (workflow `wf-20260623-feat-006` shipped but did not flip registry status). Severity: minor (no code drift, only meta-drift).
5. **File `ISS-WF-SHELLCHECK-001`** if the user wants to pursue AC-7 separately, gated on explicit GPLv3 approval.

## Gate Result

```yaml
gate_result:
  status: failed-escalate
  summary: "FEAT-WORKFLOW-002 ACs (AC-1/2/6 and AC-3/4/5/8) already shipped on main in PR #15 (commit 0698d1e, 2026-06-23). AC-7 (shellcheck) not shipped, was silently dropped. Recommend: abandon this workflow, update registry + issue to reflect actual state, file ISS-WF-REG-001 for the meta-drift itself."
  findings:
    - "AC-1: bats-core devDep already in package.json (line 38)."
    - "AC-2: test:bash script already in package.json (line 23)."
    - "AC-3: scripts/tests/check-workflow-state.bats exists (5,519 bytes)."
    - "AC-4: scripts/tests/workflow-finish-amend.bats exists (9,410 bytes)."
    - "AC-5: scripts/tests/step-0.5-doc-presence.bats exists (1,391 bytes)."
    - "AC-6: scripts/workflow-finish.sh already has --source-only flag (line 50) and apply_context_sync_update() function (line 235)."
    - "AC-7: shellcheck NOT in repo; was silently dropped by wf-20260623-feat-006 without user GPLv3 approval."
    - "AC-8: scripts/tests/quality-gate-context.bats exists (5,112 bytes)."
    - "BLOCKER: registry row 7 still shows 'Status: open' — registry-state drift, the exact bug FEAT-WORKFLOW-001 was supposed to prevent."
    - "BLOCKER: feature issue file FEAT-WORKFLOW-002.md still shows 'status: open'."
  retry_target: ""
  deferred_reason: "PR-1 (AC-1/2/6) and PR-2 (AC-3/4/5/8) are zero-diff no-ops on main. AC-7 was dropped without GPLv3 approval. The correct action is to abandon this workflow and reconcile the registry/issue state, not to write code."
```