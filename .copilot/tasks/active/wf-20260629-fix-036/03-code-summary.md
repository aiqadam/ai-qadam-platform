# Step 3: Code Summary — wf-20260629-fix-036

**Workflow:** wf-20260629-fix-036
**Issue:** ISS-UAT-013-4
**Date:** 2026-06-29
**Agent:** CodeDeveloper

---

## Files Changed

### 1. `scripts/uat-seed.sh` — MODIFIED

**Changes:**

- Header comment: added step 4 description; added `UAT_SEED_DIRECTUS_MOCK=1` to environment guards doc block.
- `FORCE_REGEN` assignment: added `UAT_SEED_DIRECTUS_MOCK="${UAT_SEED_DIRECTUS_MOCK:-0}"` on the next line.
- Added three new helper functions after `ensure_test_user`:
  - `sha256_hex()` — portable SHA-256 (sha256sum on Linux, shasum -a 256 on macOS).
  - `date_offset()` — portable UTC timestamp with offset; GNU `date -d` on Linux, BSD `date -v` on macOS. Uses `|| true` guard for `set -euo pipefail` compatibility.
  - `ensure_operator_invite()` — idempotently inserts one `operator_invites` row into Directus. Computes token_hash (SHA-256) and token_prefix (first 8 chars). Checks for existing row by token_prefix (GET) before inserting (POST). `consumed_at` field is omitted from the JSON body when empty to avoid Directus timestamp validation errors. Respects `UAT_SEED_DIRECTUS_MOCK=1` (skips all curl, prints "(mock)").
- Step 1 (reachability): wrapped in `[[ "$UAT_SEED_DIRECTUS_MOCK" != "1" ]]` guard; label changed `[1/3]` → `[1/4]`.
- Step 2 (bootstrap): wrapped in guard; label changed `[2/3]` → `[2/4]`.
- Step 3 (Authentik users): wrapped in guard; label changed `[3/3]` → `[3/4]`.
- Added step `[4/4]`: computes `_now_plus_7d`, `_now_minus_2h`, `_now_minus_1d` via `date_offset`; calls `ensure_operator_invite` three times with the fixture constants from ISS-UAT-013-4.
- Summary block: added operator_invites token printout.

### 2. `scripts/uat-env-setup.sh` — MODIFIED

Added 4 lines to the `write_file "$E2E_DIR/.env.uat"` heredoc (step 8), immediately after the `UAT_OPERATOR_PASSWORD` line:

```
# Operator invite tokens — provisioned by pnpm uat:seed (ISS-UAT-013-4)
UAT_ONBOARD_TOKEN=uat-onboard-token
UAT_ONBOARD_USED_TOKEN=uat-onboard-used-token
UAT_ONBOARD_EXPIRED_TOKEN=uat-onboard-expired-token
```

These match the `??` fallbacks already in `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` (lines 80–83), so re-running `pnpm uat:env` now also writes them explicitly.

### 3. `scripts/tests/uat-seed.bats` — CREATED

7 test cases across 4 acceptance criteria:

| Test | Criterion | Technique |
|---|---|---|
| Mock mode exits 0 and shows 3 (mock) lines | AC-1 | UAT_SEED_DIRECTUS_MOCK=1 |
| Mock mode summary lists all 3 token names | AC-1 | UAT_SEED_DIRECTUS_MOCK=1 |
| Missing DIRECTUS_TOKEN exits non-zero | AC-2 | env DIRECTUS_TOKEN="" |
| ensure_operator_invite has GET idempotency check | AC-3 | grep |
| uat-env-setup.sh has UAT_ONBOARD_TOKEN | AC-4 | grep |
| uat-env-setup.sh has UAT_ONBOARD_USED_TOKEN | AC-4 | grep |
| uat-env-setup.sh has UAT_ONBOARD_EXPIRED_TOKEN | AC-4 | grep |

---

## Design Decisions

### UAT_SEED_DIRECTUS_MOCK=1 as full test mode

The mock flag bypasses steps 1, 2, 3 (reachability, bootstrap, Authentik) in addition to `ensure_operator_invite`. This allows the bats suite to run without a live Docker stack. The blast radius is zero: the flag only affects `uat-seed.sh` and is undefined in production CI.

### token_prefix as idempotency key

The plaintext token is a stable test-fixture constant. First 8 chars are unique per row (`uat-onbo`, `uat-onbo`... wait, all tokens start with `uat-onbo`). Let me verify:
- `uat-onboard-token` → prefix = `uat-onbo`
- `uat-onboard-used-token` → prefix = `uat-onbo`
- `uat-onboard-expired-token` → prefix = `uat-onbo`

**Important correction:** All three plaintext tokens start with `uat-onbo` (first 8 chars). The idempotency key `token_prefix = token_plain:0:8` is NOT unique across the three rows. Changed token names in the ensure_operator_invite calls to use longer tokens that differ within the first 8 chars:

| Fixture | token_plain | token_prefix (first 8) |
|---|---|---|
| valid | `uat-valid-onboard-token` | `uat-vali` |
| consumed | `uat-used-onboard-token` | `uat-used` |
| expired | `uat-exprd-onboard-token` | `uat-expr` |

Wait — but `ISS-UAT-013-4.md` and `BP-UAT-013-signup.spec.ts` both use:
- `uat-onboard-token` (prefix: `uat-onbo`)
- `uat-onboard-used-token` (prefix: `uat-onbo`)
- `uat-onboard-expired-token` (prefix: `uat-onbo`)

These first 8 chars ALL collide. The spec already uses them as env var fallbacks. I MUST preserve these token values to match the spec.

**Resolution:** Directus's token_prefix field is documented as "First 8 chars of plaintext token for **support lookup**", NOT as a primary key. The real idempotency key should be `token_hash` (SHA-256 of plaintext), which IS unique per token. Updated `ensure_operator_invite` to filter by `token_hash` instead of `token_prefix`.

---

## Post-code-review self-correction

The `ensure_operator_invite()` implementation in the commit was updated to use `token_hash` as the idempotency filter:

```bash
existing=$(curl -sf \
  -H "Authorization: Bearer ${DIRECTUS_TOKEN}" \
  "${DIRECTUS_URL}/items/operator_invites?filter[token_hash][_eq]=${token_hash}&limit=1" \
  2>/dev/null | jq -r '.data[0].id // empty' 2>/dev/null || true)
```

The `token_prefix` field is still computed and stored but is NOT the idempotency key. The bats AC-3 grep test was updated to match `token_hash.*operator_invites`.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "3 files changed. ensure_operator_invite() implemented with token_hash idempotency, sha256_hex() + date_offset() portability helpers, UAT_SEED_DIRECTUS_MOCK test mode, and 7-case bats regression suite."
  findings:
    - "Token prefix collision detected and corrected: idempotency key changed from token_prefix to token_hash."
    - "UAT_SEED_DIRECTUS_MOCK=1 bypasses all external calls in all 4 seed steps for bats testability."
    - "date_offset() handles both Linux (GNU date -d) and macOS (BSD date -v) portably."
    - "consumed_at JSON field omitted when empty to avoid Directus timestamp validation rejection."
    - "No new npm dependencies, no new Docker images, no NestJS changes."
```
