#!/usr/bin/env bash
# scripts/uat-env-setup.sh
#
# One-command UAT environment bootstrap. Idempotent — safe to re-run.
#
# What this does (in order):
#   1. Generate secrets and write infrastructure/.env (if missing or stale)
#   2. Generate secrets and write apps/api/.env (if missing or stale)
#   3. Write apps/web/.env (trivial, always safe to overwrite)
#   4. docker compose up -d (starts Postgres, Redis, Authentik, Directus, Mailpit, …)
#   5. Wait for all services to pass their healthchecks
#   6. Bootstrap Authentik: create the OIDC application + provider via the admin API
#   7. Extract OIDC client_id + client_secret from Authentik
#   8. Patch apps/api/.env with the live OIDC credentials
#   9. Write apps/e2e/.env.uat with UAT-specific values
#  10. Print a short summary
#
# Prerequisites: docker, docker compose v2, curl, jq, openssl
# Usage (from repo root):
#   bash scripts/uat-env-setup.sh
#
# Environment guards:
#   FORCE_REGEN=1   — overwrite existing .env files even if they exist
#   DRY_RUN=1       — print what would be done, make no changes

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA_DIR="$REPO_ROOT/infrastructure"
API_DIR="$REPO_ROOT/apps/api"
WEB_DIR="$REPO_ROOT/apps/web"
E2E_DIR="$REPO_ROOT/apps/e2e"

FORCE_REGEN="${FORCE_REGEN:-0}"
DRY_RUN="${DRY_RUN:-0}"

# ── Colour helpers ─────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}  ✓${NC} $*"; }
warn() { echo -e "${YELLOW}  !${NC} $*"; }
info() { echo -e "  → $*"; }
fail() { echo -e "${RED}  ✗ FATAL:${NC} $*" >&2; exit 1; }

# ── Dry-run write ──────────────────────────────────────────────────────────────
write_file() {
  local path="$1" content="$2"
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[dry-run] would write: $path"
    return
  fi
  printf '%s\n' "$content" > "$path"
}

