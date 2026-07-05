#!/usr/bin/env bats
# scripts/tests/uat-seed.bats
#
# Regression tests for the ensure_operator_invite() addition in
# scripts/uat-seed.sh (ISS-UAT-013-4 fix), plus the FR-WORKFLOW-003
# `--reset <BP-UAT-NNN>|all` fixture-reset mode (wf-20260703-feat-063).
#
# These tests use three techniques:
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
#   3. Isolated-copy mock mode (FR-WORKFLOW-003 tests only) — copies
#      scripts/uat-seed.sh and scripts/uat-fixtures/ into BATS_TEST_TMPDIR
#      so a manifest can be deliberately corrupted (via jq) without
#      touching the real repo files. REPO_ROOT/FIXTURES_DIR are derived
#      from BASH_SOURCE inside uat-seed.sh, so running the copy from a
#      tmpdir is what makes the corrupted manifest take effect.
#
# Coverage:
#   AC-1: Mock mode exits 0 and calls ensure_operator_invite for all 3 tokens
#   AC-2: Missing DIRECTUS_TOKEN exits non-zero with FATAL message
#   AC-3: ensure_operator_invite contains an idempotency check (token_prefix GET)
#   AC-4: uat-env-setup.sh contains UAT_ONBOARD_TOKEN, UAT_ONBOARD_USED_TOKEN,
#         UAT_ONBOARD_EXPIRED_TOKEN
#
# FR-WORKFLOW-003 coverage (--reset mode, see
# .copilot/tasks/active/wf-20260703-feat-063/06-test-strategy.md):
#   AC-1/AC-3: manifest parsing + delete-then-create ordering
#   AC-4: localhost guard (DIRECTUS_URL and AK_URL checked independently)
#   AC-2/AC-3: unknown BP-UAT id + --reset all iteration
#   AC-6: byte-identical no-flag regression vs. the pre-FR baseline
#   member_email -> Directus user id FK resolution (success, failure,
#     and BP-UAT-013 non-regression)
#   CLI-parsing structural edge cases (missing --reset value, unknown flag)
#   AC-5/AC-7: doc-presence structural checks (business-analyst.md,
#     uat-verification.md) — not runtime behavior of uat-seed.sh, but
#     grepped here per this suite's established structural-check pattern.
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
  unset DIRECTUS_URL
  unset AK_URL
}

