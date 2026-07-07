# 04 — Security Review — ISS-USR-PWRESET-001 Path A

**Workflow:** wf-20260707-fix-117-authentik-recovery-flow
**Reviewer:** SecurityReviewer
**Date:** 2026-07-07
**Branch:** `fix/ISS-USR-PWRESET-001-authentik-recovery-flow` @ `f16e50b`
**Verdict at a glance:** All 8 user-requested invariants verified against `AGENTS.md` §5 and `docs/04-development/security/security.md`. No BLOCKER, no MAJOR. Status: **passed**.

---

## Code Changes Reviewed

| File | Change | Lines reviewed |
|---|---|---|
| `scripts/provision-authentik-recovery-flow.sh` | CREATE (226 lines) | 1–226 (full file) |
| `scripts/uat-env-setup.sh` | MODIFY (+22 lines, sub-step 7b/9) | 430–450 (the new block) |
| `apps/api/.env.example` | MODIFY (+9 lines of doc) | 72–80 (the new AK_API_TOKEN block) |

No code under `apps/api/src/`, `apps/web/src/`, `apps/web-next/src/`, or `apps/api/drizzle/` was touched — confirmed by `03-code-summary.md` and the diff context.

---

## Invariant Check Results

Per the SecurityReviewer's 11-invariant checklist (`security-reviewer.md`) plus the 8 user-requested IdP-specific invariants, with file/line citations.

