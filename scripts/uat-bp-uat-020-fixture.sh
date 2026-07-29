#!/usr/bin/env bash
# scripts/uat-bp-uat-020-fixture.sh
#
# ISS-UAT-020-1 — safe, repeatable fixture-isolation mechanism for
# BP-UAT-020's "zero aiqadam-super-admin members" precondition.
#
# Why this needs its own script instead of scripts/uat-seed.sh --reset:
# --reset resets INDIVIDUAL identity/domain fixtures declared in a
# scripts/uat-fixtures/<BP-UAT-NNN>.json manifest (e.g. "recreate this one
# Authentik user" or "delete+recreate this one Directus row"). BP-UAT-020's
# precondition is a GROUP-MEMBERSHIP state ("this Authentik group currently
# has zero members") that must hold across every other UAT fixture the
# shared local dev environment already has seeded (in particular
# uat-operator@example.com, standardly bound to aiqadam-super-admin by
# `pnpm uat:seed`). Emptying a whole group and later restoring its exact
# prior membership is a different operation from resetting one row.
#
# Why this is safe against the shared local dev environment (AC-2 of
# ISS-UAT-020-1 — no destructive action without a verified, automatic
# restore):
#   1. `setup` snapshots the exact current member pks of aiqadam-super-admin
#      to a file BEFORE removing anyone.
#   2. AdminBootstrapService.hasSuperAdminMember() (apps/api/src/modules/
#      admin-invites/admin-bootstrap.service.ts) is checked exactly once,
#      at API process OnModuleInit — never on a live request. This means
#      the zero-admin window only needs to span one API process restart,
#      not the whole BP-UAT-020 session: `setup` empties the group, bounces
#      the local api dev process so bootstrap fires against zero members,
#      and BP-UAT-020's Steps 001-003 + Negative 001 then run against an
#      environment that has (at most) the ONE newly-bootstrapped admin —
#      not a lasting "no admins at all" state.
#   3. `teardown` restores the EXACT snapshotted pk array (not "some
#      admin exists again" — the precise prior membership, so any other
#      UAT fixture or engineer session that depended on
#      uat-operator@example.com's super-admin membership is unaffected)
#      and bounces the api process again so any state cached from the
#      bootstrap run is cleared.
#   4. `verify-restored` gives the caller (UATRunner / this script's own
#      teardown) a way to confirm restoration actually took, rather than
#      trusting the PATCH call's 2xx status alone.
#
# Usage:
#   bash scripts/uat-bp-uat-020-fixture.sh setup
#   bash scripts/uat-bp-uat-020-fixture.sh teardown
#   bash scripts/uat-bp-uat-020-fixture.sh verify-restored
#
# Environment:
#   AK_URL                  Authentik base URL (default http://localhost:9000)
#   AK_CONTAINER             Authentik server container name for admin-token
#                            minting (default aiqadam-authentik-server)
#   API_DIR                  apps/api absolute path (default resolved from repo root)
#   API_HEALTH_URL           API health endpoint to poll after restart
#                            (default http://localhost:3000/health)
#   API_DEV_LOG              Where the restarted 'pnpm dev' process's
#                            stdout/stderr is redirected (default
#                            <repo>/.copilot/tmp/BP-UAT-020-api-dev.log) —
#                            check this file first if a restart times out.
#   SNAPSHOT_FILE            Where the pre-removal membership snapshot is
#                            stored (default <repo>/.copilot/tmp/BP-UAT-020-super-admin-snapshot.json)
#   UAT_BP_UAT_020_MOCK=1    Skip all Authentik/process calls (test mode)
#
# Process ownership: `setup`/`teardown` both actively stop whatever is
# listening on the api port (tree-kill, best-effort) and start a fresh
# `pnpm dev` themselves — they do NOT assume a supervisor (e.g.
# `nest start --watch`'s file watcher) will notice the kill and respawn
# the child on its own. Confirmed false in this repo's Windows setup:
# force-killing the child node process tears down the whole watch
# supervisor chain, not just that one process. If the caller's own
# terminal was running `pnpm dev` in the foreground, that terminal's
# process is what gets killed — the replacement runs detached in the
# background, logging to API_DEV_LOG, and the caller's original terminal
# will show the old process as exited.
#
# Localhost-only guard: same rule as scripts/uat-seed.sh --reset — refuses
# to run against a non-localhost AK_URL. This mutates a live Authentik
# group's membership; it must never be pointed at a shared/remote target.
#
# Known limitation — invoke from a shell, not from inside Node: running
# this script via a blocking Node child-process call (e.g. Playwright's
# execFileSync) can hang past that caller's own timeout, even after the
# restarted api has already booted successfully, because bash's
# background-job detach does not fully release its file descriptors from
# a non-interactive Node-spawned parent shell on this Windows/Git-Bash
# setup. Always run `setup`/`teardown` directly from a shell (before/after
# a Playwright session, not from within one) — see restart_api_and_wait_boot()
# below for the full investigation history.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="${API_DIR:-$REPO_ROOT/apps/api}"
SNAPSHOT_FILE="${SNAPSHOT_FILE:-$REPO_ROOT/.copilot/tmp/BP-UAT-020-super-admin-snapshot.json}"
API_DEV_LOG="${API_DEV_LOG:-$REPO_ROOT/.copilot/tmp/BP-UAT-020-api-dev.log}"

