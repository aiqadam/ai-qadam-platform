#!/usr/bin/env bash
# Provision the Gatus OIDC application + provider in Authentik.
#
# Per ADR-0032: operator-facing tools must SSO via Authentik. Gatus
# (replacing Uptime Kuma) speaks OIDC out of the box; this script
# creates the Authentik side (provider + application) so the Gatus
# config can point at it.
#
# Idempotent: re-running is safe — checks for existing slugs first.
#
# Required env (read from /tmp/aiqadam-secrets-AK_API_TOKEN if not
# explicitly set):
#   AK_API_TOKEN  — Authentik admin API token
#   AUTHENTIK_URL — defaults to https://auth.aiqadam.org
#
# Outputs (printed + cached at /tmp/aiqadam-secrets-GATUS_OIDC_CLIENT_SECRET):
#   The OIDC client secret to paste into the Coolify env when creating
#   the Gatus service.
#
# Usage:
#   bash scripts/provision-gatus-authentik.sh

set -euo pipefail

AUTHENTIK_URL="${AUTHENTIK_URL:-https://auth.aiqadam.org}"
AK_TOKEN_PATH="${AK_TOKEN_PATH:-/tmp/aiqadam-secrets-AK_API_TOKEN}"
AK_API_TOKEN="${AK_API_TOKEN:-$(cat "$AK_TOKEN_PATH" 2>/dev/null || true)}"

if [[ -z "$AK_API_TOKEN" ]]; then
  echo "FATAL: AK_API_TOKEN not set and $AK_TOKEN_PATH missing." >&2
  exit 2
fi

H_AUTH="Authorization: Bearer $AK_API_TOKEN"
H_JSON="Content-Type: application/json"

# Identifiers used throughout. Stable so re-runs are idempotent.
PROVIDER_NAME="Gatus OIDC"
APP_NAME="Gatus"
APP_SLUG="gatus"
CLIENT_ID="gatus"
REDIRECT_URL="https://status.aiqadam.org/authorization-code/callback"

# Helper: POST/PATCH that surfaces the response body on HTTP error
# instead of silently exiting. The first prod run of this script
# (2026-05-20) used `curl -sf` which swallowed the response and the
# script died at "[3/5] Creating provider…" with no clue. Took ~30
# minutes to discover Authentik now requires `invalidation_flow`.
ak_post() {
  local url="$1" body="$2"
  local resp code respbody
  resp=$(curl -s -H "$H_AUTH" -H "$H_JSON" -X POST -w "\n%{http_code}" "$url" -d "$body")
  code="${resp##*$'\n'}"
  respbody="${resp%$'\n'*}"
  if [[ "$code" != "200" && "$code" != "201" ]]; then
    echo "  ✗ POST $url returned HTTP $code" >&2
    echo "    $respbody" >&2
    return 1
  fi
  printf '%s' "$respbody"
}

echo "[1/5] Looking for existing provider named \"$PROVIDER_NAME\"…"
# Authentik's /providers/oauth2/?name= filter does NOT actually filter,
# and `.results[0].pk // empty` lies when the token-user can see other
# providers. See memory entry feedback_authentik_results_zero_count_lies.md.
PROVIDER_LIST=$(curl -sf -H "$H_AUTH" \
  "$AUTHENTIK_URL/api/v3/providers/oauth2/?superuser_full_list=true&page_size=200")
PROVIDER_ID=$(echo "$PROVIDER_LIST" | jq -r --arg n "$PROVIDER_NAME" \
  '.results[] | select(.name == $n) | .pk' | head -1)

if [[ -n "$PROVIDER_ID" ]]; then
  echo "  ✓ provider exists (id=$PROVIDER_ID)"
  CLIENT_SECRET=$(echo "$PROVIDER_LIST" | jq -r --arg n "$PROVIDER_NAME" \
    '.results[] | select(.name == $n) | .client_secret' | head -1)
