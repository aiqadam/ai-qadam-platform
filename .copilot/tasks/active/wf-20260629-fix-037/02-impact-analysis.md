# Step 2 — Impact Analysis

**Workflow:** wf-20260629-fix-037
**Issue:** ISS-UAT-013-5
**Agent:** ImpactAnalyzer
**Date:** 2026-06-29

---

## Validated requirement

Directus 503 "Under pressure" load-shedding during tight `infrastructure/directus/bootstrap.sh` loops. Wrap mutating curl calls with bounded exponential back-off, expose tunables via env, add bats coverage.

Reference ID: **ISS-UAT-013-5**.

## Files in scope (must change)

| File | Reason |
|---|---|
| `infrastructure/directus/bootstrap.sh` | Primary surface — wrap every mutating call (POST/PATCH inside `ensure()`, DELETE inside `drop_field()`, plus `seed_country`, `seed_type`, `set_country_profile`) with a single `directus_request_with_retry()` helper. Public surface unchanged. |
| `scripts/uat-seed.sh` | **Read-only.** Orchestrator only `bash`-invokes `bootstrap.sh`. No env coupling to retries. Helper auto-detects `UAT_SEED_DIRECTUS_MOCK=1` and short-circuits, so uat-seed.sh needs no edit. |
| `scripts/tests/uat-seed-retries.bats` (**new**) | Acceptance criterion AC-3. Mocks a 503-then-200 sequence and asserts the helper eventually succeeds. Uses an in-process Python HTTP stub. |
| `scripts/tests/directus-retry-helper.bash` (**new**, source-able) | Extracted helper file containing only the retry function — `source`-d by both `bootstrap.sh` and the bats test (per "extract, don't mock"). |
| `scripts/tests/test_helper.bash` | **No edit** unless a shared `assert_eventually_succeeds` / stub helper benefits the new .bats file. Default: keep bats self-contained. |
| `infrastructure/.env.example` | Add tunables `DIRECTUS_RETRY_MAX=5`, `DIRECTUS_RETRY_BASE_DELAY=4` with comments explaining the 503-load-shedding semantics. |
| `infrastructure/directus/.env` | **Does NOT exist today** (verified via `list_dir`). Do not create one — keep tunables in `infrastructure/.env.example` to match the rest of the infra stack. |
| `.copilot/issues/ISS-UAT-013-5.md` | **Out of scope** for Step 2. Step 9 flips it to `resolved`. No amendment. |

## Risks & blast radius

| Risk | Severity | Mitigation |
|---|---|---|
| Wrapper masks real (non-503) failures by retrying forever | **high** | Only retry on `503` and `429`. Any other code (incl. `4xx` auth, `5xx` other) returns immediately. Max attempts enforced via `for i in $(seq 1 "$DIRECTUS_RETRY_MAX")` — explicit upper bound (AGENTS.md §1.2). |
| Wrapper accidentally retries idempotent GETs in `ensure()` | medium | Do **not** wrap the existence-check GET inside `ensure()`. Only wrap the mutating POST/PATCH inside `ensure()`, and the DELETE inside `drop_field()`. GETs add load when Directus is already pressured. |
| Retry budget loops indefinitely on stuck 503 | medium | Enforce `DIRECTUS_RETRY_MAX` (default 5). After exhaustion → `fail "Directus still failing after ${max} attempts (last code: ${code})"` with `set -euo pipefail` abort. |
| Auth-token expiry: retries all return 401 | medium | Do **not** retry `401` or `403` — those are auth errors, not transient. A 401 must fail-fast (AGENTS.md §5: never log secrets; the helper must not echo the response body). |
| `UAT_SEED_DIRECTUS_MOCK=1` slows bats suite by sleeping | low | Helper checks `UAT_SEED_DIRECTUS_MOCK=1` and bails out without retry. bats stays fast. |
| Bash style violations | medium | Helper must conform: ≤60 lines, no magic numbers (extract `DEFAULT_RETRY_MAX=5`, `DEFAULT_BASE_DELAY=4`, `RETRYABLE_CODES="503 429"` as named constants), explicit loop bound, asserts input. |
| Logging response body leaks secrets | low | Helper logs `code` only, never the body. Same pattern as the existing `ensure()` helper. |
| Public-surface drift breaks `uat-seed.sh` | low | Wrapper goes inside bootstrap.sh; `uat-seed.sh` does not change. |
| Magic-string "503" hard-coded in multiple call sites | low | Use a single named constant `RETRYABLE_HTTP_CODE_UNDER_PRESSURE=503` so future tuning (e.g. add 502/504) is one-line. |

## DB / schema changes

None — bash-only change. **Step 3 entirely skipped.**

## Security implications

- **Bearer-token reuse across retries:** every retry sends the same `Authorization: Bearer ${DIRECTUS_TOKEN}`. If the token expired mid-loop, retries will uniformly 401 and the helper will fail-fast (no retry on 401/403). Safe.
- **Do not log response body.** `DIRECTUS_TOKEN` could be echoed back indirectly (audit fields). The helper must write only the HTTP `code` and the URL path to logs.
- **Bounded retry budget.** `DIRECTUS_RETRY_MAX` is mandatory; without it the helper must default to a constant (5) and the env var is purely a tuning knob.
- **No new external input surface.** The helper only consumes env vars already passed to bootstrap.sh; no new network endpoints, no new auth flows.
- **`set -euo pipefail` preserved.** A failing retry must propagate to the caller; do not swallow errors inside the helper.

