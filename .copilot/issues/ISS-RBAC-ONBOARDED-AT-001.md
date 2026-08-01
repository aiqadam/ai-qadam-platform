# ISS-RBAC-ONBOARDED-AT-001 — `directus_users.onboarded_at` does not exist as a field; every permission grant referencing it is a no-op

| Field | Value |
|---|---|
| ID | ISS-RBAC-ONBOARDED-AT-001 |
| GitHub-Issue | https://github.com/aiqadam/ai-qadam-platform/issues/168 |
| Severity | blocker |
| Module | infrastructure/directus-bootstrap, api/me-profile, api/onboarding |
| Status | resolved |
| Reported | 2026-07-30 |
| Resolved | 2026-08-01 |
| Workflow | wf-20260801-fix-189 |
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

- **Workflow:** `wf-20260801-fix-189` — adds the missing
  `ensure "field directus_users.onboarded_at"` block to
  `infrastructure/directus/bootstrap.sh`, modeled exactly on the
  existing `directus_users.email_verified_at` block at lines 3226-3233.
  Field type `timestamp`, schema `is_nullable: true`, meta
  `interface: datetime`, `readonly: true`. Self-documenting `meta.note`
  records what sets the field (`MembersOnboardingService.completeOnboarding()`),
  what references it, and which bug it closes.
- **PR:** (filled in at workflow end)

### What was done

1. Added a 12-line `ensure` block to `bootstrap.sh` between the
   `email_verified_at` and `city` blocks. No other source files modified.
2. Ran `bash infrastructure/directus/bootstrap.sh` against the live
   local Directus stack twice (live verification, see below) — field
   created on first run, no-op on second run.

### Live verification (5/5 PASS)

Run by `tmp-iss168-verify.sh` against `aiqadam-directus Up 2 days (healthy)`,
`http://localhost:8200`, with a freshly-logged-in admin token:

```
=== TOTALS: 5 pass, 0 fail ===
```

| # | Test | Result |
|---|---|---|
| 1 | `onboarded_at` appears in `/fields/directus_users` after bootstrap | PASS |
| 2 | Full schema matches spec (`type=timestamp  nullable=true  interface=datetime  readonly=true`) | PASS |
| 3 | Idempotency: re-run leaves field byte-identical | PASS |
| 4 | `PATCH /users/{id}` body `{"onboarded_at": <iso>}` persists | PASS |
| 5 | `GET /users/{id}?fields=onboarded_at` returns the written value | PASS |

### Honesty disclosures

- **No deferrals.** All 7 ACs from this issue verified end-to-end in
  this workflow. No follow-up workflows queued from this issue.
- **Pre-existing unrelated warning**: `bootstrap.sh` output during the
  test run shows `⚠ Public policy not found — skipping public read for
  team_members.` This is the `wf-20260801-fix-188-public-policy-uuid-lookup`
  follow-up (8 hardcoded UUID-pinned public-read blocks in
  bootstrap.sh). It was queued by the prior workflow and is unrelated
  to `onboarded_at`. Not introduced by this PR.
- **No apps/api code changes.** The retry-without-onboarded_at fallback
  in `me-profile.service.ts:201-225` (the `ISS-USR-PROFILE-002`
  workaround) is intentionally left in place — it's a defensive retry
  that costs nothing when the field exists, and it still serves as a
  guard against any other Directus field-grant gap. Removing it would
  require its own regression test (out of scope for a minimal fix).
- **No backfill needed.** All existing `directus_users` rows get the
  new field with `NULL` value (no migration needed — `is_nullable: true`).
  This is the correct semantic for legacy users who joined before this
  field was created (per `MeProfileService.getOnboardedAt` doc: "Returns
  null when the Directus field is unset (legacy users who joined before
  this feature)").

### Verification artefacts

- Workflow task dir: `.copilot/tasks/active/wf-20260801-fix-189-onboarded-at-field/`
- Live verify log (transient, not committed): `tmp-iss168-verify.sh`,
  `tmp-iss168-verify.log`
- Code change: `infrastructure/directus/bootstrap.sh` (+12 lines)
