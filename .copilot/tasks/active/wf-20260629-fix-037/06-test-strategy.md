# Step 6 — Test Strategy

**Workflow:** wf-20260629-fix-037
**Issue:** ISS-UAT-013-5
**Agent:** TestStrategist
**Date:** 2026-06-29

---

## Requirement

Wrap every mutating Directus REST call in `infrastructure/directus/bootstrap.sh` (POST / PATCH / DELETE) with bounded exponential back-off so the seed script absorbs Directus 2024.x `503 Service 'api' is unavailable. Under pressure` load-shedding on fresh containers. Extract the helper to a source-able file so the bats suite exercises the same code that ships. Expose tunables `DIRECTUS_RETRY_MAX` and `DIRECTUS_RETRY_BASE_DELAY` in `infrastructure/.env.example`.

ID: **ISS-UAT-013-5** (minor, `uat / seed`).

---

## Rubric Score

Per `.copilot/agents/test-strategist.md` Test Tier Decision Rubric:

| Criterion | Points | Applies? | Justification |
|---|---|---|---|
| Touches tenant-scoped data | +2 | **No** | Helper never references `countryCode`. |
| New API endpoint | +2 | **No** | No NestJS controller added. Bash-only. |
| Business rule with edge cases | +2 | **No** | Edge cases are HTTP-transient (503/429/401/back-off). |
| Cross-module service call | +1 | **No** | Stays inside `infrastructure/directus/` + `scripts/tests/`. |
| New database query | +1 | **No** | No SQL change; no Drizzle; no migration. |
| Pure function / utility | 0 | **Yes** | `directus_request_with_retry` is a pure-bash utility with a closed contract. |
| UI-only change (no logic) | 0 | **No** | |

**Total: 0.** Score < 4 → **Unit tests sufficient.** Testcontainers integration not required. Playwright E2E not required.

### Cross-check with `issue-resolution.md` Step 6 mandate

> The plan MUST include at least one regression test that (1) would have failed before the fix and (2) passes after the fix.

Satisfied by **TC-1** (the 503-then-200 scenario, which proves the wrapper absorbs a single 503 that pre-fix would have killed `set -euo pipefail`).

The `extract, don't mock` decision means the bats test sources the **same** `directus-retry-helper.bash` that production uses — eliminating the "test verifies a different code path than production" risk class.

---

## Required Test Levels

- [x] **Unit (bats)** — the only level required
- [ ] **Integration (Testcontainers)** — N/A (no DB / no Directus schema change)
- [ ] **E2E (Playwright)** — N/A (no UI surface change)

The runtime smoke that AC-1 demands ("`pnpm uat:seed` on a fresh Directus completes in one pass") is a **Step 8 orchestrator runtime check**, not a playbook test case.

---

## Test File

**New file:** `scripts/tests/uat-seed-retries.bats`

Mirrors `scripts/tests/uat-seed.bats` style:

- `load 'test_helper'`
- `REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"`
- `setup()` / `teardown()` per test
- `run` for assertions, `[[ ]]` for substring matches, `[ "$status" -eq N ]` for return-code checks
- Sources the production helper directly: `source "${REPO_ROOT}/scripts/tests/directus-retry-helper.bash"`

### Stub mechanism (NEW pattern for the bats suite)

A small Python 3 stdlib HTTP server started in `setup()` on a per-test high port. No existing bats file uses this pattern.

**Stub script:** `scripts/tests/fixtures/tiny_http_stub.py` (~60 lines, lives next to the .bats file). Pure stdlib (`http.server`, `argparse`). Behavior:

1. CLI args: `--port <N> --response-code <C>` where `<C>` is a single int (`503`) or a comma-separated sequence (`503,503,200`). Stub keeps an internal counter; on sequence exhaustion it repeats the last code.
2. Always returns a 16-byte JSON-ish body (`{"stub":"ok"}` for 2xx; `{"stub":"under_pressure"}` for 5xx; `{"stub":"unauth"}` for 401).
3. Logs each request as one line to `/tmp/tiny_http_stub_<port>.log` so a failed test can introspect how many requests actually reached the stub.
4. `setup()` launches the stub via `command -v python || python3`, polls for the log file (≤2s, hard fail otherwise).
5. `teardown()` kills the stub by PID stored in `$BATS_TEST_TMPDIR/stub.pid`.

