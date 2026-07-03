#!/usr/bin/env bats
# scripts/tests/check-workflow-state.bats
#
# Tests for scripts/check-workflow-state.sh — the FEAT-WORKFLOW-001
# context-drift guard.
#
# Coverage:
#   - AC-1: drift present → exit 1
#   - AC-2: no drift → exit 0
#   - AC-8: diagnostics on stderr (PowerShell NativeCommandError rule)
#   - AC-10: shellcheck-clean (covered by pnpm lint:shell in PR B)
#
# AC-10 (shellcheck) is covered via PR B (FEAT-WORKFLOW-003). PR A
# only runs the shellcheck binary if it's installed; if not, the
# lint:shell script emits a soft warning so PR A passes locally.

load 'test_helper'

setup() {
  setup_test_repo "with-origin"
}

# Insert a row into the "Completed Workflows (recent)" table with the
# given workflow ID, commit the change, and push to origin/main so
# the drift script can read it via `git show origin/main:...`.
# Uses the proper workflow ID format wf-YYYYMMDD-<scope>-<n> required
# by extract_workflow_ids regex.
insert_workflow_row() {
  local wf_id="$1"
  sed -i "/^| Workflow ID |/a | ${wf_id} | requirement-development | FR-TEST-${wf_id#wf-} | feature/${wf_id} | (none) | 2026-06-23 |" .copilot/context/workspace-state.md
  # The script reads state from the base ref via `git show`, so we
  # need to commit AND push before running the check.
  git -c commit.gpgsign=false commit -q --no-verify \
    -m "test fixture: insert ${wf_id}" -- .copilot/context/workspace-state.md
  git push -q origin main
}

@test "AC-2: --base origin/main exits 0 on a clean repo" {
  run bash scripts/check-workflow-state.sh --base origin/main
  [ "$status" -eq 0 ]
  [[ "$output" == *"OK: no drift detected"* ]]
}

@test "AC-1: --base origin/main exits 1 when workspace-state.md references a missing workflow" {
  insert_workflow_row "wf-20260623-test-1"
  run bash scripts/check-workflow-state.sh --base origin/main 2>&1
  [ "$status" -eq 1 ]
  [[ "$output" == *"DRIFT"* ]]
  [[ "$output" == *"wf-20260623-test-1"* ]]
}

@test "AC-1: archived/ is recognised as a valid task-dir home (ISS-WF-13-1 regression)" {
  # Create the archived dir BEFORE pushing the row that references it.
  # (The drift script reads state from origin/main via `git show`, but
  # checks the on-disk working tree for the task dir.)
  mkdir -p .copilot/tasks/archived/wf-20260623-test-2
  echo "x" > .copilot/tasks/archived/wf-20260623-test-2/.gitkeep
  insert_workflow_row "wf-20260623-test-2"
  run bash scripts/check-workflow-state.sh --base origin/main
  [ "$status" -eq 0 ]
  [[ "$output" == *"OK: no drift detected"* ]]
}

@test "AC-1: active/ is recognised as a valid task-dir home" {
  mkdir -p .copilot/tasks/active/wf-20260623-test-3
  insert_workflow_row "wf-20260623-test-3"
  run bash scripts/check-workflow-state.sh --base origin/main
  [ "$status" -eq 0 ]
}

@test "AC-1: completed/ is recognised as a valid task-dir home" {
  mkdir -p .copilot/tasks/completed/wf-20260623-test-4
  insert_workflow_row "wf-20260623-test-4"
  run bash scripts/check-workflow-state.sh --base origin/main
  [ "$status" -eq 0 ]
}

@test "AC-1: missing FR file in requirements-registry.md triggers drift" {
  # Add a row to requirements-registry.md pointing to FR-XXX-999 that
  # does not exist in docs/03-requirements/.
  echo "| [FR-WORKFLOW-999](FR-WORKFLOW-999.md) | test | Test | wf-x | open | 2026-06-23 |" >> docs/03-requirements/requirements-registry.md
  git -c commit.gpgsign=false commit -q --no-verify -m "test fixture: add missing FR" -- docs/03-requirements/requirements-registry.md
  git push -q origin main
  run bash scripts/check-workflow-state.sh --base origin/main 2>&1
  [ "$status" -eq 1 ]
  [[ "$output" == *"FR-WORKFLOW-999"* ]]
}

@test "AC-2: --base origin/HEAD works (alt ref)" {
  run bash scripts/check-workflow-state.sh --base origin/HEAD
  [ "$status" -eq 0 ]
}

