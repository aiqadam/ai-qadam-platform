# ISS-UAT-RBAC-001 — Local Directus never receives a policy for any seeded UAT user (RBAC sync is permanently dry-run locally)

| Field | Value |
|---|---|
| ID | ISS-UAT-RBAC-001 |
| Severity | blocker |
| Module | uat/environment, api/rbac-sync |
| Status | resolved |
| Reported | 2026-07-28 |
| Resolved | 2026-07-28 |
| Workflow | wf-20260728-fix-143 |
| Reporter | Orchestrator (discovered while attempting live BP-UAT-003/016 verification) |
| Business-Process | BP-UAT-003, BP-UAT-016 (and, by the same mechanism, every other BP-UAT that needs a fully-permissioned authenticated member session) |

## Symptom

Any live browser session signed in as a seeded UAT test member (e.g.
`uat-member@example.com`, provisioned by `pnpm uat:seed`) can authenticate
successfully via Authentik/OIDC, but every subsequent authenticated
Directus-backed API call that reads a non-default `directus_users` field
fails with `403 FORBIDDEN`:

```
GET /users/{directus-id}?fields=...,onboarded_at
→ 403 "You don't have permission to access field \"onboarded_at\" in
   collection \"directus_users\" or it does not exist."
```

Confirmed in `apps/api` logs, reproduced live 2026-07-28 while verifying
[ISS-USR-PROFILE-001](ISS-USR-PROFILE-001.md)'s fix.

## Root cause (confirmed live, 2026-07-28)

Every Directus user row in the local dev instance has `role: null,
policies: []` — confirmed via:
```
GET /users?filter[email][_starts_with]=uat-member&fields=id,email,role,policies
```
returning 5 different `uat-member*` rows (a mix of TLD-migration leftovers
and current fixtures), **all** with empty policies. With no policy
attached, Directus falls back to its own built-in `$CURRENT_USER` self-read
permission, which has a narrow hardcoded field allowlist (`id`,
`first_name`, `last_name`, `email`, `password`, `avatar`, ... — none of
this platform's custom fields like `onboarded_at`, `job_title`, `bio_md`,
etc.).

The mechanism that's supposed to attach a real policy —
`RbacSyncService` (`apps/api/src/modules/rbac-sync/rbac-sync.service.ts`)
— only runs in **dry-run mode** locally:
`RBAC_SYNC_WRITE_ENABLED` defaults to `false`
(`apps/api/src/config/env.ts:190-198`), explicitly gated by its own code
comment: *"Flip to true only after replaying a few real Authentik changes
and verifying the diffs in the workspace UI."* Confirmed via manually
triggering the poll endpoint:
```
POST /v1/internal/rbac/poll  (x-internal-auth header)
→ {"scanned":7,"jobs_created":4,"errors":1}
```
Jobs ARE computed (visible in `rbac_sync_jobs`, `directus_status:
"dry_run"`), but no policy is ever actually written to Directus — matching
the dry-run contract exactly.

**This means no UAT session in this local environment can ever exercise a
fully-permissioned authenticated member view** of any Directus-custom
field added since whatever policy snapshot last had write-mode applied —
not just `onboarded_at`, potentially any custom field on any collection
gated behind a policy the dry-run mode never actually attaches.

## Attempted workaround (failed at the time; root cause now understood — see Resolution)

Tried to directly attach the repo's own `S0.1 Demo-tenant isolation`
policy (`500e0001-0000-4000-8000-000000000001`, already grants
`fields: ["*"]` read on `directus_users`) to one test user via the
Directus REST API, using the app's own `DIRECTUS_TOKEN`:
```
PATCH /users/{id} {"policies": ["500e0001-..."]}
→ 403 "You don't have permission to access this."

POST /items/directus_access {...}
→ 403 "You don't have permission to access this."
```
Confirmed the token genuinely resolves to Directus's built-in
`Administrator` role (`GET /users/me` → `role.name: "Administrator"`) and
CAN write ordinary `permissions` rows (e.g. `PATCH /permissions/9`
succeeded) — but cannot write the user↔policy relation itself. Root cause
of *that* narrower restriction not chased down (would require deeper
Directus internals investigation, out of scope for a UAT-verification
session).

**Resolved during this workflow (2026-07-28):** the `PATCH /users/{id}
{"policies": [...]}` 403 was a payload-shape bug, not a genuine
admin-bypass restriction. `policies` on `directus_users` is an M2M alias
field backed by the `directus_access` junction table; Directus requires
the nested relational `{create, update, delete}` envelope for alias-field
writes (flat arrays of related-record UUIDs are rejected with this same
generic 403 even for a true `admin_access: true` token — confirmed via a
fresh session JWT, ruling out a stale static token). Confirmed against
`directus/directus` GitHub issue #25108 and `directus/docs` issue #520.
`POST /items/directus_access` directly, however, genuinely IS blocked —
`directus_access` is a protected system collection inaccessible via the
general Items API even to admins (that part of the original workaround's
finding was correct; the fix reads existing access-row ids via the
`/users/{id}?fields=policies` alias-read path instead, which is not
blocked).

## Impact

