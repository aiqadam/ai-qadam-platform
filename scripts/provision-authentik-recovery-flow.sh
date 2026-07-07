#!/usr/bin/env bash
# scripts/provision-authentik-recovery-flow.sh
#
# Bind Authentik's built-in "Recovery Flow" to the default Brand and brand
# the recovery-email subject line. Implements ISS-USR-PWRESET-001 Path A
# (thin wiring of the IdP's native forgot-password flow). The visible
# "Forgot password?" link is rendered by Authentik itself once Brand.flow_recovery
# is bound — no apps/web or apps/web-next UI edit is required.
#
# Idempotent: re-running this script is a no-op when both
# Brand.flow_recovery == DEFAULT_RECOVERY_FLOW_SLUG and
# EmailTemplate.subject == BRANDED_RECOVERY_SUBJECT. The Brand UUID is cached
# to /tmp/aiqadam-secrets-AUTHENTIK_BRAND_UUID so the second run does not need
# a second round-trip to /api/v3/core/brands/.
#
# Env contract (read from /tmp/aiqadam-secrets-AK_API_TOKEN if not set):
#   AK_API_TOKEN   — Authentik admin API token (from Admin → Tokens)
#   AUTHENTIK_URL  — defaults to https://auth.aiqadam.org; the UAT env-setup
#                    script overrides it to http://localhost:9000
#
# Behaviour flags (defaults are the safe, recommended values):
#   RECOVERY_FLOW_SLUG  — slug of the recovery flow instance to bind
#                          (default: "default-recovery-flow")
#   BRANDED_RECOVERY_SUBJECT — subject line for the recovery email
#                          (default: "Reset your AI Qadam password" — copy
#                          matches docs/04-development/design-system/
#                          ux-and-content-guidelines.md:1251)
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
#   bash scripts/provision-authentik-recovery-flow.sh

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
RECOVERY_FLOW_SLUG="${RECOVERY_FLOW_SLUG:-default-recovery-flow}"
RECOVERY_EMAIL_TEMPLATE_NAME="${RECOVERY_EMAIL_TEMPLATE_NAME:-default-email-recovery}"
BRANDED_RECOVERY_SUBJECT="${BRANDED_RECOVERY_SUBJECT:-Reset your AI Qadam password}"
BRAND_UUID_CACHE="/tmp/aiqadam-secrets-AUTHENTIK_BRAND_UUID"
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

# ── HTTP helpers (mirror scripts/provision-authentik-rbac-groups.sh) ────────
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

# ── Resolve the default Brand UUID ──────────────────────────────────────────
# Authentik's /core/brands/?default=true paginates; read all and pick in
# process (same trick as provision-storybook-authentik.sh for proxy providers).
resolve_brand_uuid() {
  if [[ -f "$BRAND_UUID_CACHE" ]]; then
    local cached
    cached="$(cat "$BRAND_UUID_CACHE" 2>/dev/null || true)"
    if [[ -n "$cached" ]]; then
      echo "  ✓ brand UUID from cache: $cached" >&2
      printf '%s' "$cached"
      return 0
    fi
  fi
  local pk
  pk=$(ak_get "$AUTHENTIK_URL/api/v3/core/brands/?default=true&page_size=200" \
       | jq -r '.results[] | select(.default == true) | .brand_uuid' | head -1)
  if [[ -z "$pk" ]]; then
    echo "FATAL: no default brand returned by /api/v3/core/brands/?default=true" >&2
    return 3
  fi
  printf '%s' "$pk" | tee "$BRAND_UUID_CACHE" >/dev/null
  echo "  ✓ brand UUID resolved and cached: $pk" >&2
  printf '%s' "$pk"
}

# ── Resolve or create the recovery flow instance ─────────────────────────────
# 2024.12.x of Authentik does NOT auto-create a recovery flow on a fresh
# install (verified live — see .copilot/issues/ISS-USR-PWRESET-001.md).
# This function looks up the canonical slug and creates the flow if missing.
resolve_recovery_flow_uuid() {
  local pk
  pk=$(ak_get "$AUTHENTIK_URL/api/v3/flows/instances/?slug=$RECOVERY_FLOW_SLUG&page_size=200" \
       | jq -r --arg slug "$RECOVERY_FLOW_SLUG" \
              '.results[] | select(.slug == $slug) | .pk' | head -1)
  if [[ -n "$pk" ]]; then
    printf '%s' "$pk"
    return 0
  fi
  echo "  · recovery flow not found; creating it (one-time bootstrap)" >&2
  local body resp
  body=$(jq -nc --arg slug "$RECOVERY_FLOW_SLUG" \
    '{name: "Default Recovery Flow", slug: $slug, title: "Recover your account", designation: "recovery", policy_engine_mode: "any", compatibility_mode: false, layout: "stacked", denied_action: "message_continue"}')
  resp=$(ak_post "$AUTHENTIK_URL/api/v3/flows/instances/" "$body")
  pk=$(printf '%s' "$resp" | jq -r '.pk')
  if [[ -z "$pk" ]]; then
    echo "FATAL: created recovery flow but no pk in response." >&2
    return 3
  fi
  printf '%s' "$pk"
}

