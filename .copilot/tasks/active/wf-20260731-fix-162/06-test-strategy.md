# Step 6/7: Test Strategy + Design — ISS-BRIDGE-STALE-001

## Regression test (mandatory anchor)

**Would have failed before the fix, passes after:** a user row with a
cached `directusUserId` whose Directus row's email no longer matches
`platform.users.email` (reproducing the live `uat-member` bug exactly).
Before the fix: `ensureLinked` returns the stale id unconditionally, zero
Directus calls. After the fix: detects the mismatch, re-resolves via
`findOrCreate`, persists the new id.

## Full case list (added to `apps/api/test/directus-users-bridge.spec.ts`)

1. **Drift detected + repointed to a DIFFERENT existing Directus row**
   (the exact live bug shape) — cached id's email diverged; a second
   Directus row exists for the current email; expect return value +
   persisted column to be the NEW id, not the stale one; expect the
   reconcile GET to have fired.
2. **Drift detected + no matching Directus row exists** — falls through
   `findOrCreate`'s POST-create branch; expect a brand-new Directus id,
   persisted.
3. **No drift (cache-hit, email matches)** — must return the cached id
   AND must not call `post`/`patch` (only the one reconcile `get`) —
   proves the non-drifted case doesn't regress into extra writes.
4. **Reconcile GET throws (Directus unreachable)** — falls back to the
   stale cached value, does not throw, does not update the DB column.
5. **Re-resolution's `findOrCreate` throws after drift was detected** —
   falls back to the stale cached value (still doesn't throw / block
   sign-in), column stays unchanged.

Existing test #4 in the file ("is a no-op (fast path) when directusUserId
is already populated") asserted `fake.get` is NEVER called on cache-hit —
this assertion is now WRONG under the fix (reconciliation always issues
one GET on cache-hit) and must be updated, not left failing. This is the
AC-4(b) non-regression case in disguise: same test, updated expectation
(exactly one `get` call, still zero `post`, still returns the cached id
since the fake's `get` response in that test needs to now return a
matching email to stay a true fast-path/no-drift case).

## Gate Result

**Status:** `passed` → Step 8 (Execute Tests).
