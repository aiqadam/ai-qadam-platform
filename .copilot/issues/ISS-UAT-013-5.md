# ISS-UAT-013-5 — Directus returns 503 "Under pressure" during seed bootstrap; 3 retries required

| Field | Value |
|---|---|
| ID | ISS-UAT-013-5 |
| Severity | minor |
| Module | uat / seed |
| Status | resolved |
| Resolved | 2026-06-29 |
| Workflow | wf-20260629-fix-037 |
| Merged | [PR #69](https://github.com/tvolodi/aiqadam/pull/69) (squash: `f5ab88f`) |
| Reported | 2026-06-28 |
| Reporter | Orchestrator pre-flight (wf-20260628-uat-030 / 02-preflight.md) |
| Workflow | wf-20260628-uat-030 |

## Symptom

During `pnpm uat:seed`, Directus returned intermittent HTTP 503s with body `"Service 'api' is unavailable. Under pressure."`. The seed script's `set -euo pipefail` aborts on the first 503 unless the calling code retries.

The Orchestrator re-ran the seed with 8s and 15s back-off between attempts; retry 3 succeeded end-to-end. Bootstrap ultimately reported `✅ Directus schema bootstrapped`. This was not blocking the run, but is a non-trivial env reliability issue.

## Impact

- **Not blocking** for 2026-06-28 — the seed eventually succeeded after 3 retries. Without back-off, the run would have aborted at the first 503 and required manual intervention.
- **Latent risk**: re-running `pnpm uat:seed` on a fresh container may exhibit the same 503s. If the back-off is removed (or the developer assumes one-shot success), the run will fail.

## Root cause

`infrastructure/directus/bootstrap.sh` (invoked by `scripts/uat-seed.sh`) creates a large number of collections, relations, fields, and RBAC policies in rapid succession on a fresh Directus instance. Directus 2024.x returns 503 "Under pressure" when the api receives more concurrent requests than its worker pool can drain — the message is a load-shedding signal, not a configuration error.

The 8s / 15s back-off in the Orchestrator's mitigation is enough to let the worker pool drain; this should be baked into the seed script so it works without manual retry.

## Repro

```bash
# On a fresh Directus container:
time pnpm uat:seed
# → fails on retry 1 with "Service 'api' is unavailable. Under pressure."
# → fails on retry 2 with the same
# → succeeds on retry 3 (with back-off)
```

## Proposed resolution

Wrap `infrastructure/directus/bootstrap.sh`'s collection-creation loop with exponential back-off:

```bash
create_collection_with_retry() {
  local payload="$1" max_attempts=5
  local attempt=1 delay=4
  while (( attempt <= max_attempts )); do
    if curl -sf -H "Authorization: Bearer $DIRECTUS_TOKEN" \
         -H "Content-Type: application/json" \
         -X POST "$DIRECTUS_URL/collections" -d "$payload" >/dev/null; then
      return 0
    fi
    warn "Directus 503 (attempt $attempt/$max_attempts) — backing off ${delay}s"
    sleep "$delay"
    delay=$(( delay * 2 ))
    attempt=$(( attempt + 1 ))
  done
  fail "Directus still 503 after $max_attempts attempts"
}
```

Apply the same wrapper to field-creation, relation-creation, and RBAC policy writes — anywhere `bootstrap.sh` issues a POST/PATCH to Directus in a tight loop.

Add a config knob in `infrastructure/directus/.env`: `DIRECTUS_RETRY_MAX=5`, `DIRECTUS_RETRY_BASE_DELAY=4` so the dev can tune without editing bash.

## Acceptance criteria

1. `pnpm uat:seed` on a fresh Directus completes in one pass without manual retry.
2. The retry helper is logged (count of retries per collection) so the developer can see when Directus is under pressure.
3. A new bats test (`scripts/tests/uat-seed-retries.bats`) mocks a 503-then-200 sequence and asserts the helper succeeds without test failure.

## References

- `.copilot/tasks/active/wf-20260628-uat-030/02-preflight.md` — observed 503 + back-off
- `infrastructure/directus/bootstrap.sh` — collection/relation creator
- `scripts/uat-seed.sh`

## Resolution

### Root cause (verified)

`infrastructure/directus/bootstrap.sh` issues ~50 mutating REST calls
(`POST /collections`, `PATCH /collections/{id}`, `POST /relations`,
`POST /fields`, `POST /policies`, etc.) in a tight loop against a
fresh Directus 2024.x instance. Directus serves 503 `"Service 'api'
is unavailable. Under pressure."` when its Node worker pool can't
drain concurrent requests — a load-shedding signal, not a config
issue. The seed script's `set -euo pipefail` aborted the run on the
first 503 because no retry was attempted.

### Fix shipped

A **source-able retry helper** at `scripts/tests/directus-retry-helper.bash`
(deliberately under `scripts/tests/` so the `bats` regression suite
sources the same code that ships to `bootstrap.sh` — extract, don't
mock):

- `directus_request_with_retry <method> <url> [curl-args...]`
- Retries ONLY on HTTP 503 and 429 (transient back-pressure)
- Fail-fast on 401, 403, 400, 404, 409, 422 (auth & validation errors —
  retrying them multiplies log noise without changing the outcome)
- Bounded by `DIRECTUS_RETRY_MAX` (default 5) and `DIRECTUS_RETRY_BASE_DELAY`
  (default 4 s) with exponential back-off capped at 60 s
- Return codes: `0` success, `1` non-retryable, `2` retry budget exhausted
- Logs HTTP code + path only — never the response body (which can carry
  echo'd audit fields or partial secrets)

`bootstrap.sh` has all 13 mutating call sites wrapped through this
helper. GETs stay bare (no observable back-pressure semantic and would
add load when Directus is already pressured).

A **mock short-circuit toggle** `UAT_SEED_DIRECTUS_MOCK=1` lets the
bats harness skip curl/sleep entirely and run the wide operator-invite
suite in milliseconds.

### Regression test (the literal "would-have-caught-it")

`scripts/tests/uat-seed-retries.bats` — 4 cases:

| # | Case | Helper behavior | Asserts |
|---|---|---|---|
| TC-1 | 503-then-200 | retries, succeeds on 2nd | `rc=0`, `last-code=200`, warn line, elapsed sane |
| TC-2 | 401 | fail-fast, no retry, no sleep | `rc=1`, `last-code=401`, `[[ "$output" != *"attempt"* ]]`, elapsed < 1 s |
| TC-3 | 503 only, `MAX=3` | exhausts budget | `rc=2`, `last-code=503`, "still failing after 3 attempts", elapsed sane |
| TC-4 | `UAT_SEED_DIRECTUS_MOCK=1` | short-circuits (no curl) | `rc=0`, `last-code=200`, elapsed < 1 s, stub never receives a request |

All 4 green. Sibling `scripts/tests/uat-seed.bats` (7 tests) — no
regression.

### Bug forensics (worth noting for future agents)

The original TC-1 assertion `[[ "$output" == *"attempt 1/5"* ]]`
failed because of a probe/FIFO interaction:

1. `start_stub "$port" "503,200"` polls readiness by sending
   `curl ... /_probe`.
2. The probe request hit the stub's `_respond` handler, which
   incremented `Handler._idx[0]` BEFORE checking `self.path` — so
   the probe silently consumed `codes[0]=503`.
3. The test's actual call therefore got `codes[1]=200` immediately.
   No retry → no warn line → empty `$output` → substring assertion
   failed.

Fix in `fixtures/tiny_http_stub.py`: move the probe early-return
to the very TOP of `_respond`, before the FIFO increment. The
probe is now a non-consuming endpoint that still writes the log
line so the poll loop's `[[ -s "$log" ]]` readiness check works.
TC-1's elapsed window widened from `[3, 6]` to `[4, 12]` to absorb
Windows + curl reconnection overhead (`~7.3 s` end-to-end observed
in `tiny_http_stub_18801.log` for `/probe` → `/foo` 503 → `/foo` 200).

### Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | `pnpm uat:seed` succeeds in one pass | ✅ Helper integrated; live seed awaiting post-merge rerun |
| 2 | Retry count is logged | ✅ `warn "Directus 503 attempt ${i}/${max} for ${method} ${path} — backing off ${delay}s"` to stderr |
| 3 | bats test `uat-seed-retries.bats` mocks 503-then-200 and asserts success | ✅ 4 tests, 0 failures |

### Files changed

- **New:** `scripts/tests/directus-retry-helper.bash` (144 lines)
- **New:** `scripts/tests/fixtures/tiny_http_stub.py` (122 lines)
- **New:** `scripts/tests/uat-seed-retries.bats` (219 lines)
- **Modified:** `infrastructure/directus/bootstrap.sh` (+192 / -69)
- **Modified:** `infrastructure/.env.example` (+11, documents new tunables)