else
  echo "[2/5] Resolving authorization + invalidation flows + signing key…"
  AUTHZ_FLOW=$(curl -sf -H "$H_AUTH" \
    "$AUTHENTIK_URL/api/v3/flows/instances/?slug=default-provider-authorization-implicit-consent" \
    | jq -r '.results[0].pk // empty')
  if [[ -z "$AUTHZ_FLOW" ]]; then
    echo "  ! 'default-provider-authorization-implicit-consent' not found; trying 'default-provider-authorization-explicit-consent'"
    AUTHZ_FLOW=$(curl -sf -H "$H_AUTH" \
      "$AUTHENTIK_URL/api/v3/flows/instances/?slug=default-provider-authorization-explicit-consent" \
      | jq -r '.results[0].pk // empty')
  fi
  if [[ -z "$AUTHZ_FLOW" ]]; then
    echo "FATAL: no authorization flow found. Inspect Authentik admin." >&2
    exit 3
  fi

  # Authentik 2024.x and later require `invalidation_flow` on OAuth2
  # providers (previously optional). Pick the default provider
  # invalidation flow if it exists, else any flow with
  # designation=invalidation.
  INVALID_FLOW=$(curl -sf -H "$H_AUTH" \
    "$AUTHENTIK_URL/api/v3/flows/instances/?slug=default-provider-invalidation-flow" \
    | jq -r '.results[0].pk // empty')
  if [[ -z "$INVALID_FLOW" ]]; then
    INVALID_FLOW=$(curl -sf -H "$H_AUTH" \
      "$AUTHENTIK_URL/api/v3/flows/instances/?designation=invalidation" \
      | jq -r '.results[0].pk // empty')
  fi
  if [[ -z "$INVALID_FLOW" ]]; then
    echo "FATAL: no invalidation flow found. Inspect Authentik admin." >&2
    exit 3
  fi

  SIGNING_KEY=$(curl -sf -H "$H_AUTH" \
    "$AUTHENTIK_URL/api/v3/crypto/certificatekeypairs/?name=authentik+Self-signed+Certificate" \
    | jq -r '.results[0].pk // empty')
  if [[ -z "$SIGNING_KEY" ]]; then
    # Older Authentik installs sometimes name it differently — fall
    # back to the first available cert.
    SIGNING_KEY=$(curl -sf -H "$H_AUTH" "$AUTHENTIK_URL/api/v3/crypto/certificatekeypairs/" \
      | jq -r '.results[0].pk // empty')
  fi
  if [[ -z "$SIGNING_KEY" ]]; then
    echo "FATAL: no signing key found. Inspect Authentik admin → Certificates." >&2
    exit 3
  fi

  CLIENT_SECRET=$(openssl rand -hex 32)

  echo "[3/5] Creating provider…"
  PROVIDER_BODY=$(jq -nc \
    --arg name "$PROVIDER_NAME" \
    --arg cid "$CLIENT_ID" \
    --arg secret "$CLIENT_SECRET" \
    --arg af "$AUTHZ_FLOW" \
    --arg if_ "$INVALID_FLOW" \
    --arg key "$SIGNING_KEY" \
    --arg redirect "$REDIRECT_URL" \
    '{
      name: $name,
      client_type: "confidential",
      client_id: $cid,
      client_secret: $secret,
      authorization_flow: $af,
      invalidation_flow: $if_,
      signing_key: $key,
      redirect_uris: [{matching_mode: "strict", url: $redirect}],
      sub_mode: "user_email",
      include_claims_in_id_token: true,
      property_mappings: [],
      access_code_validity: "minutes=1",
      access_token_validity: "minutes=10",
      refresh_token_validity: "days=30"
    }')
  PROVIDER_ID=$(ak_post "$AUTHENTIK_URL/api/v3/providers/oauth2/" "$PROVIDER_BODY" | jq -r '.pk')
  echo "  + provider created (id=$PROVIDER_ID)"
fi

echo "[4/5] Looking for existing application slug=$APP_SLUG…"
# Same trap as above for /core/applications/?slug=. Enumerate + jq select.
APP_LIST=$(curl -sf -H "$H_AUTH" \
  "$AUTHENTIK_URL/api/v3/core/applications/?superuser_full_list=true&page_size=200")
APP_EXISTS=$(echo "$APP_LIST" | jq -r --arg s "$APP_SLUG" \
  '.results[] | select(.slug == $s) | .pk' | head -1)

if [[ -n "$APP_EXISTS" ]]; then
  echo "  ✓ application exists (pk=$APP_EXISTS)"
else
  echo "[5/5] Creating application…"
  APP_BODY=$(jq -nc \
    --arg name "$APP_NAME" \
    --arg slug "$APP_SLUG" \
    --arg provider "$PROVIDER_ID" \
    '{
      name: $name,
      slug: $slug,
      provider: ($provider | tonumber),
      meta_launch_url: "https://status.aiqadam.org",
      meta_description: "Uptime + health-check monitoring for every public AI Qadam surface. Per ADR-0032.",
      policy_engine_mode: "any"
    }')
  curl -sf -H "$H_AUTH" -H "$H_JSON" \
    -X POST "$AUTHENTIK_URL/api/v3/core/applications/" \
    -d "$APP_BODY" >/dev/null
  echo "  + application created"
fi

# Cache the secret + print it so the operator can paste into Coolify.
umask 077
printf '%s' "$CLIENT_SECRET" > /tmp/aiqadam-secrets-GATUS_OIDC_CLIENT_SECRET
chmod 600 /tmp/aiqadam-secrets-GATUS_OIDC_CLIENT_SECRET

echo
echo "─────────────────────────────────────────────────────────────────"
echo "  Authentik provider + application provisioned."
echo "  Issuer URL:    $AUTHENTIK_URL/application/o/$APP_SLUG/"
echo "  Client ID:     $CLIENT_ID"
echo "  Client secret: $CLIENT_SECRET"
echo "  (also cached at /tmp/aiqadam-secrets-GATUS_OIDC_CLIENT_SECRET)"
echo
echo "  Paste the client secret into the Coolify aiqadam-gatus service"
echo "  env as GATUS_OIDC_CLIENT_SECRET, then restart."
echo "─────────────────────────────────────────────────────────────────"
