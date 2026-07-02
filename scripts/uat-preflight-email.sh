#!/usr/bin/env bash
# scripts/uat-preflight-email.sh
#
# Pre-flight probe for the AI Qadam API's email transport.
#
# Purpose
# ────────
# Closes the UAT pre-flight gap exposed by ISS-UAT-013-2 / ISS-UAT-013-7:
# before BP-UAT-013 (and any other scenario that needs a real email
# round-trip via Mailpit) starts, confirm the API's /health/email endpoint
# reports a usable transport — i.e. mode != "disabled" AND provider is
# smtp or resend. Fails fast with an actionable, mode-naming message
# instead of letting the runner time out 60s polling Mailpit for a
# message the API never sent.
#
# Endpoint contract (see apps/api/src/health/health.controller.ts):
#   GET ${API_BASE_URL}/health/email
#   → {
#       "configured": true | false,
#       "provider":   "resend" | "smtp" | "none",
#       "mode":       "production" | "uat" | "disabled"
#     }
#
# Usage
# ─────
#   API_BASE_URL=http://localhost:3001 bash scripts/uat-preflight-email.sh
#
# Exit codes
# ──────────
#   0  Email transport is ready (provider in {smtp, resend} AND mode != "disabled").
#   1  Probe failure: curl error, jq parse error, or contract violation.
#   2  Invocation error (missing tools, invalid env).
#
# Environment
# ───────────
#   API_BASE_URL   Base URL of the API (default: http://localhost:3001).
#                  Note: NO /v1 prefix — main.ts has no setGlobalPrefix
#                  call, so /health/email resolves at the literal path.

set -euo pipefail

# ── Constants (named to satisfy AGENTS.md §1.3 — no magic strings) ──────────
readonly SCRIPT_NAME="uat-preflight-email.sh"
readonly DEFAULT_API_BASE_URL="http://localhost:3001"
readonly HEALTH_PATH="/health/email"
readonly CURL_MAX_TIME_SECONDS=10
readonly PROVIDER_OK_SMTP="smtp"
readonly PROVIDER_OK_RESEND="resend"
readonly MODE_DISABLED="disabled"

# Colour helpers — mirrors scripts/uat-env-setup.sh so messages look the same.
# Use printf '%b' for the colour escapes (so \033 is interpreted once) and
# printf '%s' for the message body (so any backslashes in user-supplied
# values, e.g. Windows paths, are preserved verbatim).
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly RED='\033[0;31m'
readonly NC='\033[0m'
ok()   { printf '%b  ✓%b %s\n' "$GREEN" "$NC" "$*"; }
warn() { printf '%b  !%b %s\n' "$YELLOW" "$NC" "$*"; }
info() { printf '  → %s\n' "$*"; }
fail() { printf '%b  ✗ FATAL:%b %s\n' "$RED" "$NC" "$*" >&2; exit 1; }

# ── Dependency checks ────────────────────────────────────────────────────────

check_deps() {
  local missing=()
  for cmd in "$CURL_CMD" jq; do
    command -v "$cmd" &>/dev/null || missing+=("$cmd")
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    fail "Missing required tools: ${missing[*]}"
  fi
}

# Platform-specific curl selection:
#   - On Linux/macOS CI, the bare `curl` is the native binary and works fine.
#   - On MSYS/Git-Bash, the bare `curl` is an MSYS2/Linux build that cannot
#     reach Windows-hosted services bound to [::]:PORT (the IPv6 wildcard).
#   - On WSL bash, the bare `curl` is also a Linux build with the same
#     limitation; Windows native `curl.exe` (reachable from WSL via
#     /mnt/c/Windows/System32) handles the wildcard binding correctly.
# In both broken cases, `curl.exe` IS in PATH. On native Linux/macOS,
# `curl.exe` is NOT in PATH — so this preference is harmless there.
if command -v curl.exe &>/dev/null; then
  CURL_CMD="curl.exe"
else
  CURL_CMD="curl"
fi

# ── Argument / env parsing ──────────────────────────────────────────────────

