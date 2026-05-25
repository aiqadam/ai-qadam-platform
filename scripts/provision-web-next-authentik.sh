#!/usr/bin/env bash
# apps/web-next/ — ADR-0038 (PR-0b) · Provision Authentik Proxy
# Provider + Application for next.aiqadam.org, bind it to the
# Embedded Outpost, and restrict access to the `aiqadam-super-admin`
# group (the engineer-only group used by ops.aiqadam.org).
#
# Per ADR-0032: operator/engineer tools must SSO via Authentik.
# next.aiqadam.org is the build-aside for v2 (ADR-0038), gated to
# engineers until cutover.
#
# The Traefik labels in infrastructure/web-next/docker-compose.yml
# call out to http://authentik-server:9000/outpost.goauthentik.io/
# auth/traefik — this script creates the Authentik side so that
# endpoint accepts requests for next.aiqadam.org.
#
# Idempotent. Mirror of scripts/provision-backrest-authentik.sh.
#
# Usage:
#   bash scripts/provision-web-next-authentik.sh

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

PROVIDER_NAME="Web-Next Proxy"
APP_NAME="AI Qadam (next)"
APP_SLUG="aiqadam-web-next"
EXTERNAL_HOST="https://next.aiqadam.org"
EMBEDDED_OUTPOST_PK="883dda0b-58dd-4b22-ad7c-ed51348d6ee7"
SUPER_ADMIN_GROUP="aiqadam-super-admin"

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

ak_patch() {
  local url="$1" body="$2"
  local resp code respbody
  resp=$(curl -s -H "$H_AUTH" -H "$H_JSON" -X PATCH -w "\n%{http_code}" "$url" -d "$body")
  code="${resp##*$'\n'}"
  respbody="${resp%$'\n'*}"
  if [[ "$code" != "200" && "$code" != "204" ]]; then
    echo "  ✗ PATCH $url returned HTTP $code" >&2
    echo "    $respbody" >&2
    return 1
  fi
  printf '%s' "$respbody"
}

echo "[1/6] Resolving authorization + invalidation flows..."
AUTHZ_FLOW=$(curl -sf -H "$H_AUTH" \
  "$AUTHENTIK_URL/api/v3/flows/instances/?slug=default-provider-authorization-implicit-consent" \
  | jq -r '.results[0].pk // empty')
INVALID_FLOW=$(curl -sf -H "$H_AUTH" \
  "$AUTHENTIK_URL/api/v3/flows/instances/?slug=default-provider-invalidation-flow" \
  | jq -r '.results[0].pk // empty')
if [[ -z "$AUTHZ_FLOW" || -z "$INVALID_FLOW" ]]; then
  echo "FATAL: required flows not found. Inspect Authentik admin." >&2
  exit 3
fi

echo "[2/6] Looking for existing Proxy Provider \"$PROVIDER_NAME\"..."
# Authentik's providers/proxy endpoint does NOT support the `?name=`
# filter — it returns all proxies regardless. We have to enumerate and
# match in-process. Same trap on /core/applications/?slug=: pagination
# is filtered by policy but the results[0] entry is whatever the
# token's user can see, so `.results[0].pk // empty` lies when count=0.
# Use jq's `select` on the actual name to be safe.
PROVIDER_LIST=$(curl -sf -H "$H_AUTH" \
  "$AUTHENTIK_URL/api/v3/providers/proxy/?superuser_full_list=true&page_size=200")
PROVIDER_ID=$(echo "$PROVIDER_LIST" | jq -r --arg n "$PROVIDER_NAME" \
  '.results[] | select(.name == $n) | .pk' | head -1)

if [[ -n "$PROVIDER_ID" ]]; then
  echo "  ✓ provider exists (id=$PROVIDER_ID)"
else
  echo "[3/6] Creating Proxy Provider (mode=forward_single, external_host=$EXTERNAL_HOST)..."
  PROVIDER_BODY=$(jq -nc \
    --arg name "$PROVIDER_NAME" \
    --arg af "$AUTHZ_FLOW" \
    --arg if_ "$INVALID_FLOW" \
    --arg ext "$EXTERNAL_HOST" \
    '{
      name: $name,
      authorization_flow: $af,
      invalidation_flow: $if_,
      mode: "forward_single",
      external_host: $ext,
      internal_host_ssl_validation: true,
      access_token_validity: "hours=1",
      refresh_token_validity: "days=30",
      basic_auth_enabled: false,
      skip_path_regex: ""
    }')
  PROVIDER_ID=$(ak_post "$AUTHENTIK_URL/api/v3/providers/proxy/" "$PROVIDER_BODY" | jq -r '.pk')
  echo "  + provider created (id=$PROVIDER_ID)"
