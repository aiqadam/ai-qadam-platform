#!/usr/bin/env bats
# scripts/tests/bootstrap-public-policy-name-lookup.bats
#
# Regression test for ISS-PUB-POLICY-UUID-PIN-001 (wf-20260801-fix-188):
# infrastructure/directus/bootstrap.sh used to define an env-specific UUID
# pin POLICY_PUBLIC_PROD="87bf5954-…" for the Directus Public policy.
# On every Directus instance whose Public policy had a different id
# (notably local: abf8a154-5b1c-4a46-ac9c-7300570f4f17), the eight lower
# public-read grant blocks silently skipped, so unauthenticated reads of
# event_materials / event_photos / event_questions / event_sponsors /
# sponsors / site_settings / press_page / badge_definitions /
# team_members returned zero rows even on rows that should be public.
#
# The fix migrates the eight blocks to the same name-lookup pattern that
# ISS-SEC-DIRECTUS-USERS-PUBLIC-001 (line 178) and
# ISS-SEC-PUBLIC-UNMANAGED-001 (line ~2979) already use: resolve
# `$t:public_label` against `/policies` and store the result in a block-
# scoped PUBLIC_POLICY_ID. POLICY_PUBLIC_PROD and its 87bf5954-… value
# are removed.
#
# This file is a *static* regression — no Directus, no Docker, no curl.
# It inspects bootstrap.sh with grep/awk so it can run in CI without
# infrastructure. It is intentionally paired with the live verification
# steps (Pre-flight $t:public_label lookup, idempotent re-bootstrap)
# which the TestRunner executes after this static gate is green.
#
# Failure-vs-pass contract (proves the bug is real and the fix lands):
#   Against origin/main (pre-fix):
#     - POLICY_PUBLIC_PROD assignment to 87bf5954-… exists        → FAIL #1
#     - 87bf5954 appears in executable code (not just a comment)  → FAIL #2
#     - PUBLIC_POLICY_ID=…lookup blocks: 0                       → FAIL #3
#   Against fix/ISS-PUB-POLICY-UUID-PIN-001-… (this branch):
#     - All five tests below pass.
#
# Run:
#   bash scripts/run-bats.sh scripts/tests/bootstrap-public-policy-name-lookup.bats
#   pnpm test:bash

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  BOOTSTRAP="$REPO_ROOT/infrastructure/directus/bootstrap.sh"
  export REPO_ROOT BOOTSTRAP
}

# ─── AC-1: POLICY_PUBLIC_PROD variable definition is gone ───────────────

@test "AC-1: bootstrap.sh no longer defines POLICY_PUBLIC_PROD" {
  [ -f "$BOOTSTRAP" ] || { echo "bootstrap.sh not found at $BOOTSTRAP"; return 1; }
  # Any assignment of POLICY_PUBLIC_PROD (with or without leading
  # whitespace, export, local, or readonly) is a regression. The pre-fix
  # line was `POLICY_PUBLIC_PROD="87bf5954-616e-40fa-bd61-2587e8c3f49b"`
  # inside the event_materials block.
  ! grep -qE '^[[:space:]]*(export[[:space:]]+|local[[:space:]]+|readonly[[:space:]]+)?POLICY_PUBLIC_PROD=' "$BOOTSTRAP" \
    || { echo "POLICY_PUBLIC_PROD=… assignment still present in bootstrap.sh — pre-fix pin not removed"; return 1; }
  # Also catch any read of the variable, even if a stray reference
  # survived the deletion. After the migration every reference to the
  # UUID pin was renamed to PUBLIC_POLICY_ID.
  ! grep -qE '\$\{?POLICY_PUBLIC_PROD\}?' "$BOOTSTRAP" \
    || { echo "bootstrap.sh still references \$POLICY_PUBLIC_PROD — should be renamed to PUBLIC_POLICY_ID"; return 1; }
}

# ─── AC-2: hardcoded UUID 87bf5954-… is not used in executable code ────

