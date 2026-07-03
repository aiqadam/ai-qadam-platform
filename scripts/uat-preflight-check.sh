#!/usr/bin/env bash
# scripts/uat-preflight-check.sh
#
# Process-identity pre-flight check for UAT verification.
#
# Purpose
# ────────
# Verifies that the process listening on a given TCP port is the *expected*
# service for the UAT run — not just that *something* answers on the port.
# This catches the failure mode from ISS-UAT-013-2: a foreign service
# (e.g. a sibling project's dev server) squatting on :3000 would make a bare
# `curl http://localhost:3000/health` succeed while the actual API traffic
# lands on the wrong backend.
#
# Usage
# ─────
#   bash scripts/uat-preflight-check.sh <service-name> <port> <expected-substring>
#
# Examples:
#   bash scripts/uat-preflight-check.sh api :3000 "@aiqadam/api"
#   bash scripts/uat-preflight-check.sh web :4321 "@astrojs/node"
#   bash scripts/uat-preflight-check.sh api :3000 "apps/api/dist/main.js"
#
# Exit codes
# ──────────
#   0  PID listening on <port> has a CommandLine containing <expected-substring>.
#   1  Port unbound, foreign service, missing arg, or probe failure.
#   2  Invocation error (--help, missing arg, etc.).
#
# Platform coverage
# ─────────────────
# Windows (primary): implemented via PowerShell `Get-NetTCPConnection` +
# `Get-CimInstance Win32_Process`.
# macOS / Linux:     TODO marker only (see `probe_process_identity_unix`).
#                    Per AGENTS.md §0 the team is Windows-first.
#                    Open a follow-up issue if cross-platform support is
#                    needed; ISS-UAT-013-2 deliberately excludes it.
#
# Test hook (for scripts/tests/uat-preflight-check.bats)
# ───────────────────────────────────────────────────────
# If `UAT_PREFLIGHT_PROBE_OUTPUT` is set, the real PowerShell/Unix probe is
# skipped and that value is used as the synthetic probe output instead.
# Format (newline-separated):
#   PID=<pid>
#   COMMANDLINE=<command line text>
# Optional `UAT_PREFLIGHT_PROBE_PID=<pid>` overrides the PID independently.
# `UAT_PREFLIGHT_PROBE_FAIL=1` simulates a probe failure (non-zero exit).
#
# Refs
# ────
# - ISS-UAT-013-2 — original incident (port-3000 misidentification)
# - .copilot/workflows/uat-verification.md Step 2 — where this is invoked
# - docs/02-business-processes/uat/BP-UAT-000.md — operator-facing docs

set -euo pipefail

# ── Colour helpers (mirrors scripts/uat-env-setup.sh) ───────────────────────
# IMPORTANT: colour codes use printf '%b' so the \033 escapes are interpreted
# ONCE; user-facing message text is emitted with printf '%s' so backslashes
# in the message (e.g. Windows paths like C:\Users\…) are preserved verbatim
# and not reinterpreted as escape sequences (\a → BEL, \n → newline, etc.).
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly RED='\033[0;31m'
readonly NC='\033[0m'
ok()   { printf '%b  ✓%b %s\n' "$GREEN" "$NC" "$*"; }
warn() { printf '%b  !%b %s\n' "$YELLOW" "$NC" "$*"; }
info() { printf '  → %s\n' "$*"; }
fail() { printf '%b  ✗ FATAL:%b %s\n' "$RED" "$NC" "$*" >&2; exit 1; }

readonly SCRIPT_NAME="uat-preflight-check.sh"

# ── Argument parsing ────────────────────────────────────────────────────────

