# Step 2: Impact Analysis — ISS-BRIDGE-STALE-001

## Issue Summary

`DirectusUsersBridgeService.ensureLinked()`/`resolveDirectusId()` treat
`platform.users.directus_user_id` as a write-once cache: once non-null, it
is returned unconditionally, never re-validated against the user's current
email, never refreshed. `users.service.ts#upsertByAuthentikSubject()`'s
`onConflictDoUpdate` set-clause updates `email`/`displayName`/`lastLoginAt`
but not `directusUserId`, so an email change (self-service, admin
correction, or the historical `ISS-UAT-BRIDGE-002` Authentik-only email
migration) leaves the cached id pointing at a superseded Directus row
forever. Confirmed live: `uat-member@example.com`'s registrations
FK-attach to Directus id `a1524645-...` (stale, still `@aiqadam.test`)
instead of `bb110099-...` (current, Directus-mirrored for the real email).

## Affected Layers

### API (NestJS) — `apps/api/src/modules/`

| Module | File | Call site |
|---|---|---|
| directus | `directus-users-bridge.service.ts` | fix lands here: `ensureLinked`, `resolveDirectusId` |
| auth | `auth.controller.ts:197` | `ensureLinked()` on every OIDC sign-in — the natural re-validation trigger point |
| auth | `registration.service.ts:246` | `ensureLinkedByEmail()` |
| me-profile | `me-profile.service.ts` (13 call sites via private `resolveDirectusId` wrapper) | every profile read/write |
| registrations | `registrations-directus.service.ts:641` | registration creation — the exact path that produced the live bug |
| admin-invites | `admin-invites.service.ts:163,261` | created-by / revoked-by attribution |
| audit | `audit-events.service.ts:60,128` | actor resolution for audit log |
| badges | `badges.controller.ts:60` | badge award attribution |
| referrals | `referrals.service.ts:59,69,79` | referral attribution |
| event-questions | `event-questions.service.ts:76` | forum Q&A author attribution |
| workspace | `forms.controller.ts:66`, `tg-broadcasts.controller.ts:236` | operator attribution |
| internal | `internal.controller.ts:113` | `ensureLinkedByEmail()` — UAT seed / admin-invite pre-signup path |

**No new module.** Fix is contained to `directus-users-bridge.service.ts`;
all 10+ call sites above are unchanged consumers — they call the same
method signatures and get correct behavior for free once the bridge itself
re-validates.

### DB Changes Required: **no**

`directus_user_id` column already exists (`uuid('directus_user_id').unique()`
in `apps/api/src/modules/users/schema.ts:37`). No schema/migration needed.
AC-3's backfill is a one-time **data** reconciliation (a repair script run
against existing rows), not a schema change — no DBMigrationAuthor step.

### Shared Types: none. Internal service method, no DTO/Zod contract change.

### Frontend / Bot / Workers: none directly. Correcting the id resolved
server-side is transparent to `apps/web`, `apps/web-next`, `apps/bot` —
none of them see `directus_user_id` directly.

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| (none) | — | Internal service logic only; no route/DTO signature changes | No |

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| `auth.controller.ts` | `DirectusUsersBridgeService.ensureLinked` | DI, on every OIDC callback |
| `DirectusUsersBridgeService` | `DirectusClient.get/patch` | HTTP to Directus `/users` |
| `DirectusUsersBridgeService` | `users` table (Drizzle) | `platform.users.directus_user_id` read/write |

No new cross-module calls introduced. The fix adds one additional Directus
`GET /users/:id` (or `/users?filter[email]`) lookup on the cache-hit path
that previously did zero Directus calls — see Risk Flags for the
latency/cost tradeoff AC-4(b) explicitly requires guarding.

## Risk Flags

**Security Review Required: YES.** This is an identity-resolution/
authorization-adjacent fix (which Directus user does this platform user's
writes attach to). A wrong re-resolution (AC-2's "different Directus row"
case) could misattribute data to the WRONG user in a new way if not
implemented carefully — e.g. blindly trusting a Directus `email` filter
match without also considering `external_identifier`/`provider` shape
(the existing `maybeBackfill` pattern already establishes the right
precedent: shape-check before trusting a match).

**Architecture Rule Risks:** none — no module-boundary crossing, no new
cross-schema (`platform.*` vs Directus-native) query pattern beyond what
`findOrCreate`/`maybeBackfill` already do.

**Performance risk (flagged by AC-4(b) itself):** naive "always re-verify
against Directus on every call" would add a network round-trip to every
one of the 10+ call sites above, on every request. The fix must keep the
common (non-drifted) case at today's zero-Directus-call fast path. Options
to evaluate at CodeDeveloper: (a) re-validate only on `ensureLinked`'s
sign-in path (once per session, not per-request, since `resolveDirectusId`
callers happen within a session already bridged at sign-in) — matches how
`maybeBackfill` is already scoped to the `findOrCreate` (infrequent) path,
not read-heavy call sites; (b) cache a short TTL "last-verified-at" so
even the sign-in path doesn't re-verify more than e.g. once per day. Prefer
(a): it mirrors the existing idiom exactly (verification piggybacked on
sign-in, not on every read) and requires no new caching/TTL infrastructure.

## Test Scope

- **Unit:** `directus-users-bridge.service.spec.ts` (exists — 331 lines) —
  extend for: cache-hit with matching email (unchanged fast path, still
  zero Directus calls — the explicit non-regression AC-4(b) case);
  cache-hit with DIVERGED email (triggers re-resolution); re-resolution
  finds a DIFFERENT Directus row (repoints + logs); re-resolution finds NO
  matching row (falls back to existing `findOrCreate` behavior).
- **Integration (Testcontainers):** a real Postgres `platform.users` row
  with a deliberately stale `directus_user_id` against a fake/mock Directus
  responding with the current row for the email — proves the repoint
  actually persists via a real DB round-trip, not just a mocked call.
- **Regression test (mandatory per Step 6):** must reproduce the exact live
  bug — a user row with stale `directus_user_id` pointing to a row whose
  email no longer matches — and prove it now re-resolves instead of
  silently misattributing. This is the regression-test anchor.
- **E2E:** out of scope for this fix (no frontend/route surface changed);
  AC-5's live re-verification is a manual/scripted one-time repair
  confirmation, not a new Playwright spec.

## Gate Result

**Status:** `passed`. No DB migration needed → proceed directly to Step 4
(Develop Fix), skipping Step 3.