@test "AC-2: bootstrap.sh does not use the 87bf5954-… UUID in executable code" {
  # The historical comment at line ~2973 (ISS-SEC-PUBLIC-UNMANAGED-001
  # block) still names the pin when explaining why this migration was
  # out of scope for the previous PR — that comment is intentional and
  # out of scope for this PR. We allow one such reference, and only
  # inside a comment line (#). Any executable (non-#) line containing
  # the literal UUID is a regression.
  local offenders
  offenders="$(grep -nE '87bf5954-616e-40fa-bd61-2587e8c3f49b' "$BOOTSTRAP" \
    | grep -vE '^[[:digit:]]+:[[:space:]]*#' || true)"
  [[ -z "$offenders" ]] \
    || { echo "87bf5954-… UUID appears on non-comment line(s):"; echo "$offenders"; return 1; }
}

# ─── AC-3: exactly eight lower blocks resolve PUBLIC_POLICY_ID ───────────

@test "AC-3: bootstrap.sh has exactly eight lower PUBLIC_POLICY_ID name-lookup blocks" {
  # The reference pattern (line 178 verbatim, three physical lines) is:
  #   PUBLIC_POLICY_ID=$(curl -s -H "${H_AUTH}" \
  #     "${DIRECTUS_URL}/policies?filter%5Bname%5D%5B_eq%5D=%24t%3Apublic_label&fields=id&limit=1" \
  #     | jq -r '.data[0].id // empty' 2>/dev/null || true)
  #
  # Each block is a single `$(curl …)` substitution that spans multiple
  # physical lines. The URL we want to assert lives on the SECOND line
  # of the block (not on the assignment line), so a single-line grep
  # of the assignment is the wrong tool — that is the bug this test
  # previously had. We extract the whole multi-line block with awk
  # (from the assignment line to the matching `)` that closes the
  # `$(…)`) and verify the encoded URL appears within it.
  #
  # Count assignments. Pre-fix: 0. Post-fix: exactly 8 (one per migrated
  # block). The two higher sections use different variable names
  # (DIRECTUS_PUBLIC_POLICY_ID at line 178, ISS_169_PUBLIC_POLICY_ID at
  # line 2979) so they are NOT counted here.
  local count
  count="$(grep -cE '^[[:space:]]*PUBLIC_POLICY_ID=\$\(curl' "$BOOTSTRAP")"
  [[ "$count" -eq 8 ]] \
    || { echo "expected 8 PUBLIC_POLICY_ID=...curl assignments (one per migrated block), got $count"; return 1; }

  # Extract every `PUBLIC_POLICY_ID=$(curl …)` multi-line block as a
  # single record separated by `@@__BLOCK_END__@@`. A block starts on a
  # line matching `^[[:space:]]*PUBLIC_POLICY_ID=$(curl` and continues
  # until awk sees a closing `)` (the end of the `$(…)` substitution).
  # The encoded URL `filter%5Bname%5D%5B_eq%5D=%24t%3Apublic_label` must
  # appear somewhere inside that multi-line block. Pre-fix: zero blocks
  # are emitted (and the count check above already fails). Post-fix:
  # every emitted block contains the URL.
  local blocks
  blocks="$(awk '
    /^[[:space:]]*PUBLIC_POLICY_ID=\$\(curl/ {
      in_block = 1
      buf = $0
      next
    }
    in_block {
      buf = buf "\n" $0
      # Close the block when the substitution ends. The reference
      # blocks terminate with `|| true)` on their last line.
      if ($0 ~ /\)$/) {
        print buf
        print "@@__BLOCK_END__@@"
        in_block = 0
        buf = ""
      }
    }
  ' "$BOOTSTRAP")"

  local wrong_url=""
  local block_no=0
  local block=""
  while IFS= read -r line; do
    if [[ "$line" == "@@__BLOCK_END__@@" ]]; then
      block_no=$((block_no + 1))
      if ! grep -qE 'filter%5Bname%5D%5B_eq%5D=%24t%3Apublic_label' <<<"$block"; then
        wrong_url+="----- block #$block_no -----"$'\n'"$block"$'\n'
      fi
      block=""
    else
      if [[ -z "$block" ]]; then
        block="$line"
      else
        block+=$'\n'"$line"
      fi
    fi
  done <<<"$blocks"

  [[ -z "$wrong_url" ]] \
    || { echo "some PUBLIC_POLICY_ID blocks do not use the \$t:public_label name lookup (URL lives on the continuation line, not the assignment line):"; echo "$wrong_url"; return 1; }

  # Sanity: we should have inspected exactly the same number of blocks
  # as assignments counted above. If a future refactor changes the
  # block terminator (e.g. drops the closing `)` onto a fresh line),
  # this guard catches the regression before silently passing.
  [[ "$block_no" -eq "$count" ]] \
    || { echo "internal mismatch: counted $count assignment lines but only $block_no multi-line blocks were extracted"; return 1; }
}

