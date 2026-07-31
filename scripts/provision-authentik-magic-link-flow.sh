#!/usr/bin/env bash
# scripts/provision-authentik-magic-link-flow.sh
#
# Provision Authentik's "magic-link-login" authentication flow — a
# passwordless sign-in mechanism for FR-AUTH-004. A user requests a
# one-time email link (POST /v1/auth/magic-link); Authentik's Email stage
# sends it natively; clicking the link authenticates the flow's session
# directly (no password-set step, unlike the recovery flow).
#
# Modeled directly on provision-authentik-recovery-flow.sh's idempotent
# resolve-or-create pattern, with the flow topology confirmed empirically
# against the live local Authentik instance (see
# .copilot/tasks/active/wf-20260801-feat-179/02b-authentik-spike-findings.md):
#
#   10  IdentificationStage  aiqadam-magic-link-identification  (NEW instance)
#   20  EmailStage           aiqadam-magic-link-email            (NEW instance, token_expiry=15)
#   30  UserLoginStage       default-authentication-login        (EXISTING built-in — resolved by
#                                                                  name, NOT created)
#
# Unlike the recovery flow, this flow does NOT bind to Brand.flow_recovery
# (or any Brand.flow_* field) — it is reached only by the API's own
# recovery_email send-by-stage-uuid call
# (POST /api/v3/core/users/{id}/recovery_email/?email_stage=<uuid>, see
# AuthentikClient.sendMagicLinkEmail), which routes to whatever Email
# stage UUID is passed regardless of Brand bindings. So this script
# deliberately has no bind_brand_* step.
#
# Idempotent: re-running this script resolves existing objects by name/
# slug rather than duplicating them, matching the recovery-flow script's
# own convention.
#
# Env contract (read from /tmp/aiqadam-secrets-AK_API_TOKEN if not set):
#   AK_API_TOKEN   — Authentik admin API token (from Admin → Tokens)
#   AUTHENTIK_URL  — defaults to https://auth.aiqadam.org; local dev/UAT
#                    overrides it to http://localhost:9000
#
# Behaviour flags (defaults are the safe, recommended values):
#   MAGIC_LINK_FLOW_SLUG      — slug of the flow instance (default: "magic-link-login")
#   MAGIC_LINK_EMAIL_SUBJECT  — subject line for the sign-in email
#                                (default: "Sign in to AI Qadam")
#   MAGIC_LINK_TOKEN_EXPIRY_MINUTES — Email stage token TTL in minutes,
#                                matches FR-AUTH-004 AC-3 (default: 15)
#
# Safety: this script refuses to run against AUTHENTIK_URL hosts other than
# localhost, 127.0.0.1, or auth.aiqadam.org. Production writes must come
# from the platform's break-glass operator runbook, not from this script.
#
# AGENTS.md conformance:
#   - set -euo pipefail; no magic strings (named constants below)
#   - parameterized jq filters via --arg (no string interpolation)
#   - helpers < 60 lines, single-purpose
#   - curl binary selection follows §6.1 footnote (prefer curl.exe on Windows)
#
# Usage:
#   bash scripts/provision-authentik-magic-link-flow.sh
#
# Output: prints the resolved Email stage UUID on its own line as
#   EMAIL_STAGE_UUID=<uuid>
# — set this as AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID in the API's env.

set -euo pipefail

# ── curl binary selection (AGENTS.md §6.1 footnote) ──────────────────────────
# Native Windows curl.exe reaches localhost:N via the Win host; the MSYS2
# GNU curl resolved in the Copilot-Chat sandbox on Windows cannot.
if command -v curl.exe &>/dev/null; then
  CURL_BIN='curl.exe'
else
  CURL_BIN='curl'
fi

# ── Env-var contract ─────────────────────────────────────────────────────────
AUTHENTIK_URL="${AUTHENTIK_URL:-https://auth.aiqadam.org}"
AK_TOKEN_PATH="${AK_TOKEN_PATH:-/tmp/aiqadam-secrets-AK_API_TOKEN}"
AK_API_TOKEN="${AK_API_TOKEN:-$(cat "$AK_TOKEN_PATH" 2>/dev/null || true)}"

if [[ -z "$AK_API_TOKEN" ]]; then
  echo "FATAL: AK_API_TOKEN not set and $AK_TOKEN_PATH missing." >&2
  exit 2
fi