AK_URL="${AK_URL:-http://localhost:9000}"
AK_CONTAINER="${AK_CONTAINER:-aiqadam-authentik-server}"
API_HEALTH_URL="${API_HEALTH_URL:-http://localhost:3000/health}"
UAT_BP_UAT_020_MOCK="${UAT_BP_UAT_020_MOCK:-0}"

SUPER_ADMIN_GROUP='aiqadam-super-admin'

# ── Colour helpers (mirrors scripts/uat-preflight-check.sh) ──────────────────
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly RED='\033[0;31m'
readonly NC='\033[0m'
ok()   { printf '%b  ✓%b %s\n' "$GREEN" "$NC" "$*"; }
warn() { printf '%b  !%b %s\n' "$YELLOW" "$NC" "$*"; }
info() { printf '  → %s\n' "$*"; }
fail() { printf '%b  ✗ FATAL:%b %s\n' "$RED" "$NC" "$*" >&2; exit 1; }

# ── MSYS-aware curl binary selector (AGENTS.md §6.1's documented idiom) ──────
if command -v curl.exe &>/dev/null; then
  CURL_BIN='curl.exe'
else
  CURL_BIN='curl'
fi

usage() {
  cat <<EOF
scripts/uat-bp-uat-020-fixture.sh — BP-UAT-020 zero-super-admin fixture

usage:
  bash scripts/uat-bp-uat-020-fixture.sh setup
  bash scripts/uat-bp-uat-020-fixture.sh teardown
  bash scripts/uat-bp-uat-020-fixture.sh verify-restored

See the file header for the full safety rationale (ISS-UAT-020-1).
EOF
}

[[ $# -ge 1 ]] || { usage; fail "missing subcommand"; }
SUBCOMMAND="$1"

# ── Localhost-only guard (mirrors scripts/uat-seed.sh's reset_localhost_guard) ─
localhost_guard() {
  case "$AK_URL" in
    *localhost*|*127.0.0.1*) ;;
    *) fail "refuses to run against a non-localhost AK_URL ($AK_URL). This script mutates live group membership — local dev only." ;;
  esac
  ok "localhost guard passed (AK_URL=$AK_URL)"
}

