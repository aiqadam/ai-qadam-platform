# Step 7 — Test Design (FEAT-WORKFLOW-002)

**Workflow:** wf-20260623-feat-006
**Author:** Orchestrator

This document describes the test cases at the level of inputs,
expected outputs, and why each one exists. It is the design
companion to the test files in `scripts/tests/`.

## scripts/tests/test_helper.bash

Shared fixture and assertion library. Not a test file itself.

### `setup_test_repo <repo_type>`

| Input | Effect |
|---|---|
| `"with-origin"` (default) | Creates `BATS_TEST_TMPDIR/repo` (git init), `BATS_TEST_TMPDIR/origin` (bare git init -b main), configures `remote add origin`, pushes initial main, sets `origin/HEAD` to main |
| `"local-only"` | Same but no remote. Useful for tests that don't push |

State files seeded:
- `.copilot/context/workspace-state.md` — full template with empty tables
- `.copilot/issues/registry.md` — header + empty table
- `docs/03-requirements/requirements-registry.md` — header + empty table
- `.copilot/tasks/{active,completed,archived}/` — empty dirs

Scripts copied from project root:
- `scripts/check-workflow-state.sh`
- `scripts/workflow-finish.sh`

### Assertions

- `assert_exit_code <expected> <cmd...>` — runs `cmd` and asserts exit
- `assert_file_contains <file> <regex>` — fails if `file` does not match
- `assert_file_not_contains <file> <regex>` — fails if `file` matches
- `assert_stderr_contains` / `assert_stdout_contains` — for tests that
  need to inspect AC-8 (PowerShell stderr rule)

## scripts/tests/check-workflow-state.bats (13 tests)

### AC-1: drift present

| Test | Setup | Assertion |
|---|---|---|
| `exit 1 when workspace-state.md references a missing workflow` | Insert row `wf-20260623-test-1`, commit, push | exit 1, output contains `DRIFT` and `wf-20260623-test-1` |
| `archived/ is recognised as a valid task-dir home (ISS-WF-13-1 regression)` | Create `archived/wf-20260623-test-2/` first, THEN push the row referencing it | exit 0, output contains `OK: no drift detected` |
| `active/ is recognised as a valid task-dir home` | Create `active/wf-20260623-test-3/`, push row | exit 0 |
| `completed/ is recognised as a valid task-dir home` | Create `completed/wf-20260623-test-4/`, push row | exit 0 |
| `missing FR file in requirements-registry.md triggers drift` | Append row to requirements-registry.md pointing to non-existent `FR-WORKFLOW-999.md`, push | exit 1, output contains `FR-WORKFLOW-999` |

### AC-2: drift clean / no-op

| Test | Setup | Assertion |
|---|---|---|
| `--base origin/main exits 0 on a clean repo` | Default fixture, no rows | exit 0, output contains `OK: no drift detected` |
| `--base origin/HEAD works (alt ref)` | Default fixture | exit 0 (verifies `origin/HEAD` resolution) |
| `--help prints usage and exits 0` | None | exit 0, output contains script name + flags + "Exit codes" + "Context-drift guard" |
| `--skip exits 0 with WARNING on stderr` | None | exit 0, output contains `WARNING` and `bypassing drift check` |
| `success summary goes to stdout` | Default fixture | exit 0, output contains `OK:` |
| `invocation error (bad flag) exits 2` | `--bogus` | exit 2, output contains `unknown` (or similar) |
| `missing base ref (ref doesn't exist) — exits non-zero` | `--base origin/does-not-exist` | exit 1 |

### AC-8: PowerShell stderr rule

| Test | Setup | Assertion |
|---|---|---|
| `drift diagnostic is written to stderr, not stdout` | Insert row, push | `run ...` (stdout only) does NOT contain `DRIFT:`; `run ... 2>&1` (combined) DOES contain `DRIFT:` and `ERROR:` |

## scripts/tests/workflow-finish-amend.bats (10 tests)

### AC-6: F.5 happy path

