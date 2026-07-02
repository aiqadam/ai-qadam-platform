#!/usr/bin/env bash
# scripts/uat-seed.sh
#
# Seed UAT test fixtures so BP-UAT-001 through BP-UAT-018 can run.
# Idempotent — safe to re-run.
#
# What this does (in order):
#   1. Verifies the UAT stack is reachable (Directus + Authentik)
#   2. Runs infrastructure/directus/bootstrap.sh — creates all Directus
#      collections (countries, events, registrations, member_consents,
#      operator_invites, …) + RBAC policies. Idempotent by design.
#   3. Creates the two UAT test users in Authentik and assigns them to
#      RBAC groups:
#        uat-member@aiqadam.test   → aiqadam-member
#        uat-operator@aiqadam.test → aiqadam-super-admin (full operator cab)
#      These credentials are referenced in apps/e2e/.env.uat
#      (UAT_MEMBER_EMAIL / UAT_OPERATOR_EMAIL) written by uat-env-setup.sh.
#   4. Inserts three operator_invites rows into Directus (one valid+unused,
#      one consumed, one expired) so BP-UAT-013 steps 005/006 and
#      Neg 002/003 can run against the real /v1/onboard/preview API. Idempotent.
#
# Prerequisites (all done by scripts/uat-env-setup.sh):
#   - Docker stack up (Authentik :9000, Directus :8200)
#   - apps/api/.env has DIRECTUS_TOKEN
#   - infrastructure/.env has AUTHENTIK_BOOTSTRAP_PASSWORD
#
# Usage (from repo root):
#   pnpm uat:seed
#
# Environment guards:
#   FORCE_REGEN=1              — re-create test users even if they already exist
#                                (resets their password + group membership)
#   UAT_SEED_DIRECTUS_MOCK=1   — skip ALL external calls (test mode for bats)
#
# Why a bash script, not TypeScript: the fixtures live in Directus
# (CMS) and Authentik (IdP) — both administered via REST + shell. There
# is no Drizzle/TypeScript surface to write to; bootstrap.sh already
# owns the Directus side in bash, and we mirror its shape here.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA_DIR="$REPO_ROOT/infrastructure"
API_DIR="$REPO_ROOT/apps/api"

FORCE_REGEN="${FORCE_REGEN:-0}"
UAT_SEED_DIRECTUS_MOCK="${UAT_SEED_DIRECTUS_MOCK:-0}"

# ── Colour helpers (same palette as uat-env-setup.sh) ─────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}  ✓${NC} $*"; }
warn() { echo -e "${YELLOW}  !${NC} $*"; }
info() { echo -e "  → $*"; }
fail() { echo -e "${RED}  ✗ FATAL:${NC} $*" >&2; exit 1; }

# ── Read a value from an existing .env file (empty if not found) ──────────────
# Strips both surrounding double-quotes AND trailing CR (Windows-edited .env
# files can have CRLF line endings; the bare CR corrupts bearer tokens when
# the value is interpolated into curl headers — Directus returns FORBIDDEN
# because the bearer doesn't match). tr -d '\r' is the standard fix used
# by all our env-reading helpers (ISS-UAT-SEED-001 AC-3).
env_get() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || { echo ""; return; }
  grep -E "^${key}=" "$file" 2>/dev/null | head -1 | sed 's/^[^=]*=//' | tr -d '"\r' || true
}

# ── Dependency checks ──────────────────────────────────────────────────────────
check_deps() {
  local missing=()
  for cmd in curl jq; do
    command -v "$cmd" &>/dev/null || missing+=("$cmd")
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    fail "Missing required tools: ${missing[*]}"
  fi
}

