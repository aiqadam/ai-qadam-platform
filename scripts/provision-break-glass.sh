#!/usr/bin/env bash
# scripts/provision-break-glass.sh — F-S0.2.
#
# Provision (or rotate) the break-glass Directus admin token: a
# dedicated `aiqadam-break-glass@aiqadam.org` directus_users row in
# the Administrator role, with a static `token` field set to a fresh
# 64-hex value. Output token to stdout AND to
# /tmp/aiqadam-secrets-BREAKGLASS_DIRECTUS_TOKEN (mode 0600).
#
# Idempotent + rotation-aware:
#   - If the user doesn't exist: create + assign token
#   - If the user exists: regenerate the token (rotation)
# Either way, the secret file ends up with the current token.
#
# Per docs/runbooks/break-glass.md + ADR-0017 + roadmap §7 row 0.2.
#
# Why we need this:
#   - DIRECTUS_TOKEN (the existing admin token) is bound to a
#     bootstrap-utility user; rotating it breaks bootstrap.sh runs +
#     the migrate scripts
#   - When Authentik is down, normal Directus admin SSO doesn't work;
#     a separately-rotatable static token bound to a clearly-named
#     break-glass user is the cleanest hedge
#   - Quarterly rotation per SECURITY.md; this script makes the
#     rotation a one-command operation
#
# Required env:
#   DIRECTUS_URL       — defaults to https://cms.aiqadam.org
#   DIRECTUS_TOKEN     — existing admin token from /tmp/aiqadam-secrets-DIRECTUS_TOKEN
#
# Outputs:
#   stdout: the new break-glass token (also written to the secret file)
#   /tmp/aiqadam-secrets-BREAKGLASS_DIRECTUS_TOKEN (mode 0600)
#
# Usage:
#   bash scripts/provision-break-glass.sh
#
# Quarterly rotation: run this script again. The user is reused; the
# token rolls forward; the prior token is invalidated by Directus the
# moment the new one is PATCHed in.

set -euo pipefail

DIRECTUS_URL="${DIRECTUS_URL:-https://cms.aiqadam.org}"
DIRECTUS_TOKEN_PATH="${DIRECTUS_TOKEN_PATH:-/tmp/aiqadam-secrets-DIRECTUS_TOKEN}"
DIRECTUS_TOKEN="${DIRECTUS_TOKEN:-$(cat "$DIRECTUS_TOKEN_PATH" 2>/dev/null || true)}"

if [[ -z "$DIRECTUS_TOKEN" ]]; then
  echo "FATAL: DIRECTUS_TOKEN not set and $DIRECTUS_TOKEN_PATH missing." >&2
  echo "       The existing admin token is required to provision the" >&2
  echo "       break-glass user. If it's been rotated, restore from the" >&2
  echo "       team password manager first." >&2
  exit 2
fi

BREAKGLASS_EMAIL="${BREAKGLASS_EMAIL:-aiqadam-break-glass@aiqadam.org}"
BREAKGLASS_FIRST_NAME="Break-Glass"
BREAKGLASS_LAST_NAME="Admin"
SECRET_PATH="${SECRET_PATH:-/tmp/aiqadam-secrets-BREAKGLASS_DIRECTUS_TOKEN}"

H_AUTH="Authorization: Bearer $DIRECTUS_TOKEN"
H_JSON="Content-Type: application/json"

# Helper: POST / PATCH with body, surface non-2xx response. Same shape
# as scripts/provision-gatus-authentik.sh's ak_post so the failure
# mode is consistent across our provisioning scripts.
api_call() {
  local method="$1" url="$2" body="${3:-}"
  local resp code respbody
  if [[ -n "$body" ]]; then
    resp=$(curl -s -H "$H_AUTH" -H "$H_JSON" -X "$method" -w "\n%{http_code}" "$url" -d "$body")
  else
    resp=$(curl -s -H "$H_AUTH" -X "$method" -w "\n%{http_code}" "$url")
  fi
  code="${resp##*$'\n'}"
  respbody="${resp%$'\n'*}"
  if [[ "$code" != "200" && "$code" != "201" && "$code" != "204" ]]; then
    echo "  ✗ $method $url returned HTTP $code" >&2
    echo "    ${respbody:0:300}" >&2
    return 1
  fi
  printf '%s' "$respbody"
}

# Generate a 64-hex token (Directus accepts arbitrary strings; we mirror
# the existing DIRECTUS_TOKEN's shape for consistency).
new_token() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    # POSIX fallback using /dev/urandom + xxd or od.
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

echo "[1/4] Resolving the Administrator role id…"
ROLE_ID=$(curl -sf -H "$H_AUTH" \
  "$DIRECTUS_URL/roles?filter%5Bname%5D%5B_eq%5D=Administrator&limit=1&fields=id" \
  | jq -r '.data[0].id // empty')

if [[ -z "$ROLE_ID" ]]; then
  echo "FATAL: no Administrator role found in Directus." >&2
  echo "       This is unexpected on a healthy install. Check the" >&2
  echo "       roles list manually via the API or admin UI." >&2
  exit 1
fi
echo "  ✓ Administrator role id=$ROLE_ID"

echo "[2/4] Looking for existing break-glass user ($BREAKGLASS_EMAIL)…"
USER_ID=$(curl -sf -H "$H_AUTH" \
  "$DIRECTUS_URL/users?filter%5Bemail%5D%5B_eq%5D=$(printf %s "$BREAKGLASS_EMAIL" | jq -sRr @uri)&limit=1&fields=id" \
  | jq -r '.data[0].id // empty')

NEW_TOKEN=$(new_token)

if [[ -n "$USER_ID" ]]; then
  echo "  ✓ user exists (id=$USER_ID) — rotating token"
  api_call PATCH "$DIRECTUS_URL/users/$USER_ID" \
    "$(jq -nc --arg t "$NEW_TOKEN" '{token:$t}')" >/dev/null
  echo "[3/4] Token rotated for existing break-glass user"
else
  echo "  → creating break-glass user…"
  api_call POST "$DIRECTUS_URL/users" \
    "$(jq -nc \
        --arg email "$BREAKGLASS_EMAIL" \
        --arg first "$BREAKGLASS_FIRST_NAME" \
        --arg last  "$BREAKGLASS_LAST_NAME" \
        --arg role  "$ROLE_ID" \
        --arg token "$NEW_TOKEN" \
        '{
           email:      $email,
           first_name: $first,
           last_name:  $last,
           role:       $role,
           status:     "active",
           token:      $token,
           description: "Break-glass admin (per docs/runbooks/break-glass.md + F-S0.2). NOT for routine work — invocations are auditable; quarterly rotation."
         }')" >/dev/null
  echo "[3/4] Break-glass user created"
fi

echo "[4/4] Writing token to $SECRET_PATH (mode 0600)…"
umask 077
printf '%s' "$NEW_TOKEN" > "$SECRET_PATH"
chmod 600 "$SECRET_PATH"
echo "  ✓ token written"

cat <<EOF

────────────────────────────────────────────────────────────────────
Break-glass Directus token (also at $SECRET_PATH):

$NEW_TOKEN

Next steps:
  - Copy to the team password manager under "Break-Glass / Directus".
  - Document this rotation in docs/runbooks/break-glass.md "Rotations"
    table (date + initials).
  - Test the new token works: curl -H "Authorization: Bearer \$TOKEN" \\
    "$DIRECTUS_URL/users/me" — expects 200 with email
    $BREAKGLASS_EMAIL.
  - Quarterly: re-run this script.
────────────────────────────────────────────────────────────────────
EOF