## Test strategy sketch (Step 6 details)

Recommended approach: **extract, don't mock**.

1. **New file `scripts/tests/directus-retry-helper.bash`** — defines `directus_request_with_retry()`. Sourced by both `bootstrap.sh` (via `source`) and `scripts/tests/uat-seed-retries.bats`.
2. **New file `scripts/tests/uat-seed-retries.bats`** — three `@test` cases:
   - AC-3.1: stub returns `503` twice then `200`. Assert: wrapper returns 0, saw 2 retry logs. No real HTTP required.
   - AC-3.2: stub returns `401` immediately. Assert: wrapper returns non-zero, **no retry** (single call recorded). Catches the "retry-on-auth-error" bug class.
   - AC-3.3: stub returns `503` N+1 times (one more than `DIRECTUS_RETRY_MAX`). Assert: wrapper returns non-zero with a clear "still failing after 5 attempts" message — proves the retry budget is bounded.
3. **Stub mechanism:** a per-test `tiny_http_stub.py` started in `setup()` on a high port; the `.bats` test rewires `DIRECTUS_URL` to point at it. Teardown kills the stub. This is faster and more deterministic than mocking `curl`.

## Cross-module calls

| Caller | Called | Via |
|---|---|---|
| `infrastructure/directus/bootstrap.sh` | Directus REST | `curl` (now wrapped) |
| `scripts/uat-seed.sh` | `infrastructure/directus/bootstrap.sh` | `bash` (no change) |
| `scripts/run-bats.sh` | new bats tests | (no change) |

## Frontend / Bot / Workers / Shared-Types / API Surface / NestJS Modules

**No changes** to any TypeScript module or Astro surface. This is a pure bash + bats change scoped to infrastructure scripts.

## Test scope

- **Unit (bats):** new `scripts/tests/uat-seed-retries.bats` + extracted helper file `scripts/tests/directus-retry-helper.bash`.
- **Integration (Testcontainers / real Directus):** not required — the bats suite uses a stub HTTP server that reproduces the Directus 503 contract. A full `pnpm uat:seed` end-to-end run on a fresh container is gated by the orchestrator pre-flight in Step 8.
- **E2E (Playwright):** not required — no UI surface changes.

## Acceptance criteria mapping

| AC (from ISS-UAT-013-5) | Covered in |
|---|---|
| AC-1: One-pass completion on fresh Directus | Step 8 orchestrator runtime check (existing) |
| AC-2: Per-collection retry count logged | Helper emits one `warn "Directus 503 attempt ${i}/${max} for <kind> — backing off ${delay}s"` line |
| AC-3: bats test mocks 503-then-200 sequence | New `scripts/tests/uat-seed-retries.bats` |

## Open questions for the user

1. **Tunable location:** `infrastructure/.env.example` is the obvious home. **Confirm.**
2. **Default values:** `DIRECTUS_RETRY_MAX=5`, `DIRECTUS_RETRY_BASE_DELAY=4`. **Confirm.**
3. **Exponential vs linear back-off:** Issue example uses exponential. Recommend exponential. **Confirm.**
4. **Retry on 429 in addition to 503?** Recommend yes (same semantics — transient back-pressure). **Confirm.**

## PR-size forecast

Estimated diff: ~120 lines added across 4 files (bootstrap.sh +20, retry helper ~50, bats ~30, env.example +20). **Well under the 400-line / 5-file cap** (AGENTS.md §4). No split needed.

---

## Gate Result

```markdown
## Gate Result

gate_result:
  status: passed
  summary: "Bash-only fix scoped to infrastructure/directus/bootstrap.sh + new extracted retry helper + new bats test + infrastructure/.env.example tunables; no DB/API/frontend changes; risk profile bounded by explicit retryable-code list and named retry budget constants."
  findings:
    - "infrastructure/directus/.env does NOT exist on disk today (verified via list_dir); tunables MUST land in infrastructure/.env.example instead."
    - "Retry helper should be extracted into a source-able file (recommended name: scripts/tests/directus-retry-helper.bash) so bats can source it without spinning up the full bootstrap.sh. Extract > mock."
    - "Do NOT retry GETs: only wrap the POST/PATCH branches inside ensure() and drop_field(); the existence-check GETs are wasteful under load and must stay unretried."
    - "Do NOT retry 401/403 — those are auth errors, not transient back-pressure. Only 503 and 429 are retryable."
    - "Public surface of bootstrap.sh is preserved; scripts/uat-seed.sh requires no change. UAT_SEED_DIRECTUS_MOCK=1 must short-circuit the helper to keep bats fast."
    - "Bash style: all retry tuning numbers must be named constants; helper must be ≤60 lines; loop must use 'for i in $(seq 1 $max)' — explicit upper bound per AGENTS.md §1.2."
    - "Helper must log HTTP code only, never response body — same security baseline as the existing ensure() helper."
```