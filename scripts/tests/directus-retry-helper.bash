#!/usr/bin/env bash
# scripts/tests/directus-retry-helper.bash
#
# Bounded exponential-back-off wrapper for mutating Directus REST calls.
# Source-able by both infrastructure/directus/bootstrap.sh (production
# path) and scripts/tests/uat-seed-retries.bats (test path) so the bats
# suite verifies the same code that ships — extract, don't mock.
#
# Design contract (verified by bats in Step 7):
#   - Retries ONLY on 503 and 429 (transient back-pressure).
#   - NEVER retries on 401 / 403 (auth errors fail-fast; the bearer
#     token is wrong or expired — retrying multiplies log noise without
#     changing the outcome). 400, 404, 409, 422 etc. also fail-fast.
#   - GETs are NOT routed through this helper (caller decision). They
#     add load when Directus is already under pressure and have no
#     observable back-pressure semantic.
#   - Logs HTTP code + URL path only. NEVER echoes the response body
#     (the body can carry echo'd audit fields / partial secrets).
#
# Tunables (env, with named-constant defaults):
#   DIRECTUS_RETRY_MAX         — total attempts per request (default 5)
#   DIRECTUS_RETRY_BASE_DELAY  — initial back-off seconds (default 4)
#   UAT_SEED_DIRECTUS_MOCK=1   — short-circuits the helper (no curl,
#                                no sleep) so bats stays fast
#
# Failure mode (set -euo pipefail friendly):
#   directus_request_with_retry <method> <url> [curl-args...]
#     rc 0 — success (HTTP 2xx)
#     rc 1 — non-retryable failure (auth / validation / not-found)
#            /tmp/directus-last-code contains the last HTTP code
#     rc 2 — retry budget exhausted (still failing after
#            DIRECTUS_RETRY_MAX attempts); helper already logged a
#            fail-line to stderr so `set -e` aborts the caller

set -u

# ── Named constants (AGENTS.md §1.3 — no magic numbers in the loop) ──────
DEFAULT_RETRY_MAX=5
DEFAULT_BASE_DELAY=4
MAX_BACKOFF_CAP=60
# Space-separated list — membership tested with case-statement.
RETRYABLE_HTTP_CODES="503 429"

DIRECTUS_LAST_CODE_FILE="/tmp/directus-last-code"
DIRECTUS_RETRY_RESP_FILE="/tmp/directus-retry-resp"

# ── Defensive logging fallback ────────────────────────────────────────────
# The helper may be sourced from bootstrap.sh (no colour helpers defined)
# or from uat-env-setup.sh / uat-seed.sh (where warn()/ok()/info()/fail()
# are already defined with colour). When sourced standalone (or before
# the colour helpers are defined), fall back to plain stderr echo so the
# retry messages remain visible without breaking the run. AGENTS.md §7
# (return values checked) and §1.6 (smallest scope) prefer a one-line
# type-check-and-define over a full colour palette.
if ! declare -f warn >/dev/null 2>&1; then
  warn() { echo "  ! $*" >&2; }
fi

# directus_request_with_retry <method> <url> [extra curl args...]
# Returns 0 on 2xx; 1 on non-retryable 4xx/5xx; 2 on retry exhaustion.
directus_request_with_retry() {
  local method="$1" url="$2"
  shift 2

  # AGENTS.md §1.5 — assert non-empty inputs.
  [[ -n "$method" ]] || { echo "directus_request_with_retry: empty method" >&2; return 1; }
  [[ -n "$url"   ]] || { echo "directus_request_with_retry: empty url" >&2;   return 1; }

  # Mock short-circuit (bats fast-path; no curl, no sleep).
  if [[ "${UAT_SEED_DIRECTUS_MOCK:-0}" == "1" ]]; then
    echo "200" > "$DIRECTUS_LAST_CODE_FILE"
    return 0
  fi

  local max="${DIRECTUS_RETRY_MAX:-$DEFAULT_RETRY_MAX}"
  local delay="${DIRECTUS_RETRY_BASE_DELAY:-$DEFAULT_BASE_DELAY}"
  # AGENTS.md §1.2 — explicit upper bound via seq, not while-true.
  local i code

  for i in $(seq 1 "$max"); do
    code=$(curl -s -o "$DIRECTUS_RETRY_RESP_FILE" -w "%{http_code}" \
      -X "$method" "$url" "$@")
    echo "$code" > "$DIRECTUS_LAST_CODE_FILE"

    # Success — any 2xx ends the loop.
    if [[ "$code" =~ ^2 ]]; then
      return 0
    fi

    # Non-retryable — return 1 so caller can read /tmp/directus-last-code.
    if ! _directus_is_retryable "$code"; then
      return 1
    fi

    # Last attempt — don't sleep, just return 2.
    if (( i == max )); then
      break
    fi

    # AGENTS.md §5 — log code + URL path only, never the response body.
    # The body lives in $DIRECTUS_RETRY_RESP_FILE if a future caller
    # needs it for non-retryable diagnostics.
    warn "Directus ${code} attempt ${i}/${max} for ${method} $(url_path_of "$url") — backing off ${delay}s"
    sleep "$delay"

    # Exponential back-off with cap (AGENTS.md §1.3).
    delay=$(( delay * 2 ))
    if (( delay > MAX_BACKOFF_CAP )); then
      delay=$MAX_BACKOFF_CAP
    fi
  done

  warn "Directus still failing after ${max} attempts (last code: ${code}) for ${method} $(url_path_of "$url")"
  return 2
}

# _directus_is_retryable <code>
# Returns 0 (true) if <code> is in RETRYABLE_HTTP_CODES, 1 (false) otherwise.
# Internal helper extracted from directus_request_with_retry to keep the
# main function ≤60 lines (AGENTS.md §1.4).
_directus_is_retryable() {
  local code="$1"
  for rc in $RETRYABLE_HTTP_CODES; do
    if [[ "$code" == "$rc" ]]; then
      return 0
    fi
  done
  return 1
}

# url_path_of <url>
# Echo the path-and-query portion of a URL (e.g. "/items/countries/uz?x=1").
# Used so the log line is identifiable without leaking the host or
# (worse) any token-shaped query string. Pure bash, no sed.
url_path_of() {
  local url="$1"
  # Strip scheme://host if present.
  local no_scheme="${url#*://}"
  local path="${no_scheme#*/}"
  # /<path> or just <path>
  if [[ "$no_scheme" == *"/"* ]]; then
    echo "/${path%%\?*}"
  else
    echo "/"
  fi
}
