#!/usr/bin/env bash
# Provision the AI Qadam RBAC groups in Authentik per ADR-0021 §2.
#
# Creates (idempotent — checks existing slugs first):
#   - 6 country-agnostic groups:
#       aiqadam-member, aiqadam-speaker, aiqadam-sponsor-rep,
#       aiqadam-super-admin, aiqadam-svc-bot, aiqadam-svc-worker
#   - 2 per-country groups for every active country (uz / kz / tj / xx):
#       aiqadam-organizer-<c>, aiqadam-country-lead-<c>
#
# Per ADR-0021 §2 the role naming is canonical; rename = downstream
# breakage. Idempotent: re-running is safe.
#
# Assigns the operator's email (default Viktor's) to aiqadam-super-admin
# if the user exists in Authentik. The assignment is the only "make a
# real change to a specific person" step in this script; everything else
# is structural.
#
# Required env (read from /tmp/aiqadam-secrets-AK_API_TOKEN if not set):
#   AK_API_TOKEN          — Authentik admin API token
#   AUTHENTIK_URL         — defaults to https://auth.aiqadam.org
#   SUPER_ADMIN_EMAIL     — email of the human to add to aiqadam-super-admin
#                           (defaults to drukker1991@gmail.com — Viktor)
#   COUNTRIES             — space-separated active country codes
#                           (defaults to "uz kz tj xx")
#
# Usage:
#   bash scripts/provision-authentik-rbac-groups.sh

set -euo pipefail

AUTHENTIK_URL="${AUTHENTIK_URL:-https://auth.aiqadam.org}"
AK_TOKEN_PATH="${AK_TOKEN_PATH:-/tmp/aiqadam-secrets-AK_API_TOKEN}"
AK_API_TOKEN="${AK_API_TOKEN:-$(cat "$AK_TOKEN_PATH" 2>/dev/null || true)}"

if [[ -z "$AK_API_TOKEN" ]]; then
  echo "FATAL: AK_API_TOKEN not set and $AK_TOKEN_PATH missing." >&2
  exit 2
fi

SUPER_ADMIN_EMAIL="${SUPER_ADMIN_EMAIL:-drukker1991@gmail.com}"
COUNTRIES="${COUNTRIES:-uz kz tj xx}"

H_AUTH="Authorization: Bearer $AK_API_TOKEN"
H_JSON="Content-Type: application/json"

# Helper: POST with body, surface non-2xx response (same shape as
# provision-gatus-authentik.sh's ak_post — the existing pattern).
ak_post() {
  local url="$1" body="$2"
  local resp code respbody
  resp=$(curl -s -H "$H_AUTH" -H "$H_JSON" -X POST -w "\n%{http_code}" "$url" -d "$body")
  code="${resp##*$'\n'}"
  respbody="${resp%$'\n'*}"
  if [[ "$code" != "200" && "$code" != "201" ]]; then
    echo "  ✗ POST $url returned HTTP $code" >&2
    echo "    ${respbody:0:300}" >&2
    return 1
  fi
  printf '%s' "$respbody"
}

# Helper: PATCH with body, surface non-2xx.
ak_patch() {
  local url="$1" body="$2"
  local resp code respbody
  resp=$(curl -s -H "$H_AUTH" -H "$H_JSON" -X PATCH -w "\n%{http_code}" "$url" -d "$body")
  code="${resp##*$'\n'}"
  respbody="${resp%$'\n'*}"
  if [[ "$code" != "200" && "$code" != "204" ]]; then
    echo "  ✗ PATCH $url returned HTTP $code" >&2
    echo "    ${respbody:0:300}" >&2
    return 1
  fi
  printf '%s' "$respbody"
}

# Get group pk by name (Authentik returns paginated results; we read
# the first match). Empty string if not found.
group_pk_by_name() {
  local name="$1"
  curl -sf -H "$H_AUTH" \
    "$AUTHENTIK_URL/api/v3/core/groups/?name=$(printf %s "$name" | jq -sRr @uri)" \
    | jq -r '.results[0].pk // empty'
}

ensure_group() {
  local name="$1"
  local existing
  existing=$(group_pk_by_name "$name")
  if [[ -n "$existing" ]]; then
    echo "  ✓ group $name (exists, pk=$existing)"
    return 0
  fi
  ak_post "$AUTHENTIK_URL/api/v3/core/groups/" \
    "$(jq -nc --arg name "$name" '{name:$name, is_superuser:false}')" >/dev/null
  echo "  + group $name (created)"
}

# ──────────── Country-agnostic groups (per ADR-0021 §2) ──────────────────

echo "[1/3] Country-agnostic groups…"
for name in aiqadam-member aiqadam-speaker aiqadam-sponsor-rep \
            aiqadam-super-admin aiqadam-svc-bot aiqadam-svc-worker; do
  ensure_group "$name"
done

# ──────────── Per-country groups ─────────────────────────────────────────

echo "[2/3] Per-country groups for: $COUNTRIES …"
for c in $COUNTRIES; do
  ensure_group "aiqadam-organizer-${c}"
  ensure_group "aiqadam-country-lead-${c}"
done

# ──────────── Super-admin assignment ─────────────────────────────────────

echo "[3/3] Assigning $SUPER_ADMIN_EMAIL to aiqadam-super-admin…"

# Look up the user pk by email.
USER_PK=$(curl -sf -H "$H_AUTH" \
  "$AUTHENTIK_URL/api/v3/core/users/?email=$(printf %s "$SUPER_ADMIN_EMAIL" | jq -sRr @uri)" \
  | jq -r '.results[0].pk // empty')

if [[ -z "$USER_PK" ]]; then
  echo "  ! user $SUPER_ADMIN_EMAIL not found in Authentik — skip assignment" >&2
  echo "    (the user must first sign in once via OIDC so Authentik provisions a row)" >&2
  echo "    Re-run this script after the first sign-in." >&2
else
  SA_PK=$(group_pk_by_name "aiqadam-super-admin")
  if [[ -z "$SA_PK" ]]; then
    echo "  ✗ aiqadam-super-admin group not found (should have been created above)" >&2
    exit 1
  fi
  # Read current groups for the user.
  CURRENT_GROUPS=$(curl -sf -H "$H_AUTH" \
    "$AUTHENTIK_URL/api/v3/core/users/$USER_PK/" \
    | jq -r '.groups[]')
  if echo "$CURRENT_GROUPS" | grep -qx "$SA_PK"; then
    echo "  ✓ already in aiqadam-super-admin (pk=$SA_PK)"
  else
    # Append SA_PK to the user's groups array.
    NEW_GROUPS=$(jq -nc --arg sa "$SA_PK" --args '$ARGS.positional + [$sa]' --args $CURRENT_GROUPS)
    ak_patch "$AUTHENTIK_URL/api/v3/core/users/$USER_PK/" \
      "$(jq -nc --argjson groups "$NEW_GROUPS" '{groups:$groups}')" >/dev/null
    echo "  + added $SUPER_ADMIN_EMAIL to aiqadam-super-admin"
  fi
fi

echo
echo "✅ Authentik RBAC groups provisioned per ADR-0021 §2."
echo
echo "Next steps (HUMAN — when ready):"
echo "  - Confirm in Authentik admin UI that the groups appear under Directory → Groups"
echo "  - As country leads / sponsors are onboarded, assign them via the Authentik admin UI"
echo "  - F-S2.2 RBAC sync service (next sprint) will then propagate the group changes to"
echo "    Directus (writing directus_users.policies[]) + Plausible (per-site role)"