usage() {
  cat <<EOF
$SCRIPT_NAME — email transport pre-flight for UAT

usage:
  API_BASE_URL=http://localhost:3001 bash $SCRIPT_NAME

environment:
  API_BASE_URL   Base URL of the API (default: $DEFAULT_API_BASE_URL).
                 Endpoint resolves at \$API_BASE_URL$HEALTH_PATH — no /v1 prefix.

exit codes:
  0  Email transport ready (provider in {smtp, resend} AND mode != "disabled").
  1  Probe failure or contract violation (see error output).
  2  Missing tools (curl, jq).
EOF
}

case "${1:-}" in
  -h|--help)
    usage; exit 0 ;;
esac

API_BASE_URL="${API_BASE_URL:-$DEFAULT_API_BASE_URL}"
# Strip any trailing slash so URL concatenation is predictable.
API_BASE_URL="${API_BASE_URL%/}"

# Restrict the scheme to http(s):// — close the curl file:// / ftp:// / gopher://
# surface for an operator-side misconfig. Issue: ISS-UAT-013-7 hardening follow-up.
if [[ ! "$API_BASE_URL" =~ ^https?:// ]]; then
  fail "API_BASE_URL must start with http:// or https:// — got: $API_BASE_URL"
fi

# ── Probe ───────────────────────────────────────────────────────────────────

main() {
  check_deps

  local probe_url="${API_BASE_URL}${HEALTH_PATH}"
  info "Probing ${probe_url} (max-time=${CURL_MAX_TIME_SECONDS}s)…"

  # Capture body + status separately so we can distinguish a curl failure
  # (network/timeout) from a contract violation (HTTP 200 but bad JSON).
  local body http_code
  body="$("$CURL_CMD" --silent --show-error --max-time "$CURL_MAX_TIME_SECONDS" \
              --write-out '\n%{http_code}' "$probe_url" 2>&1)" \
    || fail "curl could not reach ${probe_url} within ${CURL_MAX_TIME_SECONDS}s — is the API running? (curl exit: $?)"

  # The body + http_code are on the last line; split them.
  http_code="$(printf '%s' "$body" | tail -n 1)"
  body="$(printf '%s' "$body" | sed '$d')"

  if [[ "$http_code" != "200" ]]; then
    fail "GET ${probe_url} returned HTTP ${http_code} — expected 200. Body: ${body:-<empty>}"
  fi

  # Validate the JSON shape — explicit assertions per AGENTS.md §1.5.
  if ! printf '%s' "$body" | jq -e . >/dev/null 2>&1; then
    fail "Response from ${probe_url} is not valid JSON. Body: $body"
  fi

  for field in configured provider mode; do
    if ! printf '%s' "$body" | jq -e --arg f "$field" 'has($f)' >/dev/null 2>&1; then
      fail "Response missing required field '$field'. Body: $body"
    fi
  done

  # Core gate: configured == true AND provider ∈ {smtp, resend} AND mode != disabled.
  # Use jq -e so a non-zero exit (from a false branch) bubbles up via set -e.
  if ! printf '%s' "$body" \
       | jq -e --arg p_smtp "$PROVIDER_OK_SMTP" \
               --arg p_resend "$PROVIDER_OK_RESEND" \
               --arg m_disabled 'disabled' \
               '.configured == true
                and ((.provider == $p_smtp) or (.provider == $p_resend))
                and (.mode != $m_disabled)' >/dev/null; then
    # Build a precise, actionable error message naming the actual provider + mode.
    local actual_provider actual_mode
    actual_provider="$(printf '%s' "$body" | jq -r '.provider // "<missing>"')"
    actual_mode="$(printf '%s' "$body" | jq -r '.mode // "<missing>"')"
    fail "Email transport not ready (provider=\"${actual_provider}\", mode=\"${actual_mode}\")." \
         "Required: provider ∈ {${PROVIDER_OK_SMTP}, ${PROVIDER_OK_RESEND}} AND mode != \"${MODE_DISABLED}\"." \
         "Fixes:" \
         "  • provider=\"none\"  → set SMTP_HOST (Mailpit at :1025) or RESEND_API_KEY in apps/api/.env." \
         "  • mode=\"disabled\"   → set SEND_EMAILS=true in apps/api/.env." \
         "Then restart the API container."
  fi

  # Print the JSON response so the operator (and the UAT log capture) sees the
  # exact values the gate passed on.
  printf '%s\n' "$body" | jq .
  ok "Email transport ready at ${probe_url}"
}

main