This satisfies "must NOT require live Directus or Authentik" and "network beyond 127.0.0.1" constraints.

---

## Test Cases

| TC | Title | Level | Asserts What | Maps to |
|---|---|---|---|---|
| TC-1 | "503-then-200: helper retries and succeeds on 2nd attempt" | bats (unit) | rc=0, retry warning emitted (`attempt 1/5`), last-code sentinel == "200", elapsed 3–6s | AC-3 (regression AC-2a) |
| TC-2 | "401: helper fails-fast with rc=1, no retry, no sleep" | bats (unit) | rc=1, last-code sentinel == "401", NO retry warning, elapsed < 1s | Security check #4 (fail-fast on auth) |
| TC-3 | "503 exhausted: helper returns 2 after max attempts" | bats (unit) | rc=2, last-code sentinel == "503", "still failing after 3 attempts" log line, elapsed 3–5s | Bounded-budget regression (AC-2b) |
| TC-4 | "UAT_SEED_DIRECTUS_MOCK=1: helper short-circuits, no curl" | bats (unit) | rc=0, last-code sentinel == "200", elapsed < 1s, stub log file absent | Mock-mode regression |

### TC-1 detail (regression AC-2a — must fail pre-fix)

```bash
@test "TC-1: 503-then-200: helper retries and succeeds on 2nd attempt" {
  local port=18801
  start_stub "$port" "503,200"

  local start_ns end_ns
  start_ns=$(date +%s%N)

  run bash -c "source '${REPO_ROOT}/scripts/tests/directus-retry-helper.bash' && \
    directus_request_with_retry GET 'http://127.0.0.1:${port}/foo' \
      -H 'Authorization: Bearer mock'"

  end_ns=$(date +%s%N)
  local elapsed_s=$(( (end_ns - start_ns) / 1000000000 ))

  [ "$status" -eq 0 ]
  [[ "$output" == *"attempt 1/5"* ]]
  [ "$(cat /tmp/directus-last-code)" = "200" ]
  [ "$elapsed_s" -ge 3 ]
  [ "$elapsed_s" -le 6 ]
}
```

**Pre-fix behavior (regression proof):** Without `directus_request_with_retry`, `bootstrap.sh`'s `ensure()` calls `curl -sf ...` directly. A 503 makes curl exit non-zero, `set -euo pipefail` aborts, the seed dies. TC-1 against the pre-fix code would print `✗ foo HTTP 503` and return 1. The post-fix `[[ "$output" == *"attempt 1/5"* ]]` assertion would fail because the pre-fix code never logs "attempt". This is the literal Step 6 mandate satisfied.

### TC-2 detail (security invariant — fail-fast on 401)

```bash
@test "TC-2: 401: helper fails-fast with rc=1, no retry, no sleep" {
  local port=18802
  start_stub "$port" "401"

  local start_ns end_ns
  start_ns=$(date +%s%N)

  run bash -c "source '${REPO_ROOT}/scripts/tests/directus-retry-helper.bash' && \
    DIRECTUS_RETRY_MAX=5 DIRECTUS_RETRY_BASE_DELAY=1 \
    directus_request_with_retry GET 'http://127.0.0.1:${port}/foo' \
      -H 'Authorization: Bearer mock'"

  end_ns=$(date +%s%N)
  local elapsed_s=$(( (end_ns - start_ns) / 1000000000 ))

  [ "$status" -eq 1 ]
  [ "$(cat /tmp/directus-last-code)" = "401" ]
  [[ "$output" != *"attempt"* ]]
  [ "$elapsed_s" -lt 1 ]
}
```

### TC-3 detail (bounded budget)

```bash
@test "TC-3: 503 exhausted: helper returns 2 after max attempts" {
  local port=18803
  start_stub "$port" "503"

  local start_ns end_ns
  start_ns=$(date +%s%N)

  run bash -c "source '${REPO_ROOT}/scripts/tests/directus-retry-helper.bash' && \
    DIRECTUS_RETRY_MAX=3 DIRECTUS_RETRY_BASE_DELAY=1 \
    directus_request_with_retry GET 'http://127.0.0.1:${port}/foo' \
      -H 'Authorization: Bearer mock'"

  end_ns=$(date +%s%N)
  local elapsed_s=$(( (end_ns - start_ns) / 1000000000 ))

  [ "$status" -eq 2 ]
  [ "$(cat /tmp/directus-last-code)" = "503" ]
  [[ "$output" == *"still failing after 3 attempts"* ]]
  [ "$elapsed_s" -ge 3 ]
  [ "$elapsed_s" -le 5 ]
}
```