# ── Resolve Authentik admin token via docker exec ak shell ────────────────────
# Why docker exec and not HTTP Basic: Authentik 2024.x rejects HTTP Basic on
# /api/v3/core/tokens/ with "Unsupported authentication type", and the
# default-authentication-flow password stage errors out after the bootstrap
# password is rotated. The reliable path on a local Docker install is to mint
# a non-expiring api-intent token inside the container via `ak shell` — this
# is the same mechanism .copilot/oidc-setup-token was created with.
get_ak_admin_token() {
  local ak_url="$1" container="$2"
  # update_or_create is idempotent: re-running the seed just returns the
  # existing token's key. Intent=api + expiring=False so it survives across
  # runs; we never delete it (cleanup would break re-runs).
  local key
  key=$(docker exec "$container" ak shell -c "
from django.contrib.auth import get_user_model
from authentik.core.models import Token
U = get_user_model()
admin = U.objects.filter(username='akadmin').first()
t, _ = Token.objects.update_or_create(
    identifier='uat-seed-token',
    defaults={'user': admin, 'intent': 'api', 'expiring': False})
print(t.key)
" 2>/dev/null | tail -n 1 | tr -d '[:space:]')

  if [[ -z "$key" ]]; then
    fail "Could not mint Authentik admin token via docker exec. Is container '$container' running?"
  fi
  printf '%s' "$key"
}

# ── HTTP helpers (Bearer token) ────────────────────────────────────────────────
ak_get() {
  local url="$1" token="$2"
  curl -sf -H "Authorization: Bearer ${token}" "$url" 2>/dev/null || true
}

ak_post() {
  local url="$1" body="$2" token="$3"
  local resp code
  resp=$(curl -s -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    -X POST -w "\n%{http_code}" "$url" -d "$body")
  code="${resp##*$'\n'}"
  printf '%s|%s' "$code" "${resp%$'\n'*}"
}

ak_patch() {
  local url="$1" body="$2" token="$3"
  local resp code
  resp=$(curl -s -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    -X PATCH -w "\n%{http_code}" "$url" -d "$body")
  code="${resp##*$'\n'}"
  printf '%s|%s' "$code" "${resp%$'\n'*}"
}

# ── Look up Authentik user pk by username (empty if not found) ────────────────
user_pk_by_username() {
  local ak_url="$1" token="$2" username="$3"
  local encoded
  encoded=$(printf '%s' "$username" | jq -sRr @uri)
  ak_get "${ak_url}/api/v3/core/users/?username=${encoded}" "$token" \
    | jq -r '.results[0].pk // empty' 2>/dev/null || true
}

# ── Look up Authentik user pk by email (empty if not found) ───────────────────
# Used by ensure_operator_invite to populate operator_invites.authentik_user_id
# so apps/api/src/modules/admin-invites/admin-invites.service.ts:357 can resolve
# the invite at consume time. Without this, the api throws
# ConflictException('invite_missing_authentik_user') and the BP-UAT-013 Step 006
# form submit fails. ISS-UAT-SEED-001 AC-2.
user_pk_by_email() {
  local ak_url="$1" token="$2" email="$3"
  local encoded
  encoded=$(printf '%s' "$email" | jq -sRr @uri)
  ak_get "${ak_url}/api/v3/core/users/?email=${encoded}" "$token" \
    | jq -r '.results[0].pk // empty' 2>/dev/null || true
}

# ── Look up Authentik group pk by name (empty if not found) ───────────────────
group_pk_by_name() {
  local ak_url="$1" token="$2" name="$3"
  local encoded
  encoded=$(printf '%s' "$name" | jq -sRr @uri)
  ak_get "${ak_url}/api/v3/core/groups/?name=${encoded}" "$token" \
    | jq -r '.results[0].pk // empty' 2>/dev/null || true
}

# ── Ensure a single test user exists with the given password + groups ─────────
# Idempotent: if the user exists and FORCE_REGEN=0, just ensure group membership.
# If FORCE_REGEN=1 or user missing: create + set password + assign groups.
ensure_test_user() {
  local ak_url="$1" token="$2" username="$3" email="$4" name="$5"
  local password="$6" groups_csv="$7"

  local pk
  pk=$(user_pk_by_username "$ak_url" "$token" "$username")

  if [[ -n "$pk" && "$FORCE_REGEN" == "0" ]]; then
    ok "user ${username} (exists, pk=${pk})"
  else
    if [[ -z "$pk" ]]; then
      info "creating user ${username}"
      local create_body create_resp create_code
      create_body=$(jq -nc \
        --arg u "$username" --arg e "$email" --arg n "$name" \
        '{username:$u, name:$n, email:$e, is_active:true, type:"internal"}')
      create_resp=$(ak_post "${ak_url}/api/v3/core/users/" "$create_body" "$token")
      create_code="${create_resp%%|*}"
      if [[ "$create_code" != "200" && "$create_code" != "201" ]]; then
        fail "create user ${username} failed: HTTP ${create_code} — ${create_resp#*|}"
      fi
      pk=$(printf '%s' "${create_resp#*|}" | jq -r '.pk // empty')
      [[ -n "$pk" ]] || fail "create user ${username}: no pk in response"
      ok "user ${username} (created, pk=${pk})"
    else
      ok "user ${username} (exists, pk=${pk}) — FORCE_REGEN, resetting password"
    fi

    # Set password (separate endpoint per ADR-0035 §"session worked")
    local pw_resp pw_code
    pw_resp=$(ak_post "${ak_url}/api/v3/core/users/${pk}/set_password/" \
      "{\"password\":\"${password}\"}" "$token")
    pw_code="${pw_resp%%|*}"
    if [[ "$pw_code" != "200" && "$pw_code" != "204" ]]; then
      fail "set_password for ${username} failed: HTTP ${pw_code}"
    fi
    ok "password set for ${username}"
  fi

  # Assign groups. PATCH /users/{pk}/ with groups[] replaces membership.
  # Resolve each group name to pk; skip silently if missing (RBAC script
  # should have created them, but degrade gracefully per AGENTS.md §9).
  local group_pks=()
  IFS=',' read -ra _groups <<< "$groups_csv"
  for gname in "${_groups[@]}"; do
    [[ -z "$gname" ]] && continue
    local gpk
    gpk=$(group_pk_by_name "$ak_url" "$token" "$gname")
    if [[ -z "$gpk" ]]; then
      warn "group ${gname} not found in Authentik — skipping (run provision-authentik-rbac-groups.sh)"
      continue
    fi
    group_pks+=("$gpk")
  done

  if [[ ${#group_pks[@]} -gt 0 ]]; then
    local patch_body patch_resp patch_code
    patch_body=$(jq -nc --argjson groups "$(printf '%s\n' "${group_pks[@]}" | jq -R . | jq -s .)" \
      '{groups:$groups}')
    patch_resp=$(ak_patch "${ak_url}/api/v3/core/users/${pk}/" "$patch_body" "$token")
    patch_code="${patch_resp%%|*}"
    if [[ "$patch_code" != "200" && "$patch_code" != "204" ]]; then
      warn "group assignment for ${username} returned HTTP ${patch_code} (non-fatal)"
    else
      ok "${username} → groups: ${groups_csv}"
    fi
  fi
}

# ── Portable SHA-256 hex hash ────────────────────────────────────────────────
# sha256sum is Linux-only; macOS ships shasum. Both produce the same hex output.
sha256_hex() {
  if command -v sha256sum &>/dev/null; then
    printf '%s' "$1" | sha256sum | awk '{print $1}'
  else
    printf '%s' "$1" | shasum -a 256 | awk '{print $1}'
  fi
}

# ── Portable UTC timestamp with offset from now ───────────────────────────────
# Usage: date_offset <spec> <unit>
#   spec: "+7" or "-1" (sign + number)
#   unit: days | hours
# GNU date (Linux) uses -d; BSD date (macOS) uses -v.
date_offset() {
  local spec="$1" unit="$2"
  local result
  result=$(date -u -d "${spec} ${unit}" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || true)
  if [[ -n "$result" ]]; then
    printf '%s' "$result"
    return
  fi
  # BSD date (macOS): spec "+7" → -v+7d, "-2" → -v-2H
  local n="${spec:1}"    # strip sign
  local sign="${spec:0:1}"
  local flag
  case "$unit" in
    days)  flag="${sign}${n}d" ;;
    hours) flag="${sign}${n}H" ;;
    *)     fail "date_offset: unknown unit '${unit}'" ;;
  esac
  date -u -v"${flag}" '+%Y-%m-%dT%H:%M:%SZ'
}

# ── Idempotently insert one operator_invite row into Directus ─────────────────
# Args: <email> <status> <expires_at_iso> <consumed_at_iso_or_empty>
#       <token_plain> <display_name> [role_groups_json='[]']
#
# <display_name> is the value copied into the Directus `display_name` column
# and surfaced verbatim by the OnboardingForm at /onboard?token=…
# (`Welcome, {preview.display_name ?? preview.email.split('@')[0]}.`). Three
# fixture rows share the same Authentik email (`uat-operator@aiqadam.test`)
# but are distinguished in the UI by `display_name` (e.g. "UAT Operator
# (valid)"). The fourth fixture row uses a plus-addressed email with no
# matching Authentik user, which exercises the api's
# `invite_missing_authentik_user` path.
#
# UAT_SEED_DIRECTUS_MOCK=1 — skip all curl calls (used by bats tests).
#
# role_groups is a JSON array string passed as the 7th positional arg
# (default '[]'). ISS-UAT-013-10: the valid-invite row passes
# '["aiqadam-staff"]' so the BP-UAT-013 Step 005 spec assertion
# `getByText(/aiqadam-staff/i)` can find the role label rendered by
# apps/web/src/components/OnboardingForm.tsx at line ~194
# (`preview.role_groups.join(', ')`).
#
# ISS-UAT-SEED-001 (AC-1 + AC-2):
#   - consumed_at is a Directus readonly field. We OMIT the key from the POST
#     payload entirely when the value is empty (passing null still triggers
#     VALUE_TOO_LONG — see Directus 11 readonly behaviour). The consumed
#     branch keeps the value (Directus does not re-validate on PATCH, and
#     consume-time writes go through PATCH, not POST).
#   - We look up the Authentik user pk by email and include it as
#     authentik_user_id. The api's admin-invites.service.ts:357 throws
#     ConflictException('invite_missing_authentik_user') at consume time if
#     the column is null.
ensure_operator_invite() {
  local email="$1" status="$2" expires_at="$3" consumed_at="$4" token_plain="$5" display_name="$6"
  local role_groups="${7:-[]}"
  local token_hash token_prefix
  token_hash=$(sha256_hex "$token_plain")
  token_prefix="${token_plain:0:8}"

  # Look up the Authentik user pk by email. Empty result is allowed — the
  # no-user fixture row uses a plus-addressed email that intentionally has
  # no Authentik user (it exercises the api's invite_missing_authentik_user
  # error path).
  local ak_url="${AK_URL:-http://localhost:9000}"
  local ak_token="${AK_TOKEN:-}"
  local ak_user_pk=""
  if [[ -n "$ak_token" ]]; then
    ak_user_pk=$(user_pk_by_email "$ak_url" "$ak_token" "$email" 2>/dev/null || true)
  fi

  if [[ "$UAT_SEED_DIRECTUS_MOCK" == "1" ]]; then
    # Mock-mode line includes the email, role_groups AND the resolved
    # authentik_user_id (or "none" for the no-user fixture) so the bats
    # regression can grep all four invariants from stdout.
    local ak_label
    if [[ -n "$ak_user_pk" ]]; then
      ak_label="$ak_user_pk"
    else
      ak_label="none"
    fi
    ok "operator_invite ${token_prefix} (mock, email=${email}, role_groups=${role_groups}, authentik_user_id=${ak_label})"
    return
  fi

  # Idempotency guard: full SHA-256 hash uniquely identifies the row across
  # all four fixtures (their token_prefixes collide on "uat-onbo").
  local existing
  existing=$(curl -sf \
    -H "Authorization: Bearer ${DIRECTUS_TOKEN}" \
    "${DIRECTUS_URL}/items/operator_invites?filter[token_hash][_eq]=${token_hash}&limit=1" \
    2>/dev/null | jq -r '.data[0].id // empty' 2>/dev/null || true)
  if [[ -n "$existing" ]]; then
    ok "operator_invite ${token_prefix} (exists, id=${existing})"
    return
  fi

  # Build payload. Two notes:
  #   (a) `consumed_at` is OMITTED entirely when the value is empty — passing
  #       null triggers Directus 11 readonly validation (VALUE_TOO_LONG). The
  #       consumed branch keeps consumed_at in the body.
  #   (b) `authentik_user_id` is included as an integer JSON value (or
  #       omitted if the email has no matching Authentik user — e.g. the
  #       no-user fixture row).
  local body
  if [[ -n "$consumed_at" ]]; then
    if [[ -n "$ak_user_pk" ]]; then
      body=$(jq -nc \
        --arg e   "$email" \
        --arg dn  "$display_name" \
        --arg st  "$status" \
        --arg exp "$expires_at" \
        --arg cat "$consumed_at" \
        --arg th  "$token_hash" \
        --arg tp  "$token_prefix" \
        --argjson rg "$role_groups" \
        --argjson ak "$ak_user_pk" \
        '{email:$e,display_name:$dn,status:$st,expires_at:$exp,consumed_at:$cat,token_hash:$th,token_prefix:$tp,role_groups:$rg,authentik_user_id:$ak}')
    else
      body=$(jq -nc \
        --arg e   "$email" \
        --arg dn  "$display_name" \
        --arg st  "$status" \
        --arg exp "$expires_at" \
        --arg cat "$consumed_at" \
        --arg th  "$token_hash" \
        --arg tp  "$token_prefix" \
        --argjson rg "$role_groups" \
        '{email:$e,display_name:$dn,status:$st,expires_at:$exp,consumed_at:$cat,token_hash:$th,token_prefix:$tp,role_groups:$rg}')
    fi
  else
    if [[ -n "$ak_user_pk" ]]; then
      body=$(jq -nc \
        --arg e   "$email" \
        --arg dn  "$display_name" \
        --arg st  "$status" \
        --arg exp "$expires_at" \
        --arg th  "$token_hash" \
        --arg tp  "$token_prefix" \
        --argjson rg "$role_groups" \
        --argjson ak "$ak_user_pk" \
        '{email:$e,display_name:$dn,status:$st,expires_at:$exp,token_hash:$th,token_prefix:$tp,role_groups:$rg,authentik_user_id:$ak}')
    else
      body=$(jq -nc \
        --arg e   "$email" \
        --arg dn  "$display_name" \
        --arg st  "$status" \
        --arg exp "$expires_at" \
        --arg th  "$token_hash" \
        --arg tp  "$token_prefix" \
        --argjson rg "$role_groups" \
        '{email:$e,display_name:$dn,status:$st,expires_at:$exp,token_hash:$th,token_prefix:$tp,role_groups:$rg}')
    fi
  fi

  local resp code
  resp=$(curl -s \
    -H "Authorization: Bearer ${DIRECTUS_TOKEN}" \
    -H "Content-Type: application/json" \
    -X POST -w "\n%{http_code}" \
    "${DIRECTUS_URL}/items/operator_invites" \
    -d "$body" 2>/dev/null)
  code="${resp##*$'\n'}"

  if [[ "$code" != "200" && "$code" != "201" ]]; then
    fail "ensure_operator_invite ${token_prefix}: HTTP ${code} — ${resp%$'\n'*}"
  fi
  ok "operator_invite ${token_prefix} (created, status=${status}, authentik_user_id=${ak_user_pk:-none})"
}

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║        AI Qadam — UAT Seed Fixtures                  ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

check_deps

# ── Read env from files written by uat-env-setup.sh ───────────────────────────
DIRECTUS_URL="${DIRECTUS_URL:-http://localhost:8200}"
DIRECTUS_TOKEN="${DIRECTUS_TOKEN:-$(env_get "$API_DIR/.env" "DIRECTUS_TOKEN")}"
[[ -n "$DIRECTUS_TOKEN" ]] || fail "DIRECTUS_TOKEN missing (apps/api/.env not seeded by uat-env-setup.sh?)"

AK_URL="${AK_URL:-http://localhost:9000}"
# Authentik server container name (matches infrastructure/docker-compose.yml service).
# Used only to mint the admin API token via docker exec ak shell.
AK_CONTAINER="${AK_CONTAINER:-aiqadam-authentik-server}"

# Test credentials — must match apps/e2e/.env.uat written by uat-env-setup.sh
MEMBER_EMAIL="${UAT_MEMBER_EMAIL:-uat-member@aiqadam.test}"
MEMBER_PASSWORD="${UAT_MEMBER_PASSWORD:-UatMember1!}"
OPERATOR_EMAIL="${UAT_OPERATOR_EMAIL:-uat-operator@aiqadam.test}"
OPERATOR_PASSWORD="${UAT_OPERATOR_PASSWORD:-UatOperator1!}"

# ── STEP 1 — Reachability ─────────────────────────────────────────────────────
echo "[1/4] Verifying stack reachability…"
if [[ "$UAT_SEED_DIRECTUS_MOCK" == "1" ]]; then
  ok "Directus reachable (mock)"
  ok "Authentik reachable (mock)"
else
  if ! curl -sf "${DIRECTUS_URL}/server/ping" -H "Authorization: Bearer ${DIRECTUS_TOKEN}" >/dev/null 2>&1; then
    fail "Directus unreachable at ${DIRECTUS_URL}. Start the stack: bash scripts/uat-env-setup.sh"
  fi
  ok "Directus reachable"
  if ! curl -sf "${AK_URL}/if/admin/" >/dev/null 2>&1; then
    fail "Authentik unreachable at ${AK_URL}. Start the stack: bash scripts/uat-env-setup.sh"
  fi
  ok "Authentik reachable"
fi

# ── STEP 2 — Directus schema + fixtures (delegates to bootstrap.sh) ──────────
echo ""
echo "[2/4] Running Directus bootstrap (collections + RBAC policies + demo data)…"
if [[ "$UAT_SEED_DIRECTUS_MOCK" == "1" ]]; then
  ok "Directus bootstrap complete (mock)"
else
  if [[ ! -f "$INFRA_DIR/directus/bootstrap.sh" ]]; then
    fail "infrastructure/directus/bootstrap.sh not found"
  fi
  # bootstrap.sh is idempotent (documented at its head) — safe to call every run.
  DIRECTUS_URL="$DIRECTUS_URL" DIRECTUS_TOKEN="$DIRECTUS_TOKEN" \
    bash "$INFRA_DIR/directus/bootstrap.sh"
  ok "Directus bootstrap complete"
fi

# ── STEP 3 — Authentik test users ─────────────────────────────────────────────
echo ""
echo "[3/4] Creating Authentik test users…"
if [[ "$UAT_SEED_DIRECTUS_MOCK" == "1" ]]; then
  ok "user uat-member (mock)"
  ok "user uat-operator (mock)"
else
  AK_TOKEN=$(get_ak_admin_token "$AK_URL" "$AK_CONTAINER")
  [[ -n "$AK_TOKEN" ]] || fail "Failed to obtain Authentik admin token"

  # Group membership per ADR-0021 §2 (canonical role names).
  # Member: standard community member.
  # Operator: super-admin cab so BP-UAT-001..018 can drive operator flows.
  ensure_test_user \
    "$AK_URL" "$AK_TOKEN" \
    "uat-member" "$MEMBER_EMAIL" "UAT Member" \
    "$MEMBER_PASSWORD" "aiqadam-member"

  ensure_test_user \
    "$AK_URL" "$AK_TOKEN" \
    "uat-operator" "$OPERATOR_EMAIL" "UAT Operator" \
    "$OPERATOR_PASSWORD" "aiqadam-super-admin"
fi

# ── STEP 4 — operator_invites rows ──────────────────────────────────────────
# Four rows for BP-UAT-013 (ISS-UAT-013-4, ISS-UAT-013-8): valid+unused,
# consumed, expired, plus a fourth row whose email has no matching Authentik
# user to exercise the api's `invite_missing_authentik_user` path.
#
# All three "happy" rows share email `uat-operator@aiqadam.test` so the api
# can resolve the seeded Authentik user at accept time. Rows are
# distinguished in the OnboardingForm UI by `display_name`. The fourth
# (`no-user`) row uses a plus-addressed email so the api's
# consumeInvite() throws ConflictException('invite_missing_authentik_user')
# — exercising that error path.
#
# Tokens are static test-fixture constants — never used in production.
#
# ISS-UAT-SEED-001: the AK_TOKEN minted in step 3 is needed here too so
# ensure_operator_invite can resolve each row's Authentik user pk by
# email. In mock mode AK_TOKEN is empty (lookups return "" which becomes
# the "none" label in the mock line).
echo ""
echo "[4/4] Provisioning operator_invites rows…"
_now_plus_7d=$(date_offset "+7" days)
_now_minus_2h=$(date_offset "-2" hours)
_now_minus_1d=$(date_offset "-1" days)

ONBOARD_TOKEN="uat-onboard-token"
ONBOARD_USED_TOKEN="uat-onboard-used-token"
ONBOARD_EXPIRED_TOKEN="uat-onboard-expired-token"
ONBOARD_NO_USER_TOKEN="uat-onboard-no-user-token"
OPERATOR_FIXTURE_EMAIL="uat-operator@aiqadam.test"
NO_USER_FIXTURE_EMAIL="uat-operator+no-user@aiqadam.test"

# ISS-UAT-013-10: valid invite must include 'aiqadam-staff' so the
# BP-UAT-013 Step 005 spec assertion `getByText(/aiqadam-staff/i)` can
# find the role label rendered by apps/web/src/components/OnboardingForm.tsx
# at line ~194 (`preview.role_groups.join(', ')`). The other three rows
# intentionally keep role_groups=[] because:
#   - used + expired: spec asserts GonePanel, not role label; empty groups
#     keep these rows realistic for their error paths.
#   - no-user: spec asserts the api returns 409 invite_missing_authentik_user;
#     role_groups is irrelevant to that error path. Keeping [] avoids
#     accidentally exercising the role-to-Authentik group mapping for a
#     user that intentionally does not exist.
ensure_operator_invite \
  "$OPERATOR_FIXTURE_EMAIL" "pending" "$_now_plus_7d" "" \
  "$ONBOARD_TOKEN" "UAT Operator (valid)" '["aiqadam-staff"]'

ensure_operator_invite \
  "$OPERATOR_FIXTURE_EMAIL" "consumed" "$_now_plus_7d" "$_now_minus_2h" \
  "$ONBOARD_USED_TOKEN" "UAT Operator (used)" '[]'

ensure_operator_invite \
  "$OPERATOR_FIXTURE_EMAIL" "pending" "$_now_minus_1d" "" \
  "$ONBOARD_EXPIRED_TOKEN" "UAT Operator (expired)" '[]'

ensure_operator_invite \
  "$NO_USER_FIXTURE_EMAIL" "pending" "$_now_plus_7d" "" \
  "$ONBOARD_NO_USER_TOKEN" "UAT Operator (no-user)" '[]'

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
ok "UAT seed complete"
echo ""
echo "  Test credentials (also in apps/e2e/.env.uat):"
echo "    member:   ${MEMBER_EMAIL} / ${MEMBER_PASSWORD}"
echo "    operator: ${OPERATOR_EMAIL} / ${OPERATOR_PASSWORD}"
echo ""
echo "  operator_invites tokens (also in apps/e2e/.env.uat):"
echo "    valid:    ${ONBOARD_TOKEN}            (display_name: \"UAT Operator (valid)\")"
echo "    used:     ${ONBOARD_USED_TOKEN}       (display_name: \"UAT Operator (used)\")"
echo "    expired:  ${ONBOARD_EXPIRED_TOKEN}    (display_name: \"UAT Operator (expired)\")"
echo "    no-user:  ${ONBOARD_NO_USER_TOKEN}    (display_name: \"UAT Operator (no-user)\" — API returns 409 invite_missing_authentik_user)"
echo ""
echo "  Next: cd apps/e2e && pnpm playwright test --config playwright.uat.config.ts"
