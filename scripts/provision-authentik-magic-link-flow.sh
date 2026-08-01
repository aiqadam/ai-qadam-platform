#!/usr/bin/env bash
# scripts/provision-authentik-magic-link-flow.sh
#
# Provision Authentik's "magic-link-login" authentication flow — a
# passwordless sign-in mechanism for FR-AUTH-004. A user requests a
# one-time email link (POST /v1/auth/magic-link); Authentik's Email stage
# sends it natively; clicking the link authenticates the flow's session
# directly (no password-set step, unlike the recovery flow).
#
# Modeled on provision-authentik-recovery-flow.sh's idempotent
# resolve-or-create pattern. Current (correct) flow topology — the flow's
# own BOUND stage sequence — confirmed empirically live (see
# .copilot/tasks/active/wf-20260801-feat-179/07-test-results.md's
# "SECOND retry finding"):
#
#   10  UserLoginStage  default-authentication-login  (EXISTING built-in —
#                                                        resolved by name,
#                                                        NOT created; this
#                                                        is the ONLY stage
#                                                        bound to the flow)
#
# The Identification stage (aiqadam-magic-link-identification) and Email
# stage (aiqadam-magic-link-email) objects are still created/resolved by
# this script (see ensure_identification_stage / ensure_email_stage below)
# — the Email stage's UUID is still required by
# AuthentikClient.sendMagicLinkEmail's `email_stage=<uuid>` query param,
# which controls the sent email's subject/template. But as of the SECOND
# Step 8 retry, NEITHER stage is bound into the magic-link-login flow's
# own stage sequence. See "WHY ONLY UserLoginStage" below for the reason.
#
# CORRECTION #1 (Step 8 retry, see 07-test-results.md's "CRITICAL
# FINDING"): the original version of this script (and the spike findings
# doc that guided it) assumed AuthentikClient.sendMagicLinkEmail's
# `recovery_email/?email_stage=<uuid>` call routes the emailed LINK to
# whichever Email stage UUID is passed. A live send-and-inspect-the-real-
# email test proved this wrong: reading Authentik's own server source
# (authentik/core/api/users.py) confirms `email_stage` only selects the
# sent email's subject/template — the link is always minted by
# `_create_recovery_link()`, which is unconditionally `Brand.flow_recovery`
# for the CURRENT REQUEST's resolved Brand (per-request Host-header
# resolution, authentik/brands/middleware.py + utils.py), never a
# parameter of the call. So a second, purpose-built Brand IS required —
# this script provisions one (see bind_second_brand_recovery_flow below),
# pointed at THIS flow via its own `flow_recovery` field, reached only
# when AuthentikClient sends the request with a matching Host header. The
# existing default Brand's flow_recovery stays bound to
# default-recovery-flow (password reset) — completely untouched.
#
# CORRECTION #2 (SECOND Step 8 retry — the flow-TOPOLOGY bug, distinct
# from CORRECTION #1's flow-TARGET bug above): even after CORRECTION #1's
# fix routed the emailed link to the right flow, a live Playwright
# click-through (not just reading the link) found clicking it did NOT
# issue a session in one hop — it re-showed Identification, and
# submitting that sent a SECOND email. Root cause, confirmed by reading
# Authentik's flow-executor source (authentik/flows/views/executor.py): a
# FlowToken's pickled FlowPlan is built ONCE, in full, at
# _create_recovery_link() time, covering the flow's ENTIRE bound-stage
# list from the start. Clicking the emailed link restores that plan and
# resumes it from its FIRST bound stage — with Identification (order 10)
# and Email (order 20) both bound ahead of UserLoginStage (order 30), the
# token resumed at Identification every time, re-asking for the email
# address instead of completing sign-in. The token does NOT mean "this
# address is already verified" — it means "resume this specific
# pre-planned run of the whole flow from the top." Fix: the flow's own
# bound-stage list must contain ONLY UserLoginStage — no Identification,
# no Email stage bound into the flow itself. PLAN_CONTEXT_PENDING_USER is
# already set on the plan at token-creation time by recovery_email() (via
# its `for_user` argument), so UserLoginStage — which only reads that
# context key — can act immediately with no re-identification step. This
# script therefore no longer calls ensure_flow_stage_binding for the
# Identification/Email stages, and actively UN-binds them
# (ensure_flow_stage_NOT_bound, the mirror of ensure_flow_stage_binding)
# if a prior run of an older version of this script left them bound —
# making the script convergent regardless of which prior topology it's
# applied against.
#
# Idempotent: re-running this script resolves existing objects by name/
# slug/domain rather than duplicating them, matching the recovery-flow
# script's own convention, and converges any stale wrong-topology
# bindings to the correct state rather than assuming a clean slate.
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
#   MAGIC_LINK_BRAND_DOMAIN    — the second Brand's `domain` value, matched
#                                against the outbound request's Host header
#                                by AuthentikClient.sendMagicLinkEmail
#                                (default: "magic-link.aiqadam.internal" —
#                                deliberately non-routable; reached only by
#                                our own server-to-server call, never a
#                                real browser's Host header)
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
# Output: prints the resolved Email stage UUID and the second Brand's
# domain on their own lines as
#   EMAIL_STAGE_UUID=<uuid>
#   BRAND_DOMAIN=<domain>
# — set these as AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID and
# AUTHENTIK_MAGIC_LINK_BRAND_DOMAIN in the API's env.

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
# Brand.domain is a plain TextField with no uniqueness constraint (confirmed
# via `docker exec aiqadam-authentik-server sh -c "grep -n 'class Brand' -A
# 40 /authentik/brands/models.py"`) — but it must still never collide with a
# real incoming Host header from a real browser, since get_brand_for_request()
# (authentik/brands/utils.py) matches ANY request's Host against it via
# iendswith. ".internal" is not a real public TLD and this exact hostname is
# never registered in DNS or requested by any browser — it is set as the
# Host header ONLY by AuthentikClient.sendMagicLinkEmail's own fetch() call.
MAGIC_LINK_BRAND_DOMAIN="${MAGIC_LINK_BRAND_DOMAIN:-magic-link.aiqadam.internal}"
MAGIC_LINK_BRAND_NAME="${MAGIC_LINK_BRAND_NAME:-aiqadam-magic-link}"
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

