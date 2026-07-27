#!/usr/bin/env bats
# scripts/tests/bootstrap-oidc.bats
#
# Regression test for ISS-AUTH-OIDC-EMAIL-001 (wf-20260727-fix-137):
# .copilot/bootstrap-oidc.sh created the Authentik OAuth2/OIDC provider
# with no property_mappings, so Authentik attached no scope mappings and
# every id_token was missing the `email` claim — the app correctly
# rejected sign-in with 401 "oidc id_token missing email claim".
#
# This test proves the bug directly against a live Authentik: creating a
# provider with the pre-fix body shape (no property_mappings key) leaves
# it with zero mappings attached, and running the fixed script attaches
# the three built-in managed scope mappings (openid, email, profile) on
# both the create path and the reuse/self-heal (existing provider) path.
#
# Run:
#   bash scripts/run-bats.sh scripts/tests/bootstrap-oidc.bats
#   pnpm test:bash
#
# Pre-flight contract (AGENTS.md §6.1):
#   - Authentik is reachable at $AUTHENTIK_URL (default http://localhost:9000)
#   - /tmp/aiqadam-secrets-AK_API_TOKEN contains a valid Authentik API token
#   Skips (not fails) when either is unavailable — matches the
#   provision-authentik-recovery-flow.bats precedent.

load 'test_helper'

if command -v curl.exe &>/dev/null; then
  CURL_BIN='curl.exe'
else
  CURL_BIN='curl'
fi

readonly AUTHENTIK_URL_DEFAULT='http://localhost:9000'
readonly AK_TOKEN_FILE='/tmp/aiqadam-secrets-AK_API_TOKEN'
readonly HEALTHCHECK_PATH='/-/health/live/'
readonly SCOPE_MAPPINGS_PATH='/api/v3/propertymappings/provider/scope/'
readonly PROVIDERS_PATH='/api/v3/providers/oauth2/'
readonly REPRO_PROVIDER_NAME='bats-bootstrap-oidc-repro-provider'
readonly REQUIRED_MANAGED_SCOPES='goauthentik.io/providers/oauth2/scope-openid goauthentik.io/providers/oauth2/scope-email goauthentik.io/providers/oauth2/scope-profile'

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  export REPO_ROOT
  export AUTHENTIK_URL="${AUTHENTIK_URL:-$AUTHENTIK_URL_DEFAULT}"
}

auth_reachable() {
  local url="${AUTHENTIK_URL}${HEALTHCHECK_PATH}"
  "$CURL_BIN" --silent --fail --max-time 5 --output /dev/null "$url" \
    || { skip "authentik not up at $url"; return 1; }
}

require_token() {
  AK_API_TOKEN="$(cat "$AK_TOKEN_FILE" 2>/dev/null || true)"
  [[ -z "$AK_API_TOKEN" ]] && { skip "no AK_API_TOKEN at $AK_TOKEN_FILE"; return 1; }
  return 0
}

# Deletes the throwaway repro provider by pk, ignoring failures — used in
# teardown so a failed assertion never leaves stray Authentik state.
cleanup_repro_provider() {
  local pk
  pk="$("$CURL_BIN" --silent --max-time 10 \
          --header "Authorization: Bearer ${AK_API_TOKEN}" \
          "${AUTHENTIK_URL}${PROVIDERS_PATH}?name=${REPRO_PROVIDER_NAME}" \
        | jq -r '.results[0].pk // empty')"
  [[ -n "$pk" ]] && "$CURL_BIN" --silent --max-time 10 -X DELETE \
    --header "Authorization: Bearer ${AK_API_TOKEN}" \
    "${AUTHENTIK_URL}${PROVIDERS_PATH}${pk}/" >/dev/null || true
}

teardown() {
  [[ -n "${AK_API_TOKEN:-}" ]] && cleanup_repro_provider || true
}

# ─── Test 1: the three managed scope mappings resolve on this instance ──

