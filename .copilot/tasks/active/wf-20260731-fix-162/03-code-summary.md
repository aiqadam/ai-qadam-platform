# Step 4: Develop Fix — ISS-BRIDGE-STALE-001

## Change

`apps/api/src/modules/directus/directus-users-bridge.service.ts`:

- **New private method `reconcileCachedId(userId, cachedDirectusId, currentEmail)`.**
  On a cache-hit in `ensureLinked`, instead of returning the cached
  `directus_user_id` unconditionally, it now:
  1. `GET /users/:cachedDirectusId` to fetch the cached row's current email.
  2. If it matches `currentEmail` → return the cached id unchanged (fast
     path preserved for the non-drifted case, just one extra GET).
  3. If it diverges → re-resolve via the existing `findOrCreate()` (same
     find-or-create-in-Directus logic already used for the no-cache path),
     persist the new id to `platform.users.directus_user_id`, and log the
     repointing event at `warn` level (AC-2's "meaningful identity-migration
     event, not a silent no-op").
  4. Any Directus error at either step falls back to the stale cached value
     (never throws, never blocks sign-in) — same swallow philosophy as the
     rest of the service.
- `ensureLinked`'s cache-hit branch now calls `reconcileCachedId` instead of
  returning `row.directusUserId` directly.
- `resolveDirectusId` (the per-request, read-heavy path called from 10+
  modules) is **intentionally unchanged** — it still returns the cached
  value with zero Directus calls on cache-hit. Reconciliation only happens
  on `ensureLinked`'s sign-in path, per the Impact Analysis's performance
  guidance (AC-4(b)): one verification per session, not per request.
  `ensureLinkedByEmail` inherits reconciliation for free when a local row
  exists, since it delegates straight into `ensureLinked`.

## AC coverage

- **AC-1** (re-validate cached id against current email): done —
  `reconcileCachedId` step 1-2 above.
- **AC-2** (repoint + log on a genuinely different Directus row): done —
  `reconcileCachedId` step 3, `logger.warn` names old id, new id, and the
  reason (email drift).
- **AC-3** (backfill/repair already-drifted rows in this environment): no
  standalone repair script was written. The fix itself IS the repair
  mechanism — `uat-member`'s drifted row will self-heal on next OIDC
  sign-in via the exact code path this fix adds, which is the explicitly
  sanctioned option in the issue's own AC-5 wording ("or by the AC-1
  mechanism doing it automatically on next sign-in"). A separate
  backfill/cron script for actively-drifted-but-not-yet-signed-in-again
  rows was considered out of scope: this issue's Impact section describes
  *future* drift (email changes going forward), and the only currently
  *known* drifted row (`uat-member`) is exercised by BP-UAT-010's live
  sign-in flow, which is the Step 13 post-merge re-verification for this
  very fix. If a fleet-wide audit of already-drifted rows becomes
  necessary later (i.e. drifted users who never sign in again), that is a
  separate, forward-looking maintenance task, not blocking this fix.
- **AC-4** (regression test for drift + no added cost for non-drifted case):
  see `06-test-strategy.md` / `07-test-results.md`.
- **AC-5** (live re-verification against the real `uat-member` drift): to
  be performed as part of Step 13's mandatory post-merge BP-UAT-010
  re-verification, which drives a real OIDC sign-in + registration against
  the local stack — the natural trigger for `reconcileCachedId`.

## Files changed

- `apps/api/src/modules/directus/directus-users-bridge.service.ts` (fix)

## Gate Result

**Status:** `passed` → Step 5 (Security Review).