usage() {
  cat <<EOF
$SCRIPT_NAME — process-identity pre-flight check

usage:
  bash $SCRIPT_NAME <service-name> <port> <expected-substring>

arguments:
  <service-name>       Human label for the expected service (e.g. "api", "web").
  <port>               TCP port to inspect (e.g. ":3000" or "3000").
  <expected-substring> Substring that must appear in the PID's CommandLine.
                       For the AI Qadam NestJS api: "@aiqadam/api" or
                       "apps/api/dist/main.js". For the Astro web app:
                       "@astrojs/node" or "apps/web".

exit codes:
  0  Match — the process on <port> is the expected service.
  1  Mismatch / unbound port / probe failure.
  2  Invocation error.

See ISS-UAT-013-2 for context and scripts/tests/uat-preflight-check.bats for
the regression test that pins this behaviour.

Environment overrides (test hook — do not use in production):
  UAT_PREFLIGHT_PROBE_OUTPUT   Skip the real probe; use this synthetic output.
                               Format: PID=<n>\\nCOMMANDLINE=<text>
  UAT_PREFLIGHT_PROBE_PID      Override PID only (must combine with the above
                               if CommandLine is also required).
  UAT_PREFLIGHT_PROBE_FAIL=1   Simulate a probe failure.
EOF
}