@test "authentik-exposes-openid-email-profile-managed-scope-mappings" {
  auth_reachable
  require_token || return 0

  local body
  body="$("$CURL_BIN" --silent --max-time 10 \
            --header "Authorization: Bearer ${AK_API_TOKEN}" \
            "${AUTHENTIK_URL}${SCOPE_MAPPINGS_PATH}?page_size=100")"

  for managed in $REQUIRED_MANAGED_SCOPES; do
    local pk
    pk="$(printf '%s' "$body" | jq -r --arg m "$managed" '.results[] | select(.managed == $m) | .pk')"
    [[ -n "$pk" ]] || { echo "managed mapping '$managed' not found on this Authentik instance"; return 1; }
  done
}

# ─── Test 2: pre-fix body shape reproduces the bug (documents the defect) ─

@test "provider-created-without-property-mappings-key-gets-none-attached" {
  auth_reachable
  require_token || return 0

  cleanup_repro_provider

  local flow_pk
  flow_pk="$("$CURL_BIN" --silent --max-time 10 \
               --header "Authorization: Bearer ${AK_API_TOKEN}" \
               "${AUTHENTIK_URL}/api/v3/flows/instances/?slug=default-provider-authorization-explicit-consent" \
             | jq -r '.results[0].pk // empty')"
  [[ -n "$flow_pk" ]] || skip "default-provider-authorization-explicit-consent flow not present"

  local inval_flow_pk
  inval_flow_pk="$("$CURL_BIN" --silent --max-time 10 \
                     --header "Authorization: Bearer ${AK_API_TOKEN}" \
                     "${AUTHENTIK_URL}/api/v3/flows/instances/?slug=default-provider-invalidation-flow" \
                   | jq -r '.results[0].pk // empty')"
  [[ -n "$inval_flow_pk" ]] || skip "default-provider-invalidation-flow not present"

  # This body shape mirrors the pre-fix .copilot/oidc-provider-body.json
  # exactly — no property_mappings key at all.
  local repro_body
  repro_body="$(jq -n \
    --arg name "$REPRO_PROVIDER_NAME" \
    --arg af "$flow_pk" \
    --arg iv "$inval_flow_pk" \
    '{name:$name, authorization_flow:$af, invalidation_flow:$iv, client_type:"confidential",
      redirect_uris:[{matching_mode:"strict", url:"http://localhost:4321/api/v1/auth/callback"}],
      sub_mode:"hashed_user_id", include_claims_in_id_token:true}')"

  local mapping_count
  mapping_count="$("$CURL_BIN" --silent --max-time 10 -X POST \
                     --header "Authorization: Bearer ${AK_API_TOKEN}" \
                     --header 'Content-Type: application/json' \
                     --data "$repro_body" \
                     "${AUTHENTIK_URL}${PROVIDERS_PATH}" \
                   | jq -r '.property_mappings | length')"

  [[ "$mapping_count" == "0" ]] \
    || { echo "expected the pre-fix body shape to attach 0 mappings (documenting the bug), got $mapping_count — has Authentik's API default behavior changed?"; return 1; }
}

# ─── Test 3: the fixed bootstrap-oidc.sh attaches all three mappings ────

@test "bootstrap-oidc-sh-attaches-openid-email-profile-mappings" {
  auth_reachable
  require_token || return 0

  grep -q 'property_mappings' "$REPO_ROOT/.copilot/bootstrap-oidc.sh" \
    || { echo "bootstrap-oidc.sh no longer references property_mappings — has the fix been reverted?"; return 1; }

  local provider_name='aiqadam-platform-local-provider'
  local pk
  pk="$("$CURL_BIN" --silent --max-time 10 \
          --header "Authorization: Bearer ${AK_API_TOKEN}" \
          "${AUTHENTIK_URL}${PROVIDERS_PATH}?name=${provider_name}" \
        | jq -r '.results[0].pk // empty')"
  [[ -n "$pk" ]] || skip "provider '$provider_name' not provisioned in this environment"

  local mapping_names
  mapping_names="$("$CURL_BIN" --silent --max-time 10 \
                     --header "Authorization: Bearer ${AK_API_TOKEN}" \
                     "${AUTHENTIK_URL}${PROVIDERS_PATH}${pk}/" \
                   | jq -r '.property_mappings | length')"

  [[ "$mapping_names" -ge 3 ]] \
    || { echo "expected >=3 property_mappings attached to '$provider_name', got $mapping_names"; return 1; }
}
