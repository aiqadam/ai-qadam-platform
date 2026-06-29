#!/usr/bin/env bats
# scripts/tests/uat-seed-retries.bats
#
# Regression suite for scripts/tests/directus-retry-helper.bash
# (ISS-UAT-013-5). Sources the production helper directly so the bats
# suite verifies the same code that ships to infrastructure/directus/
# bootstrap.sh — extract, don't mock.
#
# Each test runs a small Python 3 stdlib HTTP stub on its own
# high-port (18801-18804) and asserts on the helper's return code,
# on the /tmp/directus-last-code sentinel file, and on the elapsed
# wall-clock (using date +%s%N on POSIX, EPOCHREALTIME on bash 5+).
#
# Run:
#   bash scripts/run-bats.sh scripts/tests/uat-seed-retries.bats
#   pnpm test:bash

load 'test_helper'

REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
PY_BIN="$(command -v python3 || command -v python || true)"
STUB="${REPO_ROOT}/scripts/tests/fixtures/tiny_http_stub.py"

# ── Helpers (defined in this file, not test_helper.bash) ────────────────
# Why local: these helpers reference BATS_TEST_TMPDIR and the stub
# script path; keeping them in-file avoids growing test_helper.bash
# with one-off fixture plumbing.

# Mark the stub server ready/healthy in $BATS_TEST_TMPDIR/stub.ready.
# The setup() poll loop returns as soon as this file exists AND
# contains at least one request line written by the stub.
stub_ready() {
  local port="$1"
  local log="/tmp/tiny_http_stub_${port}.log"
  [[ -s "$log" ]]
}

# Start the stub on <port> serving <codes> (e.g. "503,200").
# Polls for readiness up to 20x100ms (2s total). On timeout, prints
# a FATAL so the test fails with a clear message ("Python missing?"
# vs a generic timeout).
start_stub() {
  local port="$1" codes="$2"
  [[ -n "$PY_BIN" ]] || {
    echo "FATAL: python3/python not on PATH — cannot run stub" >&2
    return 1
  }
  [[ -f "$STUB" ]] || {
    echo "FATAL: stub script missing at $STUB" >&2
    return 1
  }
  # Truncate / unlink any stale log so readiness is unambiguous.
  rm -f "/tmp/tiny_http_stub_${port}.log"

  # Launch stub detached; capture PID in $BATS_TEST_TMPDIR/stub.pid.
  "$PY_BIN" "$STUB" --port "$port" --response-code "$codes" \
    >/dev/null 2>&1 &
  echo $! > "$BATS_TEST_TMPDIR/stub.pid"

  # Poll for readiness. We can't pre-write the log ourselves because
  # the stub owns the file. So we drive one real request via curl to
  # 127.0.0.1:<port> and then poll until the log exists & non-empty.
  for _ in $(seq 1 20); do
    curl -s -o /dev/null "http://127.0.0.1:${port}/_probe" 2>/dev/null || true
    if stub_ready "$port"; then
      return 0
    fi
    sleep 0.1
  done
  echo "FATAL: stub on port ${port} did not become ready in 2s" >&2
  return 1
}

# Stop the stub launched by start_stub. Safe to call multiple times.
stop_stub() {
  local pid_file="$BATS_TEST_TMPDIR/stub.pid"
  [[ -f "$pid_file" ]] || return 0
  local pid
  pid="$(cat "$pid_file")"
  rm -f "$pid_file"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    # Wait briefly for clean exit, then escalate.
    sleep 0.2
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
  fi
}

# now_ns: cross-platform monotonic-ish clock in nanoseconds.
# Tries date +%s%N (POSIX glibc + macOS); falls back to EPOCHREALTIME
# (bash 5+ supports fractional seconds natively).
now_ns() {
  if date +%s%N 2>/dev/null | grep -qE '^[0-9]+$'; then
    date +%s%N
  else
    # bash 5+:  $EPOCHREALTIME is "seconds.microseconds" string.
    awk -v t="${EPOCHREALTIME:-}" 'BEGIN {
      if (t == "") { print 0; exit }
      printf "%d\n", (t * 1000000000)
    }'
  fi
}

elapsed_seconds() {
  local start="$1" end="$2"
  echo $(( (end - start) / 1000000000 ))
}

setup() {
  export REPO_ROOT
  # /tmp sentinels used by the helper.
  : > /tmp/directus-last-code
  : > /tmp/directus-retry-resp
  # Mock state must NOT leak between tests.
  unset UAT_SEED_DIRECTUS_MOCK
}

