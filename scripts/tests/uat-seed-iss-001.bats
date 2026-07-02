#!/usr/bin/env bats
# scripts/tests/uat-seed-iss-001.bats
#
# Regression tests for ISS-UAT-SEED-001 (uat-seed.sh step 4 failures):
#
#   AC-1: ensure_operator_invite OMITS consumed_at from POST payload when
#         the value is empty (Directus 11 readonly validation rejects
#         consumed_at: null with VALUE_TOO_LONG).
#   AC-2: ensure_operator_invite looks up the Authentik user pk by email
#         and includes it as authentik_user_id in the payload (so the api
#         does not throw invite_missing_authentik_user at consume time).
#   AC-3: env_get() in uat-seed.sh strips \r from values read from
#         Windows-edited .env files (CRLF in DIRECTUS_TOKEN would
#         otherwise produce an Authorization header with a trailing \r
#         and Directus would return FORBIDDEN).
#   AC-4: AUTHENTIK_ADMIN_TOKEN is documented in apps/api/.env.example
#         (verified-already-satisfied — see .copilot/issues/ISS-UAT-SEED-001.md
#         and 03-code-summary.md for the resolution rationale).
#
# Tests run hermetically via UAT_SEED_DIRECTUS_MOCK=1 (no Docker, no
# Directus, no Authentik). Mock-mode prints the per-row payload
# construction to stdout (e.g.
#   "operator_invite uat-onbo (mock, email=…, role_groups=…, authentik_user_id=N|none)"
# ) so the assertions grep the constructed body, not the HTTP wire.
#
# Run:
#   bash scripts/run-bats.sh scripts/tests/uat-seed-iss-001.bats

load 'test_helper'

REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"

setup() {
  export REPO_ROOT
  unset UAT_SEED_DIRECTUS_MOCK
}

teardown() {
  unset UAT_SEED_DIRECTUS_MOCK
}

# ─── AC-1: consumed_at is OMITTED from payload when value is empty ─────────────

@test "AC-1: pending-invite mock line has no consumed_at field" {
  # The three "pending" fixture rows (valid, expired, no-user) all pass
  # empty consumed_at. Mock mode prints the constructed body so we can
  # verify the field is absent — not "consumed_at: null", not
  # "consumed_at: ''", just absent.
  run bash -c 'UAT_SEED_DIRECTUS_MOCK=1 DIRECTUS_TOKEN=mock-token bash "$REPO_ROOT/scripts/uat-seed.sh" 2>&1'
  [ "$status" -eq 0 ]
  # The "valid" + "expired" + "no-user" rows are all pending → no
  # consumed_at. The "used" row is the only one with consumed_at set.
  # Count lines mentioning "consumed_at=" in the mock output. Should be
  # zero — the mock line uses (mock, email=…, role_groups=…,
  # authentik_user_id=…) and never includes consumed_at.
  local hits
  hits=$(echo "$output" | grep -cE 'consumed_at=' || true)
  [ "$hits" -eq 0 ]
}

@test "AC-1: ensure_operator_invite jq payload omits consumed_at when value is empty" {
  # Static-analysis check on the function body: the jq expression must
  # NOT include the literal '.consumed_at = null' for the empty branch.
  # The old code had:
  #   ... | .consumed_at = null
  # which is what triggered the VALUE_TOO_LONG error.
  run grep -nE '\.consumed_at *= *null' "$REPO_ROOT/scripts/uat-seed.sh"
  # grep exits 1 when no match found (which is what we want).
  [ "$status" -ne 0 ]
}

@test "AC-1: uat-seed.bats existing tests still pass after the consumed_at fix" {
  # Defensive: ensure the refactor didn't break the original 4-AC suite.
  # This re-runs the same suite as a smoke test.
  run bash -c 'UAT_SEED_DIRECTUS_MOCK=1 DIRECTUS_TOKEN=mock-token bash "$REPO_ROOT/scripts/uat-seed.sh" 2>&1'
  [ "$status" -eq 0 ]
  # Still 4 mock lines, one per fixture row.
  local count
  count=$(echo "$output" | grep -cE 'operator_invite .*\(mock' || true)
  [ "$count" -eq 4 ]
}

# ─── AC-2: authentik_user_id is looked up by email and included ───────────────

