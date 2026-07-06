#!/usr/bin/env bash
# scripts/uat-seed.sh
#
# Seed UAT test fixtures so BP-UAT-001 through BP-UAT-018 can run.
# Idempotent — safe to re-run.
#
# What this does (in order):
#   1. Verifies the UAT stack is reachable (Directus + Authentik)
#   2. Runs infrastructure/directus/bootstrap.sh — creates all Directus
#      collections (countries, events, registrations, member_consents,
#      operator_invites, …) + RBAC policies. Idempotent by design.
#   3. Creates the two UAT test users in Authentik and assigns them to
#      RBAC groups:
#        uat-member@example.com   → aiqadam-member
#        uat-operator@example.com → aiqadam-super-admin (full operator cab)
#      These credentials are referenced in apps/e2e/.env.uat
#      (UAT_MEMBER_EMAIL / UAT_OPERATOR_EMAIL) written by uat-env-setup.sh.
#   4. Inserts three operator_invites rows into Directus (one valid+unused,
#      one consumed, one expired) so BP-UAT-013 steps 005/006 and
#      Neg 002/003 can run against the real /v1/onboard/preview API. Idempotent.
#
# Prerequisites (all done by scripts/uat-env-setup.sh):
#   - Docker stack up (Authentik :9000, Directus :8200)
#   - apps/api/.env has DIRECTUS_TOKEN
#   - infrastructure/.env has AUTHENTIK_BOOTSTRAP_PASSWORD
#
# Usage (from repo root):
#   pnpm uat:seed
#   pnpm uat:seed --reset <BP-UAT-NNN>   # reset one BP-UAT's mutable fixtures
#                                        # to their declared initial state
#   pnpm uat:seed --reset all            # reset every BP-UAT that has a
#                                        # manifest under scripts/uat-fixtures/
#
# --reset mode (FR-WORKFLOW-003): scripts/uat-seed.sh is create-if-missing
# only — BP-UAT scripts mutate the fixtures they seed (event status flips,
# invite tokens consumed, registrations created), so re-running a script, or
# running scripts out of order, fails for state reasons, not product
# reasons. `--reset <BP-UAT-NNN>` reads scripts/uat-fixtures/<BP-UAT-NNN>.json
# and, for every fixture it declares:
#   - "kind":"domain"   fixtures (events, operator_invites, member_consents,
#     …) are DELETED then RECREATED from the manifest's payload.
#   - "kind":"identity" fixtures (Authentik users) are RESET, never deleted —
#     group membership is restored via the same FORCE_REGEN-style code path
#     ensure_test_user() already implements. Deleting an identity would
#     invalidate sessions and RBAC group history.
# `--reset` without a flag leaves existing callers' behavior byte-identical
# (this is a purely additive branch that runs instead of, not alongside,
# the unconditional STEP 1-4 flow below).
#
# Environment guards:
#   FORCE_REGEN=1              — re-create test users even if they already exist
#                                (resets their password + group membership)
#   UAT_SEED_DIRECTUS_MOCK=1   — skip ALL external calls (test mode for bats)
#
# Why a bash script, not TypeScript: the fixtures live in Directus
# (CMS) and Authentik (IdP) — both administered via REST + shell. There
# is no Drizzle/TypeScript surface to write to; bootstrap.sh already
# owns the Directus side in bash, and we mirror its shape here.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA_DIR="$REPO_ROOT/infrastructure"
API_DIR="$REPO_ROOT/apps/api"
FIXTURES_DIR="$REPO_ROOT/scripts/uat-fixtures"

FORCE_REGEN="${FORCE_REGEN:-0}"
UAT_SEED_DIRECTUS_MOCK="${UAT_SEED_DIRECTUS_MOCK:-0}"

# ── MSYS-aware curl binary selector ───────────────────────────────────────────
# ISS-UAT-013-15: on this machine's Copilot-Chat run_in_terminal sandbox (Git
# Bash MSYS), bash resolves `curl` to the MSYS2 GNU ELF build (/usr/bin/curl)
# which cannot reach Windows-host `localhost:<port>` from inside the sandbox
# — only the native Windows curl.exe (in System32, on PATH from Git Bash) can.
# The MSYS bug also affects WSL bash on Windows hosts that publish services
# on the IPv6 wildcard adapter. Mirror the precedent set in
# scripts/uat-preflight-email.sh lines 85-90: prefer curl.exe when present,
# fall back to GNU curl otherwise. On Linux/macOS CI runners, curl.exe is
# not on PATH so CURL_BIN falls back to `curl` — byte-identical to pre-fix.
if command -v curl.exe &>/dev/null; then
  CURL_BIN='curl.exe'
else
  CURL_BIN='curl'
fi
export CURL_BIN

# ── CLI argument parsing (--reset <BP-UAT-NNN> | --reset all) ─────────────────
# No flag at all: RESET_TARGET stays empty and the script falls through to
# the pre-existing unconditional STEP 1-4 flow below, byte-identical to
# pre-FR-WORKFLOW-003 behavior (regression guard, FR AC-6).
RESET_TARGET=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --reset)
      [[ -n "${2:-}" ]] || { echo "Usage: uat-seed.sh --reset <BP-UAT-NNN>|all" >&2; exit 2; }
      RESET_TARGET="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: uat-seed.sh [--reset <BP-UAT-NNN>|all]" >&2
      exit 2
      ;;
  esac
done

# ── Colour helpers (same palette as uat-env-setup.sh) ─────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}  ✓${NC} $*"; }
warn() { echo -e "${YELLOW}  !${NC} $*"; }
info() { echo -e "  → $*"; }
fail() { echo -e "${RED}  ✗ FATAL:${NC} $*" >&2; exit 1; }

# ── Read a value from an existing .env file (empty if not found) ──────────────
# Strips both surrounding double-quotes AND trailing CR (Windows-edited .env
# files can have CRLF line endings; the bare CR corrupts bearer tokens when
# the value is interpolated into curl headers — Directus returns FORBIDDEN
# because the bearer doesn't match). tr -d '\r' is the standard fix used
# by all our env-reading helpers (ISS-UAT-SEED-001 AC-3).
env_get() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || { echo ""; return; }
  grep -E "^${key}=" "$file" 2>/dev/null | head -1 | sed 's/^[^=]*=//' | tr -d '"\r' || true
}

# ── Dependency checks ──────────────────────────────────────────────────────────
check_deps() {
  local missing=()
  for cmd in curl jq; do
    command -v "$cmd" &>/dev/null || missing+=("$cmd")
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    fail "Missing required tools: ${missing[*]}"
  fi
  # ISS-UAT-013-15: also verify the MSYS-resolved $CURL_BIN is on PATH.
  # `curl` (the bare name) is checked above for legacy / docs reasons; the
  # script's actual HTTP traffic routes through $CURL_BIN which may be
  # curl.exe on Windows. A failure here surfaces an actionable error
  # rather than a downstream `curl: command not found` deep inside a
  # helper function.
  command -v "$CURL_BIN" &>/dev/null \
    || fail "Missing required curl binary: $CURL_BIN (resolved from PATH)"
}

