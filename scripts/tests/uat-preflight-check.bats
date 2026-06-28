#!/usr/bin/env bats
# scripts/tests/uat-preflight-check.bats
#
# Regression tests for scripts/uat-preflight-check.sh — the process-identity
# probe introduced for ISS-UAT-013-2.
#
# These tests use the `UAT_PREFLIGHT_PROBE_OUTPUT` (and friends) test hook
# to inject synthetic probe results. They therefore do NOT exercise the
# real PowerShell / lsof paths — those are exercised in CI on the matching
# platform. See scripts/uat-preflight-check.sh header for the test-hook
# contract and Known Limitations in 03-code-summary.md.
#
# Stream-capture convention
# ─────────────────────────
# On the bats version pinned in package.json (^1.10.0), `run ... 2>&1`
# merges stderr into the captured `$output`. The helper writes its
# diagnostics to stderr (PowerShell-friendly per AGENTS.md / check-workflow-
# state.sh convention), so each failing-path test merges the streams. This
# matches the pattern already used by check-workflow-state.bats (AC-8).
#
# Coverage:
#   - AC-1: missing args exits non-zero with usage
#   - AC-2: --help exits 0 with usage
#   - AC-3: unbound port (probe returns empty PID) exits non-zero
#   - AC-4: foreign service (substring mismatch) exits non-zero with explicit
#           CommandLine that includes the foreign PID and the foreign path
#   - AC-5: expected service (substring match) exits 0
#   - AC-6: probe failure (PowerShell non-zero) exits non-zero
#
# Run:
#   bash scripts/run-bats.sh scripts/tests/uat-preflight-check.bats
#   pnpm test:bash                                       # picks up the glob

load 'test_helper'

setup() {
  # Always start each test with a clean test-hook state. Unset (rather than
  # default to "") because the helper's trigger is `[[ -v NAME ]]` — i.e. the
  # variable being *set* (even to empty) routes through the test hook.
  unset UAT_PREFLIGHT_PROBE_OUTPUT
  unset UAT_PREFLIGHT_PROBE_PID
  unset UAT_PREFLIGHT_PROBE_FAIL
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  export REPO_ROOT
}

teardown() {
  unset UAT_PREFLIGHT_PROBE_OUTPUT
  unset UAT_PREFLIGHT_PROBE_PID
  unset UAT_PREFLIGHT_PROBE_FAIL
}

@test "AC-1: missing args exits non-zero with usage" {
  run bash "$REPO_ROOT/scripts/uat-preflight-check.sh" 2>&1
  [ "$status" -ne 0 ]
  [[ "$output" == *"usage"* ]]
}

@test "AC-1: only two args exits non-zero with usage" {
  run bash "$REPO_ROOT/scripts/uat-preflight-check.sh" api :3000 2>&1
  [ "$status" -ne 0 ]
  [[ "$output" == *"usage"* ]]
}

@test "AC-2: --help exits 0 with usage on stdout" {
  run bash "$REPO_ROOT/scripts/uat-preflight-check.sh" --help
  [ "$status" -eq 0 ]
  [[ "$output" == *"usage"* ]]
  [[ "$output" == *"service-name"* ]]
  [[ "$output" == *"expected-substring"* ]]
}

@test "AC-2: -h exits 0 with usage on stdout" {
  run bash "$REPO_ROOT/scripts/uat-preflight-check.sh" -h
  [ "$status" -eq 0 ]
  [[ "$output" == *"usage"* ]]
}

@test "AC-3: unbound port (probe returns UNBOUND) exits non-zero with diagnostic" {
  # Explicitly set (even to empty) so the helper's `[[ -v UAT_PREFLIGHT_PROBE_OUTPUT ]]`
  # trigger fires. The helper treats empty output as "simulate unbound port".
  export UAT_PREFLIGHT_PROBE_OUTPUT=""
  run bash "$REPO_ROOT/scripts/uat-preflight-check.sh" api :3000 "@aiqadam/api" 2>&1
  [ "$status" -ne 0 ]
  [[ "$output" == *"no process listening"* ]]
}