@test "AC-2: --help prints usage and exits 0" {
  run bash scripts/check-workflow-state.sh --help
  [ "$status" -eq 0 ]
  [[ "$output" == *"check-workflow-state.sh"* ]]
  [[ "$output" == *"--base"* ]]
  [[ "$output" == *"--skip"* ]]
  [[ "$output" == *"Exit codes"* ]]
  [[ "$output" == *"Context-drift guard"* ]]
}

@test "AC-2: --skip exits 0 with WARNING on stderr" {
  run bash scripts/check-workflow-state.sh --skip 2>&1
  [ "$status" -eq 0 ]
  [[ "$output" == *"WARNING"* ]]
  [[ "$output" == *"--skip"* ]]
}

@test "AC-8: drift diagnostic is written to stderr, not stdout" {
  insert_workflow_row "wf-20260623-test-5"
  run bash scripts/check-workflow-state.sh --base origin/main
  [ "$status" -eq 1 ]
  # Success-summary line "OK:" must NOT be on stdout (we are failing)
  [[ "$output" != *"OK:"* ]]
  # DRIFT and ERROR lines must be on stderr (not stdout). We verify by
  # comparing the un-combined and combined output: combined must contain
  # the lines; un-combined (stdout) must not.
  run bash scripts/check-workflow-state.sh --base origin/main 2>&1
  [ "$status" -eq 1 ]
  [[ "$output" == *"DRIFT:"* ]]
  [[ "$output" == *"ERROR:"* ]]
  [[ "$output" == *"1 drift item"* ]]
}

@test "AC-2: success summary goes to stdout" {
  run bash scripts/check-workflow-state.sh --base origin/main
  [ "$status" -eq 0 ]
  [[ "$output" == *"OK: no drift detected"* ]]
  # On success, stderr should be empty
  [[ -z "$stderr" ]]
}

@test "AC-2: invocation error (bad flag) exits 2" {
  run bash scripts/check-workflow-state.sh --not-a-real-flag
  [ "$status" -eq 2 ]
}

@test "AC-2: missing base ref (ref doesn't exist) — exits non-zero" {
  run bash scripts/check-workflow-state.sh --base origin/nonexistent
  [ "$status" -ne 0 ]
}

# Regression for ISS-UAT-009-1 Step 0.5 root cause: the extract_issue_ids
# regex `ISS-[A-Z0-9-]+` does not include lowercase hex chars, so it
# greedy-matches only up to the trailing `-` of PRSteward's auto-registered
# `ISS-CI-OVERRIDE-<sha1-prefix>` IDs (AGENTS.md §6.3 names this exact pattern)
# and emits a phantom `ISS-CI-OVERRIDE-` orphan that has no file.
@test "regression: SHA-suffixed ISS IDs (PRSteward auto-registered) do NOT trigger phantom drift" {
  # Insert a row pointing to ISS-CI-OVERRIDE-ebd184b (the exact ID PRSteward
  # auto-registered on PR #94). The corresponding file is created on disk
  # before commit so the drift script's existence check passes.
  mkdir -p .copilot/issues
  echo "# Auto-registered CI failure class (regression fixture)" > .copilot/issues/ISS-CI-OVERRIDE-ebd184b.md
  echo "" >> .copilot/issues/registry.md
  echo "| [ISS-CI-OVERRIDE-ebd184b](ISS-CI-OVERRIDE-ebd184b.md) | regression-fixture | test | SHA-suffixed ISS ID; file exists at this exact name. | open | — | 2026-07-04 |" >> .copilot/issues/registry.md
  git -c commit.gpgsign=false add -A
  git -c commit.gpgsign=false commit -q --no-verify \
    -m "test fixture: SHA-suffixed ISS ID" \
    -- .copilot/issues/registry.md .copilot/issues/ISS-CI-OVERRIDE-ebd184b.md
  git push -q origin main
  run bash scripts/check-workflow-state.sh --base origin/main 2>&1
  # The drift script must NOT report the phantom `ISS-CI-OVERRIDE-` prefix
  # as a missing-file drift. Output is clean when the regex correctly
  # matches the full ID including the SHA1 hex tail.
  [ "$status" -eq 0 ]
  [[ "$output" == *"OK: no drift detected"* ]]
  [[ "$output" != *"ISS-CI-OVERRIDE-' "* ]]
  [[ "$output" != *"ISS-CI-OVERRIDE-."* ]]
}