### TC-4 detail (mock short-circuit)

```bash
@test "TC-4: UAT_SEED_DIRECTUS_MOCK=1: helper short-circuits, no curl" {
  local port=18804
  local log="/tmp/tiny_http_stub_${port}.log"
  rm -f "$log"

  local start_ns end_ns
  start_ns=$(date +%s%N)

  run bash -c "source '${REPO_ROOT}/scripts/tests/directus-retry-helper.bash' && \
    UAT_SEED_DIRECTUS_MOCK=1 \
    directus_request_with_retry GET 'http://127.0.0.1:${port}/foo' \
      -H 'Authorization: Bearer mock'"

  end_ns=$(date +%s%N)
  local elapsed_s=$(( (end_ns - start_ns) / 1000000000 ))

  [ "$status" -eq 0 ]
  [ "$(cat /tmp/directus-last-code)" = "200" ]
  [ "$elapsed_s" -lt 1 ]
  [ ! -f "$log" ]
}
```

---

## Acceptance Criteria → Test Mapping

| AC | Test | Level | Notes |
|---|---|---|---|
| AC-1: One-pass completion on fresh Directus | (Step 8 orchestrator runtime check) | runtime | Not a bats test. |
| AC-2: Per-collection retry count logged | TC-1 + TC-3 | bats | The `warn "Directus ${code} attempt ${i}/${max} ..."` line is asserted in TC-1. |
| AC-3: New bats test mocks 503-then-200 and asserts success | TC-1 | bats | Direct match to AC wording. |
| Regression AC-2a: pre-fix would have aborted on first 503 | TC-1 | bats | Documented in Pre-fix vs Post-fix. |
| Regression AC-2b: 401 must not be retried | TC-2 | bats | Security check #4 from `04-security-review.md`. |
| Regression AC-2c: retry budget is bounded | TC-3 | bats | Proves `DIRECTUS_RETRY_MAX` is honored. |
| Mock-mode regression | TC-4 | bats | Keeps `pnpm test:bash` fast. |

All three issue ACs are mapped. Two additional regressions (TC-2, TC-3) per the issue-resolution Step 6 mandate.

---

## Mock Strategy

| Aspect | Decision |
|---|---|
| Tool | Python 3 stdlib `http.server` (single-file stub script) |
| Stub script location | `scripts/tests/fixtures/tiny_http_stub.py` |
| Stub lifecycle | `setup()` starts, `teardown()` kills by PID stored in `$BATS_TEST_TMPDIR/stub.pid` |
| Stub ports | 18801, 18802, 18803, 18804 — one per TC, avoids cross-test bleed |
| Stub log file | `/tmp/tiny_http_stub_<port>.log` — used by TC-4 to prove no curl was issued |
| Stub failure mode | If Python missing or port occupied, `setup()` prints FATAL + exits non-zero |
| Stub body | 16-byte JSON-ish per status class |
| Why not `nc -l`? | `nc` on Windows behaves inconsistently. Python is universally available on the runner image. |
| Why not curl --mock? | curl has no native stub-mode flag for configurable status sequences. |

---

## Test Ordering

Tests are isolated by port, so runtime ordering is irrelevant. **Convention:** alphabetical (TC-1 → TC-2 → TC-3 → TC-4).

Total runtime budget: TC-1 ≈ 4s + TC-2 <1s + TC-3 ≈ 3s + TC-4 <0.1s ≈ **8s**. Well under the 30-second bats default.

---

## Edge Cases NOT Covered (deliberate)