# ─── AC-4: every expected collection still has its public-read grant ────

@test "AC-4: all eight expected collections appear under a PUBLIC_POLICY_ID block" {
  # event_sponsors and sponsors share a single block (single
  # PUBLIC_POLICY_ID, two ensure_perm_for_policy calls); the other
  # seven collections are one-per-block. So 8 blocks cover 9 grants.
  local expected=(
    "event_materials"
    "event_photos"
    "event_questions"
    "event_sponsors"
    "sponsors"
    "site_settings"
    "press_page"
    "badge_definitions"
    "team_members"
  )
  local missing=()
  local coll
  for coll in "${expected[@]}"; do
    # A grant for $coll under PUBLIC_POLICY_ID exists iff some line in
    # the file references both `PUBLIC_POLICY_ID` and the collection
    # name (typically inside an ensure_perm_for_policy call or a
    # permissions filter). This is a presence check, not a semantic
    # one — semantic correctness is verified by the live pre-flight
    # step the TestRunner runs after this static gate.
    if ! grep -qE "PUBLIC_POLICY_ID.*${coll}|${coll}.*PUBLIC_POLICY_ID" "$BOOTSTRAP"; then
      missing+=("$coll")
    fi
  done
  [[ "${#missing[@]}" -eq 0 ]] \
    || { echo "missing PUBLIC_POLICY_ID grant for collection(s): ${missing[*]}"; return 1; }
}

# ─── AC-5: each block guards the permissions call on a non-empty ID ─────

@test "AC-5: each PUBLIC_POLICY_ID block guards its permissions call" {
  # The pre-fix blocks echoed "  ⚠ Public policy $POLICY_PUBLIC_PROD
  # not found — skipping…" and silently skipped if the UUID didn't
  # match. After the fix, the guard is `if [ -n "${PUBLIC_POLICY_ID}" ]`
  # wrapping the count-then-POST block. There must be at least eight
  # such guards (one per migrated block).
  local guard_count
  guard_count="$(grep -cE '^[[:space:]]*if[[:space:]]+\[[[:space:]]*-n[[:space:]]+"?\$\{?PUBLIC_POLICY_ID\}?' "$BOOTSTRAP")"
  [[ "$guard_count" -ge 8 ]] \
    || { echo "expected at least 8 'if [ -n \"\${PUBLIC_POLICY_ID}\" ]' guards, got $guard_count"; return 1; }

  # And every block must still skip (not silently succeed) when the
  # lookup returns empty — i.e. each guard has a matching `else` branch
  # that prints the skip warning. The migrated blocks echo
  # `⚠ Public policy (\$t:public_label) not found — skipping public
  # read for <collection>` in their else branch. Counting those echoes
  # is a stronger check than a blanket else-floor (the file has many
  # else-branches for other reasons), and it directly asserts the
  # "no silent skip" property that the original bug violated.
  local skip_warnings
  skip_warnings="$(grep -cE '^[[:space:]]*echo[[:space:]]+"  ⚠ Public policy' "$BOOTSTRAP")"
  [[ "$skip_warnings" -ge 8 ]] \
    || { echo "expected at least 8 '⚠ Public policy (\$t:public_label) not found' skip warnings (one per migrated block), got $skip_warnings"; return 1; }
}