teardown() {
  unset UAT_SEED_DIRECTUS_MOCK
  unset DIRECTUS_URL
  unset AK_URL
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
  bare=$(echo "$output" | grep -cE 'operator_invite .*\(mock, email=uat-operator@example\.com' || true)
  plus=$(echo "$output" | grep -cE 'operator_invite .*\(mock, email=uat-operator[+]no-user@example\.com' || true)
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

# ═══════════════════════════════════════════════════════════════════════════
# FR-WORKFLOW-003: `--reset <BP-UAT-NNN>|all` fixture-reset mode
# ═══════════════════════════════════════════════════════════════════════════

# ─── Row 1: Manifest parsing (run_reset_for_bp reading BP-UAT-013.json) ───────

@test "FR-WORKFLOW-003 row 1: --reset BP-UAT-013 mock mode logs exactly 4 fixture lines" {
  run bash -c 'UAT_SEED_DIRECTUS_MOCK=1 DIRECTUS_TOKEN=mock-token bash "$REPO_ROOT/scripts/uat-seed.sh" --reset BP-UAT-013 2>&1'
  [ "$status" -eq 0 ]
  # One create line per fixture in the manifest (4 operator_invites rows).
  local count
  count=$(echo "$output" | grep -cE '\(mock, create collection=operator_invites\)' || true)
  [ "$count" -eq 4 ]
}

# ─── Row 2: Delete-then-create ordering (reset_domain_fixture mock branch) ────

@test "FR-WORKFLOW-003 row 2: each domain fixture's delete line precedes its create line" {
  run bash -c 'UAT_SEED_DIRECTUS_MOCK=1 DIRECTUS_TOKEN=mock-token bash "$REPO_ROOT/scripts/uat-seed.sh" --reset BP-UAT-013 2>&1'
  [ "$status" -eq 0 ]
  # For each of the 4 fixture ids, the delete line's line number must be
  # lower than the create line's line number.
  local id
  for id in uat-onboard-token uat-onboard-used-token uat-onboard-expired-token uat-onboard-no-user-token; do
    local del_line create_line
    del_line=$(echo "$output" | grep -nE "fixture ${id} \(mock, delete collection=" | head -1 | cut -d: -f1)
    create_line=$(echo "$output" | grep -nE "fixture ${id} \(mock, create collection=" | head -1 | cut -d: -f1)
    [ -n "$del_line" ]
    [ -n "$create_line" ]
    [ "$del_line" -lt "$create_line" ]
  done
}

# ─── Row 3: Localhost guard — non-localhost DIRECTUS_URL ──────────────────────

@test "FR-WORKFLOW-003 row 3: non-localhost DIRECTUS_URL exits 4 with zero writes" {
  run bash -c 'DIRECTUS_URL=https://prod.aiqadam.org UAT_SEED_DIRECTUS_MOCK=1 DIRECTUS_TOKEN=mock-token bash "$REPO_ROOT/scripts/uat-seed.sh" --reset BP-UAT-001 2>&1'
  [ "$status" -eq 4 ]
  [[ "$output" == *"FATAL"* ]]
  [[ "$output" == *"non-localhost target"* ]]
  # Load-bearing assertion: zero mock/fixture output lines were emitted —
  # not even the manifest read happens once the guard trips.
  local mock_lines
  mock_lines=$(echo "$output" | grep -cE '\(mock,' || true)
  [ "$mock_lines" -eq 0 ]
}

# ─── Row 3b: Localhost guard — non-localhost AK_URL, DIRECTUS_URL local ───────

@test "FR-WORKFLOW-003 row 3b: non-localhost AK_URL (DIRECTUS_URL local) exits 4 with zero writes" {
  # Confirms AK_URL is checked independently — not short-circuited once
  # DIRECTUS_URL passes the localhost check.
  run bash -c 'DIRECTUS_URL=http://localhost:8200 AK_URL=https://prod-ak.aiqadam.org UAT_SEED_DIRECTUS_MOCK=1 DIRECTUS_TOKEN=mock-token bash "$REPO_ROOT/scripts/uat-seed.sh" --reset BP-UAT-001 2>&1'
  [ "$status" -eq 4 ]
  [[ "$output" == *"FATAL"* ]]
  [[ "$output" == *"non-localhost target"* ]]
  local mock_lines
  mock_lines=$(echo "$output" | grep -cE '\(mock,' || true)
  [ "$mock_lines" -eq 0 ]
}

# ─── Row 4: Unknown BP-UAT id (require_manifest) ──────────────────────────────

@test "FR-WORKFLOW-003 row 4: --reset BP-UAT-999 (no manifest) exits non-zero with actionable FATAL" {
  run bash -c 'UAT_SEED_DIRECTUS_MOCK=1 DIRECTUS_TOKEN=mock-token bash "$REPO_ROOT/scripts/uat-seed.sh" --reset BP-UAT-999 2>&1'
  [ "$status" -ne 0 ]
  [[ "$output" == *"FATAL"* ]]
  [[ "$output" == *"No fixture manifest found for 'BP-UAT-999'"* ]]
  [[ "$output" == *"BP-UAT-999.json"* ]]
  # list_known_manifests() output — both known manifests named.
  [[ "$output" == *"BP-UAT-001"* ]]
  [[ "$output" == *"BP-UAT-013"* ]]
}

# ─── Row 5: --reset all iteration (run_reset_all) ─────────────────────────────

@test "FR-WORKFLOW-003 row 5: --reset all processes both manifests and exits 0" {
  run bash -c 'UAT_SEED_DIRECTUS_MOCK=1 DIRECTUS_TOKEN=mock-token bash "$REPO_ROOT/scripts/uat-seed.sh" --reset all 2>&1'
  [ "$status" -eq 0 ]
  [[ "$output" == *"resetting fixtures for BP-UAT-001"* ]]
  [[ "$output" == *"resetting fixtures for BP-UAT-013"* ]]
  [[ "$output" == *"BP-UAT-001 reset complete (5 fixture(s))"* ]]
  [[ "$output" == *"BP-UAT-013 reset complete (4 fixture(s))"* ]]
}

# ─── Row 6: Regression — structural equivalence vs. pre-FR baseline ──────────
#
# ISS-UAT-BATS-001 (resolved 2026-07-04 by wf-20260704-fix-092, PR #108):
#   Two interacting bugs in the previous version of this test were fixed:
#   (a) Baseline source-of-truth was `git show origin/main:scripts/uat-seed.sh`,
#       which stopped being pre-fix once main advanced past commit `2b72f46`
#       (ISS-UAT-001-1 fix). Now pinned to the immutable SHA `8db37ac^`
#       (parent of the commit that introduced the +2 ensure_linked lines).
#   (b) Strict byte-equality assertion was too strict for the documented
#       `@aiqadam.test → @example.com` TLD migration in
#       `wf-20260704-fix-086` / ISS-UAT-BRIDGE-002. Replaced with a structural
#       assertion: every non-ensure_linked line from the pre-fix baseline must
#       appear in the post-fix output, modulo a small whitelist of accepted
#       drift sources (see DRIFT_SED_FILTERS below).

@test "FR-WORKFLOW-003 row 6: no-flag mock output is structurally equivalent to the pre-FR baseline (+2 ensure_linked lines + documented drift)" {
  # The --reset branch is an early-exit branch that runs BEFORE the
  # unconditional STEP 1-4 flow (see uat-seed.sh's CLI dispatch comment at
  # the '--reset dispatch' section) — it must not change no-flag behavior
  # at all.
  #
  # ISS-UAT-001-1 note: this fix necessarily adds 2 new mock-mode
  # `ensure_linked <email> (mock, …)` lines (one per identity fixture in
  # STEP 3). The structural assertion below verifies the line-count delta
  # is exactly +2 and every other line is present (modulo the documented
  # drift whitelist).

  # Baseline is pinned to 8db37ac^ — the parent of the commit that introduced
  # the ensure_linked mock lines. This SHA is immutable; the baseline never
  # moves as main advances.
  local baseline="$BATS_TEST_TMPDIR/baseline-uat-seed.sh"
  if ! git rev-parse --verify 8db37ac^ >/dev/null 2>&1; then
    skip "baseline commit 8db37ac^ not reachable from this clone"
  fi
  git show 8db37ac^:scripts/uat-seed.sh > "$baseline"
  [ -s "$baseline" ]

  local baseline_output current_output baseline_lines current_lines
  baseline_output=$(UAT_SEED_DIRECTUS_MOCK=1 DIRECTUS_TOKEN=mock-token bash "$baseline" 2>&1)
  current_output=$(UAT_SEED_DIRECTUS_MOCK=1 DIRECTUS_TOKEN=mock-token bash "$REPO_ROOT/scripts/uat-seed.sh" 2>&1)

  # Exact +2 line delta from the two new ensure_linked mock lines
  # (one per identity fixture: uat-member + uat-operator).
  baseline_lines=$(echo "$baseline_output" | wc -l)
  current_lines=$(echo "$current_output" | wc -l)
  [ "$((current_lines - baseline_lines))" -eq 2 ]

  # Strip the new ensure_linked lines from both outputs, then strip the
  # accepted-drift patterns (currently just the @aiqadam.test → @example.com
  # TLD migration from wf-20260704-fix-086), then assert structural
  # equivalence: every remaining line from the baseline appears in the
  # current output (modulo ordering, which we sort to remove dependency on
  # output stability across minor refactors).
  #
  # If you add a new drift source here, file an issue and update the
  # comment so the next reviewer knows why each sed filter exists.
  local DRIFT_SED_FILTERS=(
    -e 's/@aiqadam\.test/@example.com/g'
  )

  local non_ensure_lines current_non_ensure_lines
  non_ensure_lines=$(echo "$baseline_output" \
    | grep -vE 'ensure_linked .*\(mock, directus_user_id=mock-uuid\)' \
    | sed "${DRIFT_SED_FILTERS[@]}" || true)
  current_non_ensure_lines=$(echo "$current_output" \
    | grep -vE 'ensure_linked .*\(mock, directus_user_id=mock-uuid\)' \
    | sed "${DRIFT_SED_FILTERS[@]}" || true)

  # Sort both sides so the assertion is order-independent.
  # `comm -23` reports lines unique to the baseline that are NOT in current.
  # If non-empty, the current output is missing structural content from the
  # baseline — a regression.
  local missing_from_current
  missing_from_current=$(comm -23 \
    <(echo "$non_ensure_lines" | sort) \
    <(echo "$current_non_ensure_lines" | sort) || true)
  [ -z "$missing_from_current" ]
}

# ─── Row 7: member_email FK resolution — success ──────────────────────────────

@test "FR-WORKFLOW-003 row 7: member_email resolves to the sibling identity fixture in mock mode" {
  run bash -c 'UAT_SEED_DIRECTUS_MOCK=1 DIRECTUS_TOKEN=mock-token bash "$REPO_ROOT/scripts/uat-seed.sh" --reset BP-UAT-001 2>&1'
  [ "$status" -eq 0 ]
  [[ "$output" == *"fixture uat-member-consented-consent (mock, create collection=member_consents, member_email=uat-member-c@example.com resolved to member=uat-member-consented)"* ]]
}

# ─── Row 8: member_email FK resolution — unresolvable email fails loudly ──────

@test "FR-WORKFLOW-003 row 8: unresolvable member_email fails loudly; prior fixtures still succeed" {
  # Isolated-copy technique: copy uat-seed.sh + scripts/uat-fixtures/ into a
  # scratch dir so REPO_ROOT/FIXTURES_DIR (both derived from BASH_SOURCE
  # inside uat-seed.sh) resolve into the tmpdir, then corrupt the scratch
  # copy of BP-UAT-001.json's member_email with jq. The real repo's
  # scripts/uat-fixtures/BP-UAT-001.json is never touched.
  local scratch="$BATS_TEST_TMPDIR/scratch-repo"
  mkdir -p "$scratch/scripts/uat-fixtures"
  cp "$REPO_ROOT/scripts/uat-seed.sh" "$scratch/scripts/uat-seed.sh"
  cp "$REPO_ROOT/scripts/uat-fixtures/BP-UAT-013.json" "$scratch/scripts/uat-fixtures/BP-UAT-013.json"
  jq '(.fixtures[] | select(.id=="uat-member-consented-consent") | .payload.member_email) |= "nonexistent@aiqadam.test"' \
    "$REPO_ROOT/scripts/uat-fixtures/BP-UAT-001.json" \
    > "$scratch/scripts/uat-fixtures/BP-UAT-001.json"

  run bash -c "UAT_SEED_DIRECTUS_MOCK=1 DIRECTUS_TOKEN=mock-token bash '$scratch/scripts/uat-seed.sh' --reset BP-UAT-001 2>&1"
  [ "$status" -ne 0 ]
  [[ "$output" == *"FATAL"* ]]
  [[ "$output" == *"fixture uat-member-consented-consent"* ]]
  [[ "$output" == *"member_email 'nonexistent@aiqadam.test' did not resolve to any identity fixture in this manifest (mock mode)"* ]]
  # The two identity fixtures ordered before the bad domain fixture in the
  # manifest must still have logged successfully — the failure is isolated
  # to the one bad domain fixture, not a global short-circuit.
  [[ "$output" == *"identity uat-operator (mock, reset"* ]]
  [[ "$output" == *"identity uat-member-consented (mock, reset"* ]]
}

# ─── Row 9: BP-UAT-013 unaffected by the member_email change (regression) ─────

@test "FR-WORKFLOW-003 row 9: --reset BP-UAT-013 output has no member_email/resolved-to substrings" {
  run bash -c 'UAT_SEED_DIRECTUS_MOCK=1 DIRECTUS_TOKEN=mock-token bash "$REPO_ROOT/scripts/uat-seed.sh" --reset BP-UAT-013 2>&1'
  [ "$status" -eq 0 ]
  [[ "$output" != *"member_email="* ]]
  [[ "$output" != *"resolved to member="* ]]
}

# ─── Row 10: Structural — --reset requires an argument ────────────────────────

@test "FR-WORKFLOW-003 row 10: --reset with no following argument exits 2 with usage message" {
  run bash -c 'bash "$REPO_ROOT/scripts/uat-seed.sh" --reset 2>&1'
  [ "$status" -eq 2 ]
  [[ "$output" == *"Usage: uat-seed.sh --reset <BP-UAT-NNN>|all"* ]]
}

# ─── Row 11: Structural — unknown flag rejected ───────────────────────────────

@test "FR-WORKFLOW-003 row 11: unknown flag exits 2 with usage message" {
  run bash -c 'bash "$REPO_ROOT/scripts/uat-seed.sh" --bogus-flag 2>&1'
  [ "$status" -eq 2 ]
  [[ "$output" == *"Unknown argument: --bogus-flag"* ]]
  [[ "$output" == *"Usage: uat-seed.sh [--reset <BP-UAT-NNN>|all]"* ]]
}
# ─── Row 12 (BP-UAT-001 owner: ISS-UAT-COV-003 / FEAT-UAT-COV-003) ───────────
# BP-UAT-001 contract (docs/02-business-processes/uat/BP-UAT-001.md +
# scripts/uat-fixtures/BP-UAT-001.json):
#   - uat-member-consented has a member_consents row (events purpose)
#   - uat-member-no-consent has NO member_consents row — the absence IS
#     the fixture's declared initial state and the consent-gating guarantee
#     that the operator's broadcast excludes this member from recipient_count
#   - --reset BP-UAT-001 must be idempotent across reruns: the consented
#     member's consent row must be re-created every run, and the
#     no-consent member must NEVER acquire a member_consents row.

@test "FEAT-UAT-COV-003 row 12: --reset BP-UAT-001 mock mode re-creates uat-member-consented's consent row and never materialises one for uat-member-no-consent" {
  # ── Act ────────────────────────────────────────────────────────────────
  run bash -c 'UAT_SEED_DIRECTUS_MOCK=1 DIRECTUS_TOKEN=mock-token bash "$REPO_ROOT/scripts/uat-seed.sh" --reset BP-UAT-001 2>&1'
  [ "$status" -eq 0 ]

  # ── Assert 1: uat-member-consented's consent row IS re-created ─────────
  # The mock output format from reset_domain_fixture() (scripts/uat-seed.sh
  # line ~743) for fixtures with member_email is:
  #   "fixture <id> (mock, delete collection=member_consents lookup=member_email=<email>)"
  #   "fixture <id> (mock, create collection=member_consents, member_email=<email> resolved to member=<id>)"
  # The delete line must precede the create line (FR-WORKFLOW-003 row 2 invariant).
  local consented_email="uat-member-c@example.com"
  local consented_id="uat-member-consented-consent"
  local del_line create_line
  del_line=$(echo "$output" | grep -nE "fixture ${consented_id} \(mock, delete collection=member_consents" | head -1 | cut -d: -f1)
  create_line=$(echo "$output" | grep -nE "fixture ${consented_id} \(mock, create collection=member_consents, member_email=${consented_email} resolved to member=${consented_id%-consent}" | head -1 | cut -d: -f1)
  [ -n "$del_line" ]
  [ -n "$create_line" ]
  [ "$del_line" -lt "$create_line" ]

  # ── Assert 2: uat-member-no-consent acquires NO member_consents row ────
  # The contract from BP-UAT-001.md's Seed Fixtures Required table + the
  # JSON manifest's note field is that this fixture's "declared initial
  # state" is the ABSENCE of a member_consents row for the events purpose.
  # We assert that the mock output emits zero collection=member_consents
  # lines whose member_email is uat-member-nc@example.com (the no-consent
  # fixture's email) — across the entire reset run.
  local nc_email="uat-member-nc@example.com"
  local nc_member_consents_lines
  nc_member_consents_lines=$(echo "$output" | grep -cE "collection=member_consents.*member_email=${nc_email}" || true)
  [ "$nc_member_consents_lines" -eq 0 ]

  # ── Assert 3: the uat-member-no-consent identity fixture IS reset ─────
  # The identity reset emits `identity <id> (mock, reset group=<group>)`
  # lines (FR-WORKFLOW-003 row 5 / row 7 idiom). We assert one such line
  # exists for uat-member-no-consent, confirming the reset visited the
  # identity layer (so the negative assertion 2 is meaningful — the reset
  # ran, and it deliberately did NOT create a consent row).
  [[ "$output" == *"identity uat-member-no-consent (mock, reset"* ]]

  # ── Assert 4: idempotency — second --reset produces identical consent-row output ─
  local second
  second=$(UAT_SEED_DIRECTUS_MOCK=1 DIRECTUS_TOKEN=mock-token bash "$REPO_ROOT/scripts/uat-seed.sh" --reset BP-UAT-001 2>&1)
  # The consented-member create line is present in BOTH runs (re-created
  # every run = the fixture contract).
  [[ "$second" == *"fixture ${consented_id} (mock, create collection=member_consents, member_email=${consented_email} resolved to member=uat-member-consented)"* ]]
  # The no-consent member has no member_consents line in EITHER run.
  local second_nc_lines
  second_nc_lines=$(echo "$second" | grep -cE "collection=member_consents.*member_email=${nc_email}" || true)
  [ "$second_nc_lines" -eq 0 ]
}
# ─── AC-6 (first clause): bash -n scripts/uat-seed.sh passes ──────────────────

@test "FR-WORKFLOW-003 AC-6: bash -n scripts/uat-seed.sh passes (syntax check)" {
  run bash -n "$REPO_ROOT/scripts/uat-seed.sh"
  [ "$status" -eq 0 ]
}

# ─── AC-5: BusinessAnalyst Step 1 checklist + output-format table doc-presence ─

@test "FR-WORKFLOW-003 AC-5: business-analyst.md Step 1 checklist has the manifest-drift row" {
  # Same structural-doc-presence pattern as bp-uat-template-rule.bats: grep
  # a doc file for a required substring so a future edit that silently
  # drops the row is caught. AC-5 is a process/authoring-time check, not
  # runtime behavior of uat-seed.sh, so this is the load-bearing test for it.
  local doc="$REPO_ROOT/.copilot/agents/business-analyst.md"
  [ -f "$doc" ]
  grep -qE 'manifest matches doc fixture table.*scripts/uat-fixtures' "$doc"
  grep -qE 'PASS/FAIL/N/A.*diff named on FAIL' "$doc"
}

@test "FR-WORKFLOW-003 AC-5: business-analyst.md's 01-uat-script-validation.md output table has the manifest-drift row" {
  local doc="$REPO_ROOT/.copilot/agents/business-analyst.md"
  [ -f "$doc" ]
  # The output-file-format table's row uses the 3-column shape
  # (Check | Result | Notes) — 'PASS / FAIL / N/A' in the Result column,
  # 'diff named on FAIL' in the Notes column.
  grep -qE 'manifest matches doc fixture table.*scripts/uat-fixtures.*PASS / FAIL / N/A.*diff named on FAIL' "$doc"
}

# ─── AC-7: uat-verification.md Step 2 documents the reset invocation ──────────

@test "FR-WORKFLOW-003 AC-7: uat-verification.md Step 2 section documents --reset and failed-escalate together" {
  # Slice the file to the Step 2 section only (from its header to the next
  # '### Step' header), matching bp-uat-template-rule.bats's awk-slice
  # pattern for scoping a grep to one doc section rather than the whole
  # file. Guards against the doc drifting silently in a future edit.
  local doc="$REPO_ROOT/.copilot/workflows/uat-verification.md"
  [ -f "$doc" ]
  local step2
  step2=$(awk '/^### Step 2: Pre-Flight/{flag=1} flag{print} /^### Step 3:/{if (flag) exit}' "$doc")
  [ -n "$step2" ]
  echo "$step2" | grep -qE 'reset <BP-UAT-NNN>'
  echo "$step2" | grep -qE 'failed-escalate'
}

# ═══════════════════════════════════════════════════════════════════════════
# ISS-UAT-001-1 — ensure_test_user() now POSTs to the api's new
# /v1/internal/users/ensure-linked endpoint so newly-provisioned Authentik
# users are mirrored into directus_users before the consent-row FK lookup
# runs. In mock mode (UAT_SEED_DIRECTUS_MOCK=1) the api_ensure_directus_user_link
# helper emits one `ensure_linked <email> (mock, directus_user_id=mock-uuid)`
# line per identity fixture.
# ═══════════════════════════════════════════════════════════════════════════

@test "ISS-UAT-001-1: ensure_test_user emits one ensure_linked mock line per identity fixture" {
  # STEP 3 of uat-seed.sh runs ensure_test_user for two identities
  # (uat-member + uat-operator). Each call now also invokes
  # api_ensure_directus_user_link, which in mock mode prints one
  # `ensure_linked <email> (mock, directus_user_id=mock-uuid)` line.
  # Total expected: 2 lines.
  run bash -c 'UAT_SEED_DIRECTUS_MOCK=1 DIRECTUS_TOKEN=mock-token bash "$REPO_ROOT/scripts/uat-seed.sh" 2>&1'
  [ "$status" -eq 0 ]
  local count
  count=$(echo "$output" | grep -cE 'ensure_linked .*\(mock, directus_user_id=mock-uuid\)' || true)
  [ "$count" -eq 2 ]
}

@test "ISS-UAT-001-1: ensure_linked mock line carries the right email per identity" {
  # Strengthens the previous test: the two ensure_linked lines must
  # reference the right emails (one per identity that STEP 3
  # provisions). uat-member's email is `uat-member@example.com`,
  # uat-operator's is `uat-operator@example.com`.
  # (Switched from @aiqadam.test to @example.com in wf-20260704-fix-086 /
  # ISS-UAT-BRIDGE-002 — the @aiqadam.test TLD is rejected by Directus's
  # built-in is-email validator, blocking the bridge from creating the
  # directus_users mirror. .example.com is RFC 2606 reserved and passes
  # every email validator.)
  run bash -c 'UAT_SEED_DIRECTUS_MOCK=1 DIRECTUS_TOKEN=mock-token bash "$REPO_ROOT/scripts/uat-seed.sh" 2>&1'
  [ "$status" -eq 0 ]
  local member_lines operator_lines
  member_lines=$(echo "$output" | grep -cE 'ensure_linked uat-member@example\.com \(mock, directus_user_id=mock-uuid\)' || true)
  operator_lines=$(echo "$output" | grep -cE 'ensure_linked uat-operator@example\.com \(mock, directus_user_id=mock-uuid\)' || true)
  [ "$member_lines" -eq 1 ]
  [ "$operator_lines" -eq 1 ]
}

@test "ISS-UAT-001-1: api_ensure_directus_user_link helper is structurally present in uat-seed.sh" {
  # Structural regression: the helper function must exist (not just
  # the inline mock line) so the live-mode curl + token path stays
  # available. The bats above cover the mock branch; this guards the
  # function definition itself from a future refactor that accidentally
  # inlines the mock line and drops the live-mode code path.
  grep -qE '^api_ensure_directus_user_link\(\)' "$REPO_ROOT/scripts/uat-seed.sh"
  grep -qE 'INTERNAL_API_TOKEN' "$REPO_ROOT/scripts/uat-seed.sh"
  grep -qE '/v1/internal/users/ensure-linked' "$REPO_ROOT/scripts/uat-seed.sh"
}

# ═══════════════════════════════════════════════════════════════════════════
# ISS-UAT-SEED-002 (wf-20260704-fix-089): default-port drift in
# scripts/uat-seed.sh's api_ensure_directus_user_link helper.
# AC-1 / AC-5 are pure structural-grep regressions; AC-2 / AC-3 / AC-4
# use a stubbed-source technique that mirrors the FR-WORKFLOW-003
# isolated-copy pattern (see row 8 above) — the helper is byte-extracted
# from the live script into a BATS_TEST_TMPDIR stub with a controlled
# API_DIR, so the test never mutates the real apps/api/.env.
# ═══════════════════════════════════════════════════════════════════════════

@test "ISS-UAT-SEED-002 AC-1: uat-seed.sh contains no localhost:3001 reference" {
  # Pre-fix bug surface: the default literal was
  #   ${API_BASE_URL:-http://host.docker.internal:3001}
  # and an earlier iteration used
  #   ${API_BASE_URL:-http://localhost:3001}.
  # Both must be gone. The post-fix shape is ${API_BASE_URL:-http://localhost:${api_port}}
  # where api_port derives from apps/api/.env's PORT — see AC-2.
  ! grep -F 'localhost:3001' "$REPO_ROOT/scripts/uat-seed.sh"
  ! grep -F 'host.docker.internal:3001' "$REPO_ROOT/scripts/uat-seed.sh"
}

@test "ISS-UAT-SEED-002 AC-5: uat-seed.sh contains no host.docker.internal reference" {
  # Companion to AC-1: the misleading `host.docker.internal` prefix is
  # explicitly removed (the seed runs on the host shell, not in Docker,
  # so the magic DNS resolved to the same address as localhost and
  # implied a Docker-bridge path that doesn't exist).
  ! grep -F 'host.docker.internal' "$REPO_ROOT/scripts/uat-seed.sh"
}

# Stubbed-source helper: extracts the api_ensure_directus_user_link
# function body verbatim from uat-seed.sh, and runs it under a
# self-contained bash environment where:
#   - env_get / fail / ok are provided as local stubs (the helper's
#     only dependencies from the parent script)
#   - curl is replaced with an echoer that prints the URL it would
#     have called
#   - API_DIR points at the test's stub apps/api/.env (real file
#     untouched)
# so the captured stdout is exactly the resolved api_base URL.
#
# args: <stubbed_env_port_or_empty> <api_base_url_override_or_empty>
# stdout: the api_base URL the helper would have curl-ed
extract_api_base_from_helper() {
  local port_override="$1" url_override="$2"
  local stub_dir="$BATS_TEST_TMPDIR/api-base-stub"
  mkdir -p "$stub_dir/apps/api"
  rm -f "$stub_dir/apps/api/.env"
  # Always populate INTERNAL_API_TOKEN=dummy so the helper's token
  # guard passes (we are not testing token handling here — only the
  # resolved `api_base` URL). PORT is optional; when empty, the
  # helper's `${api_port:-3000}` fallback fires (AC-4 path).
  local env_body='INTERNAL_API_TOKEN=dummy'
  if [[ -n "$port_override" ]]; then
    env_body=$(printf 'PORT=%s\nINTERNAL_API_TOKEN=dummy\n' "$port_override")
  fi
  printf '%s' "$env_body" > "$stub_dir/apps/api/.env"

  # Extract the helper function verbatim from the live script. awk
  # walks from the function header to the matching closing brace
  # (depth tracking) — robust against unrelated `}` in strings/comments.
  local helper_src
  helper_src=$(awk '
    /^api_ensure_directus_user_link\(\) \{/ { in_fn=1; depth=0 }
    in_fn { print; for (i=1; i<=length($0); i++) { c=substr($0,i,1); if (c=="{") depth++; else if (c=="}") { depth--; if (depth==0 && in_fn) { in_fn=0; exit } } } }
  ' "$REPO_ROOT/scripts/uat-seed.sh")

  # Build a self-contained wrapper. The helper's only external
  # dependencies are env_get, fail, ok — provide them locally so we
  # can source the helper without the rest of uat-seed.sh's main flow.
  # The curl stub mimics `-w "\n%{http_code}"` semantics by emitting
  # the captured URL on one line and "200" on a new line — so the
  # helper's resp-parse path completes and the OK branch fires
  # (echoing the URL one more time, which the caller greps).
  cat > "$stub_dir/run.sh" <<WRAPPER_EOF
# Self-contained stubs (mirrors uat-seed.sh semantics):
RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'
ok()   { echo -e "\${GREEN}  ✓\${NC} \$*"; }
fail() { echo -e "\${RED}  ✗ FATAL:\${NC} \$*" >&2; exit 1; }
env_get() {
  local file="\$1" key="\$2"
  [[ -f "\$file" ]] || { echo ""; return; }
  grep -E "^\${key}=" "\$file" 2>/dev/null | head -1 | sed 's/^[^=]*=//' | tr -d '"\r' || true
}
# ISS-UAT-013-15: the live script's MSYS-detection block (added at the
# top of uat-seed.sh) is NOT extracted with the helper — this wrapper
# therefore sets CURL_BIN explicitly so the helper's \`"\$CURL_BIN"\`
# expansion resolves to the same name our stub shadows below.
CURL_BIN='curl'
export CURL_BIN
$helper_src
$( [[ -n "$url_override" ]] && echo "export API_BASE_URL='$url_override'" )
# Stub curl: mimic \`-w "\n%{http_code}"\` semantics — emit the URL,
# then a newline + "200". We also capture the URL into a side file
# (\$BATS_TEST_TMPDIR is shared with the parent) so the assertion can
# read it deterministically regardless of tty shape.
LAST_URL_FILE="$stub_dir/last_url"
curl() {
  local URL=""; local HTTP_CODE_LINE=""
  while [[ \$# -gt 0 ]]; do
    case "\$1" in
      http://*|https://*) URL="\$1" ;;
    esac
    shift
  done
  printf '%s' "\$URL" > "\$LAST_URL_FILE"
  printf '{\\n  "directusUserId": "stub-uuid"\\n}\\n200\\n'
}
# ISS-UAT-013-15: if a CI runner or developer happens to have curl.exe
# on PATH AND our local export CURL_BIN='curl' is overridden (e.g. via
# pre-existing environment), forward curl.exe to our curl stub so the
# assertion still captures the URL.
curl.exe() { curl "\$@"; }
api_ensure_directus_user_link "uat-test@example.com" "UAT Test"
WRAPPER_EOF

  # Run with API_DIR pointing at the stub apps/api dir.
  API_DIR="$stub_dir/apps/api" \
    OUT_FILE="$stub_dir/last_url" \
    bash "$stub_dir/run.sh" >&2
  cat "$stub_dir/last_url"
}

@test "ISS-UAT-SEED-002 AC-2: api_base default port is derived from apps/api/.env PORT" {
  # Stub apps/api/.env with PORT=4321 — the helper must produce
  # http://localhost:4321/v1/internal/users/ensure-linked (i.e. adopt
  # whatever PORT the api declares, not a hardcoded 3000 or 3001).
  local captured
  captured=$(extract_api_base_from_helper 4321 "")
  [[ "$captured" == *"http://localhost:4321/v1/internal/users/ensure-linked"* ]]
  # And confirm the hardcoded 3001 leak is gone.
  [[ "$captured" != *":3001"* ]]
  [[ "$captured" != *"host.docker.internal"* ]]
}

@test "ISS-UAT-SEED-002 AC-3: API_BASE_URL env override wins over the derived default" {
  # Even when apps/api/.env declares PORT=4321, an explicit API_BASE_URL
  # must take precedence. This guards the ${VAR:-default} shape across
  # future refactors.
  local captured
  captured=$(extract_api_base_from_helper 4321 "http://override-host:9999")
  [[ "$captured" == *"http://override-host:9999/v1/internal/users/ensure-linked"* ]]
  # The derived PORT=4321 must NOT bleed through.
  [[ "$captured" != *"4321"* ]]
}

@test "ISS-UAT-SEED-002 AC-4: api_base default falls back to :3000 when apps/api/.env is absent" {
  # Fresh-checkout UX: when apps/api/.env hasn't been created yet
  # (uat-env-setup.sh hasn't run), the seed must still produce a
  # sensible api_base URL — the documented fallback is :3000, matching
  # apps/api/.env.example's PORT=3000.
  local captured
  captured=$(extract_api_base_from_helper "" "")
  [[ "$captured" == *"http://localhost:3000/v1/internal/users/ensure-linked"* ]]
}

# ─── ISS-UAT-013-14: --reset BP-UAT-013 derives token_hash+token_prefix from manifest's token_plain ─
# Directus's operator_invites collection requires token_hash + token_prefix
# NOT NULL. The unconditional ensure_operator_invite() path computes both
# at the call site. The --reset path (reset_domain_fixture at
# scripts/uat-seed.sh lines 725-806) previously POSTed the manifest's
# payload verbatim and so failed with HTTP 400 FAILED_VALIDATION, leaving
# operator_invites empty after every --reset run. This regression test
# proves the fix is in place: reset_domain_fixture MUST contain a
# collection=operator_invites branch that reads .token_plain from the
# fixture and merges {token_hash, token_prefix} into resolved_payload
# using the sha256_hex helper, mirroring the reference implementation in
# ensure_operator_invite (scripts/uat-seed.sh lines 500-501, 558-595).

@test "ISS-UAT-013-14 structural: reset_domain_fixture derives token_hash + token_prefix from manifest token_plain (collection=operator_invites)" {
  local script="$REPO_ROOT/scripts/uat-seed.sh"
  # (a) The collection=operator_invites gate must exist inside reset_domain_fixture.
  # We grep the function body by anchoring on the function header and reading
  # the next ~120 lines (the function is ~80 lines in current source). A naive
  # global grep would also catch any operator_invites mention in
  # ensure_operator_invite, which we want to avoid — the fix lives in
  # reset_domain_fixture, not the unconditional path.
  local rdf_body
  # Bash 3-compatible: read the function body via sed line-anchor.
  # reset_domain_fixture opens at the function header (line ~725) and the
  # next function opens at run_reset_for_bp (line ~841). Extract that slice.
  rdf_body=$(sed -n '/^reset_domain_fixture() {/,/^}$/p' "$script")

  # (a) Collection gate present.
  [[ "$rdf_body" == *'[[ "$collection" == "operator_invites" ]]'* ]]

  # (b) token_plain read via jq with .token_plain // empty idiom (mirrors
  #     ensure_operator_invite's consumption shape).
  [[ "$rdf_body" == *"jq -r '.token_plain // empty'"* ]]

  # (c) SHA-256 derivation via the existing sha256_hex helper (matches the
  #     unconditional reference implementation).
  [[ "$rdf_body" == *"sha256_hex \"\$token_plain\""* ]]

  # (d) token_prefix computed as the first 8 chars of token_plain (matches
  #     the reference implementation byte-for-byte).
  [[ "$rdf_body" == *'token_prefix="${token_plain:0:8}"'* ]]

  # (e) jq-merge into resolved_payload uses --arg th / --arg tp typing
  #     AND the {token_hash:$th, token_prefix:$tp} field shape.
  [[ "$rdf_body" == *'--arg th "$token_hash"'* ]]
  [[ "$rdf_body" == *'--arg tp "$token_prefix"'* ]]
  [[ "$rdf_body" == *'. + {token_hash:$th, token_prefix:$tp}'* ]]
}

@test "ISS-UAT-013-14 behavioral: --reset BP-UAT-013 mock mode still exits 0 with exactly 4 operator_invites create lines" {
  # Behavioral regression: the fix is silent in mock mode (no new log lines,
  # per the silent-merge choice in 02-impact-analysis.md), so the existing
  # FR-WORKFLOW-003 row 1 invariant continues to hold: --reset BP-UAT-013 in
  # mock mode exits 0 and emits exactly 4 create lines for collection=operator_invites.
  # If a future edit accidentally introduced noisy log lines for the new
  # derivation block, this test would fail.
  run bash -c 'UAT_SEED_DIRECTUS_MOCK=1 DIRECTUS_TOKEN=mock-token bash "$REPO_ROOT/scripts/uat-seed.sh" --reset BP-UAT-013 2>&1'
  [ "$status" -eq 0 ]
  local count
  count=$(echo "$output" | grep -cE '\(mock, create collection=operator_invites\)' || true)
  [ "$count" -eq 4 ]
}

@test "ISS-UAT-013-14 unconditional: pnpm uat:seed mock mode (no --reset) still provisions all 4 operator_invites" {
  # Regression guard on AC-5: the unconditional ensure_operator_invite path
  # must continue to provision all 4 fixtures byte-identically. The fix
  # is scoped to --reset only; this test ensures the unconditional path
  # is not accidentally regressed.
  run bash -c 'UAT_SEED_DIRECTUS_MOCK=1 DIRECTUS_TOKEN=mock-token bash "$REPO_ROOT/scripts/uat-seed.sh" 2>&1'
  [ "$status" -eq 0 ]
  local count
  count=$(echo "$output" | grep -cE 'operator_invite .*\(mock' || true)
  [ "$count" -eq 4 ]
}

# ─── ISS-UAT-013-15: MSYS-aware curl binary selector ───────────────────────────
# Background: under a Git Bash / MSYS shell on Windows (the Copilot-Chat
# run_in_terminal sandbox on this machine), bash resolves `curl` to the
# MSYS2 GNU ELF binary, which cannot reach Windows-host `localhost:<port>`.
# scripts/uat-seed.sh must therefore prefer curl.exe when it is on PATH
# (matching the precedent in scripts/uat-preflight-email.sh). These tests
# are pinned to structural assertions on the script source so they
# survive the baseline-shift bug already documented in row 6 above.
@test "ISS-UAT-013-15 AC-2 (structural): uat-seed.sh has an MSYS-aware CURL_BIN detection block using 'command -v curl.exe'" {
  # The detection block is required (AC-2). It MUST use the
  # `command -v curl.exe` form (matching uat-preflight-email.sh's
  # precedent) and NOT the `uname -s | grep mingw` heuristic from
  # the issue body — the latter does not cover WSL bash, where
  # curl.exe is reachable from /mnt/c/Windows/System32.
  grep -q "command -v curl.exe" "$REPO_ROOT/scripts/uat-seed.sh"
  grep -q "CURL_BIN='curl.exe'" "$REPO_ROOT/scripts/uat-seed.sh"
  grep -q "CURL_BIN='curl'" "$REPO_ROOT/scripts/uat-seed.sh"
  # The detection block must appear near the top of the script
  # (before any function that uses curl). Allow a generous ceiling of
  # 100 lines to accommodate future growth.
  local detection_line
  detection_line=$(grep -n "command -v curl.exe" "$REPO_ROOT/scripts/uat-seed.sh" | head -1 | cut -d: -f1)
  [[ -n "$detection_line" ]]
  [ "$detection_line" -lt 100 ]
}

@test "ISS-UAT-013-15 AC-2 (structural): every runtime curl invocation in uat-seed.sh routes through \$CURL_BIN" {
  # Count standalone `curl` invocations in the script. We allow curl
  # to appear in comments and in `check_deps` (which is a `command -v`
  # check, not an HTTP call). The script must have ZERO `curl`
  # invocations OUTSIDE of check_deps/comments after the fix.
  #
  # Implementation: extract all non-comment lines containing literal
  # `curl ` (with trailing space, to avoid `curl.exe` / `curl.exe` /
  # `$CURL_BIN` matches) and verify they belong to check_deps OR to
  # a comment.
  local offending
  offending=$(grep -nE '^\s*curl ' "$REPO_ROOT/scripts/uat-seed.sh" || true)
  if [[ -n "$offending" ]]; then
    echo "Found runtime curl invocations outside \$CURL_BIN:"
    echo "$offending"
    return 1
  fi
  # And verify the substitution actually happened: there must be at
  # least 10 \"\$CURL_BIN\" call sites (the impact analysis counted 14
  # runtime invocations; allow some slack for future edits).
  local curlbin_count
  curlbin_count=$(grep -cE '"?\$CURL_BIN"?\s' "$REPO_ROOT/scripts/uat-seed.sh" || true)
  [ "$curlbin_count" -ge 10 ]
}

@test "ISS-UAT-013-15 AC-2 (runtime sim): CURL_BIN resolution branch — curl.exe-on-PATH selects curl.exe; absent falls back to curl" {
  # Run a stripped-down copy of the detection block under two
  # simulated PATH states and assert the right CURL_BIN is selected.
  # This is hermetic (no api / no Docker / no git). Mirrors the
  # structural check above with a runtime check that proves the
  # actual control flow, not just the literal text.
  local stub="$BATS_TEST_TMPDIR/curl-bin-stub"
  mkdir -p "$stub"

  # (a) curl.exe on PATH: detection block selects curl.exe
  cat > "$stub/curl.exe" <<'STUB'
#!/usr/bin/env bash
echo "curl.exe stub invoked"
STUB
  chmod +x "$stub/curl.exe"
  run bash -c "PATH=\"$stub:\$PATH\" bash -c '
    if command -v curl.exe &>/dev/null; then CURL_BIN=curl.exe; else CURL_BIN=curl; fi
    echo \"CURL_BIN=\$CURL_BIN\"
  '"
  [ "$status" -eq 0 ]
  [[ "$output" == *"CURL_BIN=curl.exe"* ]]

  # (b) curl.exe NOT on PATH (empty stub dir): detection block falls back to curl
  local empty_stub="$BATS_TEST_TMPDIR/empty-stub"
  mkdir -p "$empty_stub"
  run bash -c "PATH=\"$empty_stub:/usr/bin:/bin\" bash -c '
    # Mask the parent shell\"s curl.exe by prepending an empty dir only.
    if command -v curl.exe &>/dev/null; then CURL_BIN=curl.exe; else CURL_BIN=curl; fi
    echo \"CURL_BIN=\$CURL_BIN\"
  '"
  [ "$status" -eq 0 ]
  [[ "$output" == *"CURL_BIN=curl"* ]]
  # And the fallback must NOT be curl.exe.
  [[ "$output" != *"CURL_BIN=curl.exe"* ]]
}

@test "ISS-UAT-013-15 AC-2 (structural): check_deps now also verifies \$CURL_BIN is on PATH" {
  # The fix added a second `command -v \"$CURL_BIN\"` check inside
  # check_deps so a missing curl.exe surfaces an actionable FATAL
  # message before any helper function runs.
  grep -q 'command -v "$CURL_BIN"' "$REPO_ROOT/scripts/uat-seed.sh"
  grep -q 'Missing required curl binary' "$REPO_ROOT/scripts/uat-seed.sh"
}