# ── Ensure a stage is NOT bound into a flow (idempotent, mirror of
# ensure_flow_stage_binding above) ───────────────────────────────────────────
# SECOND Step 8 retry fix (see CORRECTION #2 at the top of this file): a
# FlowToken resumes its FlowPlan from the flow's FIRST bound stage, so
# Identification/Email must never be bound into magic-link-login — only
# UserLoginStage may be. This helper makes that convergent regardless of
# which prior script version last touched the live instance: a
# fresh/uncorrected environment (e.g. a teammate's local Authentik that
# only ran the FIRST script version, which DID bind these stages) gets
# the stale bindings actively removed; an already-corrected environment
# (nothing bound) is a clean no-op.
ensure_flow_stage_NOT_bound() {
  local flow_uuid="$1" stage_uuid="$2" stage_label="$3"
  local existing_pk
  existing_pk=$(ak_get "$AUTHENTIK_URL/api/v3/flows/bindings/?target=$flow_uuid&page_size=200" \
                | jq -r --arg s "$stage_uuid" \
                       '.results[] | select(.stage == $s) | .pk' | head -1)
  if [[ -z "$existing_pk" ]]; then
    echo "    · $stage_label already NOT bound to flow (no-op)" >&2
    return 0
  fi
  echo "    → $stage_label found bound (pk=$existing_pk) — removing (wrong topology, see CORRECTION #2)" >&2
  "$CURL_BIN" -sf -H "$H_AUTH" -X DELETE "$AUTHENTIK_URL/api/v3/flows/bindings/$existing_pk/" >/dev/null
  echo "    - $stage_label binding $existing_pk deleted" >&2
}