@test "AC-4: foreign service (substring mismatch) exits non-zero with foreign PID and CommandLine" {
  # Reproduces the BP-UAT-013 attempt-1 incident: PID 5008 is actually
  # `next start-server.js` from `ai-dala-next`, not the AI Qadam api.
  # We write the synthetic probe output to a temp file (then assign with
  # `$(cat …)`) to avoid two pitfalls:
  #   1. Bash $'…' ANSI-C quoting would interpret \a → BEL, \n → newline,
  #      \t → tab — all of which corrupt the literal Windows path.
  #   2. `var+="$(printf …)"` strips trailing newlines from each `printf`,
  #      so we can't simply concatenate "PID=…\n" and "COMMANDLINE=…".
  # Using printf → file → $(cat file) preserves the bytes verbatim.
  local probe_file="$BATS_TEST_TMPDIR/probe.txt"
  printf 'PID=5008\nCOMMANDLINE=C:\\Users\\viktor\\Documents\\Claude\\Projects\\ai-dala-next\\node_modules\\.pnpm\\next@15.0.0\\node_modules\\next\\dist\\server\\lib\\start-server.js' > "$probe_file"
  export UAT_PREFLIGHT_PROBE_OUTPUT="$(cat "$probe_file")"
  run bash "$REPO_ROOT/scripts/uat-preflight-check.sh" api :3000 "@aiqadam/api" 2>&1
  [ "$status" -ne 0 ]
  [[ "$output" == *"5008"* ]]
  [[ "$output" == *"is not the expected"* ]]
  [[ "$output" == *"ai-dala-next"* ]]
}

@test "AC-4: foreign service but explicit PID override is honoured" {
  export UAT_PREFLIGHT_PROBE_OUTPUT=$'PID=1\nCOMMANDLINE=whatever'
  export UAT_PREFLIGHT_PROBE_PID="7777"
  run bash "$REPO_ROOT/scripts/uat-preflight-check.sh" api :3000 "@aiqadam/api" 2>&1
  [ "$status" -ne 0 ]
  [[ "$output" == *"7777"* ]]
  [[ "$output" == *"is not the expected"* ]]
}

@test "AC-5: expected service (substring match) exits 0 silently" {
  export UAT_PREFLIGHT_PROBE_OUTPUT=$'PID=1234\nCOMMANDLINE=node /workspace/apps/api/dist/main.js'
  run bash "$REPO_ROOT/scripts/uat-preflight-check.sh" api :3000 "apps/api/dist/main.js"
  [ "$status" -eq 0 ]
  # Success path emits the "ok" line to stdout, nothing to stderr.
  [[ "$output" == *"1234"* ]]
}

@test "AC-5: web expected service (@astrojs/node) exits 0" {
  export UAT_PREFLIGHT_PROBE_OUTPUT=$'PID=4321\nCOMMANDLINE=node /workspace/apps/web/node_modules/@astrojs/node/dist/cli.js'
  run bash "$REPO_ROOT/scripts/uat-preflight-check.sh" web :4321 "@astrojs/node"
  [ "$status" -eq 0 ]
  [[ "$output" == *"4321"* ]]
}

@test "AC-6: probe failure (PowerShell non-zero) exits non-zero with diagnostic" {
  export UAT_PREFLIGHT_PROBE_FAIL=1
  run bash "$REPO_ROOT/scripts/uat-preflight-check.sh" api :3000 "@aiqadam/api" 2>&1
  [ "$status" -ne 0 ]
  [[ "$output" == *"process-identity probe failed"* ]]
}

@test "AC-7 (bonus): invalid port (non-numeric) exits non-zero" {
  # AGENTS.md §1.5 — guard against bad input.
  run bash "$REPO_ROOT/scripts/uat-preflight-check.sh" api not-a-port "@aiqadam/api" 2>&1
  [ "$status" -ne 0 ]
  [[ "$output" == *"invalid port"* ]]
}

@test "AC-8 (bonus): empty expected-substring exits non-zero" {
  export UAT_PREFLIGHT_PROBE_OUTPUT=$'PID=1234\nCOMMANDLINE=node apps/api/dist/main.js'
  run bash "$REPO_ROOT/scripts/uat-preflight-check.sh" api :3000 "" 2>&1
  [ "$status" -ne 0 ]
}