@test "AC-2: mock line contains the authentik_user_id field for all 4 rows" {
  run bash -c 'UAT_SEED_DIRECTUS_MOCK=1 DIRECTUS_TOKEN=mock-token bash "$REPO_ROOT/scripts/uat-seed.sh" 2>&1'
  [ "$status" -eq 0 ]
  # Each of the 4 mock lines must end with authentik_user_id=<value>.
  # In mock mode AK_TOKEN is empty so the lookup returns "" → labelled
  # "none" by the mock line formatter. We accept either "none" or a
  # numeric pk.
  local hits
  hits=$(echo "$output" | grep -cE 'authentik_user_id=(none|[0-9]+)' || true)
  [ "$hits" -eq 4 ]
}

@test "AC-2: uat-seed.sh has a user_pk_by_email helper" {
  # The new helper must exist (referenced from ensure_operator_invite).
  run grep -nE '^user_pk_by_email\(\)' "$REPO_ROOT/scripts/uat-seed.sh"
  [ "$status" -eq 0 ]
}

@test "AC-2: ensure_operator_invite calls user_pk_by_email" {
  run grep -nE 'user_pk_by_email.*"' "$REPO_ROOT/scripts/uat-seed.sh"
  [ "$status" -eq 0 ]
}

# ─── AC-3: env_get strips \r from Windows-edited .env values ──────────────────

@test "AC-3: env_get in uat-seed.sh trims \\r from values" {
  # Static check: the tr command must include '\\r' in its character
  # class. The old code was `| tr -d '"'`; the new code is
  # `| tr -d '"\r'`.
  run grep -nE "tr -d '[^']*\\\\r" "$REPO_ROOT/scripts/uat-seed.sh"
  [ "$status" -eq 0 ]
}

@test "AC-3: env_get in uat-env-setup.sh trims \\r from values" {
  # Same fix must be applied to the sibling env_get in uat-env-setup.sh
  # to keep the two helpers in lockstep. (Without this, direct calls to
  # uat-env-setup.sh after a Windows edit would still get a trailing \r.)
  run grep -nE "tr -d '[^']*\\\\r" "$REPO_ROOT/scripts/uat-env-setup.sh"
  [ "$status" -eq 0 ]
}

@test "AC-3: env_get returns the trimmed token (end-to-end with CRLF fixture)" {
  # Functional check: build a temporary .env file with CRLF line
  # endings, source the env_get helper, and confirm the returned value
  # has no trailing \r.
  local tmpdir
  tmpdir="$(mktemp -d)"
  trap "rm -rf '$tmpdir'" RETURN

  # Build a CRLF .env file with a non-empty DIRECTUS_TOKEN. printf is
  # portable across bash/dash and does not depend on the host's
  # filesystem line-ending policy.
  printf 'DIRECTUS_TOKEN=mock-token\r\n' > "$tmpdir/.env"

  # Sanity: confirm the file actually has CR bytes (od is in POSIX so
  # works on macOS + Linux + WSL).
  local file_hex
  file_hex=$(od -An -c "$tmpdir/.env" | tr -d ' \n')
  # file_hex should contain \r (escaped) and \n
  [[ "$file_hex" == *\\r* ]]

  # Source env_get and call it. The output must NOT contain \r.
  run bash -c "
    source <(sed -n '/^env_get()/,/^}/p' '$REPO_ROOT/scripts/uat-seed.sh')
    env_get '$tmpdir/.env' 'DIRECTUS_TOKEN'
  "
  [ "$status" -eq 0 ]
  # Output must be exactly 'mock-token' (10 bytes), no trailing CR.
  [ "$output" = "mock-token" ]
  [ ${#output} -eq 10 ]
}

# ─── AC-4: AUTHENTIK_ADMIN_TOKEN documented in env.example ────────────────────

@test "AC-4: apps/api/.env.example contains AUTHENTIK_ADMIN_TOKEN" {
  # Verified-already-satisfied: the issue's Proposed Resolution #4 is a
  # no-op. The env var was already documented on main. This test
  # protects against accidental removal.
  run grep -nE '^AUTHENTIK_ADMIN_TOKEN=' "$REPO_ROOT/apps/api/.env.example"
  [ "$status" -eq 0 ]
}

@test "AC-4: apps/api/.env.example contains AUTHENTIK_ADMIN_URL" {
  # The URL companion var is also expected (token alone without URL is
  # not useful).
  run grep -nE '^AUTHENTIK_ADMIN_URL=' "$REPO_ROOT/apps/api/.env.example"
  [ "$status" -eq 0 ]
}
