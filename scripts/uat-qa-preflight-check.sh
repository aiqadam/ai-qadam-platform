#!/usr/bin/env bash
# scripts/uat-qa-preflight-check.sh
#
# QA-target pre-flight check for the uat-verification workflow / UATRunner
# (FR-WORKFLOW-005 — read-only QA target mode for agent-driven UAT).
#
# Purpose
# ────────
# When a UAT session targets `qa` instead of `local`, the Docker-stack and
# localhost-port checks performed by scripts/uat-preflight-check.sh do not
# apply — there is no local process to identify. Instead this script
# verifies plain HTTPS reachability of the two QA-facing surfaces the
# agent-driven session actually depends on:
#   - https://qa.aiqadam.org        (the app under test / UAT landing URL)
#   - https://auth.qa.aiqadam.org   (the Authentik IdP subdomain)
# Directus and Authentik's admin API are intentionally NOT checked here —
# they are host-bound to 127.0.0.1 on the QA host and not reachable from
# outside it (see docs/04-development/infrastructure/runbooks/
# pro-data-tech-frontend-rollout.md), and are out of scope for this FR.
#
# Read-only guarantee (AC-3c)
# ────────────────────────────
# QA UAT sessions are READ-ONLY. This script performs unauthenticated GET
# probes only, and — structurally, not just by convention — contains no
# invocation of the fixture-seeding pnpm script anywhere in its source.
# There is no code path in this file that can reach a seed/reset call.
# Seed/reset against QA is out of scope for FR-WORKFLOW-005 (see
# .copilot/tasks/active/wf-20260718-feat-121/01-requirement-validation.md,
# AC-3c) and may become a separate future FR. This is enforced by a
# regression guard in scripts/tests/uat-qa-preflight-check.bats that greps
# this file's source for the seed command token and asserts zero matches.
#
# Usage
# ─────
#   bash scripts/uat-qa-preflight-check.sh [--base-url <url>]
#
# Arguments:
#   --base-url <url>   Override the app-under-test URL. Defaults to
#                       https://qa.aiqadam.org. The IdP URL
#                       (https://auth.qa.aiqadam.org) is fixed and not
#                       overridable — QA has exactly one Authentik instance.
#
# Exit codes
# ──────────
#   0  Both hosts responded with a 2xx or 3xx HTTP status.
#   1  At least one host failed (non-2xx/3xx, connection error, timeout).
#   2  Invocation error (bad flag, missing value for --base-url).
#
# Test hook (for scripts/tests/uat-qa-preflight-check.bats)
# ───────────────────────────────────────────────────────────
# If `UAT_QA_PREFLIGHT_HTTP_CODES` is set, the real `curl` probe is skipped
# for the hosts named in it and the given HTTP status codes are used
# instead — no real network access. Format (comma-separated
# host=code pairs, host without scheme, matching the --base-url /
# fixed-IdP-url hostnames):
#   qa.aiqadam.org=200,auth.qa.aiqadam.org=200
# A host present in the check but absent from this variable falls back to
# the real curl probe for that host only. Use a non-2xx/3xx code (e.g. 500)
# or the literal value "000" (curl's own convention for "connection
# failed / no response") to simulate a failure for that host.
#
# Refs
# ────
# - FR-WORKFLOW-005 — .copilot/tasks/active/wf-20260718-feat-121/
# - .copilot/workflows/uat-verification.md Step 2 — where this is invoked
#   for `target: qa`
# - .copilot/agents/uat-runner.md — Pre-Flight Checks, `target: qa` branch
# - scripts/uat-preflight-check.sh — sibling script for `target: local`
#   (Docker/process-identity checks); this script is the `target: qa`
#   analogue for HTTPS reachability.

set -euo pipefail

# ── Colour helpers (mirrors scripts/uat-preflight-check.sh) ─────────────────
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly RED='\033[0;31m'
readonly NC='\033[0m'
ok()   { printf '%b  ✓%b %s\n' "$GREEN" "$NC" "$*"; }
warn() { printf '%b  !%b %s\n' "$YELLOW" "$NC" "$*"; }
info() { printf '  → %s\n' "$*"; }
fail() { printf '%b  ✗ FATAL:%b %s\n' "$RED" "$NC" "$*" >&2; exit 1; }

readonly SCRIPT_NAME="uat-qa-preflight-check.sh"
readonly DEFAULT_BASE_URL="https://qa.aiqadam.org"
readonly IDP_URL="https://auth.qa.aiqadam.org"

# ── Argument parsing ─────────────────────────────────────────────────────────