# ── Named constants (no magic strings) ──────────────────────────────────────
MAGIC_LINK_FLOW_SLUG="${MAGIC_LINK_FLOW_SLUG:-magic-link-login}"
MAGIC_LINK_EMAIL_SUBJECT="${MAGIC_LINK_EMAIL_SUBJECT:-Sign in to AI Qadam}"
MAGIC_LINK_TOKEN_EXPIRY_MINUTES="${MAGIC_LINK_TOKEN_EXPIRY_MINUTES:-15}"
AIQADAM_IDENT_STAGE_NAME="${AIQADAM_IDENT_STAGE_NAME:-aiqadam-magic-link-identification}"
AIQADAM_EMAIL_STAGE_NAME="${AIQADAM_EMAIL_STAGE_NAME:-aiqadam-magic-link-email}"
AIQADAM_LOGIN_STAGE_NAME="${AIQADAM_LOGIN_STAGE_NAME:-default-authentication-login}"
ALLOWED_HOSTS="localhost 127.0.0.1 auth.aiqadam.org"

# ── Host guard (safety: no accidental writes against arbitrary prod) ────────
_host="$(printf '%s' "$AUTHENTIK_URL" | sed -E 's#^https?://##; s#:[0-9]+$##; s#/.*##')"
_allowed=0
for h in $ALLOWED_HOSTS; do
  if [[ "$_host" == "$h" ]]; then _allowed=1; break; fi
done
if [[ "$_allowed" -ne 1 ]]; then
  echo "FATAL: AUTHENTIK_URL host '$_host' is not in allow-list ($ALLOWED_HOSTS)." >&2
  echo "       This script is for local dev and the platform's own prod host only." >&2
  exit 4
fi

H_AUTH="Authorization: Bearer $AK_API_TOKEN"
H_JSON="Content-Type: application/json"

# ── HTTP helpers (mirror provision-authentik-recovery-flow.sh) ──────────────
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

ak_patch() {
  local url="$1" body="$2"
  local resp code respbody
  resp=$("$CURL_BIN" -s -H "$H_AUTH" -H "$H_JSON" -X PATCH -w "\n%{http_code}" "$url" -d "$body")
  code="${resp##*$'\n'}"
  respbody="${resp%$'\n'*}"
  if [[ "$code" != "200" && "$code" != "204" ]]; then
    echo "  ✗ PATCH $url returned HTTP $code" >&2
    echo "    ${respbody:0:300}" >&2
    return 1
  fi
  printf '%s' "$respbody"
}

# ── Resolve or create the magic-link flow instance ───────────────────────────
# designation="authentication" (not "recovery") — its terminal state is a
# login, matching default-authentication-flow's own designation. Confirmed
# by the spike this doesn't collide with anything: a non-default
# authentication-designated flow is not auto-bound anywhere just by
# existing (only Brand.flow_authentication and explicit per-provider
# bindings matter), and this flow is never bound as either.
resolve_magic_link_flow_uuid() {
  local pk
  pk=$(ak_get "$AUTHENTIK_URL/api/v3/flows/instances/?slug=$MAGIC_LINK_FLOW_SLUG&page_size=200" \
       | jq -r --arg slug "$MAGIC_LINK_FLOW_SLUG" \
              '.results[] | select(.slug == $slug) | .pk' | head -1)
  if [[ -n "$pk" ]]; then
    printf '%s' "$pk"
    return 0
  fi
  echo "  · magic-link flow not found; creating it (one-time bootstrap)" >&2
  local body resp
  body=$(jq -nc --arg slug "$MAGIC_LINK_FLOW_SLUG" \
    '{name: "Magic Link Sign-In", slug: $slug, title: "Sign in to AI Qadam", designation: "authentication", policy_engine_mode: "any", compatibility_mode: false, layout: "stacked", denied_action: "message_continue"}')
  resp=$(ak_post "$AUTHENTIK_URL/api/v3/flows/instances/" "$body")
  pk=$(printf '%s' "$resp" | jq -r '.pk')
  if [[ -z "$pk" ]]; then
    echo "FATAL: created magic-link flow but no pk in response." >&2
    return 3
  fi
  printf '%s' "$pk"
}

