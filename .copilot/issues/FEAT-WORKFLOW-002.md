---
id: FEAT-WORKFLOW-002
title: Add bats-core test suite for FEAT-WORKFLOW-001
status: open
severity: enhancement
module: workflow/test
parent: FEAT-WORKFLOW-001
created: 2026-06-23
---

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
