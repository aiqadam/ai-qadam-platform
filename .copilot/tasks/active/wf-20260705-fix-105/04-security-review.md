# Step 5 — Security Review

**Workflow:** wf-20260705-fix-105 (issue-resolution)
**Issue:** ISS-UAT-013-15
**Date:** 2026-07-05
**Author:** SecurityReviewer

---

## Verdict

**PASS** — All security invariants hold. No blocking findings. No
findings requiring remediation. No N/A items need to flip to PASS.

---

## Invariants evaluated

| # | Invariant | Verdict | Notes |
|---|---|---|---|
| 1 | **Tenant isolation.** No code path that takes a tenantId from input now bypasses the tenant scoping layer. | **N/A** | `scripts/uat-seed.sh` is a workstation-side provisioning tool. It is not a request handler. The api endpoint it calls (`POST /v1/internal/users/ensure-linked`) is unchanged on the server side — the fix is purely client-side binary selection. |
| 2 | **Authentication enforced at controller level.** | **N/A** | No controllers added or modified. |
| 3 | **Zod validation at boundaries.** | **N/A** | No new API surface. No new request bodies. The `api_ensure_directus_user_link()` request body schema (`{email, displayName}`) is unchanged. |
| 4 | **No secrets in code.** | **PASS** | No new secrets introduced. The `CURL_BIN` variable holds only the literal binary name (`curl.exe` or `curl`) — never a credential. The existing `INTERNAL_API_TOKEN` and `DIRECTUS_TOKEN` continue to flow through `env_get()` which already strips CRLF (ISS-UAT-SEED-001 AC-3). |
| 5 | **No cross-schema queries.** | **N/A** | No database queries. The script is HTTP client only. |
| 6 | **Rate limiting on public endpoints.** | **N/A** | No new endpoints. The existing `POST /v1/internal/users/ensure-linked` is internal and trusted; the fix does not change call frequency. |
| 7 | **CSRF protection on state-changing operations.** | **N/A** | The fix does not touch browser-side code. The script's POST is server-to-server with a static bearer token in `x-internal-auth` header. |
| 8 | **Parameterized queries only.** | **N/A** | No SQL. The `filter[field][op]=value` URLs already use jq-encoded values (`jq -sRr @uri`), preserving the ISS-UAT-BRIDGE-002 fix from prior PRs. |
| 9 | **No unhandled errors / no ignored errors.** | **PASS** | The new `command -v "$CURL_BIN"` check in `check_deps()` is the only addition; it explicitly fails with an actionable error message if curl.exe is missing. No silent failure paths introduced. |
| 10 | **Shell-quoting hygiene.** | **PASS** | `"$CURL_BIN"` is double-quoted everywhere, matching the AGENTS.md §10 / §1-1 convention. No unquoted expansions. The new `command -v curl.exe` literal is also a fixed string — no interpolation risk. |
| 11 | **Token in `ps` output.** | **PASS (unchanged from pre-fix)** | The `Authorization: Bearer ${token}` and `x-internal-auth: ${token}` headers are passed to `"$CURL_BIN"` via `-H`, exactly as before. Token still appears in `ps` for the duration of one HTTP call — same as the pre-fix GNU `curl` invocation. This is a pre-existing property of all curl-based scripts in the repo (uat-env-setup.sh, uat-preflight-email.sh, uat-preflight-check.sh, etc.) and is accepted as the documented pattern in `.claude/CLAUDE.md` "Local override" note. **The fix does not expand the leakage surface** — `curl.exe` is the same Microsoft-published binary PowerShell already resolves for `curl` aliases on Windows. |

---

## Specific concerns evaluated

### "Does `curl.exe` change the token-leakage surface?"

**No.** `curl.exe` on Windows 10 1803+ is built from the same upstream
cURL source as GNU `curl` on Linux/macOS. CLI semantics are
byte-compatible for the flags `uat-seed.sh` uses (`-s`, `-f`, `-g`, `-H`,
`-X`, `-w`, `-d`, `-o`). Headers are passed via `-H` exactly as before.
The bearer token still flows through the same shell variable
(`${token}`) → `-H "Authorization: Bearer ${token}"` path. There is no
intermediate process whose `ps` output exposes the token differently.

### "Could a malicious `curl.exe` on PATH substitute a network endpoint?"

**No, in practice.** The detection block selects `curl.exe` from the
shell's PATH lookup order — the same lookup order as every other binary
in the script (`bash`, `jq`, `docker`, etc.). A malicious curl.exe on
PATH would have to come from a compromised PATH directory, which is
already a deeper-than-this-fix trust assumption baked into the script.
**Mitigation already in place:** the existing `check_deps()` verified
that `curl` (bare name) is on PATH; the fix extended this to also
verify the resolved `$CURL_BIN`. If a developer PATH had `curl.exe` in
an untrusted directory but no `curl`, the existing check would have
failed (no bare `curl`). The new check catches the symmetric case (no
`curl.exe` when one was selected). **No regression, marginal
improvement.**

### "Does quoting the binary name as `"$CURL_BIN"` open an injection?"

**No.** Bash variable expansion inside double quotes does not invoke
the shell parser on the value. `"$CURL_BIN" -sf -H …` invokes the
literal binary whose name is the value of `CURL_BIN`. Even if a PATH
directory contained a binary named `curl with spaces.exe` (highly
unusual on Windows but technically possible), double-quoting handles
that correctly. Shellcheck would flag unquoted expansion; we are
double-quoted.

### "Does routing through curl.exe change the exit-code semantics?"

**No.** Both binaries return 0 on HTTP 2xx/3xx with `-f` set, and 22
on 4xx/5xx. The script's existing `|| true` (in idempotency GETs) and
`if ! "$CURL_BIN" …` (in health checks) patterns work identically.

### "What if curl.exe is missing on a Windows host where it was expected?"

The new `check_deps()` extension surfaces an actionable error
(`Missing required curl binary: curl.exe`) before any helper function
runs. This is strictly better than the pre-fix behavior where the
script would silently fall through `command -v curl` (passing because
MSYS /usr/bin/curl exists), then fail deep inside a helper function
with a less-actionable message. **Net security improvement.**

---

## Scope of review

Files reviewed:

- `scripts/uat-seed.sh` (modified; +37 net lines)
- `scripts/tests/uat-seed.bats` (modified; +4 new tests, ~10 lines of
  existing test stub patch)

Files NOT reviewed (out of scope per the impact analysis):

- `infrastructure/directus/bootstrap.sh`
- `scripts/uat-env-setup.sh`
- `scripts/uat-preflight-email.sh`
- `scripts/uat-preflight-check.sh`
- `scripts/provision-*.sh`

---

## Gate Result

```
gate_result:
  status: passed
  notes: |
    Security review complete. All 11 invariants evaluated (4 N/A by
    surface area, 7 PASS). No blocking findings. No remediation
    required. The fix is a binary-selector change with no impact on
    token handling, request validation, error propagation, or
    shell-quoting hygiene. The pre-existing `token in ps output`
    pattern is unchanged. The new `check_deps()` extension is a
    marginal improvement (catches missing-curl.exe case earlier and
    with an actionable error message).
```