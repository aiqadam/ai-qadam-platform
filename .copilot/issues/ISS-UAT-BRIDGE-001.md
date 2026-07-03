# ISS-UAT-BRIDGE-001 — `ensureLinkedByEmail` short-circuits with `null` when no `platform.users` row exists; seed-driven bridge cannot create Directus mirror

| Field | Value |
|---|---|
| ID | ISS-UAT-BRIDGE-001 |
| Severity | blocker |
| Module | api/directus-bridge |
| Status | **open** (queued behind `wf-20260703-uat-064` resolution) |
| Reported | 2026-07-03 |
| Reporter | Orchestrator (wf-20260703-uat-064, Step 3 — UAT verification live run) |
| Related | [ISS-UAT-001-1](ISS-UAT-001-1.md) — same root-cause family (seed flow cannot reach Directus); the prior fix only addressed the symptom of "endpoint doesn't exist", not the deeper contract problem |
| Blocks | BP-UAT-001 Step 006 ("uat-member-no-consent excluded from recipient count") because AC-2/AC-3 of ISS-UAT-001-1 cannot be verified without this |

## Symptom

`apps/api/src/modules/directus/directus-users-bridge.service.ts`'s
public method `ensureLinkedByEmail({ email, displayName })`:

```typescript
async ensureLinkedByEmail(input: { email: string; displayName: string | null }): Promise<string | null> {
  const [row] = await this.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  if (!row) {
    return null;     // ← returns here for freshly-seeded users
  }
  return this.ensureLinked({ userId: row.id, email: input.email, displayName: input.displayName });
}
```

returns `null` for freshly-seeded UAT fixtures
(`uat-member-c@aiqadam.test`, `uat-member-nc@aiqadam.test`) because
those users exist in Authentik (created by `ensure_test_user`) but
have no corresponding `platform.users` row (no OIDC sign-in ever
fired). Downstream, the bridge's private `findOrCreate` could create
the Directus mirror on its own — it doesn't depend on a local row —
but the public method short-circuits before reaching it.

The seed then fails at `reset_domain_fixture` for the
`uat-member-consented-consent` row:

```
fixture uat-member-consented-consent: member_email 'uat-member-c@aiqadam.test'
did not resolve to any Directus user — fixture-authoring bug (create the
identity fixture first), refusing to POST a broken member_consents row.
```

because no Directus user has been created from the seed.

## Root cause

The public `ensureLinkedByEmail` was added in fix-064 (wf-20260703-fix-064,
PR #89, squash 2b72f460) specifically to bridge the seed flow's
gap — but its implementation still carries the OIDC-callback
contract that there must already be a `platform.users` row. The
"right" fix has two shapes:

### Option A — relax the contract (recommended)

`ensureLinkedByEmail` should be able to create a Directus mirror even
when no local row exists. It can do the lookup by email against
`directus_users` itself (which is exactly what `findOrCreate` does
already); if found, return it; if not, POST a new Directus user. The
caller's intent is "ensure that the Directus mirror exists"; the
link-back-write to `platform.users.directus_user_id` is best-effort
and can be skipped when no local row exists.

Sketch:

```typescript
async ensureLinkedByEmail(input: { email: string; displayName: string | null }): Promise<string | null> {
  // Try the local-row path first (back-write the link if local row exists)
  const [row] = await this.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  if (row) {
    return this.ensureLinked({ userId: row.id, email: input.email, displayName: input.displayName });
  }
  // Fallback: seed/admin path. No link-back possible (no local row), but we
  // can still mirror into Directus so the FK targets for member_consents
  // exist. Caller (seed, admin invite) will treat null as a soft warning.
  try {
    return await this.findOrCreate(input.email, input.displayName);
  } catch (err) {
    this.logger.warn(`[directus-bridge] ensureLinkedByEmail fallback failed for ${input.email}: ${err instanceof Error ? err.message : 'unknown'}`);
    return null;
  }
}
```

### Option B — populate `platform.users` from seed

Teach `ensure_test_user` to also INSERT a row in `platform.users`
when the Authentik user is brand-new. This requires either direct DB
writes from bash (awkward, brittle) or extending `ensure-test-user`
api to accept a `users_provision_local: true` flag. More moving parts
than option A.

## Recommended fix

Option A — it owns the right abstraction (bridge), is local to one
file (`directus-users-bridge.service.ts`), and matches the "create
Directus mirror" intent already encoded in the existing private
`findOrCreate`. Approximate scope: ~15 lines + a new bats unit case
covering the "no local row" branch.

## Acceptance criteria for the future workflow

1. After `pnpm uat:seed --reset BP-UAT-001`, the following probes
   return 200 OK with non-empty data:
   - `GET http://localhost:8200/users?filter[email][_eq]=uat-member-c@aiqadam.test`
2. `GET http://localhost:8200/items/member_consents?filter[purpose][_eq]=events&fields=id,member.email`
   returns the consent row with `member.email = uat-member-c@aiqadam.test`.
3. `ensureLinkedByEmail({ email })` returns the Directus user id,
   not null, even when no `platform.users` row exists.
4. Existing `directus-users-bridge.service.spec.ts` "ensureLinked +
   ensureLinkedByEmail" cases still pass (no contract regression for
   OIDC-callback callers).

## Recommended workflow to resolve

`wf-20260703-fix-065` (next counter after `wf-20260703-uat-064`
closes). Suggested module path:

- **`code-developer`**: edit
  `apps/api/src/modules/directus/directus-users-bridge.service.ts`
  to add the fallback branch above.
- **`test-designer`**: add 3-4 bats cases covering:
  - "no local row, no Directus row → creates and returns Directus id"
  - "no local row, Directus row with different provider →
    backfills to provider=authentik and returns id"
  - "no local row, Directus lookup throws → returns null with warn log"
- **`security-reviewer`**: confirm the fallback path doesn't leak
  password material (it doesn't — only email + displayName).
- **`quality-gate`**: re-run `pnpm uat:seed --reset BP-UAT-001` and
  the two Directus probes, confirm both 200 OK with non-empty data.

## Verification deferred to that workflow

Until that fix lands, **ISS-UAT-001-1 AC-2 and AC-3 remain deferred**
because the bridge-gap above prevents them from being verified (the
endpoint works, but the contract prevented the bridge from completing
the link). Both ACs get re-classified as `verified` when the new
workflow ships.

## Notes

- This issue is NOT a follow-up regression — it's a second-class
  symptom discovered while verifying ISS-UAT-001-1. Reporting it
  here makes the gap visible; the previous fix was correct for its
  declared scope (endpoint exists, seed calls it) but the underlying
  bridge contract was incomplete.
- Companion file: `09-quality-gate.md` in
  `.copilot/tasks/active/wf-20260703-uat-064/` documents the
  verification evidence.
