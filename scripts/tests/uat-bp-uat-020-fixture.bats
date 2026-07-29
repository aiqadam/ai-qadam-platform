#!/usr/bin/env bats
# scripts/tests/uat-bp-uat-020-fixture.bats
#
# Regression tests for scripts/uat-bp-uat-020-fixture.sh — the
# snapshot-remove-restore fixture-isolation mechanism introduced for
# ISS-UAT-020-1 (BP-UAT-020's zero-super-admin precondition).
#
# UAT_BP_UAT_020_MOCK=1 skips all real Authentik HTTP calls, docker exec
# token minting, and the api-health poll (same test-hook pattern as
# UAT_SEED_DIRECTUS_MOCK=1 in scripts/uat-seed.sh) — these tests exercise
# the script's own control flow and safety guards, not live Authentik.
#
# Coverage:
#   - AC-1 (ISS-UAT-020-1): setup snapshots, empties, and restarts; the
#     snapshot file is the durable evidence a restore is still owed
#   - AC-2 (ISS-UAT-020-1): teardown refuses to run with no snapshot;
#     setup refuses to run over an existing (un-torn-down) snapshot —
#     both guard against silently losing the pre-removal membership
#   - teardown restores the EXACT snapshotted membership and verifies it
#   - verify-restored is a safe, read-only check of "is a restore owed"

load 'test_helper'

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  export REPO_ROOT
  export UAT_BP_UAT_020_MOCK=1
  # Isolate each test's snapshot file under the bats tmpdir so tests never
  # touch a real (or another test's) .copilot/tmp/ state.
  SNAPSHOT_FILE="$BATS_TEST_TMPDIR/BP-UAT-020-super-admin-snapshot.json"
  export SNAPSHOT_FILE
}

teardown() {
  rm -f "$SNAPSHOT_FILE"
  unset UAT_BP_UAT_020_MOCK SNAPSHOT_FILE
}

@test "missing subcommand exits non-zero with usage" {
  run bash "$REPO_ROOT/scripts/uat-bp-uat-020-fixture.sh" 2>&1
  [ "$status" -ne 0 ]
  [[ "$output" == *"usage"* ]]
}

@test "unknown subcommand exits non-zero with usage" {
  run bash "$REPO_ROOT/scripts/uat-bp-uat-020-fixture.sh" bogus 2>&1
  [ "$status" -ne 0 ]
  [[ "$output" == *"unknown subcommand"* ]]
}

@test "--help exits 0 with usage" {
  run bash "$REPO_ROOT/scripts/uat-bp-uat-020-fixture.sh" --help
  [ "$status" -eq 0 ]
  [[ "$output" == *"usage"* ]]
}

@test "non-localhost AK_URL is refused before any mutation" {
  export AK_URL="https://auth.aiqadam.org"
  run bash "$REPO_ROOT/scripts/uat-bp-uat-020-fixture.sh" setup 2>&1
  [ "$status" -ne 0 ]
  [[ "$output" == *"non-localhost"* ]]
  [ ! -f "$SNAPSHOT_FILE" ]
}

@test "setup creates a snapshot file and reports the emptied group" {
  run bash "$REPO_ROOT/scripts/uat-bp-uat-020-fixture.sh" setup 2>&1
  [ "$status" -eq 0 ]
  [ -f "$SNAPSHOT_FILE" ]
  [[ "$output" == *"snapshotted"* ]]
  [[ "$output" == *"membership emptied"* ]]
  [[ "$output" == *"zero-super-admin bootstrap window"* ]]
}

@test "setup refuses to run again over an un-torn-down snapshot (AC-2)" {
  bash "$REPO_ROOT/scripts/uat-bp-uat-020-fixture.sh" setup >/dev/null 2>&1
  run bash "$REPO_ROOT/scripts/uat-bp-uat-020-fixture.sh" setup 2>&1
  [ "$status" -ne 0 ]
  [[ "$output" == *"already exists"* ]]
  [[ "$output" == *"Run 'teardown' first"* ]]
}

@test "teardown refuses to run with no snapshot present (AC-2)" {
  run bash "$REPO_ROOT/scripts/uat-bp-uat-020-fixture.sh" teardown 2>&1
  [ "$status" -ne 0 ]
  [[ "$output" == *"nothing to restore"* ]]
}

@test "teardown after setup restores and verifies, then removes the snapshot" {
  bash "$REPO_ROOT/scripts/uat-bp-uat-020-fixture.sh" setup >/dev/null 2>&1
  [ -f "$SNAPSHOT_FILE" ]
  run bash "$REPO_ROOT/scripts/uat-bp-uat-020-fixture.sh" teardown 2>&1
  [ "$status" -eq 0 ]
  [[ "$output" == *"restored to snapshotted state"* ]]
  [[ "$output" == *"teardown complete and verified"* ]]
  [ ! -f "$SNAPSHOT_FILE" ]
}

@test "verify-restored passes when no snapshot file is present" {
  run bash "$REPO_ROOT/scripts/uat-bp-uat-020-fixture.sh" verify-restored 2>&1
  [ "$status" -eq 0 ]
  [[ "$output" == *"no snapshot file present"* ]]
}

@test "verify-restored fails loudly when a snapshot file is still present" {
  bash "$REPO_ROOT/scripts/uat-bp-uat-020-fixture.sh" setup >/dev/null 2>&1
  run bash "$REPO_ROOT/scripts/uat-bp-uat-020-fixture.sh" verify-restored 2>&1
  [ "$status" -ne 0 ]
  [[ "$output" == *"teardown has NOT completed"* ]]
}

@test "full setup -> teardown cycle leaves verify-restored passing" {
  bash "$REPO_ROOT/scripts/uat-bp-uat-020-fixture.sh" setup >/dev/null 2>&1
  bash "$REPO_ROOT/scripts/uat-bp-uat-020-fixture.sh" teardown >/dev/null 2>&1
  run bash "$REPO_ROOT/scripts/uat-bp-uat-020-fixture.sh" verify-restored 2>&1
  [ "$status" -eq 0 ]
}