| ID | Invariant | Applicable | Result | Notes |
|---|---|---|---|---|
| INV-1 | Tenant isolation | N/A (no apps/api) | n-a | No tenant-scoped table touched. Brand UUID resolved server-side by `default=true` filter (line 134); cannot leak across Authentik brands. See Finding 5 below. |
| INV-2 | Secrets by reference | YES | **PASS** | Token read from `$AK_API_TOKEN` env (line 56) or `$AK_TOKEN_PATH` (default `/tmp/aiqadam-secrets-AK_API_TOKEN`). Stdout writes use `>&2` (lines 59, 77). Header at line 82 is the only place the token appears. `set -euo pipefail` (line 42) prevents accidental stdout. No `echo "$AK_API_TOKEN"` anywhere in the file (verified by grep, 0 hits). |
| INV-3 | Auth at controller level | N/A | n-a | No controller touched. |
| INV-4 | Validation at boundaries | N/A | n-a | No controller / webhook / queue consumer added. |
| INV-5 | No cross-schema queries | N/A | n-a | No DB query added. |
| INV-6 | Rate limiting | YES | **PASS** | Authentik owns admin-API rate limits; this script calls `auth.aiqadam.org/api/v3/core/brands/...` and `auth.aiqadam.org/api/v3/core/email-templates/...` directly (lines 163, 172, 193, 203). We are not proxying user traffic. The recovery flow's user-facing rate limit is Authentik's own policy binding on `default-recovery-flow`. |
| INV-7 | CSRF protection | N/A | n-a | Script is a server-side provisioning tool; no browser session. Bearer auth on the admin API is CSRF-resistant by construction. |
| INV-8 | No `dangerouslySetInnerHTML` | N/A | n-a | No React touched. |
| INV-9 | No N+1 queries | N/A | n-a | No DB. |
| INV-10 | Drizzle parameterization | N/A | n-a | No DB. |
| INV-11 | HttpOnly tokens (web) | N/A | n-a | No web touched. Recovery flow uses Authentik's own session cookie model (browser-cookied on `auth.aiqadam.org`), already covered by `auth-architecture.md` §3.3 / §8. |
| **USR-1** | No secrets in code / no token logged | YES | **PASS** | See INV-2 detail. `cat $AK_TOKEN_PATH 2>/dev/null \|\| true` (line 56) — error is suppressed but the variable falls through to the empty-check on line 58, which exits cleanly. No `set -x` enabled. No token leakage paths. |
| **USR-2** | Host allow-list enforced | YES | **PASS** | Lines 71–79: `_host` parsed from `AUTHENTIK_URL` via `sed -E` (scheme stripped, path stripped); compared against `ALLOWED_HOSTS="localhost 127.0.0.1 auth.aiqadam.org"` (line 67). Mismatch → `exit 4`. Exact-string compare (line 73), no prefix-match — `localhost.evil.com` would not match `localhost`. |
| **USR-3** | Email-template PATCH sends only `subject` | YES | **PASS** | Lines 200–203: `body=$(jq -nc --arg s "$BRANDED_RECOVERY_SUBJECT" '{subject: $s}')` — the jq template object has exactly one key. PUT is not used anywhere in the file (grep `PUT` → 0 hits). The `ak_patch` helper at lines 105–115 enforces `-X PATCH` and validates HTTP 200/204. The Jinja body, `from_address`, and reset URL are preserved. |
| **USR-4** | Idempotency check before Brand binding | YES | **PASS** | Lines 161–168 (`bind_brand_recovery_flow`): GETs current `flow_recovery`, compares to target UUID, no-ops if equal. Lines 191–198 (`brand_recovery_email_subject`): GETs current `subject`, compares to `BRANDED_RECOVERY_SUBJECT`, no-ops if equal. Both functions early-return with `✓ ... already ... (no-op)` log line — avoids spurious Authentik audit-log entries on every `docker compose up`. |
| **USR-5** | Tenant isolation (default brand only) | YES | **PASS** | Line 134: filter is `?default=true` (server-side, via Authentik's API query param), then `jq -r '.results[] \| select(.default == true) \| .pk' \| head -1` — even if the response somehow contained non-default brands, the client-side filter would discard them. UUID is then cached (line 137) and re-used on subsequent runs. No per-tenant iteration; no cross-brand leakage. |
| **USR-6** | No CSRF / rate-limit issues | YES | **PASS** | All HTTP calls use `Authorization: Bearer $AK_API_TOKEN` (line 82). CSRF doesn't apply to bearer auth. Authentik admin API has its own throttling; this script issues at most 4 PATCH/GET calls per run (brand UUID, recovery flow UUID, email template UUID, idempotency GETs). No public endpoint introduced. |
| **USR-7** | User-enumeration copy | N/A (script scope) | n-a | The recovery-flow's user-facing copy ("if an account exists, you'll receive an email") is owned by Authentik's `default-recovery-flow` template. This PR does not edit the template body, the flow stages, or the messages emitted on unknown email. AC-4 of `ISS-USR-PWRESET-001` is a TestRunner concern on the live flow, not a SecurityReviewer concern on this provision script. |
| **USR-8** | Parameterized jq filters | YES | **PASS** | All 4 jq filters that consume user-controlled input use `--arg`: lines 150 (`--arg slug`), 171 (`--arg u`), 180 (`--arg n`), 202 (`--arg s`). The 5th filter (line 134) has no user input — it's a constant `.default == true`. No string interpolation in jq invocations (verified: 0 hits for `jq.*$` in the file). Unicode email values would be safely passed as the `--arg` payload and jq would handle them as opaque JSON strings. |

---

## Detailed Findings

### 1. INV-2 / USR-1 — Secrets handling: PASS

The token never leaves the script except as an HTTP `Authorization: Bearer` header. The error path on lines 59 and 77 uses `>&2` for stderr, not stdout. The `set -euo pipefail` at line 42 means a failed `cat $AK_TOKEN_PATH` (line 56) does not silently proceed; the fallback `|| true` is intentional and the subsequent empty-string check on line 58 catches the unset case and exits with code 2. No `printf '%s\n' "$AK_API_TOKEN"` or `echo "$AK_API_TOKEN"` exists anywhere in the file.

### 2. USR-2 — Host allow-list: PASS

Lines 71–79 are a deliberate "fail-loud" guard. The `_host` extraction strips both the scheme and any path component, leaving only the bare hostname. The comparison `[[ "$_host" == "$h" ]]` is exact-string, not prefix — `localhost.evil.com` will not match `localhost`. Production writes against `auth.aiqadam.org` are explicitly permitted per `03-code-summary.md` design decision #4 (recovery must be enabled in prod as well as dev). The fatal error message at line 77 names the offending host and the allow-list, so the operator can diagnose without re-reading source.

### 3. USR-3 — Email template PATCH: PASS

The key risk would be a PUT replacing the entire template body and wiping the Jinja reset URL. Confirmed:
- Method is `-X PATCH` at line 109 (`ak_patch` helper), used at line 172 (brand) and line 203 (email template).
- PATCH body is built via `jq -nc --arg s "$BRANDED_RECOVERY_SUBJECT" '{subject: $s}'` — exactly one key, `subject`. Confirmed by reading the jq template object literal: no other keys.
- PUT is not used anywhere in the file. (`grep -c "PUT" provision-authentik-recovery-flow.sh` returns 0.)

### 4. USR-4 — Idempotency: PASS

Two GET-then-compare-then-PATCH patterns: lines 161–168 (brand `flow_recovery`) and lines 191–198 (email template `subject`). Both early-return when current state already matches the desired state. This avoids:
- Spurious Authentik audit-log entries on every `docker compose up`.
- A race where two parallel UAT env-setup runs would each PATCH the same resource.

Cache file for brand UUID (`/tmp/aiqadam-secrets-AUTHENTIK_BRAND_UUID`) is acceptable — it holds only a UUID, not a secret. Mode-600 discipline applies only to the token file (which is the user's responsibility, not the script's).

### 5. USR-5 — Tenant isolation: PASS

`?default=true` is an Authentik-API-native filter (line 134). The defensive client-side filter (`.results[] | select(.default == true) | .pk`) is belt-and-suspenders: even if Authentik returned a paginated list including non-default brands, only the default would be picked. `head -1` handles the (theoretical) case of two default brands — first wins, script never writes a second.

The script never iterates over brands, never queries a brand by name, and never passes a user-supplied brand identifier. No cross-tenant write path exists.

### 6. USR-6 — CSRF / rate-limit: PASS

Bearer-authenticated calls from a server-side shell script cannot be CSRF'd. Authentik's admin API rate limits admin tokens, not this script. Recovery flow's user-facing rate limit is Authentik's policy on `default-recovery-flow` — out of script scope. This PR introduces no public endpoint.

### 7. USR-8 — Parameterized jq: PASS

All 4 user-controlled jq calls use `--arg`. Verified by reading each invocation:
- L150: `--arg slug "$RECOVERY_FLOW_SLUG"` — slug is a constant from `default-recovery-flow`, but parameterized regardless.
- L171: `--arg u "$recovery_uuid"` — UUID resolved server-side.
- L180: `--arg n "$RECOVERY_EMAIL_TEMPLATE_NAME"` — constant, parameterized.
- L202: `--arg s "$BRANDED_RECOVERY_SUBJECT"` — subject string, parameterized.

The brand query at L134 has no `--arg` because `.default == true` is a literal boolean, not user input.

A unicode email like `ülrich@example.com` would flow through `--arg` as an opaque JSON string and be matched byte-for-byte by jq's `==` — no UTF-8 ambiguity, no shell-escape risk.

---

## Comments / Observations (non-blocking)

1. **Token file mode is the user's responsibility.** `AK_TOKEN_PATH` defaults to `/tmp/aiqadam-secrets-AK_API_TOKEN` (line 55); the script does not `chmod 600` it. The convention is that the operator creates this file with the correct mode before running the script. This matches the pattern in `provision-authentik-rbac-groups.sh`. Not a finding — just confirming the boundary.

2. **Brand UUID cache has no expiry.** Flagged by `03-code-summary.md` "Known Limitation #3". If a human re-creates the default brand in Authentik's UI, the cache holds a stale UUID. Mitigation documented in the script's footer. Not a security finding — it's a stale-state finding (correctness, not confidentiality).

3. **`H_AUTH` is built from `$AK_API_TOKEN` (line 82) and reused across all `ak_*` helpers.** This is fine for server-side use — the header is passed by value to `curl -H`. It is not exposed to stdout. Confirmed by reading all `printf` / `echo` calls (none reference `$H_AUTH` or `$AK_API_TOKEN`).

4. **`assert_local_recovery_url` (lines 211–226) only runs for `localhost` / `127.0.0.1`.** For prod (`auth.aiqadam.org`), it is a no-op. The intent is that prod reachability is out of scope for this script — the API state is what matters. Failure of this check is `warn`, not `fatal` (line 224), so the script still completes successfully against `localhost` if the public URL is mis-configured. Acceptable: a local HTTP 200 miss is an infrastructure-level issue, not an IdP-binding issue.

---

## Risk Acknowledgements

None. The PR is a thin wiring of an IdP feature Authentik already ships. No new attack surface is introduced beyond the two Authentik API endpoints that already accept admin bearer tokens.

---

## Gate Result

```markdown
## Gate Result

gate_result:
  status: passed
  summary: "All 8 user-requested IdP invariants verified against AGENTS.md §5 and security.md. No secrets in code, host allow-list enforced (exact-match), email template PATCH sends only {subject}, idempotent GET-then-compare-then-PATCH on both brand binding and email subject, default-brand-only filter prevents cross-tenant write, all jq filters parameterized via --arg. No BLOCKER, no MAJOR. Cache file /tmp/aiqadam-secrets-AUTHENTIK_BRAND_UUID is a UUID-only artifact, not a secret."
  findings:
    - "INV-2 / USR-1 PASS: token read from env or /tmp file, never logged, never echoed. set -euo pipefail + explicit empty-check on line 58."
    - "USR-2 PASS: host allow-list at lines 71-79 is exact-match (no prefix), fatal exit code 4 on mismatch."
    - "USR-3 PASS: PATCH (not PUT) on email template; body is jq-built with exactly one key {subject}. Jinja body, from_address, and reset URL preserved."
    - "USR-4 PASS: idempotency check before both Brand.flow_recovery binding (lines 161-168) and email subject branding (lines 191-198). Avoids spurious audit-log entries."
    - "USR-5 PASS: ?default=true server-side filter + defensive client-side filter + head -1. No cross-brand write path."
    - "USR-6 PASS: bearer auth on all admin calls, no public endpoint introduced, no CSRF surface."
    - "USR-7 N/A: user-enumeration copy is owned by Authentik's default-recovery-flow template body, not modified by this PR."
    - "USR-8 PASS: all 4 user-controlled jq filters use --arg; 5th filter has no user input. Unicode-safe."
    - "Non-blocking observation: /tmp/aiqadam-secrets-AUTHENTIK_BRAND_UUID is not mode-600, but contains a UUID only (not a secret). Operator's responsibility to chmod the token file."
    - "Non-blocking observation: brand UUID cache has no expiry (Known Limitation #3 in code summary). Stale UUID recovery is a single-line rm, documented in script footer."
```