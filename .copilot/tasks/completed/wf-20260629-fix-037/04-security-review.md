# Step 5 — Security Review

**Workflow:** wf-20260629-fix-037
**Issue:** ISS-UAT-013-5
**Agent:** SecurityReviewer
**Date:** 2026-06-29

---

## Files reviewed

| File | Status | Lines | Notes |
|---|---|---|---|
| `scripts/tests/directus-retry-helper.bash` | NEW | 144 | Source-able retry wrapper |
| `infrastructure/directus/bootstrap.sh` | MODIFIED | 4961 | 13 mutating sites rewrapped through helper |
| `infrastructure/.env.example` | MODIFIED | +11 | Tunables, default values commented |

## Scope

Bash-only fix absorbing Directus 2024.x "Under pressure" 503s emitted during tight-loop bootstrap. No DB schema, no TypeScript/Astro/NestJS, no Playwright surface. Issue classified `minor / uat / seed` — non-production seed-time reliability.

## Check Results (per Orchestrator-specified list)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Tenant isolation / auth | N/A bash | Helper never references `countryCode`. All requests still use `${H_AUTH}` bearer token (bootstrap.sh:61). Routes unchanged. |
| 2 | Bearer-token handling | **PASS** | `url_path_of()` strips scheme + host and stops at `?`, returning only `/<path>`. Log line includes only `code`, `method`, `i`, `max`, `delay`, path-only URL — never `Authorization` header. Sentinel file paths are hard-coded. |
| 3 | Retry-storm amplification | **PASS** | One bounded `for i in $(seq 1 "$max")`. No `while true`. `max` defaults to 5; cap 4→8→16→32→60. Worst-case elapsed ≈ 120s per request. |
| 4 | Auth-failure amplification | **PASS** | `_directus_is_retryable()` tests membership against `RETRYABLE_HTTP_CODES="503 429"`. 401/403/400/404/409/422 all return 1 immediately, no sleep. Smoke test confirms `elapsed=0s` on 401. |
| 5 | `eval` / dynamic dispatch | **PASS** | Zero `eval`, zero `bash -c`, zero `source <(…)`. Static `source "${REPO_ROOT}/..."` only. Caller passes curl args via `"$@"` (properly quoted). |
| 6 | Path traversal / arbitrary file write | **PASS** | Two sentinel files, both hard-coded constants: `DIRECTUS_LAST_CODE_FILE`, `DIRECTUS_RETRY_RESP_FILE`. Neither derived from caller input. |
| 7 | Secrets in logs | **PASS** | Log line: `warn "Directus ${code} attempt ${i}/${max} for ${method} $(url_path_of "$url") — backing off ${delay}s"`. All interpolated values are HTTP code, numbers, verb, and path-only URL. **Query strings are stripped by `url_path_of`** — a future caller passing `?access_token=…` would log only `/path`, not the token. |
| 8 | TOCTOU on /tmp files | **PASS (with comment)** | `/tmp/directus-last-code` and `/tmp/directus-retry-resp` are shared. Helper documented as seed-only one-shot bootstrap. Two parallel runs would race these files. Not exploitable. Acceptable for seed scope. |
| 9 | SSRF / arbitrary URL fetch | **PASS** | URL arg is always `${create_url}` / `${DIRECTUS_URL}/...`, always composed from `${DIRECTUS_URL}` (operator-controlled env). Never from DB or user input. |
| 10 | Error-message info disclosure | **PASS** | Failure format prints `✗ ${kind} HTTP ${code}` + 200-byte body preview — identical to the pre-existing `ensure()` format. The 200-byte cap matches pre-change behavior. |

## Findings

### ⚠ MAJOR Findings
None.

### ⚠ MINOR Findings
None.

### ℹ INFO Findings

1. **`set -u` only, not `set -euo pipefail`** — helper uses `set -u` rather than full strict mode. Acceptable: every helper failure returns explicit `1` or `2`; callers wrap in `if directus_request_with_retry … ; then … else … fi`. Helper intentionally avoids `set -e` because `[[ "$code" =~ ^2 ]]` and early returns would otherwise need explicit error-suppression. Documented as non-blocking comment for future maintainers.

