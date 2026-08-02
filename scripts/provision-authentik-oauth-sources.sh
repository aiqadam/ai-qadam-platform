#!/usr/bin/env bash
# scripts/provision-authentik-oauth-sources.sh
#
# Idempotent provisioning for Google and GitHub OAuth2 Sources in Authentik.
# Required for FR-AUTH-003: members can sign in via Google or GitHub.
# The source slugs MUST match the VALID_PROVIDERS allowlist in
# apps/api/src/modules/auth/auth.controller.ts ('google', 'github').
#
# Idempotent: GET /api/v3/sources/oauth/<slug>/ before POST. If the source
# already exists, prints its PK and exits cleanly. Re-running is safe.
#
# Env contract:
#   AK_API_TOKEN          — Authentik admin API token (from Admin → Tokens)
#   AUTHENTIK_URL         — defaults to http://localhost:9000
#   GOOGLE_CLIENT_ID      — Google OAuth2 app client_id
#   GOOGLE_CLIENT_SECRET  — Google OAuth2 app client_secret
#   GITHUB_CLIENT_ID      — GitHub OAuth app client_id
#   GITHUB_CLIENT_SECRET  — GitHub OAuth app client_secret
#
# Safety: refuses to run against AUTHENTIK_URL hosts other than localhost,
# 127.0.0.1, or auth.aiqadam.org.
#
# AGENTS.md conformance:
#   - set -euo pipefail; no magic strings (named constants below)
#   - parameterized jq filters via --arg (no string interpolation in JSON)
#   - helpers < 60 lines, single-purpose
#   - curl binary selection follows §6.1 footnote (prefer curl.exe on Windows)
#
# Usage:
#   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... \
#   GITHUB_CLIENT_ID=... GITHUB_CLIENT_SECRET=... \
#   bash scripts/provision-authentik-oauth-sources.sh

set -euo pipefail

# ── curl binary selection (AGENTS.md §6.1 footnote) ──────────────────────────
if command -v curl.exe &>/dev/null; then
  CURL_BIN='curl.exe'
else
  CURL_BIN='curl'
fi

# ── Env-var contract ─────────────────────────────────────────────────────────
AUTHENTIK_URL="${AUTHENTIK_URL:-http://localhost:9000}"
AK_TOKEN_PATH="${AK_TOKEN_PATH:-/tmp/aiqadam-secrets-AK_API_TOKEN}"
AK_API_TOKEN="${AK_API_TOKEN:-$(cat "$AK_TOKEN_PATH" 2>/dev/null || true)}"

if [[ -z "$AK_API_TOKEN" ]]; then
  echo "FATAL: AK_API_TOKEN not set and $AK_TOKEN_PATH missing." >&2
  exit 2
fi

GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"
GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-}"
GITHUB_CLIENT_ID="${GITHUB_CLIENT_ID:-}"
GITHUB_CLIENT_SECRET="${GITHUB_CLIENT_SECRET:-}"

# ── Named constants (no magic strings) ──────────────────────────────────────
GOOGLE_SLUG="google"
GITHUB_SLUG="github"
GOOGLE_SOURCE_NAME="Google"
GITHUB_SOURCE_NAME="GitHub"
GOOGLE_PROVIDER_TYPE="google"
GITHUB_PROVIDER_TYPE="github"
GOOGLE_SCOPES="email profile"
GITHUB_SCOPES="user:email"
SOURCES_ENDPOINT="/api/v3/sources/oauth/"
ALLOWED_HOSTS="localhost 127.0.0.1 auth.aiqadam.org"

# ── Host guard ───────────────────────────────────────────────────────────────
_host="$(printf '%s' "$AUTHENTIK_URL" | sed -E 's#^https?://##; s#:[0-9]+$##; s#/.*##')"
_allowed=0
for h in $ALLOWED_HOSTS; do
  if [[ "$_host" == "$h" ]]; then _allowed=1; break; fi