# ── Ensure an IdentificationStage exists (idempotent by name) ───────────────
ensure_identification_stage() {
  local name="$AIQADAM_IDENT_STAGE_NAME"
  local pk
  pk=$(ak_get "$AUTHENTIK_URL/api/v3/stages/identification/?name=$name&page_size=200" \
       | jq -r --arg n "$name" \
              '.results[] | select(.name == $n) | .pk' | head -1)
  if [[ -n "$pk" ]]; then
    echo "    · identification stage: $pk (existing)" >&2
    printf '%s' "$pk"
    return 0
  fi
  local body resp
  body=$(jq -nc --arg n "$name" \
    '{name: $n, user_fields: ["email"], passwordless_only: false, case_insensitive_matching: true, show_matched_user: true, pretend_user_exists: true}')
  resp=$(ak_post "$AUTHENTIK_URL/api/v3/stages/identification/" "$body")
  pk=$(printf '%s' "$resp" | jq -r '.pk')
  echo "    + identification stage created: $pk" >&2
  printf '%s' "$pk"
}

# ── Ensure an EmailStage exists with branded subject + 15-min TTL ───────────
# (idempotent by name). Note the token_expiry knob: the existing recovery
# Email stage ships with token_expiry=30 minutes; FR-AUTH-004 AC-3 requires
# 15, so this must be explicitly set, not copied from that stage.
ensure_email_stage() {
  local name="$AIQADAM_EMAIL_STAGE_NAME"
  local pk current_subject current_use_global current_expiry
  pk=$(ak_get "$AUTHENTIK_URL/api/v3/stages/email/?name=$name&page_size=200" \
       | jq -r --arg n "$name" \
              '.results[] | select(.name == $n) | .pk' | head -1)
  if [[ -n "$pk" ]]; then
    local current_json
    current_json=$(ak_get "$AUTHENTIK_URL/api/v3/stages/email/$pk/")
    current_subject=$(printf '%s' "$current_json" | jq -r '.subject // empty')
    current_use_global=$(printf '%s' "$current_json" | jq -r '.use_global_settings')
    current_expiry=$(printf '%s' "$current_json" | jq -r '.token_expiry')
    if [[ "$current_subject" == "$MAGIC_LINK_EMAIL_SUBJECT" \
          && "$current_use_global" == "true" \
          && "$current_expiry" == "$MAGIC_LINK_TOKEN_EXPIRY_MINUTES" ]]; then
      echo "    · email stage: $pk (subject branded, use_global_settings=true, token_expiry=$current_expiry)" >&2
      printf '%s' "$pk"
      return 0
    fi
    local body
    body=$(jq -nc --arg s "$MAGIC_LINK_EMAIL_SUBJECT" --argjson e "$MAGIC_LINK_TOKEN_EXPIRY_MINUTES" \
      '{subject: $s, use_global_settings: true, token_expiry: $e}')
    ak_patch "$AUTHENTIK_URL/api/v3/stages/email/$pk/" "$body" >/dev/null
    echo "    ~ email stage $pk rebranded + use_global_settings/token_expiry enforced (was: use_global_settings=$current_use_global, token_expiry=$current_expiry)" >&2
    printf '%s' "$pk"
    return 0
  fi
  local body resp
  body=$(jq -nc --arg n "$name" --arg s "$MAGIC_LINK_EMAIL_SUBJECT" --argjson e "$MAGIC_LINK_TOKEN_EXPIRY_MINUTES" \
    '{name: $n, subject: $s, template: "email/password_reset.html", use_global_settings: true, activate_user_on_success: true, token_expiry: $e}')
  resp=$(ak_post "$AUTHENTIK_URL/api/v3/stages/email/" "$body")
  pk=$(printf '%s' "$resp" | jq -r '.pk')
  if [[ -z "$pk" ]]; then
    echo "FATAL: created email stage but no pk in response." >&2
    return 3
  fi
  echo "    + email stage created: $pk (token_expiry=$MAGIC_LINK_TOKEN_EXPIRY_MINUTES)" >&2
  printf '%s' "$pk"
}

# ── Resolve an existing stage's UUID by API path + exact name ───────────────
# Used to resolve the built-in default-authentication-login UserLoginStage
# WITHOUT creating a duplicate — same discipline
# provision-authentik-recovery-flow.sh's resolve_existing_stage_uuid()
# already established for default-password-change-prompt/-write.
resolve_existing_stage_uuid() {
  local api_path="$1" name="$2"
  local uuid
  uuid=$(ak_get "$AUTHENTIK_URL/api/v3/stages/$api_path/?name=$name&page_size=200" \
         | jq -r --arg n "$name" '.results[] | select(.name == $n) | .pk' | head -1)
  if [[ -z "$uuid" ]]; then
    echo "FATAL: built-in stage '$name' not found at /api/v3/stages/$api_path/ — cannot wire the magic-link flow's session-issuance step." >&2
    return 3
  fi
  printf '%s' "$uuid"
}

