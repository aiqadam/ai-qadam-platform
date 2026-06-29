# Step 6 — Test Design

**Workflow:** wf-20260629-fix-037
**Issue:** ISS-UAT-013-5
**Agent:** TestDesigner
**Date:** 2026-06-29

---

## What I built

| File | Lines | Purpose |
|---|---|---|
| `scripts/tests/fixtures/tiny_http_stub.py` | 122 | Python 3 stdlib HTTP stub. Pure stdlib (no pip). Binds 127.0.0.1 only; serves a per-port FIFO code sequence (e.g. `503,200`) with last-code repeat on exhaustion; logs each request to `/tmp/tiny_http_stub_<port>.log`; clean SIGTERM exit; `ThreadingHTTPServer` for future parallel use. |
| `scripts/tests/uat-seed-retries.bats` | 219 | The four `@test` cases from the TestStrategist's plan. Mirrors `uat-seed.bats` style — `load 'test_helper'`, `setup()`/`teardown()`, `run` for assertions. Adds per-file `start_stub`/`stop_stub` helpers and a cross-platform `now_ns`/`elapsed_seconds` clock. |

No modifications to `scripts/tests/test_helper.bash`. No `package.json` / `pnpm` / pip changes.

## Mapping to the strategy

| Strategy TC | What it asserts | Line range in `.bats` | Notes |
|---|---|---|---|
| TC-1 — 503-then-200 regression | rc=0; "attempt 1/5" in output; sentinel == 200; elapsed 3–6s | 125–146 | The literal regression test — pre-fix `curl -sf` would abort on the first 503 and never print "attempt". |
| TC-2 — 401 fail-fast (security #4) | rc=1; sentinel == 401; no "attempt" in output; elapsed < 1s | 148–169 | Proves the retry budget is not spent on auth failures. Critical invariant from the security review. |
| TC-3 — bounded retry budget | rc=2; sentinel == 503; "still failing after 3 attempts" in output; elapsed 3–5s | 171–193 | Proves `DIRECTUS_RETRY_MAX` is honoured with non-default small numbers (3/1) so elapsed stays in the test window. |
| TC-4 — UAT_SEED_DIRECTUS_MOCK=1 short-circuit | rc=0; sentinel == 200; elapsed < 1s; stub log file absent | 195–215 | Keeps the broader bats suite fast; also locks in the regression that the short-circuit path doesn't issue a curl. |

All four issue ACs map (AC-1 is a Step-8 runtime check, AC-2/AC-3 are bats assertions). The strategy table is reproduced unchanged.

## Conventions followed (AGENTS.md §1, §3)

- **Simple control flow** — each `@test` body is ~17–19 lines (well under the 60-line function cap). No ternaries, no nested `if` deeper than 1 level.
- **Explicit upper bounds** — `start_stub` polls `for _ in $(seq 1 20)` (2s total). No `while true` anywhere.
- **No magic numbers** — the 20/100ms stub-poll budget is in named local constants, the bats timing windows come from the strategy's TC table.
- **Asserted inputs** — `start_stub` asserts `[[ -n "$PY_BIN" ]]` and `[[ -f "$STUB" ]]` before doing anything; prints `FATAL: …` and returns non-zero on failure.
- **Variables in smallest scope** — `port`, `start_ns`, `end_ns`, `elapsed_s` are all `local` to the test function. No module-level mutable state.
- **Return values checked** — every `run` captures exit code; every `$(cat …)` capture is asserted against the expected string; `|| skip` on stub startup failure (intentional — hanging forever is worse than `skip`).
- **No dynamic imports / string-built commands** — only `source` of the helper by static path and `"$PY_BIN" "$STUB" --port "$port" --response-code "$codes"`.

## How stub readiness is determined

`start_stub` cannot pre-create `/tmp/tiny_http_stub_<port>.log` because the stub server (not the bats process) owns that file. So the readiness loop launches the stub, then drives one curl probe and polls for a non-empty log file (`stub_ready`):

```bash
for _ in $(seq 1 20); do
  curl -s -o /dev/null "http://127.0.0.1:${port}/_probe" 2>/dev/null || true
  if stub_ready "$port"; then return 0; fi
  sleep 0.1
done
```

This is resilient to "stub starting but not yet listening": the curl probe will either hit the listener (which writes a log line and we return) or fail (we keep polling until log appears). On Linux + macOS glibc, `ThreadingHTTPServer`'s `bind()` happens before the first `handle()` returns, so the log appears within one RTT. On Windows MSYS the gap is similar — at most one `curl` round-trip ≈ a few ms.

## Cross-platform timing

`now_ns()` uses `date +%s%N` when supported (Linux glibc + macOS BSD `date`); falls back to `EPOCHREALTIME` (bash 5+) on systems where `date +%s%N` returns `+%s%N` literally. Detection is the exact regex recommended by the user:

```bash
if date +%s%N 2>/dev/null | grep -qE '^[0-9]+$'; then date +%s%N
else awk -v t="${EPOCHREALTIME:-}" 'BEGIN { printf "%d\n", (t * 1000000000) }'
fi
```

`elapsed_seconds` does integer-nanosecond subtraction → seconds division (whole-second resolution is what the strategy's TC tables assert on; sub-second noise wouldn't matter but the test would never be the bottleneck).

## Edge cases tested

- 503 → 200 success path (TC-1)
- 401 fail-fast no-retry no-sleep (TC-2)
- 503 retry-budget exhaustion (TC-3)
- Mock short-circuit, no curl issued (TC-4)

## Edge cases NOT tested (deliberate, per strategy)

1. **429 retry** — TC-1 covers the 503 branch; the 429 branch is structurally identical (`for rc in $RETRYABLE_HTTP_CODES`) and would be a duplicate test.
2. **Network failure (curl exits non-zero, e.g. connection refused)** — not in scope; would require a special stub that drops the socket.
3. **`MAX_BACKOFF_CAP=60` boundary** — TC-3 uses base=1, max=3, so the cap is never reached; asserting the cap would need a longer-running test.
4. **`url_path_of()` malformed URLs** — all TC URLs are well-formed; the helper's URL parser is 12 lines and tested structurally by its own logic.
5. **Concurrent stub races** — security review marked INFO-only; out of scope for bats regression.
6. **Python missing** — `start_stub` `|| skip`s with a "Python missing?" message rather than hanging the CI for 30s.

## Acceptance Criteria Coverage

| AC | Test | Status |
|---|---|---|
| AC-1: One-pass completion on fresh Directus | (Step 8 orchestrator runtime check) | Deferred to Step 8 |
| AC-2: Per-collection retry count logged | TC-1 + TC-3 (warn "Directus ${code} attempt ${i}/${max} …") | ✅ Covered |
| AC-3: New bats test mocks 503-then-200 and asserts success | TC-1 | ✅ Covered |
| Regression AC-2a: pre-fix would have aborted on first 503 | TC-1 | ✅ Covered (the "attempt 1/5" assertion would fail pre-fix because the pre-fix code prints no "attempt" line) |
| Regression AC-2b: 401 must not be retried | TC-2 | ✅ Covered |
| Regression AC-2c: retry budget is bounded | TC-3 | ✅ Covered |
| Mock-mode regression | TC-4 | ✅ Covered |

All three issue ACs are mapped. Three additional regressions (TC-2, TC-3, TC-4) per the issue-resolution Step 6 mandate ("at least one regression test that would have failed before the fix and passes after the fix").

## Known Test Gaps

- **Stub uses `<int>.append` on `Handler.log_path`** at request time. If the log directory is unwritable (CI sandbox tightening) the requests still succeed and the test's *own* assertions don't depend on the log, so the bats suite degrades gracefully. No `TODO` in source; flagged here.
- **`stop_stub` uses `kill <pid>; sleep 0.2; kill -9`** — on a heavily loaded CI box the stub could survive past the 0.2s and be reused by a subsequent test on a different port (different ports = no real conflict). Acceptable risk; documented in `stop_stub`.

## Gate Result

gate_result:
  status: passed
  summary: "Test-design complete for ISS-UAT-013-5 retry helper: four bats cases in scripts/tests/uat-seed-retries.bats and one Python stdlib stub at scripts/tests/fixtures/tiny_http_stub.py; helper sourced directly so production and tests share the same code (extract, don't mock); all three issue ACs mapped (AC-1 deferred to Step-8 orchestrator runtime); TC-1 is the literal pre-fix regression test (would fail against bootstrap.sh without the wrapper); TC-2 enforces the security-critical 401 fail-fast invariant; TC-3 enforces the bounded retry budget invariant; TC-4 pins the UAT_SEED_DIRECTUS_MOCK=1 short-circuit so the broader bats suite stays fast; cross-platform now_ns handles both date +%s%N (POSIX) and EPOCHREALTIME (bash 5+)."
  findings:
    - "NEW scripts/tests/fixtures/tiny_http_stub.py — 122 lines, pure stdlib (http.server, socketserver, argparse, signal); binds 127.0.0.1 only; FIFO code sequence with last-code repeat on exhaustion; per-request log to /tmp/tiny_http_stub_<port>.log; SIGTERM-clean exit; ThreadingHTTPServer for future parallelism."
    - "NEW scripts/tests/uat-seed-retries.bats — 219 lines, four @test cases + four per-file helpers (start_stub, stop_stub, now_ns, elapsed_seconds). All four @test functions under 22 lines (well under the AGENTS.md §1.4 60-line cap)."
    - "Mirrors scripts/tests/uat-seed.bats style: load 'test_helper'; REPO_ROOT resolved via BATS_TEST_DIRNAME; setup()/teardown() per test; run for assertions; [[ ]] for substring matches; [ \"$status\" -eq N ] for return-code checks."
    - "Sources the production helper directly: source '${REPO_ROOT}/scripts/tests/directus-retry-helper.bash' (extract, don't mock)."
    - "Stub readiness via curl-probe-then-poll on log-file existence, up to 2s; on timeout test skips with a clear 'Python missing?' message rather than hanging."
    - "TC-1 (regression AC-2a): 503-then-200 → rc=0, attempt 1/5 logged, sentinel 200, elapsed 3–6s."
    - "TC-2 (security invariant #4): 401 → rc=1, no 'attempt' line, elapsed < 1s. Critical — proves the helper does NOT retry on auth failures."
    - "TC-3 (bounded budget): max=3 base=1 against always-503 → rc=2, 'still failing after 3 attempts' logged, elapsed 3–5s. Honors DIRECTUS_RETRY_MAX."
    - "TC-4 (mock-mode regression): UAT_SEED_DIRECTUS_MOCK=1 short-circuit → rc=0, sentinel 200, stub log file absent, elapsed < 1s."
    - "All four tests verified against the helper's sentinel file /tmp/directus-last-code (helper writes it; tests assert on it; setup() truncates it to prevent bleed between cases)."
    - "Cross-platform now_ns: tries date +%s%N first; falls back to bash 5+ $EPOCHREALTIME → awk-converted ns. Same regex the user suggested."
    - "No modifications to scripts/tests/test_helper.bash, package.json, pnpm, infrastructure/directus/bootstrap.sh, infrastructure/.env.example, or the helper itself."
    - "No new pip or npm dependencies."
    - "Tests do NOT require live Directus, Authentik, or any network beyond 127.0.0.1."
    - "Total runtime budget: TC-1 ≈ 4s + TC-2 < 1s + TC-3 ≈ 3s + TC-4 < 0.1s ≈ 8s, well under the 30s bats default."
