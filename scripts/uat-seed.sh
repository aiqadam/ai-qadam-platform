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
#   FORCE_REGEN=1 — re-create test users even if they already exist
#                   (resets their password + group membership)
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

# ── Colour helpers (same palette as uat-env-setup.sh) ─────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}  ✓${NC} $*"; }
warn() { echo -e "${YELLOW}  !${NC} $*"; }
info() { echo -e "  → $*"; }
fail() { echo -e "${RED}  ✗ FATAL:${NC} $*" >&2; exit 1; }

# ── Read a value from an existing .env file (empty if not found) ──────────────
env_get() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || { echo ""; return; }
  grep -E "^${key}=" "$file" 2>/dev/null | head -1 | sed 's/^[^=]*=//' | tr -d '"' || true
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
echo "[1/3] Verifying stack reachability…"
if ! curl -sf "${DIRECTUS_URL}/server/ping" -H "Authorization: Bearer ${DIRECTUS_TOKEN}" >/dev/null 2>&1; then
  fail "Directus unreachable at ${DIRECTUS_URL}. Start the stack: bash scripts/uat-env-setup.sh"
fi
ok "Directus reachable"
if ! curl -sf "${AK_URL}/if/admin/" >/dev/null 2>&1; then
  fail "Authentik unreachable at ${AK_URL}. Start the stack: bash scripts/uat-env-setup.sh"
fi
ok "Authentik reachable"

# ── STEP 2 — Directus schema + fixtures (delegates to bootstrap.sh) ──────────
echo ""
echo "[2/3] Running Directus bootstrap (collections + RBAC policies + demo data)…"
if [[ ! -f "$INFRA_DIR/directus/bootstrap.sh" ]]; then
  fail "infrastructure/directus/bootstrap.sh not found"
fi
# bootstrap.sh is idempotent (documented at its head) — safe to call every run.
DIRECTUS_URL="$DIRECTUS_URL" DIRECTUS_TOKEN="$DIRECTUS_TOKEN" \
  bash "$INFRA_DIR/directus/bootstrap.sh"
ok "Directus bootstrap complete"

# ── STEP 3 — Authentik test users ─────────────────────────────────────────────
echo ""
echo "[3/3] Creating Authentik test users…"
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

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
ok "UAT seed complete"
echo ""
echo "  Test credentials (also in apps/e2e/.env.uat):"
echo "    member:   ${MEMBER_EMAIL} / ${MEMBER_PASSWORD}"
echo "    operator: ${OPERATOR_EMAIL} / ${OPERATOR_PASSWORD}"
echo ""
echo "  Next: cd apps/e2e && pnpm playwright test --config playwright.uat.config.ts"
