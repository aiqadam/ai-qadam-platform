# ISS-UAT-013-17 — `reset_domain_fixture()` does not set `authentik_user_id` in `operator_invites` rows

**Severity:** minor
**Module:** uat/seed
**Status:** resolved
**Date:** 2026-07-06
**Discovered by:** wf-20260706-uat-114-bp-uat-013 (BP-UAT-013 Step 4 — BusinessAnalyst triage)

## Summary

`scripts/uat-seed.sh`'s `--reset` path calls `reset_domain_fixture()` for `operator_invites` rows. This function deletes and re-creates each row from the manifest `payload` JSON. The manifest payload is static and cannot include a runtime `authentik_user_id` (an integer FK to the local Authentik instance's `core_user.pk`). After the DELETE + re-POST, the new row has `authentik_user_id = null`.

The api's `consumeInvite()` reads `authentik_user_id` from the invite row. When null it throws `ConflictException('invite_missing_authentik_user')` and `POST /v1/onboard/accept` returns HTTP 409. Step 006 fails.

By contrast, the unconditional seed path (`ensure_operator_invite()`) calls `user_pk_by_email()` against the live Authentik instance and includes the resolved `authentik_user_id` integer in the POST payload (see `scripts/uat-seed.sh` lines 587 / 611). The reset path has no equivalent lookup.

## Evidence

- Session log: `apps/e2e/uat-results/BP-UAT-013/wf-20260706-uat-114-bp-uat-013/session-log.md` — seed header line: `authentik_user_id=6 patched` (manual Directus patch required; Step 006 PASS was conditional on it)
- Code reference: `scripts/uat-seed.sh` `reset_domain_fixture()` lines ~750–863 — the `operator_invites`-specific block adds `token_hash` + `token_prefix` but does NOT add `authentik_user_id`
- Code reference: `ensure_operator_invite()` lines ~570–637 — calls `user_pk_by_email()` and includes `authentik_user_id: $ak` in every POST body

## Acceptance Criteria

- **AC-1:** After `bash scripts/uat-seed.sh --reset BP-UAT-013` with a live Authentik stack, the `operator_invites` row for `uat-operator@example.com` has `authentik_user_id = <Authentik user pk>` (non-null integer).
- **AC-2:** `POST /v1/onboard/accept` with `uat-onboard-token` returns HTTP 200 (no manual Directus patch required).
- **AC-3:** Bats regression row verifies that after a mock `--reset BP-UAT-013`, the script invokes an Authentik email-lookup step for the `operator_invites` collection.

## Proposed Fix

**Option A (minimal):** In `run_reset_for_bp()` Pass 2, after `reset_domain_fixture()` for an `operator_invites` fixture, perform an Authentik email-lookup + Directus PATCH to backfill `authentik_user_id`.

**Option B (general):** Add `ak_url` and `ak_token` parameters to `reset_domain_fixture()`. Inside, when `collection=operator_invites` and `payload.email` is set, call `user_pk_by_email()` and merge `authentik_user_id` into `resolved_payload` before the POST.

## Workaround

After `pnpm uat:seed --reset BP-UAT-013`, manually patch rows via:
```bash
AK_USER_PK=$(curl.exe -s -H "Authorization: Bearer ${AK_TOKEN}" \
  "http://localhost:9000/api/v3/core/users/?email=uat-operator%40example.com" \
  | jq -r '.results[0].pk')
# Then PATCH each operator_invites row's authentik_user_id = AK_USER_PK
```
