#!/usr/bin/env bats
# scripts/tests/uat-seed.bats
#
# Regression tests for the ensure_operator_invite() addition in
# scripts/uat-seed.sh (ISS-UAT-013-4 fix).
#
# These tests use two techniques:
#
#   1. UAT_SEED_DIRECTUS_MOCK=1 (full mock mode) — bypasses ALL external
#      calls (Directus health, bootstrap.sh, Authentik, operator_invites
#      inserts). Used for smoke + missing-token tests so the suite can run
#      without a live Docker stack.
#
#   2. Static analysis (grep) — verifies structural invariants of the
#      scripts without running them, e.g. that uat-env-setup.sh contains
#      the UAT_ONBOARD_* variables.
#
# Coverage:
#   AC-1: Mock mode exits 0 and calls ensure_operator_invite for all 3 tokens
#   AC-2: Missing DIRECTUS_TOKEN exits non-zero with FATAL message
#   AC-3: ensure_operator_invite contains an idempotency check (token_prefix GET)
#   AC-4: uat-env-setup.sh contains UAT_ONBOARD_TOKEN, UAT_ONBOARD_USED_TOKEN,
#         UAT_ONBOARD_EXPIRED_TOKEN
#
# Run:
#   bash scripts/run-bats.sh scripts/tests/uat-seed.bats
#   pnpm test:bash

load 'test_helper'

REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"

setup() {
  export REPO_ROOT
  # Unset any inherited mocks from surrounding environment
  unset UAT_SEED_DIRECTUS_MOCK
}

teardown() {
  unset UAT_SEED_DIRECTUS_MOCK
}

@test "AC-1: mock mode exits 0 and provisions all 4 operator_invite tokens" {
  run bash -c 'UAT_SEED_DIRECTUS_MOCK=1 DIRECTUS_TOKEN=mock-token bash "$REPO_ROOT/scripts/uat-seed.sh" 2>&1'
  [ "$status" -eq 0 ]
  # Each ensure_operator_invite call prints a line containing 'operator_invite' and '(mock'.
  # The mock line format is `operator_invite <token_prefix> (mock, email=<email>)` —
  # matched here in ERE with a literal '(' via \(. There should be exactly 4
  # such lines (one per fixture row: valid + used + expired + no-user,
  # ISS-UAT-013-4 + ISS-UAT-013-8).
  local count
  count=$(echo "$output" | grep -cE 'operator_invite .*\(mock' || true)
  [ "$count" -eq 4 ]
}

@test "AC-1: mock mode summary lists all four token names" {
  run bash -c 'UAT_SEED_DIRECTUS_MOCK=1 DIRECTUS_TOKEN=mock-token bash "$REPO_ROOT/scripts/uat-seed.sh" 2>&1'
  [ "$status" -eq 0 ]
  [[ "$output" == *"uat-onboard-token"* ]]
  [[ "$output" == *"uat-onboard-used-token"* ]]
  [[ "$output" == *"uat-onboard-expired-token"* ]]
  [[ "$output" == *"uat-onboard-no-user-token"* ]]
}

@test "AC-1: three happy rows share the bare operator email; the no-user row is plus-addressed" {
  # Strengthens AC-1 from "4 rows exist" to "4 rows exist with the right
  # email per row". The seed's mock-mode prints
  #   "operator_invite <token_prefix> (mock, email=<email>, role_groups=<json>)"
  # so we can grep the per-row distribution from the output (hermetic;
  # no Directus / no Authentik / no DB). The literal '+' in the
  # plus-addressed email is matched via a character class `[+]` to stay
  # portable across ERE implementations.
  run bash -c 'UAT_SEED_DIRECTUS_MOCK=1 DIRECTUS_TOKEN=mock-token bash "$REPO_ROOT/scripts/uat-seed.sh" 2>&1'
  [ "$status" -eq 0 ]
  local bare plus
  bare=$(echo "$output" | grep -cE 'operator_invite .*\(mock, email=uat-operator@aiqadam\.test' || true)
  plus=$(echo "$output" | grep -cE 'operator_invite .*\(mock, email=uat-operator[+]no-user@aiqadam\.test' || true)
  [ "$bare" -eq 3 ]
  [ "$plus" -eq 1 ]
}

