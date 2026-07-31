# Step 5: Security Review — ISS-BRIDGE-STALE-001

## Scope

`apps/api/src/modules/directus/directus-users-bridge.service.ts` —
`reconcileCachedId()` (new) and `ensureLinked()`'s cache-hit branch (changed
to call it).

## Analysis

**This is identity-resolution logic, correctly flagged for review by the
Impact Analysis.** The core risk class: could the "repoint on drift" logic
itself become a NEW way to misattribute a user's writes to the wrong
Directus identity?

1. **Path parameter injection (`GET /users/:cachedDirectusId`):**
   `cachedDirectusId` is not user/request-controlled input — it is read
   directly from `platform.users.directus_user_id`, a `uuid` column
   (`apps/api/src/modules/users/schema.ts:37`) only ever written by this
   same service from Directus-returned ids. Not an injection vector; no
   `encodeURIComponent` needed here (contrast with `findOrCreate`'s
   email-based filter query, which already does encode). Consistent with
   existing `maybeBackfill`'s `/users/${existing.id}` pattern one line
   below.

2. **Trust boundary of the re-resolution match:** `reconcileCachedId`
   re-resolves via the EXISTING `findOrCreate(currentEmail, null)` —
   the same method that already handles the zero-cache case today, which
   itself calls `maybeBackfill` to shape-check (`provider === 'authentik'
   && external_identifier === email`) before trusting a match. No new
   trust logic was introduced; the fix reuses the already-reviewed
   find-or-create path rather than inventing a second one. This was a
   deliberate design choice (see Impact Analysis's flag about this exact
   risk) — a bespoke "does this Directus row belong to this user" check
   would have been a NEW, unreviewed trust decision; reusing `findOrCreate`
   keeps the trust surface unchanged.

3. **Confused-deputy / privilege escalation:** `currentEmail` passed into
   `reconcileCachedId` is `platform.users.email` (from the local DB row,
   itself only settable via `upsertByAuthentikSubject`'s
   Authentik-JWT-derived `email` claim) — not attacker-controlled request
   input. A user cannot trigger a repoint to an arbitrary Directus id by
   sending a crafted request; the only lever is their own Authentik-issued
   email, which is already the trust root for every other call site in
   this file (`findOrCreate`, `maybeBackfill`, `ensureLinkedByEmail`).

4. **Audit trail:** AC-2 explicitly requires the repoint to be a logged
   event, not silent. `logger.warn` on both the drift-detected line and the
   successful-repoint line satisfies this — greppable in logs, consistent
   with this service's existing all-`warn` logging convention (no `error`
   level used anywhere in this file today, even for hard failures — this
   fix does not deviate from that existing convention).

5. **Failure-mode safety (no new blocking behavior):** every new failure
   path (`GET` throws, re-resolution's `findOrCreate` throws) falls back
   to returning the stale cached value rather than throwing — sign-in
   still cannot be blocked by a bridge failure, preserving the file's
   existing invariant (stated in its own header comment) end to end.

6. **No new external input reaches this code.** No controller/DTO changed;
   nothing here is reachable by a new, less-trusted caller than before.

## Findings

None. No BLOCKER, no MAJOR. The fix reuses existing, already-reviewed
trust logic (`findOrCreate`/`maybeBackfill`) rather than introducing a new
matching heuristic, keeps the existing fail-open-to-cached-value safety
property, and does not change the trust root (Authentik-issued email)
anywhere in the call chain.

## Gate Result

**Status:** `passed` → Step 6 (Plan Regression Tests).