fi

echo "[4/6] Looking for existing Application slug=$APP_SLUG..."
APP_LIST=$(curl -sf -H "$H_AUTH" \
  "$AUTHENTIK_URL/api/v3/core/applications/?superuser_full_list=true&page_size=200")
APP_EXISTS=$(echo "$APP_LIST" | jq -r --arg s "$APP_SLUG" \
  '.results[] | select(.slug == $s) | .pk' | head -1)

if [[ -n "$APP_EXISTS" ]]; then
  echo "  ✓ application exists (pk=$APP_EXISTS)"
else
  echo "[5/6] Creating Application..."
  APP_BODY=$(jq -nc \
    --arg name "$APP_NAME" \
    --arg slug "$APP_SLUG" \
    --arg provider "$PROVIDER_ID" \
    --arg ext "$EXTERNAL_HOST" \
    '{
      name: $name,
      slug: $slug,
      provider: ($provider | tonumber),
      meta_launch_url: $ext,
      meta_description: "ADR-0038 greenfield web build-aside. Engineer-only until cutover.",
      policy_engine_mode: "all"
    }')
  curl -sf -H "$H_AUTH" -H "$H_JSON" \
    -X POST "$AUTHENTIK_URL/api/v3/core/applications/" \
    -d "$APP_BODY" >/dev/null
  echo "  + application created"
fi

echo "[6/6] Binding Provider to Embedded Outpost + super-admin group policy..."

# Add provider to Embedded Outpost
OUTPOST=$(curl -sf -H "$H_AUTH" "$AUTHENTIK_URL/api/v3/outposts/instances/$EMBEDDED_OUTPOST_PK/")
CURRENT_PROVIDERS=$(echo "$OUTPOST" | jq -c '.providers')
if echo "$CURRENT_PROVIDERS" | jq -e ".[] | select(. == $PROVIDER_ID)" >/dev/null; then
  echo "  ✓ provider already in outpost"
else
  NEXT_PROVIDERS=$(echo "$CURRENT_PROVIDERS" | jq -c ". + [$PROVIDER_ID]")
  PATCH_BODY=$(jq -nc --argjson p "$NEXT_PROVIDERS" '{providers: $p}')
  ak_patch "$AUTHENTIK_URL/api/v3/outposts/instances/$EMBEDDED_OUTPOST_PK/" "$PATCH_BODY" >/dev/null
  echo "  + provider added to outpost"
fi

# Group policy: only members of aiqadam-super-admin can access.
GROUP_PK=$(curl -sf -H "$H_AUTH" \
  "$AUTHENTIK_URL/api/v3/core/groups/?name=$SUPER_ADMIN_GROUP" \
  | jq -r '.results[0].pk // empty')
if [[ -z "$GROUP_PK" ]]; then
  echo "  ! WARNING: group $SUPER_ADMIN_GROUP not found — next.aiqadam.org will be accessible to ANY signed-in user. Create the group + add members + re-run."
else
  APP_PK="${APP_EXISTS:-$(curl -sf -H "$H_AUTH" "$AUTHENTIK_URL/api/v3/core/applications/?superuser_full_list=true&page_size=200" | jq -r --arg s "$APP_SLUG" '.results[] | select(.slug == $s) | .pk' | head -1)}"
  EXISTING_POLICY=$(curl -sf -H "$H_AUTH" \
    "$AUTHENTIK_URL/api/v3/policies/bindings/?target=$APP_PK" \
    | jq -r ".results[] | select(.group == \"$GROUP_PK\") | .pk" | head -1)
  if [[ -n "$EXISTING_POLICY" ]]; then
    echo "  ✓ group policy binding exists"
  else
    BIND_BODY=$(jq -nc \
      --arg target "$APP_PK" \
      --arg group "$GROUP_PK" \
      '{
        target: $target,
        group: $group,
        order: 0,
        enabled: true,
        negate: false
      }')
    ak_post "$AUTHENTIK_URL/api/v3/policies/bindings/" "$BIND_BODY" >/dev/null
    echo "  + group binding created (only $SUPER_ADMIN_GROUP can access)"
  fi
fi

echo
echo "✓ Done. next.aiqadam.org is reachable after deploy + members of $SUPER_ADMIN_GROUP can sign in."
echo "  No client secret to copy — forward-auth mode uses cookies issued by the outpost."
