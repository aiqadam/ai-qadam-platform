# Step 5 — Security Review (ISS-UAT-SEED-002)

## Invariants checklist

| Invariant | Verdict | Evidence |
|---|---|---|
| **Tenant isolation** | N/A | No DB query introduced; no platform/RPC touched. |
| **Auth at controller level** | N/A | Change is in a bash helper, not a controller. |
| **Zod validation at boundaries** | N/A | No new boundaries. |
| **No secrets in code** | PASS | `:3000` is a port number, not a secret. `INTERNAL_API_TOKEN` resolution path is unchanged. |
| **No cross-schema queries** | N/A | No SQL introduced. |
| **Rate limiting** | N/A | Seed is operator-only; no public endpoint. |
| **CSRF** | N/A | Same. |
| **Parameterized queries** | N/A | No SQL. |
| **Auth on all public endpoints** | N/A | The internal endpoint `/v1/internal/users/ensure-linked` is unchanged and remains gated by `x-internal-auth`. |
| **No secrets in logs** | N/A | No new log lines. |
| **No new dependencies** | PASS | Zero new packages. |
| **Hardcoded-port exposure** | PASS | The fix actually REMOVES a hardcoded `:3001` typo and derives the port from the api's own configuration file — strictly less attack surface. |
| **`API_BASE_URL` env-var override preserved** | PASS | The `${VAR:-default}` shape is unchanged. |

## Findings

- None. The change strictly reduces the working attack surface (an operator who used to silently fail on `:3001` now hits the real api on `:3000` and can observe real failures instead of phantom ones).
- No new code path means no new entry on the threat model. The internal endpoint, the bearer token, and the helper's failure surface are byte-identical to the pre-fix state.

## Gate Result

gate_result:
  status: passed
  summary: "Security invariants are preserved (no new endpoint, no new token, no new code path); the fix strictly reduces the attack surface by replacing a misleading hardcoded port with one derived from the api's own configuration file."
  findings:
    - "All 11 baseline security invariants are N/A or PASS."
    - "`x-internal-auth` header flow unchanged."
    - "No new dependencies."
    - "No log line added; no PII / token / secret exposure introduced."