# ── Resolve or create the second Brand + bind its flow_recovery ─────────────
# This is the actual fix for the Step 8 bug (see the CORRECTION note at the
# top of this file): Authentik's recovery_email endpoint always mints its
# link from the resolved-request Brand's flow_recovery — the email_stage
# query param never affects the link, only the email's subject/template. A
# second Brand, matched only by our own outbound Host header, is the
# supported mechanism to route the link into THIS flow instead of the
# default Brand's flow_recovery (which stays bound to
# default-recovery-flow for password-reset, untouched).
#
# Idempotent by domain: resolves the existing Brand row by exact `domain`
# match rather than creating a duplicate on re-run.
resolve_or_create_second_brand_uuid() {
  local pk
  pk=$(ak_get "$AUTHENTIK_URL/api/v3/core/brands/?page_size=200" \
       | jq -r --arg d "$MAGIC_LINK_BRAND_DOMAIN" \
              '.results[] | select(.domain == $d) | .brand_uuid' | head -1)
  if [[ -n "$pk" ]]; then
    echo "  · second brand: $pk (existing, domain=$MAGIC_LINK_BRAND_DOMAIN)" >&2
    printf '%s' "$pk"
    return 0
  fi
  echo "  · second brand not found; creating it (domain=$MAGIC_LINK_BRAND_DOMAIN)" >&2
  local body resp
  body=$(jq -nc --arg d "$MAGIC_LINK_BRAND_DOMAIN" --arg t "$MAGIC_LINK_BRAND_NAME" \
    '{domain: $d, branding_title: $t, default: false}')
  resp=$(ak_post "$AUTHENTIK_URL/api/v3/core/brands/" "$body")
  pk=$(printf '%s' "$resp" | jq -r '.brand_uuid')
  if [[ -z "$pk" ]]; then
    echo "FATAL: created second brand but no brand_uuid in response." >&2
    return 3
  fi
  echo "    + second brand created: $pk" >&2
  printf '%s' "$pk"
}

