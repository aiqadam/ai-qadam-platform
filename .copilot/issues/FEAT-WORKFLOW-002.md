---
id: FEAT-WORKFLOW-002
title: Add bats-core test suite for FEAT-WORKFLOW-001
status: resolved
severity: enhancement
module: workflow/test
parent: FEAT-WORKFLOW-001
created: 2026-06-23
resolved: 2026-06-23
resolver: wf-20260623-feat-006 (PR #15, commit 0698d1e)
---

> **Note (2026-07-02):** This issue was closed retroactively by the Orchestrator during the abandoned workflow `wf-20260702-feat-048-bats-f5-refactor`. The implementation actually shipped on 2026-06-23 in PR #15 but the registry/issue file was never updated by the original implementation workflow. See "## Resolution" below for the audit trail. AC-7 (shellcheck CI gate) was NOT shipped and is NOT formally deferred — see "## Open follow-up" below.

## Resolution

- **Workflow:** wf-20260623-feat-006 (original implementation; registered retroactively)
- **Reconciliation workflow:** wf-20260702-feat-048-bats-f5-refactor (abandoned; this issue closure)
- **Branch / PR:** `feature/FEAT-WORKFLOW-002-bats-test-suite` → PR [#15](https://github.com/tvolodi/aiqadam/pull/15) (merged 2026-06-23T06:31:29Z)
- **Tip commit:** `0698d1e` (`test(workflows): add bats-core test suite for FEAT-WORKFLOW-001`)
- **Root cause of the registry gap:** `wf-20260623-feat-006` shipped its 7-AC implementation (AC-1 through AC-6 + AC-8) but **forgot to update `.copilot/issues/registry.md` row 7 and this issue file's frontmatter as part of its Step 9 (atomic status flip, FEAT-WORKFLOW-003)**. The implementation was correct, but the bookkeeping was not. This is the exact failure mode that FEAT-WORKFLOW-001 (drift detection) was built to catch.
- **AC verification:**

  | AC | Status | Evidence |
  |---|---|---|
  | AC-1 (bats-core devDep in package.json) | ✅ shipped | [package.json:38](../package.json) `"bats": "^1.10.0"` |
  | AC-2 (pnpm test:bash script) | ✅ shipped | [package.json:23](../package.json) `"test:bash": "bash scripts/run-bats.sh scripts/tests/*.bats"` |
  | AC-3 (check-workflow-state.bats) | ✅ shipped | [scripts/tests/check-workflow-state.bats](../scripts/tests/check-workflow-state.bats) (5,519 bytes, 13 tests) |
  | AC-4 (workflow-finish-amend.bats) | ✅ shipped | [scripts/tests/workflow-finish-amend.bats](../scripts/tests/workflow-finish-amend.bats) (9,410 bytes, 10 tests) |
  | AC-5 (step-0.5-doc-presence.bats) | ✅ shipped | [scripts/tests/step-0.5-doc-presence.bats](../scripts/tests/step-0.5-doc-presence.bats) (1,391 bytes, 5 tests) |
  | AC-6 (F.5 refactor + --source-only) | ✅ shipped | [scripts/workflow-finish.sh](../scripts/workflow-finish.sh) lines 50, 235 (`--source-only` flag + `apply_context_sync_update()` function) |
  | AC-7 (shellcheck CI gate) | ❌ **dropped, not formally deferred** | shellcheck not in repo; no GPLv3 approval was obtained; `wf-20260623-feat-006` silently dropped AC-7 instead of formally deferring |
  | AC-8 (quality-gate-context.bats) | ✅ shipped | [scripts/tests/quality-gate-context.bats](../scripts/tests/quality-gate-context.bats) (5,112 bytes, 2 tests) |

  **7 of 8 ACs verified shipped on `main` as of 2026-07-02.**

## Open follow-up (not part of this issue's closure)

- **AC-7 shellcheck**: not pursued. Per AGENTS.md §8, GPLv3 dependencies require explicit user approval. The user delegated decision authority to the Orchestrator on 2026-07-02 ("Up to you") but did NOT explicitly approve GPLv3. The Orchestrator's safe default was to NOT pursue AC-7 in any future PR. **The shellcheck AC is dropped.** If the user wants to revisit, file a new issue (e.g., `FEAT-WORKFLOW-003-shellcheck-gate`) and provide explicit GPLv3 approval in chat.
- **ISS-WF-REG-001** (registry-state drift): `wf-20260623-feat-006` shipped code without flipping the registry/issue status. Filing this issue for awareness; the fix is the retroactive closure of this FEAT-WORKFLOW-002 file itself.

## Summary

FEAT-WORKFLOW-001 shipped a `scripts/check-workflow-state.sh` drift script and a Step F.5 amendment sub-step in `scripts/workflow-finish.sh` without an automated test suite. v1 was validated by 4 manual smoke tests documented in `07-test-results.md` for workflow `wf-20260623-feat-004`. This issue tracks the addition of the full test suite, deferred to keep the FEAT-WORKFLOW-001 PR under the 400-LOC small-PR cap.

## Acceptance criteria

1. **`bats-core` declared as a root devDependency** in `package.json` (^1.10.0). Per AGENTS.md §8: weekly downloads >10k (bats has 1M+), last update <6 months, license MIT, free.
2. **`pnpm test:bash` script** added to root `package.json` running `bats scripts/tests/*.bats`.
3. **`scripts/tests/check-workflow-state.bats`** — covers AC-1 (drift present → exit 1), AC-2 (no drift → exit 0), AC-8 (PowerShell stderr rule), AC-10 (shellcheck).
4. **`scripts/tests/workflow-finish-amend.bats`** — covers AC-6 (marker present → amendment) and AC-7 (marker absent → no-op). Requires the F.5 refactor below.
5. **`scripts/tests/step-0.5-doc-presence.bats`** — covers AC-9 (Step 0.5 string in both workflow files).
6. **F.5 refactor** — extract the F.5 inline block in `scripts/workflow-finish.sh` into a callable `apply_context_sync_update()` function with explicit args (`$handoff`, `$workflow_dir`, `$workspace_state`, `$branch`). Add a `--source-only` flag that bails out after defining functions, for testability.
7. **`shellcheck` added to CI** — gate `scripts/check-workflow-state.sh` and the new F.5 sub-step on `shellcheck -S warning`. If shellcheck is not currently in CI, add a `lint:shell` script and wire it into the existing `pnpm lint` chain.
8. **QualityGate end-to-end test harness** — a new bats file `scripts/tests/quality-gate-context.bats` that exercises the QualityGate "Context-Update Check" sub-check. This is the only AC that requires running a full workflow with a real PR; the harness mocks the diff and exercises the check directly.

## Out of scope

- Drift script performance / load tests.
- Cross-platform macOS / Windows native shell tests (POSIX bash only, consistent with `workflow-finish.sh`).
- Reconciliation command (`--reconcile` flag) — manual reconciliation is acceptable.

## Notes

- The full design (test files, refactor, schema additions) is in
  `wf-20260623-feat-004/06-test-design.md` Appendix.
- bats-core is a single GitHub project: https://github.com/bats-core/bats-core
- shellcheck is similarly maintained: https://github.com/koalaman/shellcheck (GPLv3 — needs explicit user approval per AGENTS.md §8). **Open question for the user**: do we accept shellcheck's GPLv3 dependency, or use an alternative?