1. **429 retry** — TC-1 exercises the 503 path; 429 path is structurally identical.
2. **Network failure (curl exits non-zero, e.g. connection refused)** — Not covered.
3. **`MAX_BACKOFF_CAP=60` boundary** — TC-3 uses base=1 max=3 (never reaches the cap).
4. **`url_path_of` with malformed URLs** — TC-1/2/3 use well-formed URLs.
5. **Concurrent stub races** — Two parallel `bootstrap.sh` runs would race `/tmp/directus-last-code`. Security review marked as INFO-only.
6. **Stub script broken / Python missing** — Runner-env failure, not helper failure.

---

## Pre-fix vs Post-fix Behavior (regression proof)

| Scenario | Pre-fix (`curl -sf` direct) | Post-fix (helper with back-off) | Test |
|---|---|---|---|
| First call returns 503 | curl exits 22, `set -e` aborts, seed dies with `✗ foo HTTP 503` | Helper retries up to 5× (4→8→16→32→60s), succeeds on first 2xx | **TC-1** |
| First call returns 401 | curl exits 22, seed dies — correct fail-fast | Helper returns 1 immediately (no retry) | **TC-2** |
| First call returns 429 | Same as 503 (seed dies) | Helper retries | Deferred (covered transitively) |
| All 5 attempts return 503 | N/A — first 503 kills seed | Helper returns 2 with `still failing after 5 attempts` log | **TC-3** |

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Python not on PATH in runner | medium | `setup()` runs `command -v python \|\| python3` first; FATAL + exit if neither exists |
| Stub port already in use | low | Stub retries bind up to 5×100ms; FATAL if still failing |
| Stub crashes mid-test | low | TC-1/2/3 assert on rc + log content; elapsed-window catches anomalies |
| `/tmp/directus-last-code` bleeds from prior bats run | low | `setup()` truncates the sentinel file |
| `sleep` on Windows unreliable | medium | bats runner expected on POSIX shell; TC windows (±1s slop) absorb scheduler noise |
| `date +%s%N` unsupported on runner | low | bash 5+ supports `EPOCHREALTIME` |
| Stub HTTP timing race: request before stub listening | low | `setup()` polls stub log file for ≤2s before returning |
| Helper's `warn()` fallback clobbers a future bootstrap `warn()` | low | Gated by `if ! declare -f warn` (helper:49-51) |

---

## Files the TestDesigner Will Create

| File | Purpose | Approx lines |
|---|---|---|
| `scripts/tests/uat-seed-retries.bats` | The four `@test` cases | 130 |
| `scripts/tests/fixtures/tiny_http_stub.py` | Python stdlib stub server | 60 |

No modifications to `scripts/tests/test_helper.bash`. No new dependencies. No `package.json` edit.

---

## Gate Result

gate_result:
  status: passed
  summary: "Unit-test strategy for ISS-UAT-013-5 retry helper complete: four bats cases in scripts/tests/uat-seed-retries.bats exercise the same source-able helper file that bootstrap.sh ships (extract, don't mock), using a per-test Python stdlib HTTP stub on ports 18801-18804; rubric score 0 → unit tests only; all three issue ACs mapped (AC-1 is a Step-8 orchestrator runtime check, AC-2 and AC-3 are bats assertions); regression proof is TC-1, which would fail against pre-fix bootstrap.sh because the pre-fix code logs no 'attempt' line and aborts on first 503; edge cases 429 / network-failure / cap-boundary deferred as low-value; bounded retry budget (TC-3) and auth fail-fast (TC-2) provide defense in depth against the most likely future regressions."
  findings:
    - "Test file: scripts/tests/uat-seed-retries.bats. Fixture: scripts/tests/fixtures/tiny_http_stub.py."
    - "Total runtime budget: ~8s (well under the 30s bats default)."
    - "Tests do NOT require live Directus, Authentik, or any network beyond 127.0.0.1."
    - "TC-1 is the literal regression test required by issue-resolution Step 6 (would have failed pre-fix, passes post-fix)."
    - "TC-2 (401 fail-fast) and TC-3 (bounded budget) are additional regressions the security review flagged as critical invariants."
    - "TC-4 covers UAT_SEED_DIRECTUS_MOCK=1 short-circuit so the wider bats suite continues to run fast."
    - "Stub-server pattern is NEW for this bats suite; flag for DocWriter step (README.md update) if not auto-generated."
    - "Edge cases 429-retry, curl network failure, MAX_BACKOFF_CAP=60 boundary, url_path_of malformed-input are explicitly deferred."