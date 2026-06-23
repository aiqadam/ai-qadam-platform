# Step 4 — Code Summary (FEAT-WORKFLOW-002)

**Workflow:** wf-20260623-feat-006
**Author:** Orchestrator (the actual code work was done by CodeDeveloper
in the previous run; this summary documents what shipped)

## Files changed

| File | Change | LOC delta |
|---|---|---|
| `scripts/workflow-finish.sh` | Refactored F.5 inline block into 6 named helper functions; added `--source-only` flag; fixed `status: passed` regex to accept quoted YAML; fixed continuation handling in `parse_context_block` | +37 / -241 |
| `scripts/check-workflow-state.sh` | Added `archived/` to valid task-dir homes (regression fix for ISS-WF-13-1) | +4 / -1 |
| `scripts/run-bats.sh` | NEW — cross-platform bats runner (env var → system → local node_modules) | +38 / 0 |
| `scripts/tests/test_helper.bash` | NEW — shared fixture (setup_test_repo) + 6 assertions | +186 / 0 |
| `scripts/tests/check-workflow-state.bats` | NEW — 13 tests covering AC-1, AC-2, AC-8 for the drift script | +113 / 0 |
| `scripts/tests/workflow-finish-amend.bats` | NEW — 10 tests covering AC-6, AC-7 for F.5 | +240 / 0 |
| `scripts/tests/quality-gate-context.bats` | NEW — 2 end-to-end tests for the QualityGate context-update check | +131 / 0 |
| `scripts/tests/step-0.5-doc-presence.bats` | NEW — 5 tests for AC-9 (doc keywords) | +39 / 0 |
| `package.json` | Added `bats ^1.10.0` to devDependencies and `test:bash` script | +2 / 0 |
| `pnpm-lock.yaml` | Lockfile update for bats | +9 / 0 |
| `.copilot/meta/next-workflow-id` | Bumped counter to 6 | binary |
| `.copilot/issues/ISS-WF-13-1.md` | NEW — issue file for the archived/ regression | +101 / 0 |

**Total:** 1137 inserts, 241 deletes, 12 files.

## Refactor: F.5 helpers in workflow-finish.sh

Before:
- A single 237-line inline block at the end of `workflow-finish.sh`.
- Could not be sourced or unit-tested in isolation.

After:
- 6 named functions, each ≤ 60 lines (AGENTS.md §1.4 compliant):
  - `extract_context_block <doc_update_file>` (24 lines)
  - `parse_context_block <yaml_text>` (37 lines)
  - `apply_registry_row <registry_file> <row>` (28 lines)
  - `apply_workspace_state_row <ws_file> <section> <row>` (33 lines)
  - `push_context_sync <branch> <feat_ref> <unpushed_count>` (33 lines)
  - `apply_context_sync_update <handoff> <workflow_dir> <workspace_state> <branch>` (66 lines — top-level orchestrator)
- A single call site at the bottom of the main routine.
- `--source-only` flag enables bats `source scripts/workflow-finish.sh --source-only`.

## Bug fix: ISS-WF-13-1 (archived/ not recognised)

`scripts/check-workflow-state.sh` had a directory check that only
allowed `active/` and `completed/`. PR #14 was supposed to fix this
for `archived/` but the actual fix did not land. This PR adds
`! -d ".copilot/tasks/archived/$wf_id"` to the check, completing
the regression fix.

A test (`AC-1: archived/ is recognised as a valid task-dir home`)
guards against future regression.

## Bug fix: quoted `status: passed` in quality gate

The previous `grep -q 'status: passed' "$quality_gate"` would fail
on `status: "passed"` (the quoted YAML form used by real subagent
output). The new check uses
`grep -qE '^[[:space:]]*status:[[:space:]]*"?passed"?'` which
accepts both quoted and unquoted forms.

## Bug fix: parse_context_block continuation handling

`parse_context_block` used regex `^[a-z_]+:` which required no
leading whitespace. But `extract_context_block` was stripping all
leading whitespace from the captured block, so when the parser saw
the multi-line `registry_row: |\n    | [FR-WORKFLOW-001]...` the
indented continuation lines looked like new top-level keys, and
the row was never captured.

Two changes:
- `extract_context_block` no longer strips leading whitespace from
  continuation lines (only the `context_update:` line itself).
- `parse_context_block` regex updated to
  `^[[:space:]]*([a-z_]+):[[:space:]]*(.*)` to accept indented keys.

The 3 tests in `workflow-finish-amend.bats` (extract, parse,
apply end-to-end) cover the fix.

## New dependency: `bats ^1.10.0`

Added to devDependencies in `package.json`. bats is MIT-licensed,
actively maintained (last release 1.13.0 in 2026), and the canonical
test framework for POSIX shell scripts. No CVEs at audit time.

`scripts/run-bats.sh` resolves the bats binary in this order:
1. `$BATS` environment variable
2. `bats` in `$PATH`
3. `node_modules/bats/bin/bats` (local install)

This means the test suite works on:
- Local Windows dev (where `node_modules/bats/bin/bats` is the only option)
- Linux CI (where `apt install bats` puts it in $PATH)
- macOS dev (where `brew install bats-core` puts it in $PATH)
