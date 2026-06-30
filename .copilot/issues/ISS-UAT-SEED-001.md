# ISS-UAT-SEED-001 — uat-seed.sh step 4 fails due to Directus readonly field validation bug

| Field | Value |
|---|---|
| ID | ISS-UAT-SEED-001 |
| Severity | bug |
| Module | uat/seed |
| Status | open |
| Reported | 2026-06-30 |
| Resolved | — |
| Reporter | Orchestrator (wf-20260630-uat-042) |
| Workflow | wf-20260630-uat-042 |

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

- [ ] `pnpm uat:seed` on a fresh Directus creates all 4 operator_invite rows without error
- [ ] Rows have `authentik_user_id` set to the correct Authentik pk
- [ ] CRLF-safe env parsing (idempotency check returns rows, not FORBIDDEN)
- [ ] `AUTHENTIK_ADMIN_TOKEN` documented in env.example