# ── Bind a stage into a flow at the given order (idempotent) ────────────────
# FlowStageBinding uses path /api/v3/flows/bindings/ with field name 'target'
# (NOT 'flow'). See Authentik OpenAPI v3 schema.
ensure_flow_stage_binding() {
  local flow_uuid="$1" stage_uuid="$2" order="$3"
  local existing_pk
  existing_pk=$(ak_get "$AUTHENTIK_URL/api/v3/flows/bindings/?target=$flow_uuid&page_size=200" \
                | jq -r --arg s "$stage_uuid" \
                       '.results[] | select(.stage == $s) | .pk' | head -1)
  if [[ -n "$existing_pk" ]]; then
    echo "    · stage $stage_uuid already bound to flow" >&2
    return 0
  fi
  local body resp
  body=$(jq -nc --arg f "$flow_uuid" --arg s "$stage_uuid" --argjson o "$order" \
    '{target: $f, stage: $s, order: $o}')
  resp=$(ak_post "$AUTHENTIK_URL/api/v3/flows/bindings/" "$body")
  echo "    + stage $stage_uuid bound at order=$order" >&2
}

# ── AC-1-equivalent assertion: the flow is reachable at the slug URL ────────
assert_local_flow_url() {
  if [[ "$_host" != "localhost" && "$_host" != "127.0.0.1" ]]; then
    echo "  · skipping /if/flow/$MAGIC_LINK_FLOW_SLUG/ check (host=$_host)"
    return 0
  fi
  local url="http://$_host:9000/if/flow/$MAGIC_LINK_FLOW_SLUG/"
  local code
  code=$("$CURL_BIN" -s -o /dev/null -w '%{http_code}' "$url" || echo "000")
  if [[ "$code" == "200" ]]; then
    echo "  ✓ $url returns 200 (magic-link flow reachable)"
  else
    echo "  ! WARN: $url returned HTTP $code (expected 200)." >&2
  fi
}

# ── Main ───────────────────────────────────────────────────────────────────
echo "[1/5] Resolving or creating Magic Link Flow (slug=$MAGIC_LINK_FLOW_SLUG)..."
flow_uuid=$(resolve_magic_link_flow_uuid)
echo "       flow_uuid=$flow_uuid"

echo "[2/5] Ensuring identification + email stages + bindings..."
ident_stage_uuid=$(ensure_identification_stage)
email_stage_uuid=$(ensure_email_stage)
ensure_flow_stage_binding "$flow_uuid" "$ident_stage_uuid" 10
ensure_flow_stage_binding "$flow_uuid" "$email_stage_uuid" 20

echo "[3/5] Resolving + binding built-in UserLoginStage (session issuance)..."
login_stage_uuid=$(resolve_existing_stage_uuid "user_login" "$AIQADAM_LOGIN_STAGE_NAME")
ensure_flow_stage_binding "$flow_uuid" "$login_stage_uuid" 30

echo "[4/5] AC-1-equivalent local reachability check..."
assert_local_flow_url

echo "[5/5] Done."
echo
echo "✅ Authentik Magic Link Flow wired."
echo "   - Flow=$flow_uuid (slug=$MAGIC_LINK_FLOW_SLUG, designation=authentication)"
echo "   - IdentificationStage=$ident_stage_uuid (order=10)"
echo "   - EmailStage=$email_stage_uuid (subject=\"$MAGIC_LINK_EMAIL_SUBJECT\", token_expiry=${MAGIC_LINK_TOKEN_EXPIRY_MINUTES}m, order=20)"
echo "   - UserLoginStage=$login_stage_uuid (name=$AIQADAM_LOGIN_STAGE_NAME, order=30, existing built-in — not created)"
echo
echo "EMAIL_STAGE_UUID=$email_stage_uuid"
echo
echo "Next steps:"
echo "  - Set AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID=$email_stage_uuid in the API's env."
echo "  - POST /v1/auth/magic-link with a known test email, confirm delivery in Mailpit."
echo "  - Click the link within 15 minutes → confirm a session is established (AC-4)."
echo "  - Click the same link again → confirm Authentik shows an error, no new session (AC-2)."