usage() {
  cat <<EOF
$SCRIPT_NAME — QA-target HTTPS reachability pre-flight check

usage:
  bash $SCRIPT_NAME [--base-url <url>]

arguments:
  --base-url <url>   Override the app-under-test URL (default: $DEFAULT_BASE_URL).
                      The IdP check target ($IDP_URL) is fixed.

exit codes:
  0  Both qa.aiqadam.org and auth.qa.aiqadam.org responded 2xx/3xx.
  1  At least one host failed.
  2  Invocation error.

QA target is read-only; seed/reset is out of scope for FR-WORKFLOW-005 and
is never invoked against QA. This script never calls the fixture-seeding
pnpm script.

Environment overrides (test hook — do not use in production):
  UAT_QA_PREFLIGHT_HTTP_CODES   Skip the real curl probe for named hosts;
                                 use synthetic codes instead.
                                 Format: host=code,host=code
                                 e.g. qa.aiqadam.org=200,auth.qa.aiqadam.org=500
EOF
}

BASE_URL="$DEFAULT_BASE_URL"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage; exit 0 ;;
    --base-url)
      if [[ $# -lt 2 || -z "${2:-}" ]]; then
        printf 'usage: bash %s [--base-url <url>] (--base-url requires a value)\n' "$SCRIPT_NAME" >&2
        exit 2
      fi
      BASE_URL="$2"
      shift 2 ;;
    *)
      printf 'usage: bash %s [--base-url <url>] (unrecognized argument: %s)\n' "$SCRIPT_NAME" "$1" >&2
      exit 2 ;;
  esac
done

# ── Probe (test hook vs real probe) ─────────────────────────────────────────

# host_of <url>
# Strips the scheme and any path/port suffix, returning the bare hostname —
# used both to build the check list and to key into
# UAT_QA_PREFLIGHT_HTTP_CODES.
host_of() {
  local url="$1"
  url="${url#https://}"
  url="${url#http://}"
  url="${url%%/*}"
  printf '%s' "$url"
}

# code_from_test_hook <host>
# Looks up <host> in UAT_QA_PREFLIGHT_HTTP_CODES (format host=code,host=code).
# Prints the code and returns 0 if found, returns 1 if the host is absent
# from the hook (caller should fall back to a real probe).
code_from_test_hook() {
  local host="$1"
  local hook="${UAT_QA_PREFLIGHT_HTTP_CODES:-}"
  [[ -z "$hook" ]] && return 1
  local pair
  IFS=',' read -ra pairs <<< "$hook"
  for pair in "${pairs[@]}"; do
    local pair_host="${pair%%=*}"
    local pair_code="${pair#*=}"
    if [[ "$pair_host" == "$host" ]]; then
      printf '%s' "$pair_code"
      return 0
    fi
  done
  return 1
}

# probe_http_code <url>
# Real probe: curl -fsS is NOT used here because we need the status code
# even on a non-2xx response (fsS would just fail). Uses -o /dev/null so
# the response body is discarded (this is a reachability check, not a
# content check) and -w '%{http_code}' to capture the status line only.
# --max-time bounds a single probe so a hung QA host cannot hang pre-flight
# indefinitely. On connection failure curl prints "000".
probe_http_code() {
  local url="$1"
  curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$url" 2>/dev/null || printf '000'
}

# check_host <label> <url>
# Resolves the HTTP status (test hook or real probe) and prints ok/fail.
# Sets the global ALL_OK=0 on any failure rather than exiting immediately,
# so both hosts are always checked and both results are reported in one run.
ALL_OK=1

check_host() {
  local label="$1"
  local url="$2"
  local host code
  host="$(host_of "$url")"

  if code="$(code_from_test_hook "$host")"; then
    info "$label ($url): using test-hook HTTP code $code"
  else
    code="$(probe_http_code "$url")"
  fi

  if [[ "$code" =~ ^2[0-9][0-9]$ || "$code" =~ ^3[0-9][0-9]$ ]]; then
    ok "$label reachable: $url returned HTTP $code"
  else
    warn "$label unreachable: $url returned HTTP $code"
    ALL_OK=0
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────

info "QA target is read-only; seed/reset is out of scope for FR-WORKFLOW-005 and is never invoked against QA."

check_host "QA app" "$BASE_URL"
check_host "QA IdP (Authentik)" "$IDP_URL"

if [[ "$ALL_OK" -ne 1 ]]; then
  fail "QA pre-flight failed: one or more QA hosts did not respond 2xx/3xx (see warnings above)"
fi

ok "QA pre-flight passed: $BASE_URL and $IDP_URL are both reachable"