# ── Resolve Authentik admin token via docker exec ak shell ────────────────────
# Why docker exec and not HTTP Basic: Authentik 2024.x rejects HTTP Basic on
# /api/v3/core/tokens/ with "Unsupported authentication type", and the
# default-authentication-flow password stage errors out after the bootstrap
# password is rotated. The reliable path on a local Docker install is to mint
# a non-expiring api-intent token inside the container via `ak shell` — this
# is the same mechanism .copilot/oidc-setup-token was created with.
get_ak_admin_token() {
  local ak_url="$1" container="$2"
  # update_or_create is idempotent: re-running the seed just returns the
  # existing token's key. Intent=api + expiring=False so it survives across
  # runs; we never delete it (cleanup would break re-runs).
  local key
  key=$(docker exec "$container" ak shell -c "
from django.contrib.auth import get_user_model
from authentik.core.models import Token
U = get_user_model()
admin = U.objects.filter(username='akadmin').first()
t, _ = Token.objects.update_or_create(
    identifier='uat-seed-token',
    defaults={'user': admin, 'intent': 'api', 'expiring': False})
print(t.key)
" 2>/dev/null | tail -n 1 | tr -d '[:space:]')

  if [[ -z "$key" ]]; then
    fail "Could not mint Authentik admin token via docker exec. Is container '$container' running?"
  fi
  printf '%s' "$key"
}

# ── HTTP helpers (Bearer token) ────────────────────────────────────────────────
ak_get() {
  local url="$1" token="$2"
  "$CURL_BIN" -sf -H "Authorization: Bearer ${token}" "$url" 2>/dev/null || true
}

ak_post() {
  local url="$1" body="$2" token="$3"
  local resp code
  resp=$("$CURL_BIN" -s -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    -X POST -w "\n%{http_code}" "$url" -d "$body")
  code="${resp##*$'\n'}"
  printf '%s|%s' "$code" "${resp%$'\n'*}"
}

ak_patch() {
  local url="$1" body="$2" token="$3"
  local resp code
  resp=$("$CURL_BIN" -s -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    -X PATCH -w "\n%{http_code}" "$url" -d "$body")
  code="${resp##*$'\n'}"
  printf '%s|%s' "$code" "${resp%$'\n'*}"
}

# ── Look up Authentik user pk by username (empty if not found) ────────────────
user_pk_by_username() {
  local ak_url="$1" token="$2" username="$3"
  local encoded
  encoded=$(printf '%s' "$username" | jq -sRr @uri)
  ak_get "${ak_url}/api/v3/core/users/?username=${encoded}" "$token" \
    | jq -r '.results[0].pk // empty' 2>/dev/null || true
}

# ── Look up Authentik user pk by email (empty if not found) ───────────────────
# Used by ensure_operator_invite to populate operator_invites.authentik_user_id
# so apps/api/src/modules/admin-invites/admin-invites.service.ts:357 can resolve
# the invite at consume time. Without this, the api throws
# ConflictException('invite_missing_authentik_user') and the BP-UAT-013 Step 006
# form submit fails. ISS-UAT-SEED-001 AC-2.
user_pk_by_email() {
  local ak_url="$1" token="$2" email="$3"
  local encoded
  encoded=$(printf '%s' "$email" | jq -sRr @uri)
  ak_get "${ak_url}/api/v3/core/users/?email=${encoded}" "$token" \
    | jq -r '.results[0].pk // empty' 2>/dev/null || true
}

# ── Look up Authentik user email by pk (empty if not found) ───────────────────
# Used by ensure_test_user's existing-user branch to detect a stale email
# after a fixture TLD migration (wf-20260704-fix-086 /
# ISS-UAT-BRIDGE-002: @aiqadam.test → @example.com). When the existing
# user's email differs from the seed's declared email, the helper PATCHes
# the email to align the Authentik user with the manifest.
# Counterpart to user_pk_by_email() — that resolves email→pk for the
# `operator_invites.authentik_user_id` lookup; this resolves pk→email for
# the in-place email migration. Both are zero-network-failure by design
# (ak_get's `|| true` returns empty on any error), so a missing user
# surfaces as an empty string and the caller's `[[ -n ... ]]` check
# decides whether to act.
user_email_by_pk() {
  local ak_url="$1" token="$2" pk="$3"
  ak_get "${ak_url}/api/v3/core/users/${pk}/" "$token" \
    | jq -r '.email // empty' 2>/dev/null || true
}

# ── Look up a Directus user id (uuid) by email (empty if not found) ───────────
# Used by reset_domain_fixture() to resolve a manifest's member_email hint to
# member_consents.member — a uuid FK to directus_users.id (confirmed via
# infrastructure/directus/bootstrap.sh's
# `relation member_consents.member -> directus_users.id` and mirrored by
# apps/api/src/modules/directus/directus-users-bridge.service.ts's own
# `GET /users?filter[email][_eq]=` lookup). This is a DIFFERENT id space than
# user_pk_by_email() above (Authentik's numeric pk, used for
# operator_invites.authentik_user_id) — do not conflate the two.
directus_user_pk_by_email() {
  local directus_url="$1" token="$2" email="$3"
  local encoded
  encoded=$(printf '%s' "$email" | jq -sRr @uri)
  # `-g` (--globoff) disables curl's URL-bracket range parsing; required for
  # Directus `filter[field][op]=...` URLs which contain `[` and `]` that bash's
  # curl otherwise treats as character classes (ISS-UAT-BRIDGE-002).
  "$CURL_BIN" -sgf -H "Authorization: Bearer ${token}" \
    "${directus_url}/users?filter[email][_eq]=${encoded}&fields=id&limit=1" 2>/dev/null \
    | jq -r '.data[0].id // empty' 2>/dev/null || true
}

# ── Ensure a local user is mirrored into directus_users via the api ──────────
# ISS-UAT-001-1 — bridges Authentik admin user-creation (which does NOT
# trigger apps/api/src/modules/directus/directus-users-bridge.service.ts's
# ensureLinked path, because that path only fires from the OIDC callback
# at apps/api/src/modules/auth/auth.controller.ts:148) into the same
# idempotent Directus mirror. Posts {email, displayName} to the api's
# internal endpoint POST /v1/internal/users/ensure-linked, which
# delegates back to DirectusUsersBridgeService.ensureLinkedByEmail.
#
# In mock mode (UAT_SEED_DIRECTUS_MOCK=1) prints a deterministic
# `ensure_linked <email> (mock, directus_user_id=mock-uuid)` line and
# returns 0 so the bats regression can grep the invariant from stdout
# without a live api/Directus stack.
#
# Args: <email> <display_name_or_empty>
# Echoes nothing on success (the api response body is consumed but not
# surfaced to the caller — ensure_test_user treats a non-zero exit as
# a hard failure, which is the only signal it needs).
api_ensure_directus_user_link() {
  local email="$1" display_name="${2:-}"

  if [[ "$UAT_SEED_DIRECTUS_MOCK" == "1" ]]; then
    ok "ensure_linked ${email} (mock, directus_user_id=mock-uuid)"
    return 0
  fi

  # Default `api_base` is derived from `apps/api/.env`'s `PORT` so the seed
  # matches whatever port the api actually listens on (today: 3000).
  # `env_get` reads the bare PORT value (and tolerates CRLF — see env_get's
  # header comment); the `:3000` literal below is a documented fallback that
  # fires only when apps/api/.env is absent (i.e. uat-env-setup.sh hasn't
  # been run yet) AND API_BASE_URL is unset. Override via API_BASE_URL=...
  # for non-default setups (e.g. api in a remote container).
  local api_port
  api_port=$(env_get "$API_DIR/.env" "PORT")
  api_port="${api_port:-3000}"
  local api_base="${API_BASE_URL:-http://localhost:${api_port}}"
  local token
  token=$(env_get "$API_DIR/.env" "INTERNAL_API_TOKEN")
  [[ -n "$token" ]] || fail "api_ensure_directus_user_link: INTERNAL_API_TOKEN missing from apps/api/.env (run scripts/uat-env-setup.sh)"

  local body http_code resp
  body=$(jq -nc \
    --arg e "$email" \
    --arg n "$display_name" \
    '{email:$e, displayName:$n}')
  resp=$("$CURL_BIN" -s \
    -H "x-internal-auth: ${token}" \
    -H "Content-Type: application/json" \
    -X POST -w "\n%{http_code}" \
    "${api_base}/v1/internal/users/ensure-linked" \
    -d "$body" 2>/dev/null)
  http_code="${resp##*$'\n'}"

  if [[ "$http_code" != "200" ]]; then
    fail "api_ensure_directus_user_link: POST /v1/internal/users/ensure-linked returned HTTP ${http_code} for ${email} — ${resp%$'\n'*}"
  fi

  ok "ensure_linked ${email} (directus_user_id=$(printf '%s' "${resp%$'\n'*}" | jq -r '.directusUserId // "null"'))"
}

# ── Look up Authentik group pk by name (empty if not found) ───────────────────
group_pk_by_name() {
  local ak_url="$1" token="$2" name="$3"
  local encoded
  encoded=$(printf '%s' "$name" | jq -sRr @uri)
  ak_get "${ak_url}/api/v3/core/groups/?name=${encoded}" "$token" \
    | jq -r '.results[0].pk // empty' 2>/dev/null || true
}

# ── Ensure a single test user exists with the given password + groups ─────────
# Idempotent: if the user exists and FORCE_REGEN=0, just ensure group membership.
# If FORCE_REGEN=1 or user missing: create + set password + assign groups.
ensure_test_user() {
  local ak_url="$1" token="$2" username="$3" email="$4" name="$5"
  local password="$6" groups_csv="$7"

  # ISS-UAT-001-1 — mock-mode short-circuit so the new STEP 3 wiring
  # (which now routes through ensure_test_user even in mock mode) can
  # emit the same `user X (mock)` line that the old dedicated mock
  # branch in STEP 3 used to print. This preserves the exact byte
  # sequence that the existing FR-WORKFLOW-003 AC-6 baseline-equality
  # bats test (which diffs against `git show HEAD:scripts/uat-seed.sh`)
  # asserts on — so this fix is non-breaking for that test, AND
  # additionally emits the ensure_linked mock line further down.
  if [[ "$UAT_SEED_DIRECTUS_MOCK" == "1" ]]; then
    ok "user ${username} (mock)"
    # Still exercise the new ensure-linked helper so bats can grep its
    # mock-mode output line. Group-assignment is a no-op in mock mode.
    api_ensure_directus_user_link "$email" "$name"
    return 0
  fi

  local pk
  pk=$(user_pk_by_username "$ak_url" "$token" "$username")

  if [[ -n "$pk" && "$FORCE_REGEN" == "0" ]]; then
    # ISS-UAT-BRIDGE-002 — if the existing Authentik user's email differs
    # from the seed's declared email, PATCH the email so the seeded
    # identity stays consistent with `UAT_OPERATOR_EMAIL` /
    # `UAT_MEMBER_EMAIL` in apps/e2e/.env.uat. This is what makes the
    # 2026-07-04 transition from @aiqadam.test to @example.com
    # migration transparent: a developer with a stack seeded before the
    # transition has uat-operator/uat-member Authentik users with
    # `@aiqadam.test` emails; on the next `bash scripts/uat-seed.sh` the
    # email is PATCHed to the new TLD. Idempotent — if the email already
    # matches, the diff is a no-op (PATCH returns 200 with no observable
    # change).
    local existing_email
    existing_email=$(user_email_by_pk "$ak_url" "$token" "$pk")
    if [[ -n "$existing_email" && "$existing_email" != "$email" ]]; then
      local email_patch_resp email_patch_code
      email_patch_resp=$(ak_patch "${ak_url}/api/v3/core/users/${pk}/" \
        "$(jq -nc --arg e "$email" '{email:$e}')" "$token")
      email_patch_code="${email_patch_resp%%|*}"
      if [[ "$email_patch_code" != "200" && "$email_patch_code" != "204" ]]; then
        warn "email update for ${username} returned HTTP ${email_patch_code} (non-fatal) — old email may persist"
      else
        ok "${username} email updated: ${existing_email} -> ${email}"
      fi
    fi
    ok "user ${username} (exists, pk=${pk})"
  else
    if [[ -z "$pk" ]]; then
      info "creating user ${username}"
      local create_body create_resp create_code
      create_body=$(jq -nc \
        --arg u "$username" --arg e "$email" --arg n "$name" \
        '{username:$u, name:$n, email:$e, is_active:true, type:"internal"}')
      create_resp=$(ak_post "${ak_url}/api/v3/core/users/" "$create_body" "$token")
      create_code="${create_resp%%|*}"
      if [[ "$create_code" != "200" && "$create_code" != "201" ]]; then
        fail "create user ${username} failed: HTTP ${create_code} — ${create_resp#*|}"
      fi
      pk=$(printf '%s' "${create_resp#*|}" | jq -r '.pk // empty')
      [[ -n "$pk" ]] || fail "create user ${username}: no pk in response"
      ok "user ${username} (created, pk=${pk})"
    else
      ok "user ${username} (exists, pk=${pk}) — FORCE_REGEN, resetting password"
    fi

    # Set password (separate endpoint per ADR-0035 §"session worked")
    local pw_resp pw_code
    pw_resp=$(ak_post "${ak_url}/api/v3/core/users/${pk}/set_password/" \
      "{\"password\":\"${password}\"}" "$token")
    pw_code="${pw_resp%%|*}"
    if [[ "$pw_code" != "200" && "$pw_code" != "204" ]]; then
      fail "set_password for ${username} failed: HTTP ${pw_code}"
    fi
    ok "password set for ${username}"
  fi

  # Assign groups. PATCH /users/{pk}/ with groups[] replaces membership.
  # Resolve each group name to pk; skip silently if missing (RBAC script
  # should have created them, but degrade gracefully per AGENTS.md §9).
  local group_pks=()
  IFS=',' read -ra _groups <<< "$groups_csv"
  for gname in "${_groups[@]}"; do
    [[ -z "$gname" ]] && continue
    local gpk
    gpk=$(group_pk_by_name "$ak_url" "$token" "$gname")
    if [[ -z "$gpk" ]]; then
      warn "group ${gname} not found in Authentik — skipping (run provision-authentik-rbac-groups.sh)"
      continue
    fi
    group_pks+=("$gpk")
  done

  if [[ ${#group_pks[@]} -gt 0 ]]; then
    local patch_body patch_resp patch_code
    patch_body=$(jq -nc --argjson groups "$(printf '%s\n' "${group_pks[@]}" | jq -R . | jq -s .)" \
      '{groups:$groups}')
    patch_resp=$(ak_patch "${ak_url}/api/v3/core/users/${pk}/" "$patch_body" "$token")
    patch_code="${patch_resp%%|*}"
    if [[ "$patch_code" != "200" && "$patch_code" != "204" ]]; then
      warn "group assignment for ${username} returned HTTP ${patch_code} (non-fatal)"
    else
      ok "${username} → groups: ${groups_csv}"
    fi
  fi

  # ISS-UAT-001-1 — after Authentik user + group state is known-good,
  # mirror the local user into directus_users via the api's internal
  # endpoint. Runs unconditionally (even when no groups were assigned),
  # because the OIDC callback path is the only other trigger for
  # DirectusUsersBridgeService.ensureLinked and seed never goes through
  # that path. Failure is hard (fail()) — without this, the consent-row
  # FK lookup in reset_domain_fixture() cannot resolve the member_email
  # and BP-UAT-001's seed aborts (the original ISS-UAT-001-1 symptom).
  api_ensure_directus_user_link "$email" "$name"
}

# ── Portable SHA-256 hex hash ────────────────────────────────────────────────
# sha256sum is Linux-only; macOS ships shasum. Both produce the same hex output.
sha256_hex() {
  if command -v sha256sum &>/dev/null; then
    printf '%s' "$1" | sha256sum | awk '{print $1}'
  else
    printf '%s' "$1" | shasum -a 256 | awk '{print $1}'
  fi
}

# ── Portable UTC timestamp with offset from now ───────────────────────────────
# Usage: date_offset <spec> <unit>
#   spec: "+7" or "-1" (sign + number)
#   unit: days | hours
# GNU date (Linux) uses -d; BSD date (macOS) uses -v.
date_offset() {
  local spec="$1" unit="$2"
  local result
  result=$(date -u -d "${spec} ${unit}" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || true)
  if [[ -n "$result" ]]; then
    printf '%s' "$result"
    return
  fi
  # BSD date (macOS): spec "+7" → -v+7d, "-2" → -v-2H
  local n="${spec:1}"    # strip sign
  local sign="${spec:0:1}"
  local flag
  case "$unit" in
    days)  flag="${sign}${n}d" ;;
    hours) flag="${sign}${n}H" ;;
    *)     fail "date_offset: unknown unit '${unit}'" ;;
  esac
  date -u -v"${flag}" '+%Y-%m-%dT%H:%M:%SZ'
}

# ── Idempotently insert one operator_invite row into Directus ─────────────────
# Args: <email> <status> <expires_at_iso> <consumed_at_iso_or_empty>
#       <token_plain> <display_name> [role_groups_json='[]']
#
# <display_name> is the value copied into the Directus `display_name` column
# and surfaced verbatim by the OnboardingForm at /onboard?token=…
# (`Welcome, {preview.display_name ?? preview.email.split('@')[0]}.`). Three
# fixture rows share the same Authentik email (`uat-operator@example.com`)
# but are distinguished in the UI by `display_name` (e.g. "UAT Operator
# (valid)"). The fourth fixture row uses a plus-addressed email with no
# matching Authentik user, which exercises the api's
# `invite_missing_authentik_user` path.
#
# UAT_SEED_DIRECTUS_MOCK=1 — skip all curl calls (used by bats tests).
#
# role_groups is a JSON array string passed as the 7th positional arg
# (default '[]'). ISS-UAT-013-10: the valid-invite row passes
# '["aiqadam-staff"]' so the BP-UAT-013 Step 005 spec assertion
# `getByText(/aiqadam-staff/i)` can find the role label rendered by
# apps/web/src/components/OnboardingForm.tsx at line ~194
# (`preview.role_groups.join(', ')`).
#
# ISS-UAT-SEED-001 (AC-1 + AC-2):
#   - consumed_at is a Directus readonly field. We OMIT the key from the POST
#     payload entirely when the value is empty (passing null still triggers
#     VALUE_TOO_LONG — see Directus 11 readonly behaviour). The consumed
#     branch keeps the value (Directus does not re-validate on PATCH, and
#     consume-time writes go through PATCH, not POST).
#   - We look up the Authentik user pk by email and include it as
#     authentik_user_id. The api's admin-invites.service.ts:357 throws
#     ConflictException('invite_missing_authentik_user') at consume time if
#     the column is null.
ensure_operator_invite() {
  local email="$1" status="$2" expires_at="$3" consumed_at="$4" token_plain="$5" display_name="$6"
  local role_groups="${7:-[]}"
  local token_hash token_prefix
  token_hash=$(sha256_hex "$token_plain")
  token_prefix="${token_plain:0:8}"

  # Look up the Authentik user pk by email. Empty result is allowed — the
  # no-user fixture row uses a plus-addressed email that intentionally has
  # no Authentik user (it exercises the api's invite_missing_authentik_user
  # error path).
  local ak_url="${AK_URL:-http://localhost:9000}"
  local ak_token="${AK_TOKEN:-}"
  local ak_user_pk=""
  if [[ -n "$ak_token" ]]; then
    ak_user_pk=$(user_pk_by_email "$ak_url" "$ak_token" "$email" 2>/dev/null || true)
  fi

  if [[ "$UAT_SEED_DIRECTUS_MOCK" == "1" ]]; then
    # Mock-mode line includes the email, role_groups AND the resolved
    # authentik_user_id (or "none" for the no-user fixture) so the bats
    # regression can grep all four invariants from stdout.
    local ak_label
    if [[ -n "$ak_user_pk" ]]; then
      ak_label="$ak_user_pk"
    else
      ak_label="none"
    fi
    ok "operator_invite ${token_prefix} (mock, email=${email}, role_groups=${role_groups}, authentik_user_id=${ak_label})"
    return
  fi

  # Idempotency guard: full SHA-256 hash uniquely identifies the row across
  # all four fixtures (their token_prefixes collide on "uat-onbo"). `-g`
  # disables curl's URL-bracket parsing so `filter[...]` passes through verbatim.
  local existing
  existing=$("$CURL_BIN" -sgf \
    -H "Authorization: Bearer ${DIRECTUS_TOKEN}" \
    "${DIRECTUS_URL}/items/operator_invites?filter[token_hash][_eq]=${token_hash}&limit=1" \
    2>/dev/null | jq -r '.data[0].id // empty' 2>/dev/null || true)
  if [[ -n "$existing" ]]; then
    ok "operator_invite ${token_prefix} (exists, id=${existing})"
    return
  fi

  # Build payload. Two notes:
  #   (a) `consumed_at` is OMITTED entirely when the value is empty — passing
  #       null triggers Directus 11 readonly validation (VALUE_TOO_LONG). The
  #       consumed branch keeps consumed_at in the body.
  #   (b) `authentik_user_id` is included as an integer JSON value (or
  #       omitted if the email has no matching Authentik user — e.g. the
  #       no-user fixture row).
  local body
  if [[ -n "$consumed_at" ]]; then
    if [[ -n "$ak_user_pk" ]]; then
      body=$(jq -nc \
        --arg e   "$email" \
        --arg dn  "$display_name" \
        --arg st  "$status" \
        --arg exp "$expires_at" \
        --arg cat "$consumed_at" \
        --arg th  "$token_hash" \
        --arg tp  "$token_prefix" \
        --argjson rg "$role_groups" \
        --argjson ak "$ak_user_pk" \
        '{email:$e,display_name:$dn,status:$st,expires_at:$exp,consumed_at:$cat,token_hash:$th,token_prefix:$tp,role_groups:$rg,authentik_user_id:$ak}')
    else
      body=$(jq -nc \
        --arg e   "$email" \
        --arg dn  "$display_name" \
        --arg st  "$status" \
        --arg exp "$expires_at" \
        --arg cat "$consumed_at" \
        --arg th  "$token_hash" \
        --arg tp  "$token_prefix" \
        --argjson rg "$role_groups" \
        '{email:$e,display_name:$dn,status:$st,expires_at:$exp,consumed_at:$cat,token_hash:$th,token_prefix:$tp,role_groups:$rg}')
    fi
  else
    if [[ -n "$ak_user_pk" ]]; then
      body=$(jq -nc \
        --arg e   "$email" \
        --arg dn  "$display_name" \
        --arg st  "$status" \
        --arg exp "$expires_at" \
        --arg th  "$token_hash" \
        --arg tp  "$token_prefix" \
        --argjson rg "$role_groups" \
        --argjson ak "$ak_user_pk" \
        '{email:$e,display_name:$dn,status:$st,expires_at:$exp,token_hash:$th,token_prefix:$tp,role_groups:$rg,authentik_user_id:$ak}')
    else
      body=$(jq -nc \
        --arg e   "$email" \
        --arg dn  "$display_name" \
        --arg st  "$status" \
        --arg exp "$expires_at" \
        --arg th  "$token_hash" \
        --arg tp  "$token_prefix" \
        --argjson rg "$role_groups" \
        '{email:$e,display_name:$dn,status:$st,expires_at:$exp,token_hash:$th,token_prefix:$tp,role_groups:$rg}')
    fi
  fi

  local resp code
  resp=$("$CURL_BIN" -s \
    -H "Authorization: Bearer ${DIRECTUS_TOKEN}" \
    -H "Content-Type: application/json" \
    -X POST -w "\n%{http_code}" \
    "${DIRECTUS_URL}/items/operator_invites" \
    -d "$body" 2>/dev/null)
  code="${resp##*$'\n'}"

  if [[ "$code" != "200" && "$code" != "201" ]]; then
    fail "ensure_operator_invite ${token_prefix}: HTTP ${code} — ${resp%$'\n'*}"
  fi
  ok "operator_invite ${token_prefix} (created, status=${status}, authentik_user_id=${ak_user_pk:-none})"
}

# ── --reset: localhost-only production guard ──────────────────────────────────
# Must run before ANY delete/create call in the reset path (FR-WORKFLOW-003
# item 5 / AC-4). Exits 4 with zero writes performed if DIRECTUS_URL or AK_URL
# don't resolve to localhost/127.0.0.1. Mechanizes the existing prose rule in
# uat-verification.md's Scope Constraints ("Never target production").
reset_localhost_guard() {
  local directus_url="$1" ak_url="$2"
  local is_local=1
  case "$directus_url" in
    *localhost*|*127.0.0.1*) ;;
    *) is_local=0 ;;
  esac
  if [[ "$is_local" == "1" ]]; then
    case "$ak_url" in
      *localhost*|*127.0.0.1*) ;;
      *) is_local=0 ;;
    esac
  fi
  if [[ "$is_local" != "1" ]]; then
    echo -e "${RED}  ✗ FATAL:${NC} --reset refuses to run against a non-localhost target (DIRECTUS_URL=${directus_url}, AK_URL=${ak_url}). No writes were performed." >&2
    exit 4
  fi
  ok "localhost guard passed (DIRECTUS_URL=${directus_url}, AK_URL=${ak_url})"
}