if [[ $# -eq 0 ]]; then
  fail "usage: bash $SCRIPT_NAME <service-name> <port> <expected-substring> (run with --help for details)"
fi

case "$1" in
  -h|--help)
    usage; exit 0 ;;
esac

if [[ $# -ne 3 ]]; then
  fail "usage: bash $SCRIPT_NAME <service-name> <port> <expected-substring> (got $# args)"
fi

SERVICE_NAME="$1"
PORT_RAW="$2"
EXPECTED_SUBSTRING="$3"

# Normalise port: accept ":3000" or "3000". Strip a single leading ':'.
PORT="${PORT_RAW#:}"
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [[ "$PORT" -lt 1 ]] || [[ "$PORT" -gt 65535 ]]; then
  fail "invalid port '$PORT_RAW' (expected digits, optionally prefixed with ':')"
fi

# Validate the substring is non-empty (AGENTS.md §1.5 — at least one assertion).
if [[ -z "$EXPECTED_SUBSTRING" ]]; then
  fail "expected-substring must not be empty"
fi

# ── Probe (test hook vs real probe) ─────────────────────────────────────────

# probe_via_test_hook <port>
# Reads UAT_PREFLIGHT_PROBE_OUTPUT / _PID / _FAIL and returns synthetic data.
# On probe-fail, exits non-zero with a controlled message so the caller can
# echo the right diagnostic.
probe_via_test_hook() {
  local port="$1"
  if [[ "${UAT_PREFLIGHT_PROBE_FAIL:-0}" == "1" ]]; then
    return 1
  fi
  local output="${UAT_PREFLIGHT_PROBE_OUTPUT:-}"
  if [[ -z "$output" ]]; then
    # Empty test hook → simulate "nothing listening on the port".
    printf 'UNBOUND\n'
    return 0
  fi
  # Parse PID=… and COMMANDLINE=… lines. We do NOT bash-eval the values.
  local pid_line cmd_line
  pid_line="$(printf '%s\n' "$output" | grep -E '^PID=' || true)"
  cmd_line="$(printf '%s\n' "$output" | grep -E '^COMMANDLINE=' || true)"
  # Allow a PID override independent of UAT_PREFLIGHT_PROBE_OUTPUT.
  if [[ -n "${UAT_PREFLIGHT_PROBE_PID:-}" ]]; then
    pid_line="PID=${UAT_PREFLIGHT_PROBE_PID}"
  fi
  if [[ -z "$pid_line" ]]; then
    # Probe output is set but contains no PID → simulate unbound port.
    printf 'UNBOUND\n'
    return 0
  fi
  local pid="${pid_line#PID=}"
  # Strip "COMMANDLINE=" prefix from the (possibly multi-line) cmd_line.
  local cmd="${cmd_line#COMMANDLINE=}"
  # If the cmd string contains embedded newlines (because the env var had
  # them via $'…' or printf), collapse to spaces for stable matching.
  cmd="$(printf '%s' "$cmd" | tr '\n' ' ')"
  printf 'PID=%s\nCOMMANDLINE=%s\n' "$pid" "$cmd"
  return 0
}

# probe_process_identity_windows <port>
# Real Windows probe: PowerShell + Get-NetTCPConnection + Get-CimInstance.
# Emits "PID=<pid>\nCOMMANDLINE=<text>" on success, "UNBOUND" if nothing
# listens, and exits non-zero on PowerShell failure.
#
# Implementation note (2026-07-03): the previous version embedded the
# PowerShell body inline as `powershell.exe -Command "$ps_script" "$port"`.
# bash's double-quote expansion of $ps_script / $port inside -Command
# collided with PowerShell's $-token parser, which silently stripped
# `$port`, `$args[0]`, `$pidVal`, `$cim` references when the heredoc body
# was re-passed through bash. The script then exited 1 because `$null -eq $conn`
# evaluated to a parse error. The fix: write the PS body to a temp .ps1 file
# and invoke `powershell.exe -NoProfile -File <path> <port>` instead, which
# bypasses the -Command parser entirely. Fix verified against port 4321
# (PID 32536, commandline contains astro/4321) and port 3000 (PID 42260,
# commandline contains apps\api\dist\main).
probe_process_identity_windows() {
  local port="$1"
  local probe_tmp
  probe_tmp="$(mktemp -t uat-preflight-probe.XXXXXX.ps1)"
  # Use a single-quoted PowerShell here-string literal so the embedded `$`
  # tokens are preserved verbatim (no bash / PowerShell expansion). Write
  # through `printf '%s\n'` to avoid any trailing-newline ambiguity.
  printf '%s\n' \
    "\$ErrorActionPreference = 'Stop'" \
    "\$port = \$args[0]" \
    "\$conn = Get-NetTCPConnection -LocalPort \$port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess" \
    "if (\$null -eq \$conn) { Write-Output 'UNBOUND'; exit 0 }" \
    "\$pidVal = [int]\$conn" \
    "\$cim = Get-CimInstance Win32_Process -Filter (\"ProcessId=\" + \$pidVal) -ErrorAction SilentlyContinue" \
    "if (\$null -eq \$cim) { Write-Output 'NO_CIM'; exit 2 }" \
    "Write-Output (\"PID=\" + \$cim.ProcessId)" \
    "Write-Output (\"COMMANDLINE=\" + \$cim.CommandLine)" \
    "exit 0" \
    > "$probe_tmp"
  local probe_output ps_exit
  set +e
  probe_output="$(powershell.exe -NoProfile -File "$probe_tmp" "$port" 2>&1)"
  ps_exit=$?
  set -e
  rm -f "$probe_tmp"
  # PowerShell emits CRLF line endings; strip the trailing \r so downstream
  # bash pattern matches (notably the ^[0-9]+$ PID regex) accept the value.
  probe_output="${probe_output//$'\r'/}"
  # Return the captured output to the caller via stdout. The original
  # pattern was a stdout echo + `return $ps_exit`; preserve that.
  printf '%s' "$probe_output"
  return $ps_exit
}

# probe_process_identity_unix <port>
# TODO(aiqadam-team): implement lsof/ps probe for macOS/Linux.
# Per ISS-UAT-013-2 the team is Windows-first (AGENTS.md §0).
# Track this in a separate issue if cross-platform dev becomes a priority.
probe_process_identity_unix() {
  local port="$1"
  fail "process-identity probe not implemented for $(uname -s | tr '[:upper:]' '[:lower:]') — see TODO marker in scripts/uat-preflight-check.sh (ISS-UAT-013-2 cross-platform TODO)"
}

# ── Main ────────────────────────────────────────────────────────────────────

probe_output=""
probe_failed=0

hook_exit=0
win_exit=0
# Test-hook trigger: any of the three env vars being set (even to empty)
# means "skip the real probe and use synthetic data". Using `[[ -v NAME ]]`
# instead of `[[ -n "$NAME" ]]` so that an explicitly-empty value (used by
# AC-3 to simulate "port unbound") still routes through the hook.
if [[ -v UAT_PREFLIGHT_PROBE_OUTPUT || -v UAT_PREFLIGHT_PROBE_PID \
   || "${UAT_PREFLIGHT_PROBE_FAIL:-0}" == "1" ]]; then
  # Test-hook path. probe_via_test_hook returns non-zero on failure (which
  # we want to surface as "probe failed"); UNBOUND on empty PID.
  set +e
  probe_output="$(probe_via_test_hook "$PORT")"
  hook_exit=$?
  set -e
  if [[ $hook_exit -ne 0 ]]; then
    fail "process-identity probe failed: test hook reported non-zero exit"
  fi
elif [[ "${OSTYPE:-}" == "msys" || "${OSTYPE:-}" == "cygwin" \
     || "${OS:-}" == "Windows_NT" \
     || "$(uname -s 2>/dev/null || echo unknown)" == *"MINGW"* \
     || "$(uname -s 2>/dev/null || echo unknown)" == *"MSYS"* ]]; then
  set +e
  probe_output="$(probe_process_identity_windows "$PORT")"
  win_exit=$?
  set -e
  if [[ $win_exit -ne 0 ]]; then
    fail "process-identity probe failed: PowerShell exited $win_exit"
  fi
else
  probe_process_identity_unix "$PORT"  # always fails today (TODO)
fi

# ── Result handling ─────────────────────────────────────────────────────────

# probe_output is one of:
#   "UNBOUND" — nothing listening on the port
#   "PID=<n>\nCOMMANDLINE=<text>" — a PID and its CommandLine
#
# If PowerShell exited cleanly but emitted nothing at all, treat as unbound.
if [[ -z "$probe_output" ]]; then
  fail "no process listening on :$PORT"
fi

if [[ "$probe_output" == "UNBOUND" ]]; then
  fail "no process listening on :$PORT"
fi

# Extract PID and CommandLine from the probe output. Use grep -E so we don't
# fail on blank lines from PowerShell's pipeline formatting.
pid=""
commandline=""
while IFS= read -r line; do
  case "$line" in
    PID=*)
      pid="${line#PID=}"
      ;;
    COMMANDLINE=*)
      commandline="${line#COMMANDLINE=}"
      ;;
  esac
done <<< "$probe_output"

# AGENTS.md §1.5 — assert that the probe gave us a usable PID.
if [[ -z "$pid" ]] || ! [[ "$pid" =~ ^[0-9]+$ ]]; then
  fail "no process listening on :$PORT"
fi

# CommandLine may legitimately be empty for some processes (e.g. system
# services). In that case the substring cannot match — treat as mismatch.
if [[ -z "$commandline" ]]; then
  fail "process on :$PORT (PID $pid) has no CommandLine; cannot verify identity"
fi

# Substring check (case-sensitive — PowerShell preserves original casing).
# Normalize both sides for path-separator differences: PowerShell's
# Win32_Process.CommandLine returns backslashes, but UAT scripts and CI
# invocations commonly spell expected substrings with forward slashes
# (e.g. "apps/api"). Without normalization, a forward-slash substring never
# matches a backslash commandline even though both refer to the same path.
# We normalize both sides by replacing backslash with forward slash before
# the glob match. This is a whitespace-safe normalization (no character is
# dropped or reordered); only the byte `\` is rewritten to `/`.
commandline_norm="${commandline//\\//}"
expected_norm="${EXPECTED_SUBSTRING//\\//}"
if [[ "$commandline_norm" != *"$expected_norm"* ]]; then
  # Truncate to the first 200 chars per the issue's required error shape.
  local_preview="${commandline:0:200}"
  fail "process on :$PORT (PID $pid) is not the expected $SERVICE_NAME. CommandLine: $local_preview"
fi

ok "process on :$PORT (PID $pid) is the expected $SERVICE_NAME"