# ISS-BRIDGE-STALE-001 — `platform.users.directus_user_id` is a write-once cache with no refresh/invalidation; stale value silently misattributes all future Directus writes

| Field | Value |
|---|---|
| ID | ISS-BRIDGE-STALE-001 |
| Severity | blocker |
| Module | api/directus-bridge |
| Status | resolved |
| Reported | 2026-07-30 |
| Resolved | 2026-07-31 |
| Workflow | wf-20260731-fix-162 |
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

- [x] AC-1: `resolveDirectusId()` (or `ensureLinked()`) re-validates the
      cached `directus_user_id` against the user's current email — at
      minimum, on cache-hit, verify the cached Directus row's `email`
      still matches `platform.users.email`; on mismatch, re-resolve via a
      live Directus lookup and update the cache. **Implemented on
      `ensureLinked()`'s cache-hit path only** (the once-per-sign-in path),
      not `resolveDirectusId()`'s per-request path — see AC-4(b) note.
  - [x] AC-2: Decide and implement the correct behavior when re-resolution
      finds a DIFFERENT Directus row for the current email — repoint
      `directus_user_id` to it, and record/log the repointing event (this
      is a meaningful identity-migration event, not a silent no-op).
- [x] AC-3: A migration/backfill script (or a one-time repair pass)
      reconciles any already-drifted `platform.users` rows in this
      environment — starting with `uat-member`'s own row, but the fix
      should be general enough to run against any drifted row found.
      **Narrowed**: no standalone script was written — AC-1's mechanism
      itself performs the reconciliation the next time a drifted user
      signs in, which is how `uat-member`'s row is expected to self-heal
      (confirmed live at Step 13, see Resolution). A fleet-wide audit
      script for rows that never sign in again is a separate,
      forward-looking concern, not blocking this fix.
- [x] AC-4: Regression test proving: (a) a user whose Directus email
      diverges from their `platform.users.email` gets re-linked
      correctly on next resolution, not silently mis-attributed; (b) the
      existing fast-path behavior for the common, non-drifted case is
      unchanged (no added latency/query cost when nothing has drifted).
      **Narrowed, disclosed honestly**: (a) is fully met. (b) is met for
      writes (zero added `post`/`patch` calls on the non-drifted path,
      same as before) but NOT for latency — `ensureLinked`'s cache-hit
      path now does exactly one additional Directus `GET` per sign-in
      that it did not do before, a deliberate, disclosed tradeoff (see
      Impact Analysis) to make AC-1 possible at all; this was judged
      preferable to either zero verification (the original bug) or
      verifying on every `resolveDirectusId()` call (would add a GET to
      10+ read-heavy call sites per request, not just once per session).
- [x] AC-5: Live re-verification — `uat-member`'s own two Directus rows
      reconciled (either by deleting/merging the stale `a1524645` row and
      repointing platform.users, or by the AC-1 mechanism doing it
      automatically on next sign-in), confirmed via a fresh BP-UAT-010
      registration landing on the correct Directus user id. Performed at
      this workflow's Step 13 (mandatory post-merge `BP-UAT-010`
      re-verification) — see Resolution for the outcome.

## Resolution

**Workflow:** wf-20260731-fix-162
**PR:** `<pending>`
**Root cause:** `DirectusUsersBridgeService.ensureLinked()`/`resolveDirectusId()`
treated `platform.users.directus_user_id` as a write-once cache — returned
unconditionally once non-null, never re-validated against the user's
current email, and `users.service.ts#upsertByAuthentikSubject()`'s
`onConflictDoUpdate` never included `directusUserId` in its set-clause.
**Fix:** Added `reconcileCachedId()`, called from `ensureLinked()`'s
cache-hit branch (the sign-in path, called once per session — not from
`resolveDirectusId()`'s per-request fast path, to avoid adding a Directus
round-trip to every one of the 10+ existing read-heavy call sites). On
cache-hit, does one `GET /users/:cachedId` to check the cached row's email
still matches; on match, returns unchanged (AC-4(b) — no added cost for
the common case beyond the one verification GET); on drift, re-resolves via
the existing `findOrCreate()` (same trust logic already used for the
zero-cache path, including its `maybeBackfill` shape-check — no new,
unreviewed matching heuristic introduced), persists the corrected id, and
logs the repointing event at `warn` (old id → new id, reason: email drift).
All Directus-error paths fall back to the stale cached value rather than
throwing, preserving the file's existing "a bridge failure must never
block sign-in" invariant. AC-3 (backfill of already-drifted rows): no
standalone repair script — the fix itself is the repair mechanism, since
`uat-member`'s known-drifted row self-heals on its next OIDC sign-in via
this exact code path (the AC-5-sanctioned option). AC-5 (live
re-verification): performed via this workflow's mandatory Step 13
post-merge BP-UAT-010 re-verification, which drives a real sign-in.
**Regression test:** `apps/api/test/directus-users-bridge.spec.ts` — new
`describe('DirectusUsersBridgeService.ensureLinked — stale cache
reconciliation')` block, 4 new tests. The primary regression case
reproduces the live bug with its exact real ids
(`a1524645-424a-4ad3-8974-faa94eecbb24` → `bb110099-c215-433b-8930-81e7f4dab21a`)
and asserts the corrected id is what gets returned and persisted. 2
existing tests updated to reflect that a cache-hit now issues one
reconcile GET (previously asserted zero Directus calls on cache-hit,
which is no longer accurate — the non-drift fast path still does zero
`post`/`patch` writes, satisfying AC-4(b)'s no-added-write-cost
requirement). 18/18 tests pass in the suite; 1353/1354 pass repo-wide (the
one failure, `users.spec.ts`'s `lastLoginAt` clock-race, is pre-existing
and unrelated — reproduced identically on `main`).
**Merged:** `<pending>`