# ── --reset: resolve the manifest path for a given BP-UAT id ──────────────────
# Unknown BP-UAT id (no manifest file found) is a hard failure via fail()'s
# existing idiom — actionable message, exit non-zero, no partial work
# attempted (FR-WORKFLOW-003 item 2 / AC-nothing-silent).
manifest_path_for() {
  local bp_uat="$1"
  printf '%s/%s.json' "$FIXTURES_DIR" "$bp_uat"
}

require_manifest() {
  local bp_uat="$1" path
  path=$(manifest_path_for "$bp_uat")
  if [[ ! -f "$path" ]]; then
    fail "No fixture manifest found for '${bp_uat}' (expected ${path}). Known manifests: $(list_known_manifests)."
  fi
  printf '%s' "$path"
}

list_known_manifests() {
  local f names=()
  if [[ -d "$FIXTURES_DIR" ]]; then
    for f in "$FIXTURES_DIR"/*.json; do
      [[ -e "$f" ]] || continue
      names+=("$(basename "$f" .json)")
    done
  fi
  if [[ ${#names[@]} -eq 0 ]]; then
    printf 'none'
  else
    (IFS=', '; printf '%s' "${names[*]}")
  fi
}

# ── --reset: reset one identity fixture (never deleted, only restored) ────────
# Reuses ensure_test_user()'s existing FORCE_REGEN=1 branch verbatim — same
# "keep pk, reset password + groups" semantics (FR-WORKFLOW-003 item 3).
reset_identity_fixture() {
  local ak_url="$1" ak_token="$2" fixture_json="$3"
  local id username email display_name groups_csv
  id=$(jq -r '.id' <<<"$fixture_json")
  username=$(jq -r '.username' <<<"$fixture_json")
  email=$(jq -r '.email' <<<"$fixture_json")
  display_name=$(jq -r '.display_name' <<<"$fixture_json")
  groups_csv=$(jq -r '.groups_csv' <<<"$fixture_json")

  if [[ "$UAT_SEED_DIRECTUS_MOCK" == "1" ]]; then
    ok "identity ${id} (mock, reset username=${username}, email=${email}, groups=${groups_csv})"
    return
  fi

  info "resetting identity fixture ${id} (${username})"
  FORCE_REGEN=1 ensure_test_user \
    "$ak_url" "$ak_token" \
    "$username" "$email" "$display_name" \
    "UatFixture1!" "$groups_csv"
}

# ── --reset: delete-then-recreate one mutable domain fixture ──────────────────
# Generic across collections (operator_invites, events, member_consents, …):
# looks up an existing row by the manifest's declared lookup field/value,
# DELETEs it if found, then POSTs the manifest's initial-state payload.
# Offsets ({"spec":"+7","unit":"days"}) are resolved via the existing
# date_offset() helper so recreated rows use fresh relative timestamps, same
# as the unconditional STEP 4 flow does for operator_invites.
#
# member_email resolution (fast-follow to the initial FR-WORKFLOW-003 pass):
# if the fixture's payload declares "member_email" (a manifest-only hint —
# see resolve_payload_offsets()'s comment), it is resolved to a real Directus
# user id BEFORE the POST payload is finalized, and set onto the payload's
# "member" field — member_consents.member is a uuid FK to directus_users.id,
# not an email string (confirmed against
# infrastructure/directus/bootstrap.sh's
# `relation member_consents.member -> directus_users.id` and
# apps/api/src/modules/directus/directus-users-bridge.service.ts). A live
# --reset would otherwise POST an email string into a uuid FK column and get
# a Directus 422/FK error. Unresolvable emails are a fixture-authoring bug,
# not a runtime condition — fail() loudly rather than POST a broken payload
# (functional-scope item 4).
#
# sibling_fixtures_json (2nd arg) is the full manifest fixtures array for
# this BP-UAT (same value run_reset_for_bp already holds) — needed ONLY for
# the mock-mode resolution path below, which resolves member_email against
# sibling identity fixtures' declared emails instead of hitting a real
# Directus (there is no real Directus in mock mode). Live mode ignores this
# argument entirely and queries Directus directly.
reset_domain_fixture() {
  local fixture_json="$1" sibling_fixtures_json="${2:-[]}"
  local id collection lookup_field lookup_value member_email
  id=$(jq -r '.id' <<<"$fixture_json")
  collection=$(jq -r '.collection' <<<"$fixture_json")
  lookup_field=$(jq -r '.lookup_field' <<<"$fixture_json")
  lookup_value=$(jq -r '.lookup_value' <<<"$fixture_json")
  member_email=$(jq -r '.payload.member_email // empty' <<<"$fixture_json")

  if [[ "$UAT_SEED_DIRECTUS_MOCK" == "1" ]]; then
    if [[ -n "$member_email" ]]; then
      # Mock resolution: no real Directus exists in mock mode, so resolve
      # member_email against sibling identity fixtures' declared emails in
      # this same manifest (matches the real invariant — the referenced
      # member's identity fixture must exist — without a network call).
      local mock_member_id
      mock_member_id=$(jq -r --arg e "$member_email" \
        '[.[] | select(.kind=="identity" and .email==$e)][0].id // empty' \
        <<<"$sibling_fixtures_json")
      if [[ -z "$mock_member_id" ]]; then
        fail "fixture ${id}: member_email '${member_email}' did not resolve to any identity fixture in this manifest (mock mode) — fixture-authoring bug, refusing to POST a broken member_consents row."
      fi
      ok "fixture ${id} (mock, delete collection=${collection} lookup=${lookup_field}=${lookup_value})"
      ok "fixture ${id} (mock, create collection=${collection}, member_email=${member_email} resolved to member=${mock_member_id})"
      return
    fi
    ok "fixture ${id} (mock, delete collection=${collection} lookup=${lookup_field}=${lookup_value})"
    # ISS-UAT-013-17: emit authentik_user_id lookup signal for operator_invites
    # so bats regression can assert the reset path performs the lookup (AC-3).
    if [[ "$collection" == "operator_invites" ]]; then
      local payload_email_mock
      payload_email_mock=$(jq -r '.payload.email // empty' <<<"$fixture_json")
      ok "fixture ${id} (mock, authentik_user_id lookup email=${payload_email_mock})"
    fi
    ok "fixture ${id} (mock, create collection=${collection})"
    return
  fi

  # Resolve any *_offset keys in the payload to concrete ISO timestamps
  # before delete/create, using the same date_offset() helper the
  # unconditional flow already uses.
  local resolved_payload
  resolved_payload=$(resolve_payload_offsets "$fixture_json")

  # Resolve member_email (if declared) to a real Directus user id and set it
  # onto the payload's "member" field. Must happen before delete/create so a
  # bad fixture never reaches Directus as a malformed POST.
  if [[ -n "$member_email" ]]; then
    local member_id
    member_id=$(directus_user_pk_by_email "$DIRECTUS_URL" "$DIRECTUS_TOKEN" "$member_email")
    if [[ -z "$member_id" ]]; then
      fail "fixture ${id}: member_email '${member_email}' did not resolve to any Directus user — fixture-authoring bug (create the identity fixture first), refusing to POST a broken member_consents row."
    fi
    resolved_payload=$(jq -c --arg m "$member_id" '.member = $m' <<<"$resolved_payload")
    info "fixture ${id}: member_email '${member_email}' resolved to member=${member_id}"
  fi

  # ISS-UAT-013-14 fix: derive token_hash + token_prefix from the manifest's
  # token_plain field before the POST. Directus's operator_invites collection
  # requires both fields NOT NULL (added by a schema change post-2026-07-03,
  # after the last-successful --reset run at PR #108 / squash 69f2b3f).
  # Mirrors the reference implementation in ensure_operator_invite() —
  # scripts/uat-seed.sh lines 500-501 and 558-595 — which already does this
  # on the unconditional path. Without this block, --reset BP-UAT-013's
  # POST fails with HTTP 400 FAILED_VALIDATION (token_hash required +
  # token_prefix required), leaving operator_invites empty and breaking
  # BP-UAT-013 Steps 005/006 + Neg 002/003/005.
  #
  # Gated on collection=operator_invites ONLY. Other collections never had
  # a token_hash requirement; broader gating would be over-engineering.
  if [[ "$collection" == "operator_invites" ]]; then
    local token_plain
    token_plain=$(jq -r '.token_plain // empty' <<<"$fixture_json")
    if [[ -n "$token_plain" ]]; then
      local token_hash token_prefix
      token_hash=$(sha256_hex "$token_plain")
      token_prefix="${token_plain:0:8}"
      resolved_payload=$(jq -c \
        --arg th "$token_hash" \
        --arg tp "$token_prefix" \
        '. + {token_hash:$th, token_prefix:$tp}' \
        <<<"$resolved_payload")
      # ISS-UAT-013-17: look up Authentik user pk by email and merge as
      # authentik_user_id. Mirrors ensure_operator_invite()'s pattern (line ~537).
      # Empty result is allowed — the no-user fixture row intentionally has no
      # matching Authentik user, exercising the api's invite_missing_authentik_user
      # error path.
      local payload_email_reset ak_url_reset ak_token_reset ak_user_pk_reset
      payload_email_reset=$(jq -r '.email // empty' <<<"$resolved_payload")
      ak_url_reset="${AK_URL:-http://localhost:9000}"
      ak_token_reset="${AK_TOKEN:-}"
      ak_user_pk_reset=""
      if [[ -n "$ak_token_reset" && -n "$payload_email_reset" ]]; then
        ak_user_pk_reset=$(user_pk_by_email "$ak_url_reset" "$ak_token_reset" "$payload_email_reset" 2>/dev/null || true)
      fi
      if [[ -n "$ak_user_pk_reset" ]]; then
        resolved_payload=$(jq -c --argjson ak "$ak_user_pk_reset" \
          '. + {authentik_user_id: $ak}' <<<"$resolved_payload")
        info "fixture ${id}: authentik_user_id=${ak_user_pk_reset} for email=${payload_email_reset}"
      fi
    else
      fail "reset_domain_fixture ${id}: collection=operator_invites but manifest has no .token_plain — cannot derive token_hash. Update scripts/uat-fixtures/<bp-uat>.json to declare token_plain per fixture."
    fi
  fi

  # Delete existing row(s) matching the lookup filter, if any.
  # `-g` disables curl's URL-bracket parsing (see directus_user_pk_by_email).
  local encoded_value existing_ids existing_id
  encoded_value=$(printf '%s' "$lookup_value" | jq -sRr @uri)
  existing_ids=$("$CURL_BIN" -sgf \
    -H "Authorization: Bearer ${DIRECTUS_TOKEN}" \
    "${DIRECTUS_URL}/items/${collection}?filter[${lookup_field}][_eq]=${encoded_value}&limit=-1" \
    2>/dev/null | jq -r '.data[]?.id // empty' 2>/dev/null || true)

  for existing_id in $existing_ids; do
    [[ -z "$existing_id" ]] && continue
    local del_code
    del_code=$("$CURL_BIN" -s -o /dev/null -w '%{http_code}' \
      -H "Authorization: Bearer ${DIRECTUS_TOKEN}" \
      -X DELETE "${DIRECTUS_URL}/items/${collection}/${existing_id}" 2>/dev/null)
    if [[ "$del_code" != "200" && "$del_code" != "204" ]]; then
      fail "reset_domain_fixture ${id}: DELETE ${collection}/${existing_id} failed: HTTP ${del_code}"
    fi
    ok "fixture ${id} (deleted, collection=${collection}, id=${existing_id})"
  done

  local create_resp create_code
  create_resp=$("$CURL_BIN" -s \
    -H "Authorization: Bearer ${DIRECTUS_TOKEN}" \
    -H "Content-Type: application/json" \
    -X POST -w "\n%{http_code}" \
    "${DIRECTUS_URL}/items/${collection}" \
    -d "$resolved_payload" 2>/dev/null)
  create_code="${create_resp##*$'\n'}"
  if [[ "$create_code" != "200" && "$create_code" != "201" ]]; then
    fail "reset_domain_fixture ${id}: POST ${collection} failed: HTTP ${create_code} — ${create_resp%$'\n'*}"
  fi
  ok "fixture ${id} (created, collection=${collection})"
}

# ── --reset: resolve {"spec":"+7","unit":"days"} offset objects to ISO strings ─
# Walks the manifest fixture's "payload" object: any key ending in "_offset"
# is replaced by the equivalent plain key (offset suffix stripped) holding
# date_offset()'s resolved ISO-8601 value. Non-offset keys pass through
# unchanged. member_email (an FK-resolution hint, not a real Directus column)
# is dropped from the outgoing payload — the caller resolves it to a real FK
# separately when the collection needs one (e.g. member_consents.member).
resolve_payload_offsets() {
  local fixture_json="$1"
  local payload keys k
  payload=$(jq -c '.payload' <<<"$fixture_json")
  keys=$(jq -r '.payload | keys[] | select(endswith("_offset"))' <<<"$fixture_json")
  for k in $keys; do
    local spec unit resolved base_key
    spec=$(jq -r ".payload[\"$k\"].spec" <<<"$fixture_json")
    unit=$(jq -r ".payload[\"$k\"].unit" <<<"$fixture_json")
    resolved=$(date_offset "$spec" "$unit")
    base_key="${k%_offset}"
    payload=$(jq -c --arg bk "$base_key" --arg v "$resolved" \
      'del(.[$bk + "_offset"]) | .[$bk] = $v' <<<"$payload")
  done
  # member_email is a manifest-only FK-resolution hint, never a real column.
  payload=$(jq -c 'del(.member_email)' <<<"$payload")
  printf '%s' "$payload"
}

# ── --reset: process every fixture in one BP-UAT's manifest ───────────────────
# Order: identity fixtures first (restore group/consent state), then domain
# fixtures (delete-then-recreate) — matches functional-scope item 1's
# "delete and recreate every mutable domain fixture" after identities are
# known-good, and gives TestDesigner a stable ordering to assert against.
run_reset_for_bp() {
  local bp_uat="$1" ak_url="$2" ak_token="$3"
  local manifest_file fixtures_json count i fixture kind
  manifest_file=$(require_manifest "$bp_uat")
  info "resetting fixtures for ${bp_uat} (manifest: ${manifest_file})"

  fixtures_json=$(jq -c '.fixtures' "$manifest_file")
  count=$(jq 'length' <<<"$fixtures_json")

  # Pass 1: identity fixtures (reset, never recreated).
  for ((i = 0; i < count; i++)); do
    fixture=$(jq -c ".[$i]" <<<"$fixtures_json")
    kind=$(jq -r '.kind' <<<"$fixture")
    [[ "$kind" == "identity" ]] || continue
    reset_identity_fixture "$ak_url" "$ak_token" "$fixture"
  done

  # Pass 2: domain fixtures (delete-then-recreate).
  for ((i = 0; i < count; i++)); do
    fixture=$(jq -c ".[$i]" <<<"$fixtures_json")
    kind=$(jq -r '.kind' <<<"$fixture")
    [[ "$kind" == "domain" ]] || continue
    reset_domain_fixture "$fixture" "$fixtures_json"
  done

  ok "${bp_uat} reset complete (${count} fixture(s))"
}

# ── --reset all: iterate every manifest present under scripts/uat-fixtures/ ───
run_reset_all() {
  local ak_url="$1" ak_token="$2"
  local f bp_uat any=0
  if [[ -d "$FIXTURES_DIR" ]]; then
    for f in "$FIXTURES_DIR"/*.json; do
      [[ -e "$f" ]] || continue
      any=1
      bp_uat=$(basename "$f" .json)
      run_reset_for_bp "$bp_uat" "$ak_url" "$ak_token"
    done
  fi
  if [[ "$any" == "0" ]]; then
    fail "No fixture manifests found under ${FIXTURES_DIR} — nothing to reset."
  fi
}

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║        AI Qadam — UAT Seed Fixtures                  ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

check_deps

# ── Read env from files written by uat-env-setup.sh ───────────────────────────
DIRECTUS_URL="${DIRECTUS_URL:-http://localhost:8200}"
DIRECTUS_TOKEN="${DIRECTUS_TOKEN:-$(env_get "$API_DIR/.env" "DIRECTUS_TOKEN")}"
[[ -n "$DIRECTUS_TOKEN" ]] || fail "DIRECTUS_TOKEN missing (apps/api/.env not seeded by uat-env-setup.sh?)"

AK_URL="${AK_URL:-http://localhost:9000}"
# Authentik server container name (matches infrastructure/docker-compose.yml service).
# Used only to mint the admin API token via docker exec ak shell.
AK_CONTAINER="${AK_CONTAINER:-aiqadam-authentik-server}"

# Test credentials — must match apps/e2e/.env.uat written by uat-env-setup.sh
MEMBER_EMAIL="${UAT_MEMBER_EMAIL:-uat-member@example.com}"
MEMBER_PASSWORD="${UAT_MEMBER_PASSWORD:-UatMember1!}"
OPERATOR_EMAIL="${UAT_OPERATOR_EMAIL:-uat-operator@example.com}"
OPERATOR_PASSWORD="${UAT_OPERATOR_PASSWORD:-UatOperator1!}"

# ── --reset dispatch (runs instead of, not alongside, STEP 1-4 below) ─────────
# The localhost guard is the very first thing that runs in this branch —
# before any manifest is even read — so a misconfigured non-local target
# never reaches a delete/create call (FR-WORKFLOW-003 AC-4).
if [[ -n "$RESET_TARGET" ]]; then
  reset_localhost_guard "$DIRECTUS_URL" "$AK_URL"

  RESET_AK_TOKEN=""
  if [[ "$UAT_SEED_DIRECTUS_MOCK" != "1" ]]; then
    RESET_AK_TOKEN=$(get_ak_admin_token "$AK_URL" "$AK_CONTAINER")
    [[ -n "$RESET_AK_TOKEN" ]] || fail "Failed to obtain Authentik admin token"
  fi

  if [[ "$RESET_TARGET" == "all" ]]; then
    run_reset_all "$AK_URL" "$RESET_AK_TOKEN"
  else
    run_reset_for_bp "$RESET_TARGET" "$AK_URL" "$RESET_AK_TOKEN"
  fi

  echo ""
  ok "--reset ${RESET_TARGET} complete"
  exit 0
fi

# ── STEP 1 — Reachability ─────────────────────────────────────────────────────
echo "[1/4] Verifying stack reachability…"
if [[ "$UAT_SEED_DIRECTUS_MOCK" == "1" ]]; then
  ok "Directus reachable (mock)"
  ok "Authentik reachable (mock)"
else
  if ! "$CURL_BIN" -sf "${DIRECTUS_URL}/server/ping" -H "Authorization: Bearer ${DIRECTUS_TOKEN}" >/dev/null 2>&1; then
    fail "Directus unreachable at ${DIRECTUS_URL}. Start the stack: bash scripts/uat-env-setup.sh"
  fi
  ok "Directus reachable"
  if ! "$CURL_BIN" -sf "${AK_URL}/if/admin/" >/dev/null 2>&1; then
    fail "Authentik unreachable at ${AK_URL}. Start the stack: bash scripts/uat-env-setup.sh"
  fi
  ok "Authentik reachable"
fi

# ── STEP 2 — Directus schema + fixtures (delegates to bootstrap.sh) ──────────
echo ""
echo "[2/4] Running Directus bootstrap (collections + RBAC policies + demo data)…"
if [[ "$UAT_SEED_DIRECTUS_MOCK" == "1" ]]; then
  ok "Directus bootstrap complete (mock)"
else
  if [[ ! -f "$INFRA_DIR/directus/bootstrap.sh" ]]; then
    fail "infrastructure/directus/bootstrap.sh not found"
  fi
  # bootstrap.sh is idempotent (documented at its head) — safe to call every run.
  DIRECTUS_URL="$DIRECTUS_URL" DIRECTUS_TOKEN="$DIRECTUS_TOKEN" \
    bash "$INFRA_DIR/directus/bootstrap.sh"
  ok "Directus bootstrap complete"
fi

# ── STEP 3 — Authentik test users ─────────────────────────────────────────────
echo ""
echo "[3/4] Creating Authentik test users…"
# ISS-UAT-001-1 — in mock mode we still go through ensure_test_user()
# (passing the empty $AK_URL/$AK_TOKEN is fine; ensure_test_user's mock
# branches short-circuit before any HTTP call). This way the new
# api_ensure_directus_user_link() call inside ensure_test_user also runs
# in mock mode and emits the `ensure_linked <email> (mock, …)` line —
# which is exactly the invariant the new bats tests pin.
if [[ "$UAT_SEED_DIRECTUS_MOCK" == "1" ]]; then
  ensure_test_user \
    "${AK_URL:-http://localhost:9000}" "${AK_TOKEN:-}" \
    "uat-member" "$MEMBER_EMAIL" "UAT Member" \
    "$MEMBER_PASSWORD" "aiqadam-member"

  ensure_test_user \
    "${AK_URL:-http://localhost:9000}" "${AK_TOKEN:-}" \
    "uat-operator" "$OPERATOR_EMAIL" "UAT Operator" \
    "$OPERATOR_PASSWORD" "aiqadam-super-admin"
else
  AK_TOKEN=$(get_ak_admin_token "$AK_URL" "$AK_CONTAINER")
  [[ -n "$AK_TOKEN" ]] || fail "Failed to obtain Authentik admin token"

  # Group membership per ADR-0021 §2 (canonical role names).
  # Member: standard community member.
  # Operator: super-admin cab so BP-UAT-001..018 can drive operator flows.
  ensure_test_user \
    "$AK_URL" "$AK_TOKEN" \
    "uat-member" "$MEMBER_EMAIL" "UAT Member" \
    "$MEMBER_PASSWORD" "aiqadam-member"

  ensure_test_user \
    "$AK_URL" "$AK_TOKEN" \
    "uat-operator" "$OPERATOR_EMAIL" "UAT Operator" \
    "$OPERATOR_PASSWORD" "aiqadam-super-admin"
fi

# ── STEP 4 — operator_invites rows ──────────────────────────────────────────
# Four rows for BP-UAT-013 (ISS-UAT-013-4, ISS-UAT-013-8): valid+unused,
# consumed, expired, plus a fourth row whose email has no matching Authentik
# user to exercise the api's `invite_missing_authentik_user` path.
#
# All three "happy" rows share email `uat-operator@example.com` so the api
# can resolve the seeded Authentik user at accept time. Rows are
# distinguished in the OnboardingForm UI by `display_name`. The fourth
# (`no-user`) row uses a plus-addressed email so the api's
# consumeInvite() throws ConflictException('invite_missing_authentik_user')
# — exercising that error path.
#
# Tokens are static test-fixture constants — never used in production.
#
# ISS-UAT-SEED-001: the AK_TOKEN minted in step 3 is needed here too so
# ensure_operator_invite can resolve each row's Authentik user pk by
# email. In mock mode AK_TOKEN is empty (lookups return "" which becomes
# the "none" label in the mock line).
echo ""
echo "[4/4] Provisioning operator_invites rows…"
_now_plus_7d=$(date_offset "+7" days)
_now_minus_2h=$(date_offset "-2" hours)
_now_minus_1d=$(date_offset "-1" days)

ONBOARD_TOKEN="uat-onboard-token"
ONBOARD_USED_TOKEN="uat-onboard-used-token"
ONBOARD_EXPIRED_TOKEN="uat-onboard-expired-token"
ONBOARD_NO_USER_TOKEN="uat-onboard-no-user-token"
OPERATOR_FIXTURE_EMAIL="uat-operator@example.com"
NO_USER_FIXTURE_EMAIL="uat-operator+no-user@example.com"

# ISS-UAT-013-10: valid invite must include 'aiqadam-staff' so the
# BP-UAT-013 Step 005 spec assertion `getByText(/aiqadam-staff/i)` can
# find the role label rendered by apps/web/src/components/OnboardingForm.tsx
# at line ~194 (`preview.role_groups.join(', ')`). The other three rows
# intentionally keep role_groups=[] because:
#   - used + expired: spec asserts GonePanel, not role label; empty groups
#     keep these rows realistic for their error paths.
#   - no-user: spec asserts the api returns 409 invite_missing_authentik_user;
#     role_groups is irrelevant to that error path. Keeping [] avoids
#     accidentally exercising the role-to-Authentik group mapping for a
#     user that intentionally does not exist.
ensure_operator_invite \
  "$OPERATOR_FIXTURE_EMAIL" "pending" "$_now_plus_7d" "" \
  "$ONBOARD_TOKEN" "UAT Operator (valid)" '["aiqadam-staff"]'

ensure_operator_invite \
  "$OPERATOR_FIXTURE_EMAIL" "consumed" "$_now_plus_7d" "$_now_minus_2h" \
  "$ONBOARD_USED_TOKEN" "UAT Operator (used)" '[]'

ensure_operator_invite \
  "$OPERATOR_FIXTURE_EMAIL" "pending" "$_now_minus_1d" "" \
  "$ONBOARD_EXPIRED_TOKEN" "UAT Operator (expired)" '[]'

ensure_operator_invite \
  "$NO_USER_FIXTURE_EMAIL" "pending" "$_now_plus_7d" "" \
  "$ONBOARD_NO_USER_TOKEN" "UAT Operator (no-user)" '[]'

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
ok "UAT seed complete"
echo ""
echo "  Test credentials (also in apps/e2e/.env.uat):"
echo "    member:   ${MEMBER_EMAIL} / ${MEMBER_PASSWORD}"
echo "    operator: ${OPERATOR_EMAIL} / ${OPERATOR_PASSWORD}"
echo ""
echo "  operator_invites tokens (also in apps/e2e/.env.uat):"
echo "    valid:    ${ONBOARD_TOKEN}            (display_name: \"UAT Operator (valid)\")"
echo "    used:     ${ONBOARD_USED_TOKEN}       (display_name: \"UAT Operator (used)\")"
echo "    expired:  ${ONBOARD_EXPIRED_TOKEN}    (display_name: \"UAT Operator (expired)\")"
echo "    no-user:  ${ONBOARD_NO_USER_TOKEN}    (display_name: \"UAT Operator (no-user)\" — API returns 409 invite_missing_authentik_user)"
echo ""
echo "  Next: cd apps/e2e && pnpm playwright test --config playwright.uat.config.ts"