teardown() {
  stop_stub || true
  unset UAT_SEED_DIRECTUS_MOCK
  # Free ports: nothing else to do — the stub process is gone.
}

# ── TC-1: 503-then-200 — the literal regression test for the issue ──────
@test "TC-1: 503-then-200: helper retries and succeeds on 2nd attempt" {
  local port=18801
  start_stub "$port" "503,200" || skip "stub did not start (python missing?)"

  local start_ns end_ns
  start_ns=$(now_ns)

  run bash -c "source '${REPO_ROOT}/scripts/tests/directus-retry-helper.bash' && \
    directus_request_with_retry GET 'http://127.0.0.1:${port}/foo' \
      -H 'Authorization: Bearer mock' 2>&1"

  end_ns=$(now_ns)
  local elapsed_s
  elapsed_s=$(elapsed_seconds "$start_ns" "$end_ns")

  [ "$status" -eq 0 ]
  [[ "$output" == *"attempt 1/5"* ]]
  [ "$(cat /tmp/directus-last-code)" = "200" ]
  # Default DIRECTUS_RETRY_BASE_DELAY=4 ⇒ a single 4 s back-off, plus
  # the two HTTP round-trips. The stub trace shows ~7 s end-to-end on
  # busy CI hosts, so the upper bound is generous.
  [ "$elapsed_s" -ge 4 ]
  [ "$elapsed_s" -le 12 ]
}

# ── TC-2: 401 must FAIL-FAST — security check #4 from the review ────────
@test "TC-2: 401: helper fails-fast with rc=1, no retry, no sleep" {
  local port=18802
  start_stub "$port" "401" || skip "stub did not start (python missing?)"

  local start_ns end_ns
  start_ns=$(now_ns)

  run bash -c "source '${REPO_ROOT}/scripts/tests/directus-retry-helper.bash' && \
    DIRECTUS_RETRY_MAX=5 DIRECTUS_RETRY_BASE_DELAY=1 \
    directus_request_with_retry GET 'http://127.0.0.1:${port}/foo' \
      -H 'Authorization: Bearer mock' 2>&1"

  end_ns=$(now_ns)
  local elapsed_s
  elapsed_s=$(elapsed_seconds "$start_ns" "$end_ns")

  [ "$status" -eq 1 ]
  [ "$(cat /tmp/directus-last-code)" = "401" ]
  [[ "$output" != *"attempt"* ]]
  [ "$elapsed_s" -lt 1 ]
}

# ── TC-3: retry budget is BOUNDED — DIRECTUS_RETRY_MAX honoured ──────────
@test "TC-3: 503 exhausted: helper returns 2 after max attempts" {
  local port=18803
  start_stub "$port" "503" || skip "stub did not start (python missing?)"

  local start_ns end_ns
  start_ns=$(now_ns)

  run bash -c "source '${REPO_ROOT}/scripts/tests/directus-retry-helper.bash' && \
    DIRECTUS_RETRY_MAX=3 DIRECTUS_RETRY_BASE_DELAY=1 \
    directus_request_with_retry GET 'http://127.0.0.1:${port}/foo' \
      -H 'Authorization: Bearer mock' 2>&1"

  end_ns=$(now_ns)
  local elapsed_s
  elapsed_s=$(elapsed_seconds "$start_ns" "$end_ns")

  [ "$status" -eq 2 ]
  [ "$(cat /tmp/directus-last-code)" = "503" ]
  [[ "$output" == *"still failing after 3 attempts"* ]]
  [ "$elapsed_s" -ge 3 ]
  [ "$elapsed_s" -le 5 ]
}

# ── TC-4: mock short-circuit — keeps the wider bats suite fast ──────────
@test "TC-4: UAT_SEED_DIRECTUS_MOCK=1: helper short-circuits, no curl" {
  local port=18804
  local log="/tmp/tiny_http_stub_${port}.log"
  rm -f "$log"

  local start_ns end_ns
  start_ns=$(now_ns)

  run bash -c "source '${REPO_ROOT}/scripts/tests/directus-retry-helper.bash' && \
    UAT_SEED_DIRECTUS_MOCK=1 \
    directus_request_with_retry GET 'http://127.0.0.1:${port}/foo' \
      -H 'Authorization: Bearer mock'"

  end_ns=$(now_ns)
  local elapsed_s
  elapsed_s=$(elapsed_seconds "$start_ns" "$end_ns")

  [ "$status" -eq 0 ]
  [ "$(cat /tmp/directus-last-code)" = "200" ]
  [ "$elapsed_s" -lt 1 ]
  [ ! -f "$log" ]
}