- Blocks live re-verification of [ISS-USR-PROFILE-001](ISS-USR-PROFILE-001.md)'s
  BP-UAT-003/BP-UAT-016 post-merge check (queued as
  `wf-20260728-uat-142-bp-uat-003-016-postmerge`) — not because that fix is
  wrong (the fix's own core mechanism, Directus-id resolution via the
  bridge, was independently confirmed working: the failing request used the
  correct resolved Directus id, not the old broken platform id), but
  because the *next* layer of the request (Directus's own permission check)
  fails for an unrelated, pre-existing reason.
- Blocks, in principle, any future `uat-verification` workflow run whose
  BP-UAT script needs a member to read a custom `directus_users` field
  gated behind a real member-role policy — i.e. potentially several BP-UATs
  beyond just these two, though this issue only confirms the two directly
  hit so far.

## Suggested paths (as originally filed — path 1 chosen; see Resolution for what actually shipped)

1. Flip `RBAC_SYNC_WRITE_ENABLED=true` in local `.env` only (never touch
   prod/QA without the "verified diffs in workspace UI" step the comment
   requires) — simplest, matches the intended real mechanism, but the
   comment's caution suggests this needs a deliberate review pass first,
   not a drive-by flip.
2. Add a `pnpm uat:seed` step that directly grants the demo-tenant policy
   to freshly-seeded test users via a path Directus's admin role IS
   allowed to write through (needs figuring out why `directus_access` is
   blocked for this token — possibly a `directus_access` collection-level
   permission gap that itself needs a `bootstrap.sh` fix).
3. Investigate why the app's supposedly-Administrator `DIRECTUS_TOKEN`
   can't write `directus_access` — this might be a Directus-version-
   specific system-collection restriction unrelated to policy content,
   worth a small isolated investigation before choosing between 1 and 2.

## Resolution

- **Workflow:** wf-20260728-fix-143
- **PR:** <pending>
- **Root cause:** two independent bugs stacked: (a) `RBAC_SYNC_WRITE_ENABLED`
  defaults to `false` locally with no `.env`/`.env.example` documentation,
  so the sync worker never attempted a write; (b) once write mode is
  enabled, `DirectusPolicyApplier.apply()` sent `policies` as a flat array
  of UUIDs, which Directus rejects with a generic 403 for the `policies`
  M2M alias field on `directus_users` regardless of token privilege level.
- **Fix:**
  1. `apps/api/.env` (local, untracked): added `RBAC_SYNC_WRITE_ENABLED=true`.
  2. `apps/api/.env.example`: documented the flag (previously entirely
     absent) with a comment explaining the dry-run default and pointing at
     this issue.
  3. `apps/api/src/modules/rbac-sync/directus-policy-applier.ts`: `apply()`
     now reads the user's existing `directus_access` row ids via
     `/users/{id}?fields=policies` (the alias-field read path — direct
     `GET /items/directus_access` is blocked, confirmed a genuine
     protected-system-collection restriction), then PATCHes `policies`
     using the nested `{create, update: [], delete: <existing ids>}`
     relational envelope instead of a flat UUID array — a full-replace
     write that stays idempotent per sync run.
- **Regression test:** `apps/api/test/rbac-directus-applier.spec.ts`,
  rewritten (the pre-existing version asserted the buggy flat-array shape,
  which is why this shipped silently) — 6 cases covering: correct
  read-then-replace flow, the relational envelope shape, existing-row
  deletion on replace, null country_code, `DirectusError` propagation on
  the PATCH call, and failure propagation when the existing-policies
  lookup itself fails.
- **Live verification (2026-07-28):** restarted the local API process to
  load the fix, triggered `POST /v1/internal/rbac/poll` (same endpoint the
  original repro used) — all 4 scanned UAT users now show
  `rbac_sync_jobs.directus_status: "applied"`, `directus_error: null`
  (previously `dry_run`, then `403` mid-investigation). Confirmed via
  direct Directus query that `uat-member@example.com` now has one real
  `directus_access` row resolving to `policy.member`.
- **Honesty disclosure (AGENTS.md §6.1):** live verification surfaced a
  SEPARATE, pre-existing gap this issue does not fix: all seven ADR-0021
  §4.1 policies (including `policy.member`) have zero
  `directus_permissions` rows anywhere in the codebase — `bootstrap.sh`
  seeds them as empty containers and its own comment defers permission
  content to "F-S2.2 RBAC sync service," but the sync service (correctly,
  per ADR-0021 §4.1's own text) never intended to own permission content,
  only policy assignment. This means a user with `policy.member` correctly
  attached (this issue's fix) still gets 403 reading `onboarded_at` — same
  symptom, different cause. Filed as
  [ISS-RBAC-PERMS-001](ISS-RBAC-PERMS-001.md), registered in
  `registry.md`, queued as `wf-20260728-fix-144` (workflow directory to be
  created when picked up — sizing the ADR-0021 §4.1 permission-row
  implementation is that workflow's own first step). This issue
  (ISS-UAT-RBAC-001) is closed as resolved because its own scope — the
  sync mechanism actually attaching policies — is fully fixed and verified
  live; it does not claim BP-UAT-003/BP-UAT-016 are unblocked end-to-end,
  which still requires ISS-RBAC-PERMS-001.
- **BP-UAT-003 / BP-UAT-016:** NOT re-run to a full pass in this workflow
  — the remaining blocker (ISS-RBAC-PERMS-001) means the live UAT session
  would still 403 on `onboarded_at`. Re-verification is owned by
  `wf-20260728-fix-144` (ISS-RBAC-PERMS-001) once permission rows exist,
  per AGENTS.md §6.1's "no deferred tests" rule — this is a named, queued
  follow-up, not a silent gap.
