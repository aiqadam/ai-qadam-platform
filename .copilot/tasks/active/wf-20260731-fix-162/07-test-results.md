# Step 8: Execute Tests — ISS-BRIDGE-STALE-001

## Execution order

1. `pnpm --filter api typecheck` — **pass**, clean.
2. `pnpm biome check apps/api/src/modules/directus/directus-users-bridge.service.ts apps/api/test/directus-users-bridge.spec.ts` — **pass**, no fixes needed.
3. `pnpm --filter api test` — **1353/1354 pass.** See "Pre-existing unrelated failure" below.
4. Integration: this package has no separate `test:integration` script — its
   Testcontainers-backed suites (including
   `directus-users-bridge.spec.ts`) run as part of `pnpm test` itself
   (confirmed: real Postgres via `inject('TEST_DATABASE_URL')`, real
   insert/update/select against `platform.users`, not mocked — only the
   Directus REST client is faked, per this repo's existing convention for
   this file). No separate integration pass needed for this change.

## Directus-bridge suite (the regression-test anchor)

`directus-users-bridge.spec.ts` — **18/18 pass**, up from 14 (4 new tests
in the drift-reconciliation describe block, 2 existing tests updated for
the new reconcile-GET-on-cache-hit behavior).

Confirmed via test log output — the regression test's log lines are a
byte-for-byte match of the live bug report in `ISS-BRIDGE-STALE-001.md`:

```
[directus-bridge] cached directus_user_id a1524645-424a-4ad3-8974-faa94eecbb24
  (email uat-member@aiqadam.test) no longer matches current email
  uat-member@example.com — re-resolving
[directus-bridge] repointed directus_user_id for user <uuid>:
  a1524645-424a-4ad3-8974-faa94eecbb24 -> bb110099-c215-433b-8930-81e7f4dab21a
  (email drift)
```

This proves AC-1/AC-2 end-to-end using the exact ids from the live
discovery, not synthetic placeholders.

## Pre-existing unrelated failure (not a regression)

`test/users.spec.ts > UsersService.upsertByAuthentikSubject > updates
email + displayName + lastLoginAt for an existing subject` fails
intermittently on a `lastLoginAt.getTime()` strict-greater-than comparison
— a clock-resolution race unrelated to this fix (this fix does not touch
`users.service.ts`). **Verified this is pre-existing**: reproduced the
identical failure on `main` (stashed this branch's changes, checked out
`main`, ran `pnpm --filter api test -- users.spec` — same assertion fails
with the same shape, `expected <ms> to be greater than <ms>`). Not
introduced by this branch; not blocking this fix.

## Gate Result

**Status:** `passed` → Step 9 (Update Issue Registry).