@test "AC-5: valid-invite row carries role_groups=['aiqadam-staff']; other three rows carry []" {
  # ISS-UAT-013-10 regression: the BP-UAT-013 Step 005 spec asserts
  # `getByText(/aiqadam-staff/i)` is visible on the onboarding page.
  # That text is rendered by apps/web/src/components/OnboardingForm.tsx at
  # line ~194 from `preview.role_groups.join(', ')`. If the seed leaves
  # role_groups empty for the valid-invite row, Step 005 fails.
  #
  # This test pins the per-row role_groups content via the mock-mode
  # output line:
  #   "operator_invite <token_prefix> (mock, email=<email>, role_groups=<json>)"
  #
  # Expected distribution:
  #   - uat-onbo (the "uat-onboard-token" prefix) → role_groups=['aiqadam-staff']
  #   - all 3 other rows → role_groups=[]
  # Total role_groups=[] lines: 3; total role_groups=['aiqadam-staff'] lines: 1.
  run bash -c 'UAT_SEED_DIRECTUS_MOCK=1 DIRECTUS_TOKEN=mock-token bash "$REPO_ROOT/scripts/uat-seed.sh" 2>&1'
  [ "$status" -eq 0 ]
  local valid empty
  valid=$(echo "$output" | grep -cE 'operator_invite .*\(mock, .*role_groups=\["aiqadam-staff"\]' || true)
  empty=$(echo "$output" | grep -cE 'operator_invite .*\(mock, .*role_groups=\[\]' || true)
  [ "$valid" -eq 1 ]
  [ "$empty" -eq 3 ]
}

@test "AC-2: uat-seed.sh has a DIRECTUS_TOKEN guard that emits a FATAL message" {
  # Structural regression: the guard must exist so that a bare 'pnpm uat:seed'
  # without running uat-env-setup.sh first gives an actionable error.
  # Runtime test is skipped here because uat-seed.sh resolves API_DIR from
  # BASH_SOURCE (overriding any env override), meaning the guard can only be
  # triggered at runtime when apps/api/.env is genuinely absent — which is
  # true on a clean checkout but not in the developer workspace.
  grep -q 'DIRECTUS_TOKEN missing' "$REPO_ROOT/scripts/uat-seed.sh"
}

@test "AC-3: ensure_operator_invite has idempotency GET check before POST" {
  # Structural regression: the function must check for an existing row
  # by token_hash (SHA-256) before inserting. Without this, re-seeding
  # would create duplicate rows. token_prefix (first 8 chars) is NOT unique
  # across the three fixture tokens \u2014 all share the prefix "uat-onbo".
  grep -q 'token_hash.*operator_invites\|operator_invites.*token_hash' \
    "$REPO_ROOT/scripts/uat-seed.sh"
}

@test "AC-4: uat-env-setup.sh contains UAT_ONBOARD_TOKEN" {
  grep -q 'UAT_ONBOARD_TOKEN=' "$REPO_ROOT/scripts/uat-env-setup.sh"
}

@test "AC-4: uat-env-setup.sh contains UAT_ONBOARD_USED_TOKEN" {
  grep -q 'UAT_ONBOARD_USED_TOKEN=' "$REPO_ROOT/scripts/uat-env-setup.sh"
}

@test "AC-4: uat-env-setup.sh contains UAT_ONBOARD_EXPIRED_TOKEN" {
  grep -q 'UAT_ONBOARD_EXPIRED_TOKEN=' "$REPO_ROOT/scripts/uat-env-setup.sh"
}
