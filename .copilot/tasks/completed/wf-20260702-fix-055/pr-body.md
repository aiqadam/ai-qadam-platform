Resolves ISS-UAT-SEED-001.

## What

`scripts/uat-seed.sh` step 4 (`ensure_operator_invite`) failed on a fresh Directus for three independent reasons. This PR fixes all three plus a fourth, related CRLF bug.

## Why

`pnpm uat:seed` is the entry point for every UAT workflow; if it can't create the 4 `operator_invite` rows, every downstream UAT step is blocked. This was filed via wf-20260630-uat-042 (logs: `ensure_operator_invite`: HTTP 400 VALUE_TOO_LONG for `consumed_at`; idempotency GET returned FORBIDDEN because of corrupted `Authorization` header; api/post-handshake threw `invite_missing_authentik_user`).

## How

### AC-1: `consume_invite` POST no longer rejects `consumed_at`

`ensure_operator_invite` now OMITS `consumed_at` from the payload entirely when the value is empty (`[[ -n "$consumed_at" ]] || del(.consumed_at)`). Previously the code emitted `consumed_at: null`, which Directus 11's readonly-field validation rejects with `VALUE_TOO_LONG`. The consumed-time branch (`consumed_at = $now`) keeps the value; the consumed path goes through a separate PATCH call.

### AC-2: seeds now populate `authentik_user_id`

New helper `user_pk_by_email() <ak_url> <token> <email>` calls `GET /api/v3/core/users/?email=...` and parses `.results[0].pk`. `ensure_operator_invite` looks up the pk by `email` and writes it into the `authentik_user_id` column. The api's `consumeInvite()` had been throwing `ConflictException('invite_missing_authentik_user')` on the resulting null.

### AC-3: CRLF-safe env parsing in both scripts

`env_get()` now uses `tr -d '"\r'` instead of `tr -d '"'`. Applied to both `scripts/uat-seed.sh` and `scripts/uat-env-setup.sh` (the function is duplicated, fix applied to both for consistency). A Windows-edited `.env` file with CRLF line endings previously corrupted `DIRECTUS_TOKEN` (or any bearer token) with a trailing `\r` that Directus rejected with FORBIDDEN.

### AC-4: regression test for env.example

`AUTHENTIK_ADMIN_TOKEN` and `AUTHENTIK_ADMIN_URL` are already documented at apps/api/.env.example:91-92. No code change required; 2 bats tests added to prevent regression.

## Risks

- **Blast radius:** `uat-seed.sh` and `uat-env-setup.sh` only — both are local-seed scripts, not production code paths.
- **Mock-mode output shape changed** (added `authentik_user_id=<value>` to the existing `operator_invite` line). Production stdout is unchanged. The existing 9 `uat-seed.bats` tests still pass (verified).
- **No new dependencies.**

## Testing

11 new bats tests in `scripts/tests/uat-seed-iss-001.bats`:

| AC | Tests |
|---|---|
| AC-1 | mock line omits `consumed_at=`; static check no `.consumed_at = null` literal; existing 9 tests still pass |
| AC-2 | mock line includes `authentik_user_id=` for all 4 rows; helper exists; helper called from `ensure_operator_invite` |
| AC-3 | `tr -d '"\r'` in both scripts; functional test via CRLF fixture + `od -An -c` asserts output is exactly `mock-token` (10 bytes, no trailing CR) |
| AC-4 | both vars documented in env.example |

**Result:** 11/11 pass on the fix. 9/11 fail pre-fix (regression correctly catches all three bugs). AC-4 verified-already-satisfied (no change needed).

Combined with the existing 9 `uat-seed.bats` tests: **20/20 pass**.

## Honesty disclosures

- AC-4 was already satisfied on main; no env.example change.
- Live-stack UAT re-run via `scripts/uat-preflight-check.sh` (BP-UAT-013 Steps 004/005/006) is **not** part of this PR's verification. The 11 bats tests verify the script's contract hermetically. A separate UATRunner workflow can re-run BP-UAT-013 against the merged code if/when the user wants it.

## Checklist

- [x] Tests added / updated (11 new bats tests in `scripts/tests/uat-seed-iss-001.bats`)
- [x] Docs updated if behavior changed (no behavior change for prod; tests + Resolved issue are the surface)
- [x] No new dependencies
- [x] Regression-tested locally (20/20 pass; 9/11 fail on pre-fix)