| Test | Setup | Assertion |
|---|---|---|
| `marker present + gate passed → registry row applied` | Workflow dir with gate=`status: passed`, doc-update with `context_update:` block referencing `FR-WORKFLOW-001` | `apply_context_sync_update` exits 0; `registry.md` contains `FR-WORKFLOW-001` |
| `marker present + gate passed → workspace-state row applied` | Same setup | `workspace-state.md` contains `wf-20260623-feat-006` row in `## Completed Workflows (recent)` |
| `idempotency — applying twice does not duplicate registry row` | Apply, then re-apply | `grep -c FR-WORKFLOW-001` is `1` after first and `1` after second |
| `missing registry_file in context_update block → ERROR to stderr` | doc-update with block missing `registry_file:` | exit 1, output contains `ERROR` and `registry_file` |
| `extract_context_block reads the right YAML` | Direct call to `extract_context_block` on doc-update | output contains `registry_file:` and `workspace_state_section:`; does NOT contain `^context_update:` (since stripped) |
| `parse_context_block populates CTX_* globals` | Direct call to `parse_context_block` with extracted text | `CTX_REGISTRY_FILE=.copilot/issues/registry.md`, `CTX_REGISTRY_ROW` contains `FR-WORKFLOW-001`, `CTX_WS_SECTION=Completed Workflows (recent)`, `CTX_WS_ROW` contains `wf-20260623-feat-006` |
| `workspace_state row is inserted into the named section, not at end` | Apply once | `grep -n 'wf-20260623-feat-006'` returns a line number LESS than the line of `^## Open Issues` |

### AC-7: F.5 no-op

| Test | Setup | Assertion |
|---|---|---|
| `marker absent (no context_update block) → no-op` | doc-update with no `context_update:` fence | exit 0, no files modified |
| `gate not passed → no-op` | Gate has `status: failed` | exit 0, no files modified |
| `expects_registry_update: false → no-op` | handoff has `expects_registry_update: false` | exit 0, no files modified |

## scripts/tests/quality-gate-context.bats (2 tests)

End-to-end harness for the QualityGate "Context-Update Check" sub-check
(the real QualityGate runs in `10-quality-gate.md` and is reviewed by
a subagent — bats cannot invoke a subagent, so we re-implement the
check in pure bash).

| Test | Setup | Assertion |
|---|---|---|
| `PR diff that updates registry row passes the context-update check` | Apply context sync; diff against `origin/main` | `git diff --name-only origin/main..HEAD` includes both `registry.md` and `workspace-state.md` |
| `PR diff that does NOT update the registry fails the check` | Apply context sync; revert registry to `HEAD~2` (pre-sync state) | `registry.md` does NOT contain `FR-WORKFLOW-001`, but `workspace-state.md` does |

## scripts/tests/step-0.5-doc-presence.bats (5 tests)

Verifies that the scripts reference the right keywords so that a
human reading them can find the F.5 / Step 0.5 documentation.

| Test | Assertion |
|---|---|
| `'Step 0.5' appears in scripts/check-workflow-state.sh` | `grep -nE 'Step 0.5'` succeeds |
| `'F.5' (Context Sync amendment step) appears in scripts/workflow-finish.sh` | `grep -nE '\bF\.5\b'` succeeds |
| `'FEAT-WORKFLOW-001' appears in both scripts` | `grep -nE 'FEAT-WORKFLOW-001'` succeeds in both |
| `'context_update' (with the underscore) appears in workflow-finish.sh` | `grep -nE 'context_update'` succeeds |
| `check-workflow-state.sh documents its role in Step 0.5` | `grep -nE 'Step 0.5|Context Sync'` succeeds |

## Why this design

1. **No mocking.** Every test runs the real script against a fresh
   real git repo. The drift script's behaviour is intrinsically tied
   to git refs and state files, so mocking would defeat the purpose.

2. **One assertion per behaviour.** Each test asserts one specific
   behaviour. This makes failures self-explanatory.

3. **stderr is checked by combining via `2>&1`.** bats 1.13.0 does
   not separate stderr into `$stderr` by default (it goes into
   `$output`). The AC-8 test uses a paired `run ...` (stdout only)
   vs `run ... 2>&1` (combined) pattern to assert that the
   diagnostic is NOT on stdout and IS on stderr.

4. **Helper functions are unit-tested separately.** The
   `extract_context_block` and `parse_context_block` tests are
   short (5-7 lines each) and run in the same shell as the source
   script. They serve as living documentation of the input/output
   contract.

5. **No E2E Playwright tests.** This PR is CI/tooling, not user-facing.
   E2E tests would be redundant — there is no UI to click through.