done
if [[ "$_allowed" -ne 1 ]]; then
  echo "FATAL: AUTHENTIK_URL host '$_host' is not in allow-list ($ALLOWED_HOSTS)." >&2
  exit 4
fi

H_AUTH="Authorization: Bearer $AK_API_TOKEN"
H_JSON="Content-Type: application/json"

# ── HTTP helpers ─────────────────────────────────────────────────────────────
ak_get() {
  local url="$1"
  "$CURL_BIN" -sf -H "$H_AUTH" "$url"
}

ak_post() {
  local url="$1" body="$2"
  local resp code respbody
  resp=$("$CURL_BIN" -s -H "$H_AUTH" -H "$H_JSON" -X POST -w "\n%{http_code}" "$url" -d "$body")
  code="${resp##*$'\n'}"
  respbody="${resp%$'\n'*}"
  if [[ "$code" != "200" && "$code" != "201" ]]; then
    echo "  ✗ POST $url returned HTTP $code" >&2
    echo "    ${respbody:0:300}" >&2
    return 1
  fi
  printf '%s' "$respbody"
}

# ── ensure_oauth_source <slug> <name> <provider_type> <key> <secret> <scopes>
# Resolves by slug (GET); creates (POST) only when not found. Prints the PK.
ensure_oauth_source() {
  local slug="$1" name="$2" provider_type="$3" key="$4" secret="$5" scopes="$6"

  if [[ -z "$key" || -z "$secret" ]]; then
    echo "FATAL: client_id and client_secret required for slug='$slug'." >&2
    exit 3
  fi

  local pk
  pk=$(ak_get "$AUTHENTIK_URL$SOURCES_ENDPOINT$slug/" 2>/dev/null \
       | jq -r '.pk // empty' 2>/dev/null || true)

  if [[ -n "$pk" ]]; then
    echo "  ✓ OAuth source '$slug' already exists (pk=$pk)" >&2
    printf '%s' "$pk"
    return 0
  fi

  echo "  · OAuth source '$slug' not found; creating it" >&2
  local body
  body=$(jq -nc \
    --arg name "$name" \
    --arg slug "$slug" \
    --arg provider_type "$provider_type" \
    --arg consumer_key "$key" \
    --arg consumer_secret "$secret" \
    --arg additional_scopes "$scopes" \
    '{
      name: $name,
      slug: $slug,
      enabled: true,
      provider_type: $provider_type,
      consumer_key: $consumer_key,
      consumer_secret: $consumer_secret,
      additional_scopes: $additional_scopes,
      authentication_flow: null,
      enrollment_flow: null,
      user_matching_mode: "identifier"
    }')

  local created_pk
  created_pk=$(ak_post "$AUTHENTIK_URL$SOURCES_ENDPOINT" "$body" | jq -r '.pk')
  echo "  ✓ OAuth source '$slug' created (pk=$created_pk)" >&2
  printf '%s' "$created_pk"
}

# ── Main ─────────────────────────────────────────────────────────────────────
echo "Provisioning Authentik OAuth Sources against $AUTHENTIK_URL …"

google_pk=$(ensure_oauth_source \
  "$GOOGLE_SLUG" "$GOOGLE_SOURCE_NAME" "$GOOGLE_PROVIDER_TYPE" \
  "$GOOGLE_CLIENT_ID" "$GOOGLE_CLIENT_SECRET" "$GOOGLE_SCOPES")

github_pk=$(ensure_oauth_source \
  "$GITHUB_SLUG" "$GITHUB_SOURCE_NAME" "$GITHUB_PROVIDER_TYPE" \
  "$GITHUB_CLIENT_ID" "$GITHUB_CLIENT_SECRET" "$GITHUB_SCOPES")

echo ""
echo "GOOGLE_SOURCE_PK=$google_pk"
echo "GITHUB_SOURCE_PK=$github_pk"
echo ""
echo "Done. Set AUTHENTIK_GOOGLE_SOURCE_PK and AUTHENTIK_GITHUB_SOURCE_PK in"
echo "apps/api/.env if your flow configuration requires them."
