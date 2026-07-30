# ISS-RBAC-ONBOARDED-AT-001 — `directus_users.onboarded_at` does not exist as a field; every permission grant referencing it is a no-op

| Field | Value |
|---|---|
| ID | ISS-RBAC-ONBOARDED-AT-001 |
| GitHub-Issue | https://github.com/aiqadam/ai-qadam-platform/issues/168 |
| Severity | blocker |
| Module | infrastructure/directus-bootstrap, api/me-profile, api/onboarding |
| Status | open |
| Reported | 2026-07-30 |
| Resolved | — |
| Workflow | wf-20260730-fix-160 (discovery only; no fix workflow queued yet) |
| Reporter | Orchestrator (discovered while live-verifying wf-20260730-fix-160 / ISS-RBAC-PERMS-001) |
| Business-Process | BP-UAT-003, BP-UAT-016 |

## Symptom

Confirmed live against the local Directus stack (2026-07-30):

```
GET /fields/directus_users/onboarded_at  (as full-admin token)
→ 403 "You don't have permission to access this."
```

That 403 initially looked like a permissions gap (the same class this
workflow was fixing), but a direct schema listing proves the field is
simply **absent**:

```
GET /fields/directus_users  (as full-admin token, 200 OK, full list)
→ no "onboarded_at" entry anywhere in .data[].field
```

Compare: `job_title`, `seniority`, `bio_md`, `appear_in_directory`, and
every other custom member field DO exist and were confirmed queryable.
`onboarded_at` specifically does not, on this environment.

## Root cause (not yet fully diagnosed — this issue is filed for someone
to pick up, not resolved)

`infrastructure/directus/bootstrap.sh`'s `MEMBER_PROFILE_FIELDS`
constant (~line 2718) has referenced `onboarded_at` since
[ISS-USR-PROFILE-002](ISS-USR-PROFILE-002.md) (`wf-20260728-fix-144`,
2026-07-28) — but `bootstrap.sh` only ever grants *permission on*
fields; nowhere in the file does it *create* a field named
`onboarded_at` on `directus_users`. Grepping the full file for
`onboarded_at` turns up exactly one hit: the `MEMBER_PROFILE_FIELDS`
permission-allowlist string. There is no
`ensure "field directus_users.onboarded_at" ...` block anywhere.

Real application code depends on this field existing:

```
apps/api/src/modules/me-profile/me-profile.controller.ts
apps/api/src/modules/me-profile/me-profile.service.ts
apps/api/src/modules/members/onboarding.controller.ts
apps/api/src/modules/members/onboarding.service.ts
```

This means either:
1. The field was meant to be created by a different script/migration
   that was never run against this local environment, or
2. The field was never actually created anywhere, full stop, and
   `ISS-USR-PROFILE-002`'s live verification (which reported a clean
   `/me/profile` load post-fix) did not specifically assert the field's
   *value* was present in the response — only that no 403/500 occurred,
   which a silently-dropped/absent field can also produce depending on
   how `MeProfileService` shapes its response.

**Not diagnosed further in this workflow** — sizing which of the two it
is (and whether other environments, e.g. `qa.aiqadam.org`, have the
field and only local is missing it) is this issue's first step when
picked up.

## Impact

- Any permission grant naming `onboarded_at` (the one seeded by
  ISS-USR-PROFILE-002, still present in `MEMBER_PROFILE_FIELDS` after
  this workflow) is inert — Directus has nothing to grant.
- `MeProfileService`/`OnboardingService` (both real, shipped modules)
  presumably read/write this field somewhere in their logic; if it does
  not exist on any real environment, that code path is either dead or
  silently degraded. Not confirmed which without reading those services
  in detail — out of scope for this discovery-only filing.
- This is the field named in the **original symptom that motivated
  ISS-RBAC-PERMS-001 in the first place**
  (`GET /users/{id}?fields=...,onboarded_at → 403`). The permission-row
  gap that 403 was blamed on is now fixed (this workflow), but the field
  itself still does not exist locally — so the original symptom's root
  cause was actually two independent bugs stacked on top of each other,
  and only one is fixed.

## Suggested approach (not yet implemented)

1. Determine whether `onboarded_at` should exist as a real column (check
   `apps/api`'s onboarding module for what it's meant to store — likely
   a timestamp set when a member completes profile setup).
2. If yes: add an `ensure "field directus_users.onboarded_at" ...` block
   to `bootstrap.sh` (pattern: see any other `directus_users` custom
   field in the same file, e.g. `job_title`) and re-run bootstrap
   against every real environment (local, QA, prod if applicable).
3. If the field turns out to be genuinely unused/vestigial, remove it
   from `MEMBER_PROFILE_FIELDS` and from the four `apps/api` files that
   reference it instead — smaller fix, but needs to confirm neither
   `me-profile` nor `onboarding` actually depends on it functioning.

## Resolution

- **Workflow:** not yet scheduled.
- **PR:** —