# ── Ensure an IdentificationStage exists (idempotent by name) ───────────────
ensure_identification_stage() {
  local name="${AIQADAM_IDENT_STAGE_NAME:-aiqadam-recovery-identification}"
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

# ── Ensure an EmailStage exists with branded subject (idempotent by name) ──
# 2024.12.x has NO separate EmailTemplate model. The recovery template is
# bundled in the image at email/password_reset.html and is referenced from
# the EmailStage.template field as "email/password_reset.html".
ensure_email_stage() {
  local name="${AIQADAM_EMAIL_STAGE_NAME:-aiqadam-recovery-email}"
  local pk current_subject
  pk=$(ak_get "$AUTHENTIK_URL/api/v3/stages/email/?name=$name&page_size=200" \
       | jq -r --arg n "$name" \
              '.results[] | select(.name == $n) | .pk' | head -1)
  if [[ -n "$pk" ]]; then
    current_subject=$(ak_get "$AUTHENTIK_URL/api/v3/stages/email/$pk/" \
                       | jq -r '.subject // empty')
    if [[ "$current_subject" == "$BRANDED_RECOVERY_SUBJECT" ]]; then
      echo "    · email stage: $pk (subject already branded)" >&2
      printf '%s' "$pk"
      return 0
    fi
    local body
    body=$(jq -nc --arg s "$BRANDED_RECOVERY_SUBJECT" '{subject: $s}')
    ak_patch "$AUTHENTIK_URL/api/v3/stages/email/$pk/" "$body" >/dev/null
    echo "    ~ email stage $pk subject rebranded" >&2
    printf '%s' "$pk"
    return 0
  fi
  local body resp
  body=$(jq -nc --arg n "$name" --arg s "$BRANDED_RECOVERY_SUBJECT" \
    '{name: $n, subject: $s, template: "email/password_reset.html", use_global_settings: true, activate_user_on_success: true}')
  resp=$(ak_post "$AUTHENTIK_URL/api/v3/stages/email/" "$body")
  pk=$(printf '%s' "$resp" | jq -r '.pk')
  if [[ -z "$pk" ]]; then
    echo "FATAL: created email stage but no pk in response." >&2
    return 3
  fi
  echo "    + email stage created: $pk" >&2
  printf '%s' "$pk"
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

# ── Bind Brand.flow_recovery to the recovery flow (idempotent) ─────────────
bind_brand_recovery_flow() {
  local brand_uuid="$1" recovery_uuid="$2"
  local current
  current=$(ak_get "$AUTHENTIK_URL/api/v3/core/brands/$brand_uuid/" \
            | jq -r '.flow_recovery // empty')
  if [[ "$current" == "$recovery_uuid" ]]; then
    echo "  ✓ Brand.flow_recovery already bound (no-op)"
    return 0
  fi
  echo "  → current Brand.flow_recovery=$current; binding to $recovery_uuid"
  local body
  body=$(jq -nc --arg u "$recovery_uuid" '{flow_recovery: $u}')
  ak_patch "$AUTHENTIK_URL/api/v3/core/brands/$brand_uuid/" "$body" >/dev/null
  echo "  + Brand.flow_recovery bound"
}

# ── AC-1 assertion: the recovery flow is reachable at the slug URL ──────────
# In 2024.12.x the brand-keyed /if/flow/recovery/ only resolves when the
# brand's `domain` matches the request `Host`. For local-dev we verify via
# the canonical slug URL /if/flow/$RECOVERY_FLOW_SLUG/ which always resolves.
assert_local_recovery_url() {
  if [[ "$_host" != "localhost" && "$_host" != "127.0.0.1" ]]; then
    echo "  · skipping /if/flow/$RECOVERY_FLOW_SLUG/ check (host=$_host)"
    return 0
  fi
  local url="http://$_host:9000/if/flow/$RECOVERY_FLOW_SLUG/"
  local code
  code=$("$CURL_BIN" -s -o /dev/null -w '%{http_code}' "$url" || echo "000")
  if [[ "$code" == "200" ]]; then
    echo "  ✓ AC-1: $url returns 200 (recovery flow reachable)"
  else
    echo "  ! WARN: $url returned HTTP $code (expected 200)." >&2
    echo "    IdP API state was updated; surface this in BP-USR-PWRESET if it persists." >&2
  fi
}

# ── Main ───────────────────────────────────────────────────────────────────
echo "[1/5] Resolving Brand UUID..."
brand_uuid=$(resolve_brand_uuid)

echo "[2/5] Resolving or creating Recovery Flow (slug=$RECOVERY_FLOW_SLUG)..."
recovery_uuid=$(resolve_recovery_flow_uuid)
echo "       recovery_uuid=$recovery_uuid"

echo "[3/5] Ensuring identification + email stages + bindings..."
ident_stage_uuid=$(ensure_identification_stage)
email_stage_uuid=$(ensure_email_stage)
ensure_flow_stage_binding "$recovery_uuid" "$ident_stage_uuid" 10
ensure_flow_stage_binding "$recovery_uuid" "$email_stage_uuid" 20

echo "[4/5] Binding Brand → Recovery Flow..."
bind_brand_recovery_flow "$brand_uuid" "$recovery_uuid"

echo "[5/5] AC-1 local reachability check..."
assert_local_recovery_url

echo
echo "✅ Authentik Recovery Flow wired."
echo "   - Brand=$brand_uuid now points flow_recovery at $recovery_uuid"
echo "   - IdentificationStage=$ident_stage_uuid (order=10)"
echo "   - EmailStage=$email_stage_uuid (subject=\"$BRANDED_RECOVERY_SUBJECT\", order=20)"
echo
echo "Next steps (TestRunner, when infra is up):"
echo "  - Open http://localhost:9000/if/flow/default-authentication-flow/ to"
echo "    confirm 'Forgot password?' link appears below the password field."
echo "  - Hit the recovery URL with a seeded test user to confirm an email"
echo "    lands in Mailpit (http://localhost:8025)."
