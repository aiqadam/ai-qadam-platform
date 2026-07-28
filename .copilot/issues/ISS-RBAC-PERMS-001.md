# ISS-RBAC-PERMS-001 — The seven ADR-0021 RBAC policies have zero permission rows; policy attachment alone grants no access

| Field | Value |
|---|---|
| ID | ISS-RBAC-PERMS-001 |
| Severity | blocker |
| Module | infrastructure/directus-bootstrap, api/rbac-sync |
| Status | in-progress (`policy.member` done; 6 policies remain) |
| Reported | 2026-07-28 |
| Resolved | — |
| Workflow | `wf-20260728-fix-144` (policy.member slice); remainder still queued, not yet a task directory |
| Reporter | Orchestrator (discovered while verifying the fix for [ISS-UAT-RBAC-001](ISS-UAT-RBAC-001.md)) |
| Business-Process | BP-UAT-003, BP-UAT-016 (and, by the same mechanism, any BP-UAT that needs a fully-permissioned authenticated member session) |

## Update 2026-07-28 — `policy.member`'s core grants shipped

While fixing [ISS-USR-PROFILE-002](ISS-USR-PROFILE-002.md) (every real
member's `/me/profile` 500ing in production/QA — a direct, more severe
consequence of this same gap), `policy.member`'s own-row grants on
`directus_users`, `member_consents`, `member_skills`, `member_interests`,
and `member_employments` were implemented in
`infrastructure/directus/bootstrap.sh` (`ensure_perm_for_policy` +
14 permission rows) and verified live via `wf-20260728-fix-144`. This
covers everything `/me/profile` needs. **Not yet covered:** the
"read public collections" and "create registrations/feedback_responses
keyed to self" halves of `policy.member`'s ADR-0021 §4.1 Effect, and all
six remaining policies (`policy.speaker` through `policy.svc_worker`) are
still fully unimplemented. Re-read the Suggested Approach section below
before picking this up again — item 1 is partially done, items 2-7 are
untouched.

## Symptom

After [ISS-UAT-RBAC-001](ISS-UAT-RBAC-001.md)'s fix, `RbacSyncService` now
successfully attaches the correct Directus policy to every synced user
(`rbac_sync_jobs.directus_status: "applied"`, confirmed live 2026-07-28).
However, a seeded UAT member with `policy.member` attached **still** gets
`403` reading a custom `directus_users` field:

```
GET /users/{directus-id}?fields=...,onboarded_at
→ 403 "You don't have permission to access field \"onboarded_at\" in
   collection \"directus_users\" or it does not exist."
```

## Root cause (confirmed live, 2026-07-28)

`policy.member` (and by inspection, all seven ADR-0021 §4.1 RBAC policies:
`policy.member`, `policy.speaker`, `policy.sponsor_rep`, `policy.organizer`,
`policy.country_lead`, `policy.svc_bot`, `policy.svc_worker`) have **zero**
rows in `directus_permissions`:

```sql
SELECT id, collection, action, fields FROM directus_permissions
WHERE policy = '400e0021-0000-4000-8000-000000000001'; -- policy.member
-- 0 rows
```

`infrastructure/directus/bootstrap.sh` (`F-S2.2-pre`, lines ~2561–2600)
seeds these as **empty policy containers only** — the code comment says so
explicitly: *"Each is an empty container today — per-collection permission
rows (the 'Effect' column in §4.1) land with F-S2.2 RBAC sync service."*
`ADR-0021` §4.1 (`docs/adr/0021-rbac-manifest.md:87`) says the opposite of
what actually happened: *"Authoritative declaration:
`infrastructure/directus/bootstrap.sh`... The RBAC sync service (Sprint
2.2) does not create policies; it only assigns existing policies to users."*

Net effect: **nobody ever implemented the per-collection permission rows**.
`bootstrap.sh`'s comment deferred them to the sync service; the sync
service (correctly, per its own ADR) never intended to own them. The
policies exist and (after ISS-UAT-RBAC-001's fix) get attached to users
correctly, but every one of them grants nothing — a member with
`policy.member` attached has the exact same effective permissions as a
member with no policy at all (both fall back to Directus's built-in
`$CURRENT_USER` narrow field allowlist).

## Impact

- Same blocked verifications as ISS-UAT-RBAC-001 (BP-UAT-003, BP-UAT-016
  post-merge checks for ISS-USR-PROFILE-001) — ISS-UAT-RBAC-001's fix was
  necessary but not sufficient; this issue is the remaining blocker.
- Every one of the seven ADR-0021 §4.1 policies is affected, not just
  `policy.member` — this blocks any UAT/production flow that depends on
  `policy.speaker`, `policy.sponsor_rep`, `policy.organizer`,
  `policy.country_lead`, `policy.svc_bot`, or `policy.svc_worker` granting
  their documented "Effect" (ADR-0021 §4.1 table).

## Suggested approach (not yet implemented — sized out of ISS-UAT-RBAC-001's scope)

Implement the `directus_permissions` rows for all seven policies per the
ADR-0021 §4.1 "Effect" column, added to `infrastructure/directus/bootstrap.sh`
alongside the existing empty-container seeding (~line 2561 onward):

1. `policy.member` — read public collections; CRUD own `directus_users`
   row (including custom fields like `onboarded_at`, `job_title`,
   `bio_md`); create `registrations`/`feedback_responses` keyed to self.
2. `policy.speaker` — + update own `speakers` row, read own
   `event_speakers` rows.
3. `policy.sponsor_rep` — read own org's `sponsorships`/opt-in leads via
   dynamic filter `{ sponsorships: { sponsor_id: { _eq:
   $CURRENT_USER.sponsor_id } } }`.
4. `policy.organizer` — CRUD `events`/`registrations`/`event_speakers` in
   country, via `{ country_code: { _eq: "<country>" } }` filter; PII
   fields gated on opt-in flag per the PII data-flow doc referenced in
   ADR-0021 §3.
5. `policy.country_lead` — organizer permissions + roster management +
   sponsor pipeline + PII.
6. `policy.svc_bot` — read all `events`, write
   `registrations.checked_in_at`, read `point_awards`; no PII except
   `telegram_user_id`.
7. `policy.svc_worker` — CRUD `interactions`/`deliveries`/`responses`; no
   registration writes.

This is a substantial, multi-collection permission-authoring task (likely
its own PR, possibly split further) — sizing it precisely is this issue's
first step when picked up, not ISS-UAT-RBAC-001's.

## Resolution

- **Workflow:** not yet scheduled.
- **PR:** —