# ── Bind the second Brand's flow_recovery to the magic-link flow (idempotent) ──
# Deliberately targets ONLY the second Brand (never the default Brand,
# whose flow_recovery must stay bound to default-recovery-flow for
# password-reset — provision-authentik-recovery-flow.sh owns that
# binding exclusively).
bind_second_brand_recovery_flow() {
  local brand_uuid="$1" magic_link_flow_uuid="$2"
  local current
  current=$(ak_get "$AUTHENTIK_URL/api/v3/core/brands/$brand_uuid/" \
            | jq -r '.flow_recovery // empty')
  if [[ "$current" == "$magic_link_flow_uuid" ]]; then
    echo "  ✓ second Brand.flow_recovery already bound (no-op)"
    return 0
  fi
  echo "  → current second Brand.flow_recovery=$current; binding to $magic_link_flow_uuid"
  local body
  body=$(jq -nc --arg u "$magic_link_flow_uuid" '{flow_recovery: $u}')
  ak_patch "$AUTHENTIK_URL/api/v3/core/brands/$brand_uuid/" "$body" >/dev/null
  echo "  + second Brand.flow_recovery bound"
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
echo "[1/6] Resolving or creating Magic Link Flow (slug=$MAGIC_LINK_FLOW_SLUG)..."
flow_uuid=$(resolve_magic_link_flow_uuid)
echo "       flow_uuid=$flow_uuid"

echo "[2/6] Ensuring identification + email stage OBJECTS exist (NOT bound to the flow — see CORRECTION #2)..."
ident_stage_uuid=$(ensure_identification_stage)
email_stage_uuid=$(ensure_email_stage)
# Deliberately NOT bound into the flow: a FlowToken resumes its FlowPlan
# from the flow's FIRST bound stage, so binding Identification/Email
# ahead of UserLoginStage makes a clicked link re-ask for the email
# address instead of completing sign-in (see CORRECTION #2 at the top of
# this file). Actively un-bind them in case a stale run of an earlier
# script version left them bound — convergent either way.
ensure_flow_stage_NOT_bound "$flow_uuid" "$ident_stage_uuid" "identification stage"
ensure_flow_stage_NOT_bound "$flow_uuid" "$email_stage_uuid" "email stage"

echo "[3/6] Resolving + binding built-in UserLoginStage (session issuance — the ONLY bound stage)..."
login_stage_uuid=$(resolve_existing_stage_uuid "user_login" "$AIQADAM_LOGIN_STAGE_NAME")
ensure_flow_stage_binding "$flow_uuid" "$login_stage_uuid" 10

echo "[4/6] Resolving or creating the second Brand (domain=$MAGIC_LINK_BRAND_DOMAIN)..."
brand_uuid=$(resolve_or_create_second_brand_uuid)
echo "       brand_uuid=$brand_uuid"

echo "[5/6] Binding second Brand.flow_recovery → Magic Link Flow..."
bind_second_brand_recovery_flow "$brand_uuid" "$flow_uuid"

echo "[6/6] AC-1-equivalent local reachability check..."
assert_local_flow_url

echo
echo "✅ Authentik Magic Link Flow wired."
echo "   - Flow=$flow_uuid (slug=$MAGIC_LINK_FLOW_SLUG, designation=authentication)"
echo "   - Bound stages: UserLoginStage ONLY (order=10) — see CORRECTION #2 at the"
echo "     top of this file for why Identification/Email must NOT be bound."
echo "   - IdentificationStage=$ident_stage_uuid (object exists, resolvable by name, NOT bound to flow)"
echo "   - EmailStage=$email_stage_uuid (object exists, subject=\"$MAGIC_LINK_EMAIL_SUBJECT\", token_expiry=${MAGIC_LINK_TOKEN_EXPIRY_MINUTES}m, NOT bound to flow — its UUID is only referenced by AuthentikClient.sendMagicLinkEmail's email_stage query param)"
echo "   - UserLoginStage=$login_stage_uuid (name=$AIQADAM_LOGIN_STAGE_NAME, order=10, existing built-in — not created; the flow's only bound stage)"
echo "   - Brand=$brand_uuid (domain=$MAGIC_LINK_BRAND_DOMAIN, default=false) now points flow_recovery at $flow_uuid"
echo
echo "EMAIL_STAGE_UUID=$email_stage_uuid"
echo "BRAND_DOMAIN=$MAGIC_LINK_BRAND_DOMAIN"
echo
echo "Next steps:"
echo "  - Set AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID=$email_stage_uuid in the API's env."
echo "  - Set AUTHENTIK_MAGIC_LINK_BRAND_DOMAIN=$MAGIC_LINK_BRAND_DOMAIN in the API's env"
echo "    (AuthentikClient.sendMagicLinkEmail sends this as the outbound Host header"
echo "    so Authentik resolves brand=$brand_uuid, not the default Brand, for the link)."
echo "  - POST /v1/auth/magic-link with a known test email; query Mailpit's real API and"
echo "    READ the email body — confirm the link targets /if/flow/$MAGIC_LINK_FLOW_SLUG/,"
echo "    NOT default-recovery-flow, and the copy is the branded magic-link subject, not"
echo "    the generic password-reset template. A 200/{ok:true} API response is NOT"
echo "    sufficient verification by itself — this exact gap is what slipped through"
echo "    before (see 07-test-results.md's CRITICAL FINDING)."
echo "  - CLICK the link (not just read it) within 15 minutes → confirm a session is"
echo "    established in ONE hop (component: xak-flow-redirect, GET /api/v3/core/users/me/"
echo "    -> 200) — do NOT stop at 'link targets the right flow,' also prove it actually"
echo "    completes sign-in without re-showing Identification (AC-4). This exact gap"
echo "    (flow reachable + correctly targeted, but its own topology re-asks for the"
echo "    email and sends a SECOND link) is what slipped through the first retry — see"
echo "    07-test-results.md's SECOND retry finding."
echo "  - Click the same (now-consumed) link again → confirm ak-stage-access-denied /"
echo "    GET /me -> 403, no new session (AC-2)."
