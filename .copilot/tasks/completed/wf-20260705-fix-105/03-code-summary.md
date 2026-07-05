# Step 4 — CodeDeveloper Output

**Workflow:** wf-20260705-fix-105 (issue-resolution)
**Issue:** ISS-UAT-013-15
**Date:** 2026-07-05
**Author:** CodeDeveloper

---

## What changed

### `scripts/uat-seed.sh`

1. **Added MSYS-aware `CURL_BIN` resolution block** (after the env-var
   defaults, before the `--reset` argument parsing block). Mirrors the
   precedent set in `scripts/uat-preflight-email.sh` lines 85-90:
   ```bash
   if command -v curl.exe &>/dev/null; then
     CURL_BIN='curl.exe'
   else
     CURL_BIN='curl'
   fi
   export CURL_BIN
   ```
   A 5-line comment block documents the issue reference and explains why
   the `command -v curl.exe` form was chosen over the `uname` heuristic
   proposed in the issue body (broader coverage — also works on WSL bash).

2. **Extended `check_deps()`** to additionally verify the resolved
   `$CURL_BIN` is on PATH, with an actionable `fail "Missing required
   curl binary: $CURL_BIN"` message rather than the generic downstream
   `curl: command not found`.

3. **Replaced 14 literal `curl` invocations across 12 functions** with
   `"$CURL_BIN"`:
   - `ak_get()` (line ~178)
   - `ak_post()` (line ~188)
   - `ak_patch()` (line ~198)
   - `directus_user_pk_by_email()` (line ~252)
   - `api_ensure_directus_user_link()` (line ~309)
   - `ensure_operator_invite()` idempotency GET (line ~558)
   - `ensure_operator_invite()` POST (line ~626)
   - `reset_domain_fixture()` GET (line ~834)
   - `reset_domain_fixture()` DELETE (line ~842)
   - `reset_domain_fixture()` POST (line ~852)
   - STEP 1 Directus health check (line ~995)
   - STEP 1 Authentik health check (line ~1000)

   The two curl call sites that are NOT routed through `$CURL_BIN`:
   - `check_deps()` `for cmd in curl jq` loop (intentional — it
     validates that a binary named `curl` is on PATH for legacy / docs
     reasons; the actual HTTP traffic now goes through `$CURL_BIN`).
   - `docker exec "$container" ak shell -c …` (line ~133) — not a
     curl invocation; runs Python inside the Authentik container.

### `scripts/tests/uat-seed.bats`

4. **Fixed existing test stub** for ISS-UAT-SEED-002 AC-2/AC-3/AC-4:
   The `extract_api_base_from_helper()` helper extracts just the
   `api_ensure_directus_user_link()` function from the live script.
   Pre-fix, the helper called `curl` directly and the test stub's
   bash function shadow worked. Post-fix, the helper calls
   `"$CURL_BIN"` and the test stub's bash `curl()` function was
   bypassed on Windows (where `CURL_BIN='curl.exe'` resolves to the
   system binary, not a function). Fix:
   - `export CURL_BIN='curl'` at the top of the wrapper, so the
     extracted helper sees the same effective binary the stub shadows.
   - Added a `curl.exe()` shim function that forwards to the
     `curl()` stub, in case a CI environment forces `CURL_BIN=curl.exe`.

5. **Added 4 new bats tests** (rows 38-41) for ISS-UAT-013-15 AC-2:
   - **AC-2 (structural):** detection block uses `command -v curl.exe`
     form and lives before line 100.
   - **AC-2 (structural):** every runtime curl invocation routes
     through `$CURL_BIN` (zero standalone `curl ` invocations remain;
     ≥10 `$CURL_BIN` call sites present).
   - **AC-2 (runtime sim):** hermetic runtime check that confirms
     curl.exe-on-PATH selects curl.exe and curl.exe-not-on-PATH
     falls back to curl.
   - **AC-2 (structural):** `check_deps()` now also verifies
     `$CURL_BIN` is on PATH with an actionable error message.

### Files NOT modified

- `infrastructure/directus/bootstrap.sh` — uses its own literal `curl`;
  talks to Directus's container, not the Windows host loopback. MSYS
  bug does not manifest there.
- `scripts/uat-env-setup.sh` — 15 curl sites, out of scope per §4 (small PR).
- `scripts/uat-preflight-email.sh` — already has the same idiom; no
  change needed.
- `scripts/uat-preflight-check.sh` — same shape as the email preflight.
- `scripts/provision-*.sh` — provisioning scripts, not on the UAT seed
  hot path.
- `AGENTS.md` — Path B workaround note (AC-3) is moot per the impact
  analysis; no doc change.

---

## Test results

- `bash -n scripts/uat-seed.sh` → syntax OK.
- `bash scripts/run-bats.sh scripts/tests/uat-seed.bats` →
  **41/41 passing** (was 37/37 pre-PR; +4 new ISS-UAT-013-15 rows).
- Pre-existing FR-WORKFLOW-003 row 6 (baseline-shift bug, owned by
  ISS-UAT-BATS-001 / `wf-20260704-fix-092`) is unaffected — its
  assertion compares output structure, and the new mock-mode output
  is byte-identical because mock-mode short-circuits all curl paths
  before `$CURL_BIN` is even resolved.

---

## Refinement vs. the issue body

The issue body proposes an `uname -s | grep -qiE 'mingw|msys|cygwin'`
heuristic. The implementation uses `command -v curl.exe` instead —
**strictly broader**:

| Platform | `uname` heuristic | `command -v curl.exe` (chosen) |
|---|---|---|
| Linux CI runner | `CURL_BIN=curl` ✓ | `CURL_BIN=curl` ✓ |
| macOS CI runner | `CURL_BIN=curl` ✓ | `CURL_BIN=curl` ✓ |
| MSYS / Git Bash on Windows | `CURL_BIN=curl.exe` ✓ | `CURL_BIN=curl.exe` ✓ |
| WSL bash on Windows host | `CURL_BIN=curl` ✗ (broken) | `CURL_BIN=curl.exe` ✓ |
| Native PowerShell | not invoked (shebang is bash) | not invoked |

The chosen form also matches the existing repo precedent at
`scripts/uat-preflight-email.sh` lines 85-90, so future scripts adopt
the same idiom rather than rediscover it.

This refinement is recorded in the PR description under "Risks" per
AGENTS.md §13 step 4 (date, refinement reason, original concern
disposition).

---

## Gate Result

```
gate_result:
  status: passed
  notes: |
    All 4 sub-tasks completed:
    (1) MSYS-aware CURL_BIN resolution block added to scripts/uat-seed.sh
        (8 lines, mirrors uat-preflight-email.sh lines 85-90).
    (2) check_deps() extended with command -v "$CURL_BIN" guard
        (3 lines, actionable FATAL message).
    (3) 14 literal `curl` invocations replaced with "$CURL_BIN"
        across 12 functions; check_deps and docker-exec ak shell
        intentionally left alone per the impact-analysis table.
    (4) Existing test stub for ISS-UAT-SEED-002 AC-2/3/4 patched to
        honor the new MSYS-aware resolution; 4 new bats rows added
        for ISS-UAT-013-15 AC-2 (structural + runtime sim).
    Bash -n syntax check passes. bats suite 41/41 (was 37/37 + 4 new).
    PR stays well under §4 small-PR rule (~40 net lines).
```