# ── Dependency checks ──────────────────────────────────────────────────────────
check_deps() {
  local missing=()
  for cmd in docker curl jq openssl; do
    command -v "$cmd" &>/dev/null || missing+=("$cmd")
  done
  # docker compose v2
  docker compose version &>/dev/null || missing+=("docker-compose-v2")
  if [[ ${#missing[@]} -gt 0 ]]; then
    fail "Missing required tools: ${missing[*]}"
  fi
}

# ── Secret generation ──────────────────────────────────────────────────────────
gen_secret()    { openssl rand -base64 48 | tr -d '\n/+=' | head -c 64; }
gen_hex_32()    { openssl rand -hex 32; }
gen_hex_64()    { openssl rand -hex 64; }

# ── Read a value from an existing .env file (returns empty if not found) ───────
env_get() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || { echo ""; return; }
  grep -E "^${key}=" "$file" 2>/dev/null | head -1 | sed 's/^[^=]*=//' | tr -d '"' || true
}

# ── Replace or append a key=value in an env file ──────────────────────────────
env_set() {
  local file="$1" key="$2" value="$3"
  [[ "$DRY_RUN" == "1" ]] && { echo "[dry-run] $file: $key=<value>"; return; }
  if grep -qE "^${key}=" "$file" 2>/dev/null; then
    # Replace in-place (portable sed)
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$file" && rm -f "${file}.bak"
  else
    echo "${key}=${value}" >> "$file"
  fi
}

# ── Wait for a URL to respond HTTP 200 ────────────────────────────────────────
wait_for_url() {
  local label="$1" url="$2" max_wait="${3:-120}"
  local elapsed=0
  info "Waiting for $label ($url)…"
  while ! curl -sf "$url" -o /dev/null 2>/dev/null; do
    sleep 3
    elapsed=$((elapsed + 3))
    if [[ $elapsed -ge $max_wait ]]; then
      fail "$label did not become healthy within ${max_wait}s. Check: docker compose logs"
    fi
  done
  ok "$label is healthy"
}

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║        AI Qadam — UAT Environment Setup              ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

check_deps

# ══════════════════════════════════════════════════════════════════════════════
# STEP 1 — infrastructure/.env
# ══════════════════════════════════════════════════════════════════════════════
echo "[1/9] infrastructure/.env"

INFRA_ENV="$INFRA_DIR/.env"
if [[ ! -f "$INFRA_ENV" || "$FORCE_REGEN" == "1" ]]; then
  info "Creating $INFRA_ENV from .env.example"
  [[ "$DRY_RUN" != "1" ]] && cp "$INFRA_DIR/.env.example" "$INFRA_ENV"
fi

# Generate any blank mandatory secrets
_ak_secret=$(env_get "$INFRA_ENV" "AUTHENTIK_SECRET_KEY")
if [[ -z "$_ak_secret" ]]; then
  info "Generating AUTHENTIK_SECRET_KEY"
  env_set "$INFRA_ENV" "AUTHENTIK_SECRET_KEY" "$(gen_secret)"
fi

_ak_pass=$(env_get "$INFRA_ENV" "AUTHENTIK_BOOTSTRAP_PASSWORD")
if [[ -z "$_ak_pass" ]]; then
  info "Setting AUTHENTIK_BOOTSTRAP_PASSWORD=SuperSecretPass"
  env_set "$INFRA_ENV" "AUTHENTIK_BOOTSTRAP_PASSWORD" "SuperSecretPass"
fi

_twenty_secret=$(env_get "$INFRA_ENV" "TWENTY_APP_SECRET")
if [[ -z "$_twenty_secret" ]]; then
  info "Generating TWENTY_APP_SECRET"
  env_set "$INFRA_ENV" "TWENTY_APP_SECRET" "$(gen_secret)"
fi

_directus_secret=$(env_get "$INFRA_ENV" "DIRECTUS_SECRET")
if [[ -z "$_directus_secret" ]]; then
  info "Generating DIRECTUS_SECRET"
  env_set "$INFRA_ENV" "DIRECTUS_SECRET" "$(gen_secret)"
fi

# Telegram keys are optional for UAT — set placeholder if blank
_tg_id=$(env_get "$INFRA_ENV" "TELEGRAM_API_ID")
if [[ -z "$_tg_id" ]]; then
  warn "TELEGRAM_API_ID not set — Telegram service will be unavailable (OK for UAT)"
  env_set "$INFRA_ENV" "TELEGRAM_API_ID" "0"
fi
_tg_hash=$(env_get "$INFRA_ENV" "TELEGRAM_API_HASH")
if [[ -z "$_tg_hash" ]]; then
  env_set "$INFRA_ENV" "TELEGRAM_API_HASH" "placeholder"
fi

ok "infrastructure/.env ready"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 2 — apps/api/.env  (partial — OIDC values filled in step 6)
# ══════════════════════════════════════════════════════════════════════════════
echo "[2/9] apps/api/.env"

API_ENV="$API_DIR/.env"
if [[ ! -f "$API_ENV" || "$FORCE_REGEN" == "1" ]]; then
  info "Creating $API_ENV from .env.example"
  [[ "$DRY_RUN" != "1" ]] && cp "$API_DIR/.env.example" "$API_ENV"
fi

_jwt=$(env_get "$API_ENV" "JWT_SIGNING_SECRET")
if [[ -z "$_jwt" ]]; then
  info "Generating JWT_SIGNING_SECRET"
  env_set "$API_ENV" "JWT_SIGNING_SECRET" "$(gen_secret)"
fi

_internal=$(env_get "$API_ENV" "INTERNAL_API_TOKEN")
if [[ -z "$_internal" ]]; then
  _new_internal=$(gen_hex_32)
  info "Generating INTERNAL_API_TOKEN"
  env_set "$API_ENV" "INTERNAL_API_TOKEN" "$_new_internal"
  _internal="$_new_internal"
fi

# Wire Directus local instance
env_set "$API_ENV" "DIRECTUS_URL" "http://localhost:8200"
env_set "$API_ENV" "DIRECTUS_TOKEN" "uat-directus-static-admin-token-32c"

# Wire Mailpit SMTP for email capture
env_set "$API_ENV" "SEND_EMAILS" "true"
# EmailService picks up SMTP_HOST/PORT if Resend is not configured
# (check email.service.ts — when RESEND_API_KEY is blank, falls back to SMTP)
env_set "$API_ENV" "SMTP_HOST" "localhost"
env_set "$API_ENV" "SMTP_PORT" "1025"

# Wire Authentik admin API for operator invite flows
env_set "$API_ENV" "AUTHENTIK_ADMIN_URL" "http://localhost:9000"

# OIDC values are placeholders — replaced in step 6 once Authentik boots
_oidc_id=$(env_get "$API_ENV" "OIDC_CLIENT_ID")
if [[ -z "$_oidc_id" || "$_oidc_id" == "PLACEHOLDER_REPLACED_IN_STEP_6" ]]; then
  env_set "$API_ENV" "OIDC_CLIENT_ID" "PLACEHOLDER_REPLACED_IN_STEP_6"
  env_set "$API_ENV" "OIDC_CLIENT_SECRET" "PLACEHOLDER_REPLACED_IN_STEP_6"
fi

ok "apps/api/.env ready (OIDC credentials will be patched in step 6)"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 3 — apps/web/.env
# ══════════════════════════════════════════════════════════════════════════════
echo "[3/9] apps/web/.env"

write_file "$WEB_DIR/.env" "PUBLIC_API_URL=http://localhost:3000"
ok "apps/web/.env ready"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 4 — docker compose up
# ══════════════════════════════════════════════════════════════════════════════
echo "[4/9] Starting Docker Compose services"

if [[ "$DRY_RUN" == "1" ]]; then
  info "[dry-run] would run: docker compose up -d (in $INFRA_DIR)"
else
  cd "$INFRA_DIR"
  # Telegram service requires real API credentials; skip it for UAT
  docker compose up -d \
    postgres redis minio \
    authentik-server authentik-worker \
    directus \
    mailpit \
    twenty
  cd "$REPO_ROOT"
fi
ok "docker compose services started (or already running)"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 5 — wait for health
# ══════════════════════════════════════════════════════════════════════════════
echo "[5/9] Waiting for services to become healthy"

# 2026-06-25: Authentik 2024.x removed the /-/health/live endpoint; probe
# /if/admin/ instead (the admin UI), which returns 200 only after the gunicorn
# worker has finished applying DB migrations. Timeout bumped to 240s because
# first-boot migrations can take several minutes on slower machines.
wait_for_url "Authentik"  "http://localhost:9000/if/admin/" 240
wait_for_url "Directus"   "http://localhost:8200/server/health" 120
wait_for_url "Mailpit"    "http://localhost:8025/api/v1/messages" 60

ok "All services healthy"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 6 — Authentik: obtain admin API token, create OIDC app + provider
# ══════════════════════════════════════════════════════════════════════════════
echo "[6/9] Bootstrapping Authentik OIDC application"

AK_URL="http://localhost:9000"
AK_ADMIN_PASS="SuperSecretPass"
AK_ADMIN_USER="akadmin"
OIDC_APP_SLUG="aiqadam-platform-local"
OIDC_PROVIDER_NAME="aiqadam-platform-local-provider"
OIDC_REDIRECT_URI="http://localhost:4321/api/v1/auth/callback"

H_JSON="Content-Type: application/json"

# Get a short-lived API token by authenticating as akadmin
info "Authenticating with Authentik admin API"
_ak_token_resp=$(curl -sf -X POST \
  -H "$H_JSON" \
  "$AK_URL/api/v3/core/tokens/" \
  -d "{}" 2>/dev/null || true)

# Authentik's preferred way in local dev: use the bootstrap flow token.
# We create a temporary API token via the /api/v3/core/tokens/ endpoint
# authenticated with basic auth (akadmin / SuperSecretPass) once Authentik
# is up. Authentik 2024.x supports HTTP Basic on the API.
_ak_auth_header="Authorization: Basic $(printf '%s:%s' "$AK_ADMIN_USER" "$AK_ADMIN_PASS" | openssl base64 -A)"

# Verify credentials work
_me=$(curl -sf -H "$_ak_auth_header" "$AK_URL/api/v3/core/users/me/" 2>/dev/null || true)
if [[ -z "$_me" ]]; then
  # Authentik 2024+ dropped HTTP Basic on core API. Use the token flow instead.
  info "Basic auth not available — obtaining token via /api/v3/core/tokens/create/"
  _token_create=$(curl -sf -X POST \
    -H "$H_JSON" \
    -H "$_ak_auth_header" \
    "$AK_URL/api/v3/core/tokens/" \
    -d "{\"identifier\":\"uat-setup-token\",\"intent\":\"api\",\"user\":1}" 2>/dev/null || true)

  if [[ -z "$_token_create" ]]; then
    # Fall back: use Authentik's /api/v3/core/tokens/ with username+password flow
    info "Trying password-based token creation"
    _flow_resp=$(curl -sf -X POST \
      -H "$H_JSON" \
      -c /tmp/ak-cookies.txt -b /tmp/ak-cookies.txt \
      "$AK_URL/api/v3/flows/executor/default-authentication-flow/?query=null" \
      -d "{\"component\":\"ak-stage-identification\",\"uid_field\":\"${AK_ADMIN_USER}\"}" 2>/dev/null || true)

    _pass_resp=$(curl -sf -X POST \
      -H "$H_JSON" \
      -c /tmp/ak-cookies.txt -b /tmp/ak-cookies.txt \
      "$AK_URL/api/v3/flows/executor/default-authentication-flow/?query=null" \
      -d "{\"component\":\"ak-stage-password\",\"password\":\"${AK_ADMIN_PASS}\"}" 2>/dev/null || true)

    _session_token=$(echo "$_pass_resp" | jq -r '.token // empty' 2>/dev/null || true)

    if [[ -z "$_session_token" ]]; then
      warn "Could not obtain Authentik session token automatically."
      warn "Authentik OIDC setup requires a one-time manual step:"
      warn "  1. Open http://localhost:9000/if/admin/"
      warn "  2. Follow docs/04-development/infrastructure/runbooks/authentik-local-bootstrap.md"
      warn "  3. Re-run this script with FORCE_REGEN=0 to pick up the OIDC credentials"
      warn "OIDC_CLIENT_ID and OIDC_CLIENT_SECRET remain as placeholders in apps/api/.env"
      AUTHENTIK_SETUP_DONE=0
    else
      _ak_auth_header="Authorization: Bearer $_session_token"
      AUTHENTIK_SETUP_DONE=1
    fi
  else
    _raw_key=$(echo "$_token_create" | jq -r '.key // empty' 2>/dev/null || true)
    if [[ -n "$_raw_key" ]]; then
      _ak_auth_header="Authorization: Bearer $_raw_key"
      AUTHENTIK_SETUP_DONE=1
    else
      AUTHENTIK_SETUP_DONE=0
    fi
  fi
else
  AUTHENTIK_SETUP_DONE=1
fi

if [[ "${AUTHENTIK_SETUP_DONE:-0}" == "1" ]]; then
  # Check if the OIDC provider already exists
  _existing_provider=$(curl -sf -H "$_ak_auth_header" \
    "$AK_URL/api/v3/providers/oauth2/?name=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$OIDC_PROVIDER_NAME'))" 2>/dev/null || printf '%s' "$OIDC_PROVIDER_NAME" | jq -sRr @uri)" \
    2>/dev/null | jq -r '.results[0].pk // empty' 2>/dev/null || true)

  if [[ -n "$_existing_provider" ]]; then
    ok "OIDC provider already exists (pk=$_existing_provider)"
    _provider_pk="$_existing_provider"
  else
    info "Creating OIDC provider: $OIDC_PROVIDER_NAME"
    _provider_resp=$(curl -sf -X POST \
      -H "$_ak_auth_header" -H "$H_JSON" \
      "$AK_URL/api/v3/providers/oauth2/" \
      -d "{
        \"name\": \"$OIDC_PROVIDER_NAME\",
        \"authorization_flow\": \"$(curl -sf -H "$_ak_auth_header" \
          "$AK_URL/api/v3/flows/instances/?slug=default-provider-authorization-explicit-consent" \
          2>/dev/null | jq -r '.results[0].pk // empty' 2>/dev/null || echo "")\",
        \"client_type\": \"confidential\",
        \"redirect_uris\": \"$OIDC_REDIRECT_URI\",
        \"sub_mode\": \"hashed_user_id\",
        \"include_claims_in_id_token\": true,
        \"access_code_validity\": \"minutes=1\",
        \"access_token_validity\": \"minutes=10\",
        \"refresh_token_validity\": \"days=30\"
      }" 2>/dev/null || true)
    _provider_pk=$(echo "$_provider_resp" | jq -r '.pk // empty' 2>/dev/null || true)

    if [[ -z "$_provider_pk" ]]; then
      warn "Could not create OIDC provider automatically (response: ${_provider_resp:0:200})"
      warn "Follow authentik-local-bootstrap.md for manual setup."
      AUTHENTIK_SETUP_DONE=0
    else
      ok "OIDC provider created (pk=$_provider_pk)"
    fi
  fi

  if [[ "${AUTHENTIK_SETUP_DONE:-0}" == "1" && -n "${_provider_pk:-}" ]]; then
    # Check if application already exists
    _existing_app=$(curl -sf -H "$_ak_auth_header" \
      "$AK_URL/api/v3/core/applications/?slug=$OIDC_APP_SLUG" \
      2>/dev/null | jq -r '.results[0].pk // empty' 2>/dev/null || true)

    if [[ -z "$_existing_app" ]]; then
      info "Creating OIDC application: $OIDC_APP_SLUG"
      _app_resp=$(curl -sf -X POST \
        -H "$_ak_auth_header" -H "$H_JSON" \
        "$AK_URL/api/v3/core/applications/" \
        -d "{
          \"name\": \"AI Qadam Platform (local)\",
          \"slug\": \"$OIDC_APP_SLUG\",
          \"provider\": $_provider_pk,
          \"meta_description\": \"UAT local instance\"
        }" 2>/dev/null || true)
      _app_slug=$(echo "$_app_resp" | jq -r '.slug // empty' 2>/dev/null || true)
      if [[ -z "$_app_slug" ]]; then
        warn "Could not create OIDC application (response: ${_app_resp:0:200})"
      else
        ok "OIDC application created (slug=$_app_slug)"
      fi
    else
      ok "OIDC application already exists (pk=$_existing_app)"
    fi

    # Extract client_id and client_secret
    _provider_detail=$(curl -sf -H "$_ak_auth_header" \
      "$AK_URL/api/v3/providers/oauth2/$_provider_pk/" 2>/dev/null || true)
    _client_id=$(echo "$_provider_detail" | jq -r '.client_id // empty' 2>/dev/null || true)
    _client_secret=$(echo "$_provider_detail" | jq -r '.client_secret // empty' 2>/dev/null || true)

    if [[ -n "$_client_id" && -n "$_client_secret" ]]; then
      info "Patching apps/api/.env with OIDC credentials"
      env_set "$API_ENV" "OIDC_CLIENT_ID" "$_client_id"
      env_set "$API_ENV" "OIDC_CLIENT_SECRET" "$_client_secret"
      ok "OIDC credentials written to apps/api/.env"
      OIDC_CONFIGURED=1
    else
      warn "Could not extract client_id/client_secret from provider response"
      OIDC_CONFIGURED=0
    fi
  fi
fi

OIDC_CONFIGURED="${OIDC_CONFIGURED:-0}"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 7 — Authentik RBAC groups (reuse existing provision script)
# ══════════════════════════════════════════════════════════════════════════════
echo "[7/9] Provisioning Authentik RBAC groups"

if [[ "${AUTHENTIK_SETUP_DONE:-0}" == "1" ]]; then
  # Extract the bearer token from the header we already have
  _ak_token_val="${_ak_auth_header#Authorization: Bearer }"
  if [[ "$_ak_token_val" != "$_ak_auth_header" ]]; then
    # It's a Bearer token — pass to provision script
    AK_API_TOKEN="$_ak_token_val" \
    AUTHENTIK_URL="http://localhost:9000" \
    SUPER_ADMIN_EMAIL="admin@aiqadam.test" \
      bash "$REPO_ROOT/scripts/provision-authentik-rbac-groups.sh" \
      2>/dev/null || warn "RBAC group provisioning had warnings (may be OK if groups already exist)"
    ok "RBAC groups provisioned"
  else
    warn "Using Basic auth — skipping RBAC group script (re-run after Authentik API token is available)"
  fi
else
  warn "Skipping RBAC group provisioning (Authentik setup incomplete)"
fi

# ══════════════════════════════════════════════════════════════════════════════
# STEP 8 — apps/e2e/.env.uat
# ══════════════════════════════════════════════════════════════════════════════
echo "[8/9] apps/e2e/.env.uat"

# Read the internal token we wrote (or that already existed)
_internal_for_uat=$(env_get "$API_ENV" "INTERNAL_API_TOKEN")

write_file "$E2E_DIR/.env.uat" "# UAT environment — generated by scripts/uat-env-setup.sh
# Re-generate: FORCE_REGEN=1 bash scripts/uat-env-setup.sh
# Do NOT commit this file.

UAT_BASE_URL=http://localhost:4321
UAT_API_URL=http://localhost:3000
UAT_MAILPIT_URL=http://localhost:8025
UAT_DIRECTUS_URL=http://localhost:8200
UAT_AUTHENTIK_URL=http://localhost:9000

# Must match INTERNAL_API_TOKEN in apps/api/.env
UAT_INTERNAL_API_TOKEN=${_internal_for_uat}

# Test credentials — provisioned by pnpm uat:seed
UAT_MEMBER_EMAIL=uat-member@aiqadam.test
UAT_MEMBER_PASSWORD=UatMember1!
UAT_OPERATOR_EMAIL=uat-operator@aiqadam.test
UAT_OPERATOR_PASSWORD=UatOperator1!
"

ok "apps/e2e/.env.uat ready"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 9 — Summary
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "[9/9] Setup summary"
echo ""
echo "  Service        URL"
echo "  ─────────────────────────────────────────────────"
echo "  Authentik      http://localhost:9000/if/admin/     (akadmin / SuperSecretPass)"
echo "  Directus       http://localhost:8200               (admin@aiqadam.test / SuperSecretPass)"
echo "  Mailpit        http://localhost:8025"
echo "  Postgres       localhost:5432  (postgres / postgres)"
echo "  Redis          localhost:6379"
echo ""

if [[ "$OIDC_CONFIGURED" == "1" ]]; then
  ok "OIDC configured automatically — apps/api/.env has OIDC_CLIENT_ID + OIDC_CLIENT_SECRET"
else
  warn "OIDC NOT configured automatically."
  warn "Manual step required:"
  warn "  Follow docs/04-development/infrastructure/runbooks/authentik-local-bootstrap.md"
  warn "  Then paste OIDC_CLIENT_ID and OIDC_CLIENT_SECRET into apps/api/.env"
fi

echo ""
echo "  Next steps:"
echo "  1. Start all apps (from repo root):"
echo "       pnpm dev"
echo "     Turborepo starts api + web in parallel. Wait for both 'ready' lines."
echo "  2. Seed UAT fixtures:"
echo "       pnpm uat:seed"
echo "  3. Run UAT suite:"
echo "       cd apps/e2e && pnpm playwright test --config playwright.uat.config.ts"
echo ""
ok "UAT environment setup complete"