# ── Mint an Authentik admin API token (same mechanism as uat-seed.sh) ────────
get_ak_admin_token() {
  if [[ "$UAT_BP_UAT_020_MOCK" == "1" ]]; then
    printf 'mock-token'
    return
  fi
  local key
  key=$(docker exec "$AK_CONTAINER" ak shell -c "
from django.contrib.auth import get_user_model
from authentik.core.models import Token
U = get_user_model()
admin = U.objects.filter(username='akadmin').first()
t, _ = Token.objects.update_or_create(
    identifier='uat-seed-token',
    defaults={'user': admin, 'intent': 'api', 'expiring': False})
print(t.key)
" 2>/dev/null | tail -n 1 | tr -d '[:space:]')
  [[ -n "$key" ]] || fail "could not mint Authentik admin token via docker exec (container '$AK_CONTAINER' running?)"
  printf '%s' "$key"
}

# ── Look up the super-admin group's pk + current member pks ──────────────────
get_group_state() {
  local token="$1"
  if [[ "$UAT_BP_UAT_020_MOCK" == "1" ]]; then
    printf '{"pk":"mock-group-pk","users":[9001,9002]}'
    return
  fi
  "$CURL_BIN" -sf -H "Authorization: Bearer ${token}" \
    "${AK_URL}/api/v3/core/groups/?name=${SUPER_ADMIN_GROUP}" \
    | jq -c '.results[0] | {pk: .pk, users: .users}'
}

set_group_members() {
  local token="$1" group_pk="$2" users_json="$3"
  if [[ "$UAT_BP_UAT_020_MOCK" == "1" ]]; then
    ok "(mock) group ${group_pk} members set to ${users_json}"
    return
  fi
  local code
  code=$("$CURL_BIN" -s -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    -X PATCH "${AK_URL}/api/v3/core/groups/${group_pk}/" \
    -d "{\"users\":${users_json}}")
  [[ "$code" == "200" || "$code" == "204" ]] \
    || fail "PATCH group ${group_pk} users failed: HTTP ${code}"
}

# ── Find the PID of the process currently listening on API_HEALTH_URL's port ──
# Windows-only (mirrors scripts/uat-preflight-check.sh's probe -- this repo
# is Windows-first per AGENTS.md §0). Prints the PID, or nothing if unbound.
find_api_listener_pid() {
  local port
  port="$(printf '%s' "$API_HEALTH_URL" | sed -E 's#^https?://[^:]+:([0-9]+).*#\1#')"
  [[ "$port" =~ ^[0-9]+$ ]] || { warn "could not parse a port out of API_HEALTH_URL=${API_HEALTH_URL} — skipping PID detection"; return 0; }
  powershell.exe -NoProfile -Command \
    "(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess)" \
    2>/dev/null | tr -d '[:space:]'
}

# ── Restart the local api dev process and wait for a fresh boot ──────────────
# apps/api runs as a host process (`pnpm dev` -> nest start --watch), not a
# Docker container -- there is nothing to `docker compose restart`.
#
# History of broken versions, all found by running this script for REAL
# against a live local stack (the mock-mode bats suite cannot catch any of
# them -- UAT_BP_UAT_020_MOCK short-circuits this whole function):
#   1. First version only polled API_HEALTH_URL without ever terminating
#      the running process -- against an already-healthy api it reported
#      success in ~0s without OnModuleInit ever re-running, silently
#      defeating the entire fixture (bootstrap never fired against the
#      emptied group).
#   2. Second version killed the current listener and waited for a
#      supervisor to respawn it, assuming `nest start --watch`'s watcher
#      process would auto-restart a force-killed child. Confirmed false
#      in this repo's actual setup: `Stop-Process -Force` on the child
#      node process tore down the whole watch supervisor chain too -- the
#      api stayed down until manually relaunched.
#   3. A `cmd.exe /c start /b <generated .cmd>` variant (and a
#      PowerShell `Start-Process`/`System.Diagnostics.Process` variant)
#      were both tried to sidestep bash job-control entirely. Both were
#      unreliable in practice on this machine -- sometimes hanging,
#      sometimes exiting before the child actually bound the port. Not
#      pursued further.
#
# CURRENT DESIGN (confirmed reliable from an interactive/backgrounded
# shell invocation): a plain bash background job with `disown`. Known,
# accepted limitation: when this script is invoked from INSIDE a Node
# child_process call (e.g. `execFileSync` from a Playwright test), the
# parent bash process can hang past Node's own timeout even though the
# child has already started successfully -- bash's job control does not
# fully detach a background job's file descriptors from a
# non-interactive Node-spawned parent shell on this Windows/Git-Bash
# setup. Per ISS-UAT-020-1's resolution, this means: always invoke
# `setup`/`teardown` directly from a shell (interactive or a plain
# backgroundable command), never via a blocking Node child-process call.
# A Playwright-driven UATRunner session should treat fixture setup/
# teardown as a pre/post step run OUTSIDE the Node process, not as a
# call the test itself makes.
restart_api_and_wait_boot() {
  if [[ "$UAT_BP_UAT_020_MOCK" == "1" ]]; then
    ok "(mock) api restart signalled and boot confirmed"
    return
  fi

  local pid_before
  pid_before="$(find_api_listener_pid)"
  if [[ -n "$pid_before" ]]; then
    info "stopping current api process tree (pid=${pid_before})"
    taskkill //PID "$pid_before" //T //F >/dev/null 2>&1 || true
    local wait_down=0
    while [[ -n "$(find_api_listener_pid)" && "$wait_down" -lt 20 ]]; do
      sleep 1
      wait_down=$((wait_down + 1))
    done
  else
    info "no process currently listening on ${API_HEALTH_URL} — nothing to stop"
  fi

  info "starting api (pnpm dev) in the background, logging to ${API_DEV_LOG}"
  mkdir -p "$(dirname "$API_DEV_LOG")"
  ( cd "$API_DIR" && nohup pnpm dev < /dev/null > "$API_DEV_LOG" 2>&1 & disown ) 2>/dev/null

  local max_wait_s=90 waited=0 healthy=0
  while [[ "$waited" -lt "$max_wait_s" ]]; do
    if "$CURL_BIN" -sf "$API_HEALTH_URL" >/dev/null 2>&1; then
      healthy=1
      break
    fi
    sleep 2
    waited=$((waited + 2))
  done
  [[ "$healthy" == "1" ]] || fail "api did not become healthy at ${API_HEALTH_URL} within ${max_wait_s}s of starting 'pnpm dev' — check ${API_DEV_LOG} for a boot error (e.g. env validation failure)."
  ok "api (re)started and healthy at ${API_HEALTH_URL} (waited ${waited}s) — log: ${API_DEV_LOG}"
}

# ── setup: snapshot -> empty group -> restart api ─────────────────────────────
cmd_setup() {
  localhost_guard
  mkdir -p "$(dirname "$SNAPSHOT_FILE")"
  [[ ! -f "$SNAPSHOT_FILE" ]] || fail "snapshot file already exists at ${SNAPSHOT_FILE} — a prior setup was not torn down. Run 'teardown' first (or delete the file only if you have independently confirmed no real admin state is at risk)."

  local token group_state group_pk users_json
  token=$(get_ak_admin_token)
  group_state=$(get_group_state "$token")
  group_pk=$(jq -r '.pk' <<<"$group_state")
  users_json=$(jq -c '.users' <<<"$group_state")
  [[ -n "$group_pk" && "$group_pk" != "null" ]] || fail "could not resolve ${SUPER_ADMIN_GROUP} group pk — is scripts/provision-authentik-rbac-groups.sh applied?"

  jq -n --arg pk "$group_pk" --argjson users "$users_json" \
    '{group_pk: $pk, users: $users, snapshotted_at: (now | todate)}' \
    > "$SNAPSHOT_FILE"
  ok "snapshotted ${SUPER_ADMIN_GROUP} membership (pk=${group_pk}, ${users_json}) to ${SNAPSHOT_FILE}"

  set_group_members "$token" "$group_pk" '[]'
  ok "${SUPER_ADMIN_GROUP} membership emptied"

  restart_api_and_wait_boot
  ok "setup complete — environment is in the zero-super-admin bootstrap window. Run BP-UAT-020's steps now, then 'teardown' immediately after."
}

# ── teardown: restore exact snapshot -> restart api -> delete snapshot ───────
cmd_teardown() {
  localhost_guard
  [[ -f "$SNAPSHOT_FILE" ]] || fail "no snapshot file at ${SNAPSHOT_FILE} — nothing to restore (was 'setup' run in this environment?)"

  local token group_pk users_json
  token=$(get_ak_admin_token)
  group_pk=$(jq -r '.group_pk' "$SNAPSHOT_FILE")
  users_json=$(jq -c '.users' "$SNAPSHOT_FILE")

  set_group_members "$token" "$group_pk" "$users_json"
  ok "${SUPER_ADMIN_GROUP} membership restored to snapshotted state (${users_json})"

  restart_api_and_wait_boot

  local restored_state restored_users
  restored_state=$(get_group_state "$token")
  restored_users=$(jq -c '.users' <<<"$restored_state")
  [[ "$restored_users" == "$users_json" ]] \
    || fail "post-restore verification FAILED: live membership is ${restored_users}, expected ${users_json}. Snapshot file preserved at ${SNAPSHOT_FILE} for manual recovery — do NOT delete it."

  rm -f "$SNAPSHOT_FILE"
  ok "teardown complete and verified — ${SUPER_ADMIN_GROUP} membership matches the pre-setup snapshot exactly. Snapshot file removed."
}

# ── verify-restored: read-only check, safe to call anytime ───────────────────
cmd_verify_restored() {
  if [[ -f "$SNAPSHOT_FILE" ]]; then
    fail "snapshot file still present at ${SNAPSHOT_FILE} — teardown has NOT completed (or is mid-flight). Do not treat the environment as restored."
  fi
  ok "no snapshot file present — teardown has completed (or setup was never run) for this environment."
}

case "$SUBCOMMAND" in
  setup) cmd_setup ;;
  teardown) cmd_teardown ;;
  verify-restored) cmd_verify_restored ;;
  -h|--help) usage; exit 0 ;;
  *) usage; fail "unknown subcommand: $SUBCOMMAND" ;;
esac
