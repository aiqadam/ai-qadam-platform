# Test Results — wf-20260728-fix-143 (ISS-UAT-RBAC-001)

## Regression test

`apps/api/test/rbac-directus-applier.spec.ts` — rewritten. The pre-existing
version asserted the buggy flat-array `policies` payload shape, which is
why the bug shipped and stayed live undetected. New version: 6 cases.

```
npx vitest run test/rbac-directus-applier.spec.ts
✓ fetches existing access rows via /users/{id}?fields=policies, not /items/directus_access
✓ PATCHes policies via the create/update/delete relational envelope, not a flat array
✓ deletes existing access rows when replacing the policy set
✓ sends country_code=null when filter is null (super-admin)
✓ returns { status: failed, error } on DirectusError without throwing
✓ returns { status: failed, error } when the existing-policies lookup fails

Test Files  1 passed (1)
     Tests  6 passed (6)
```

## Full suite

```
npx vitest run
Test Files  1 failed | 99 passed (100)
     Tests  1 failed | 1296 passed (1297)
```

The one failure (`test/users.spec.ts` — `UsersService.upsertByAuthentikSubject`
timing assertion, `lastLoginAt.getTime() > firstLogin.getTime()`) is
pre-existing on `origin/main` — reproduced identically with this PR's
changes stashed out (clock-precision flake in an unrelated module, not
touched by this diff). Not introduced by this PR; not overridden, just
disclosed as pre-existing per AGENTS.md §6.3 rule 1 (file-path
intersection: `test/users.spec.ts` and `src/modules/users/*` are not in
this PR's diff).

## Live infrastructure verification (AGENTS.md §6.1 — real run, not deferred)

Pre-flight: `docker ps` confirmed `aiqadam-postgres`, `aiqadam-directus`,
`aiqadam-authentik-server` already up (6 days). Local API dev process
(`node dist/main`, not containerized) rebuilt (`pnpm --filter api build`)
and restarted to load the fix.

```
POST /v1/internal/rbac/poll  (x-internal-auth)
→ {"scanned":7,"jobs_created":4,"errors":1}
```

`rbac_sync_jobs` (queried directly against Directus) for the 4 UAT-relevant
users, before vs. after this fix:

| User | Before (dry-run default) | After enabling flag, before code fix | After code fix |
|---|---|---|---|
| uat-operator@example.com | `dry_run` | `failed` (403) | `applied` |
| uat-member@example.com | `dry_run` | `failed` (403) | `applied` |
| local-repro-*@example.com | `dry_run` | `failed` (403) | `applied` |
| root@example.com | `dry_run` | `failed` (403) | `applied` |

Confirmed directly against Directus (`directus_access` table) that
`uat-member@example.com` now has exactly one real access row resolving to
`policy.member` (`400e0021-0000-4000-8000-000000000001`) — matching
`computeExpectedState`'s output for a plain `aiqadam-member` Authentik
group membership.

## Known remaining gap (disclosed, not silently deferred)

Reading `GET /users/{directus-id}?fields=...,onboarded_at` as the attached
`policy.member` user still 403s — **not** because the policy isn't
attached (it is, confirmed above), but because `policy.member` itself has
zero `directus_permissions` rows anywhere in the codebase (separate,
pre-existing gap). Filed as
[ISS-RBAC-PERMS-001](../../issues/ISS-RBAC-PERMS-001.md), queued as
`wf-20260728-fix-144`. This issue's (ISS-UAT-RBAC-001's) own scope — the
sync mechanism attaching policies — is fully fixed and verified live above.
BP-UAT-003/BP-UAT-016 full re-verification is owned by the follow-up, per
AGENTS.md §6.1's "no deferred tests" rule (named + queued before this
workflow closes).

## Gate Result

```markdown
gate_result:
  status: passed
  summary: "Regression test passes (6/6); full suite 1296/1297 (1 pre-existing, unrelated flake); live poll confirms all 4 UAT users flip from dry_run/403 to applied."
  findings: []
```
