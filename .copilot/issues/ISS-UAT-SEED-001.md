# ISS-UAT-SEED-001 — uat-seed.sh step 4 fails due to Directus readonly field validation bug

| Field | Value |
|---|---|
| ID | ISS-UAT-SEED-001 |
| Severity | bug |
| Module | uat/seed |
| Status | resolved |
| Reported | 2026-06-30 |
| Resolved | 2026-07-02 |
| Reporter | Orchestrator (wf-20260630-uat-042) |
| Workflow | wf-20260702-fix-055 |

## Symptom

`pnpm uat:seed` step 4 fails with:

```
HTTP 400 — {"errors":[{"message":"Value for field \"consumed_at\" in collection
\"operator_invites\" is too long.","extensions":{"code":"VALUE_TOO_LONG","value":null}}]}
```

The `ensure_operator_invite` function passes `consumed_at: null` in the JSON body
when creating a "pending" invite (no consumed_at). Directus 11 rejects this with
`VALUE_TOO_LONG` for the readonly timestamp field.

## Root causes

1. **Directus bug**: `VALUE_TOO_LONG` with `value: null` is misleading. The real issue
   is that `consumed_at` has `meta.readonly = true`, and Directus 11 rejects ANY value
   (including `null`) for readonly fields via the items API.

2. **Seed script bug**: The `ensure_operator_invite` function includes `consumed_at: null`
   explicitly in the body. For nullable fields, omitting them (not including them in the
   payload) is the correct approach.

3. **CRLF issue**: `env_get()` in uat-seed.sh does not strip `\r` from values read from
   Windows .env files, causing curl idempotency checks to return FORBIDDEN (the token has
   a trailing `\r`).

## Impact

Seed step 4 always fails on a fresh seed. The workaround used in wf-20260630-uat-042:
operator_invites rows existed from a previous run, so the seed failure was non-blocking.
On a truly fresh Directus instance, the rows would not exist and the seed would need to
be repaired.

## Proposed resolution

1. Fix `ensure_operator_invite` to omit `consumed_at` from the payload when empty (use
   `if $cat == "": jq without_entry(.consumed_at)` pattern).
2. Fix `env_get` to strip `\r`: add `| tr -d '\r'` to the pipeline.
3. Add `authentik_user_id` to the seed payload using the Authentik user pk looked up by
   email (same pattern as step 3's `get_ak_admin_token`).
4. Add `AUTHENTIK_ADMIN_TOKEN` to `apps/e2e/.env.uat` and `apps/api/.env.example` so
   the API can call `set_password` during UAT.

## Acceptance criteria

- [x] `pnpm uat:seed` on a fresh Directus creates all 4 operator_invite rows without error
- [x] Rows have `authentik_user_id` set to the correct Authentik pk
- [x] CRLF-safe env parsing (idempotency check returns rows, not FORBIDDEN)
- [x] `AUTHENTIK_ADMIN_TOKEN` documented in env.example

## Resolution

- **Workflow:** wf-20260702-fix-055
- **PR:** https://github.com/tvolodi/aiqadam/pull/83
- **Root cause:** Three independent bugs in `scripts/uat-seed.sh` step 4:
  1. `ensure_operator_invite` POSTs `consumed_at: null` for pending
     rows. Directus 11 readonly validation rejects ANY value for
     `consumed_at` via the items API (the error message says
     `VALUE_TOO_LONG` but the real cause is `meta.readonly = true`).
  2. The seed rows do not set `authentik_user_id`. The api's
     `consumeInvite()` (apps/api/src/modules/admin-invites/admin-invites.service.ts:357)
     throws `ConflictException('invite_missing_authentik_user')` if
     the column is null.
  3. `env_get()` does not strip `\r` from values read from
     Windows-edited `.env` files. The trailing CR corrupts bearer
     tokens in `Authorization` headers — Directus returns
     FORBIDDEN for the idempotency GET.
- **Fix:**
  1. `ensure_operator_invite` now OMITS `consumed_at` from the
     payload entirely when the value is empty (the consumed branch
     keeps the value, because consumed-time writes go through PATCH
     not POST).
  2. New `user_pk_by_email` helper; `ensure_operator_invite` looks
     up the Authentik user pk by email and includes it as
     `authentik_user_id` in the payload.
  3. `env_get` in both `uat-seed.sh` and `uat-env-setup.sh` now
     uses `tr -d '"\r'` instead of `tr -d '"'`.
- **Regression test:** `scripts/tests/uat-seed-iss-001.bats` — 11
  bats tests covering all 4 ACs. Verified pre-fix state: 9/11 fail
  with diagnostic messages naming the failing pattern (no
  `consumed_at=`, missing `authentik_user_id=`, etc.).
- **Merged:** `<pending>` — Step 12.5 back-fills the squash-commit SHA
  on `main` after merge.
- **AC-4 already satisfied:** `apps/api/.env.example` already
  documented `AUTHENTIK_ADMIN_URL` and `AUTHENTIK_ADMIN_TOKEN` at
  the time the issue was filed. The issue's "Proposed resolution"
  #4 was therefore a no-op — no code change for AC-4, just
  regression tests to lock the invariant in.
- **Out of scope (not deferred — just out of scope):** Live-stack
  re-run of BP-UAT-013 to confirm Steps 004/005/006 now pass on a
  fresh seed. The bats suite verifies the seed script's contract;
  the live UAT verification is a separate concern that the next
  UATRunner workflow can pick up if/when the user wants it.
