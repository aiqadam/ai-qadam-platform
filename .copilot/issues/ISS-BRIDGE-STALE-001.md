# ISS-BRIDGE-STALE-001 — `platform.users.directus_user_id` is a write-once cache with no refresh/invalidation; stale value silently misattributes all future Directus writes

| Field | Value |
|---|---|
| ID | ISS-BRIDGE-STALE-001 |
| Severity | blocker |
| Module | api/directus-bridge |
| Status | open |
| Reported | 2026-07-30 |
| Reporter | UATRunner/Orchestrator (`wf-20260730-uat-158`, post-merge BP-UAT-010 live verification for ISS-UAT-SEED-003) |
| Related | ISS-UAT-SEED-003, ISS-UAT-BRIDGE-001, ISS-UAT-BRIDGE-002, BP-UAT-010 |
| Business-Process | BP-UAT-010 |
| GitHub-Issue | https://github.com/aiqadam/ai-qadam-platform/issues/159 |

## Symptom

Live end-to-end BP-UAT-010 verification (the first time this repo has ever
actually driven a real browser registration against a working
`scripts/uat-fixtures/BP-UAT-010.json` fixture) found: signing in as
`uat-member@example.com` and clicking Register creates real
`registrations` rows — but they are foreign-keyed to Directus user
`a1524645-424a-4ad3-8974-faa94eecbb24`, a STALE row that still carries the
OLD, retired `uat-member@aiqadam.test` email. The CORRECT, currently
Directus-mirrored row for `uat-member@example.com` is a completely
different id, `bb110099-c215-433b-8930-81e7f4dab21a` — both rows exist
side by side in `directus_users` right now.

## Root cause (confirmed via source read)

`apps/api/src/modules/directus/directus-users-bridge.service.ts`:

- `resolveDirectusId()` (line 115): `if (row.directusUserId) return row.directusUserId;` — returns the
  cached `platform.users.directus_user_id` column unconditionally whenever
  it is non-null. No re-validation against the account's current email,
  no check that the Directus row still exists or still matches.
- `ensureLinked()` (lines 38-65): the SAME fast-path check (lines 49-51)
  gates the only place that ever writes this column. Once set, on first
  OIDC sign-in, it is **never touched again** by any code path — not on
  subsequent sign-ins, not when `ensureLinkedByEmail()` is called by
  `scripts/uat-seed.sh`'s `api_ensure_directus_user_link()` (which
  delegates straight back into the same cached fast path when a local
  `platform.users` row already exists), and not by
  `users.service.ts`'s `upsertByAuthentikSubject()` (whose
  `onConflictDoUpdate` set-clause explicitly updates `email`,
  `displayName`, `lastLoginAt` — but conspicuously never `directusUserId`).

**How the two Directus rows came to exist side by side:** the historical
`ISS-UAT-BRIDGE-002` fix (`@aiqadam.test` → `@example.com` migration,
2026-07-04) PATCHed the user's email **in Authentik only**
(`scripts/uat-seed.sh`'s `ensure_test_user()`, lines ~365-389). It never
touched `platform.users.directus_user_id`, nor did it reconcile whatever
Directus-side row drift resulted. The already-cached `directus_user_id`
kept pointing at the pre-migration Directus row indefinitely.

## Impact — NOT limited to this one test fixture

Any real production user whose email is ever changed (self-service email
change, admin correction, Authentik profile edit) or whose Directus
mirror row is ever recreated/superseded for any reason will have this
exact problem: `platform.users.directus_user_id` keeps pointing at the
stale row forever, and **every** downstream consumer that resolves "this
user's Directus identity" via `resolveDirectusId()`/`ensureLinked()` —
registrations, point awards, badges, referrals, EULA/consent records,
me-profile reads/writes, admin-invite created-by/revoked-by attribution,
audit-event actor resolution, RBAC policy sync — silently writes to the
wrong Directus user with no error, no warning, and (as of today) no code
path that ever detects or repairs it.

## Acceptance criteria

- [ ] AC-1: `resolveDirectusId()` (or `ensureLinked()`) re-validates the
      cached `directus_user_id` against the user's current email — at
      minimum, on cache-hit, verify the cached Directus row's `email`
      still matches `platform.users.email`; on mismatch, re-resolve via a
      live Directus lookup and update the cache.
  - [ ] AC-2: Decide and implement the correct behavior when re-resolution
      finds a DIFFERENT Directus row for the current email — repoint
      `directus_user_id` to it, and record/log the repointing event (this
      is a meaningful identity-migration event, not a silent no-op).
- [ ] AC-3: A migration/backfill script (or a one-time repair pass)
      reconciles any already-drifted `platform.users` rows in this
      environment — starting with `uat-member`'s own row, but the fix
      should be general enough to run against any drifted row found.
- [ ] AC-4: Regression test proving: (a) a user whose Directus email
      diverges from their `platform.users.email` gets re-linked
      correctly on next resolution, not silently mis-attributed; (b) the
      existing fast-path behavior for the common, non-drifted case is
      unchanged (no added latency/query cost when nothing has drifted).
- [ ] AC-5: Live re-verification — `uat-member`'s own two Directus rows
      reconciled (either by deleting/merging the stale `a1524645` row and
      repointing platform.users, or by the AC-1 mechanism doing it
      automatically on next sign-in), confirmed via a fresh BP-UAT-010
      registration landing on the correct Directus user id.

## Resolution

_Open — not yet scheduled. Discovered live during `wf-20260730-uat-158`
(Step 13 post-merge UAT re-verification for `ISS-UAT-SEED-003`). This is a
pre-existing bridge design gap — not caused by ISS-UAT-SEED-003's own
change (a seed-fixture manifest + bash script extension) — exposed only
because that fix was the first thing to ever make a real, working
end-to-end BP-UAT-010 registration possible against this environment._