2. **TOCTOU on shared `/tmp` sentinel files** — helper writes to fixed path. Two concurrent `bootstrap.sh` runs would race. Helper documented as seed-only one-shot; race is bounded to /tmp on seed host, not exploitable. Consider `mktemp` + pass-file-path-as-arg in a future enhancement if multi-tenant seed isolation becomes a requirement.

3. **Bearer-token lifetime across retries** — if `DIRECTUS_TOKEN` expires mid-loop, every retry returns 401, helper fails-fast on first 401. No amplification. Documented in `03-code-summary.md` Known Limitations §3. Keep eye on `DIRECTUS_ADMIN_TOKEN` rotation cadence during long seed runs.

4. **`.env.example` token literal still present** — `infrastructure/.env.example` lines 41–43 contain `DIRECTUS_ADMIN_TOKEN=uat-directus-static-admin-token-32c`. Pre-existing, not introduced by this PR. Out of scope; flagging for future hygiene issue.

## Verdict

| File | Verdict |
|---|---|
| `scripts/tests/directus-retry-helper.bash` | **pass** — bounded retries, fail-fast on auth, no secrets logged, no path traversal, no eval |
| `infrastructure/directus/bootstrap.sh` | **pass** — 13 mutating sites consistently routed through helper; existence-check GETs left bare per design; `set -euo pipefail` preserved at script level |
| `infrastructure/.env.example` | **pass** — appended tunables are commented defaults; no new secrets, no new exposure surface |

**Overall: pass.** No BLOCKER or MAJOR findings. CodeDeveloper may proceed to Step 6 (TestStrategy).

## Invariant Checklist

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1 Tenant isolation | No | N/A | bash — no query layer |
| INV-2 Secrets by reference | Yes | **PASS** | `grep` for token/secret/password/apiKey/Bearer in helper: zero hits. `DIRECTUS_TOKEN` referenced only in bootstrap.sh:61, pre-existing. |
| INV-3 Auth at controller level | No | N/A | bash — no controllers |
| INV-4 Validation at boundaries | Yes | **PASS** | `[[ -n "$method" ]]` and `[[ -n "$url" ]]` at function entry |
| INV-5 No cross-schema queries | No | N/A | bash — no SQL |
| INV-6 Rate limiting | No | N/A | seed-only script |
| INV-7 CSRF protection | No | N/A | bearer-token REST, not browser-initiated |
| INV-8 No `dangerouslySetInnerHTML` | No | N/A | bash |
| INV-9 No N+1 queries | No | N/A | bash — no queries |
| INV-10 Drizzle parameterization | No | N/A | bash — no SQL |
| INV-11 HttpOnly tokens (web) | No | N/A | bash |

---

## Gate Result

gate_result:
  status: passed
  summary: "Bash-only retry helper reviewed for ISS-UAT-013-5. Retry budget bounded (max=5, base=4s, capped at 60s); retryable codes strictly 503/429; 401/403/4xx fail-fast (no sleep); helper logs HTTP code + path-only URL (query string stripped by url_path_of) and never the Authorization header or response body; no eval, no bash -c, no dynamic source; sentinel files hard-coded to /tmp; URL arg always operator-controlled via ${DIRECTUS_URL}; set -u on the helper is intentional since callers wrap in if/else; .env.example adds commented tunables only. 13 mutating call sites in bootstrap.sh consistently routed, existence-check GETs left bare per design. No MAJOR or BLOCKER findings; 4 INFO notes flagged."
  findings:
    - "INFO: scripts/tests/directus-retry-helper.bash uses 'set -u' rather than 'set -euo pipefail' — intentional (helper relies on explicit return codes, not set -e propagation); document in PR description for future maintainers."
    - "INFO: scripts/tests/directus-retry-helper.bash two hard-coded sentinel files in /tmp — acceptable for seed-time one-shot usage; flag for future mktemp/arg-passed upgrade if concurrent seed isolation is needed."
    - "INFO: bearer-token mid-loop expiry uniformly 401s and fails-fast (helper check #4); behavior is correct and documented in 03-code-summary Known Limitations."
    - "INFO: infrastructure/.env.example pre-existing DIRECTUS_ADMIN_TOKEN literal — out of scope for this PR, suggest a follow-up hygiene issue."