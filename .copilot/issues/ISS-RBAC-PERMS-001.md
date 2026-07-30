# ISS-RBAC-PERMS-001 — The seven ADR-0021 RBAC policies have zero permission rows; policy attachment alone grants no access

| Field | Value |
|---|---|
| ID | ISS-RBAC-PERMS-001 |
| GitHub-Issue | https://github.com/aiqadam/ai-qadam-platform/issues/124 |
| Severity | blocker |
| Module | infrastructure/directus-bootstrap, api/rbac-sync |
| Status | in-progress (`policy.member` + `policy.speaker` done; 5 policies remain) |
| Reported | 2026-07-28 |
| Resolved | — |
| Workflow | `wf-20260728-fix-144` (policy.member own-row slice) → `wf-20260730-fix-160` (policy.member public-read/create-registration + policy.speaker, [PR #170](https://github.com/aiqadam/ai-qadam-platform/pull/170) squash `08932ab`); remaining 5 policies queued as `wf-rbac-perms-001-remaining-policies` |
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

## Update 2026-07-30 (`wf-20260730-fix-160`) — `policy.member` completed (minus one deliberately-unimplementable clause); `policy.speaker` shipped; 3 real bugs found and fixed along the way; 2 new issues split off

Implemented and verified live against the local Directus stack:

- **`policy.member` — "read public collections":** 7 new read grants
  (`events`, `point_awards`, `partners`, `homepage_hero`, `sponsors`,
  `speakers`, `countries`), reusing the existing S0.1 `COUNTRY_FILTER`
  constant.
- **`policy.member` — "create registrations ... keyed to self":**
  implemented with a `validation` clause (see bug #2 below for why
  `permissions` alone was insufficient).
- **`policy.member` — "create ... feedback_responses keyed to self":**
  **deliberately NOT implemented.** No `feedback_responses` collection
  exists; the real analog is `interaction_responses`, which has no
  direct owner column (ownership is one hop via
  `delivery → interaction_deliveries.recipient_user`). Tested live: this
  cannot be enforced by either Directus `permissions` or `validation` —
  neither can express "this FK must point at a row matching a
  condition" at create time. Needs an API-layer guard instead (out of
  scope for a permissions-seeding PR). See the bootstrap.sh comment at
  the `[policy.member — create own interaction_responses]` (removed)
  section for the full empirical writeup.
- **`policy.speaker`:** both Effect-column grants implemented —
  `speakers/update` scoped to own row, `event_speakers/read` scoped via
  `speaker.user == $CURRENT_USER`.

### Three real, previously-unverified bugs found and fixed while proving these grants live

Every prior workflow that touched this area (`wf-20260728-fix-144`)
verified via a real browser session or direct field read-back, but
never actually exercised the `COUNTRY_FILTER`/`$CURRENT_USER`-dynamic-
value machinery live, because `POLICY_DEMO_TENANT` (the only prior
policy carrying that filter shape) is seeded but never attached to any
real user. This workflow's `policy.member` public-read grants are the
first to both carry that filter AND be attached to a live user — which
is how all three of these surfaced:

1. **`$CURRENT_USER.<field>` as a bare dotted filter KEY 400s** ("Invalid
   filter key") on this Directus version (11.17.4) — `$CURRENT_USER`
   only resolves as a dynamic VALUE, never as part of a filter key path.
   The correct form nests it as a relational filter object:
   `{"$CURRENT_USER":{"is_test_user":{"_eq":true}}}`. Fixed at the
   source (`COUNTRY_FILTER` and every other call site using the old
   `$CURRENT_USER.is_test_user` form) in `bootstrap.sh` — this was a
   pre-existing bug in the S0.1 demo-tenant section, not something this
   workflow introduced, just the first workflow to exercise it live.
2. **Directus `permissions` has NO enforcement effect on `create`.**
   A `{"user":{"_eq":"$CURRENT_USER"}}` `permissions` filter on
   `registrations/create` let a member successfully register a
   DIFFERENT user for an event — confirmed by directly reading back the
   created row. `permissions` filters which EXISTING rows an action can
   touch; there are no existing rows at create time. The actual
   submitted-value constraint belongs in Directus's separate
   `validation` field. Fixed by extending `ensure_perm_for_policy` with
   an optional `validation_json` 7th argument and passing it for the
   `registrations/create` grant; re-verified live (self-create 204,
   on-behalf-of create now correctly 400s
   `"Value has to be \"<own-id>\""`).
3. **`validation` cannot traverse a relational FK to check a column on
   the related row** — attempted the same fix for
   `interaction_responses/create` (`delivery.recipient_user ==
   $CURRENT_USER`), which made even the LEGITIMATE self-response 400
   ("Value is required"). This is a genuine Directus-policy-level
   architectural limit, not a mistake in the filter shape — confirmed
   by testing multiple filter forms. Resulted in the "not implemented"
   decision above rather than shipping a grant with no real enforcement.

**Also found, independently, while chasing bug #1:** `events`,
`speakers`, and `event_speakers` are fully world-readable with zero
authentication on this environment via unmanaged Directus Public-role
grants that exist nowhere in `bootstrap.sh` or version control — split
to its own issue,
[ISS-SEC-PUBLIC-UNMANAGED-001](ISS-SEC-PUBLIC-UNMANAGED-001.md)
([GitHub #169](https://github.com/aiqadam/ai-qadam-platform/issues/169)),
since it's an independent, security-classed finding unrelated to this
issue's actual scope. **This is also why bug #1 above looked like it
"worked" on first pass for `events`/`speakers`** (their unrestricted
Public grant silently masked the broken filter) **but not for
`partners`/`point_awards`/`homepage_hero`/`sponsors`** (no such masking
grant exists on those) — the discrepancy is what surfaced bug #1 in the
first place.

**Also found:** `directus_users.onboarded_at` — the exact field named in
this issue's original Symptom section below — does not exist as a
field anywhere in the local schema, despite `MEMBER_PROFILE_FIELDS`
referencing it since `wf-20260728-fix-144` and 4 real `apps/api` modules
depending on it. This means the original symptom was two independent
bugs stacked together; only the permission-row half is fixed by this
workflow. Split to
[ISS-RBAC-ONBOARDED-AT-001](ISS-RBAC-ONBOARDED-AT-001.md)
([GitHub #168](https://github.com/aiqadam/ai-qadam-platform/issues/168)).

### Known limitation: `ensure_perm_for_policy` does not update existing rows

The helper is pure create-if-missing (identifies by policy+collection+
action, skips if a row already exists). This means the `$CURRENT_USER`
filter-shape fix (bug #1) and the new `validation` argument (bug #2) do
NOT retroactively repair rows already created by a PRIOR run of
`bootstrap.sh` on an already-bootstrapped environment (e.g. QA, prod, or
any other developer's local stack) — they only apply to newly-created
rows. Any environment that already ran the pre-fix version of this file
needs either a manual `PATCH /permissions/<id>` per affected row, or a
full re-seed. Not automated in this PR; flagging so whoever next
bootstraps or re-bootstraps a shared environment knows to check.

### Still not implemented (unchanged scope)

`policy.sponsor_rep`, `policy.organizer`, `policy.country_lead`,
`policy.svc_bot`, `policy.svc_worker` — all five still have zero
permission rows. Each needs country-scoped or cross-collection dynamic
filters materially different from what this workflow shipped (see
Suggested Approach below, items 3–7 — still accurate). Queued as
[`wf-rbac-perms-001-remaining-policies`](../tasks/queued/wf-rbac-perms-001-remaining-policies/handoff.yaml).

## Resolution (partial — this issue stays `in-progress`, not `resolved`)

- **Workflow:** `wf-20260730-fix-160`
- **PR:** [#170](https://github.com/aiqadam/ai-qadam-platform/pull/170) squash `08932ab` (merged 2026-07-30, admin override on pre-existing unrelated `architecture-check` failure — see PR-Steward gate record in `wf-20260730-fix-160`'s archived `handoff.yaml`)
- **Shipped:** `policy.member`'s remaining two Effect clauses (public
  reads, create-own-registration) and `policy.speaker` in full, plus 3
  real Directus-behavior bug fixes discovered while proving the grants
  live (see 2026-07-30 update above for detail): the `COUNTRY_FILTER`
  `$CURRENT_USER` dotted-key bug (pre-existing, from S0.1, first
  exercised live by this workflow), the `create`-time `validation` vs
  `permissions` distinction (`ensure_perm_for_policy` gained an optional
  7th `validation_json` arg), and the discovery that
  `interaction_responses`'s ownership cannot be enforced at the
  Directus-policy level at all (left unimplemented rather than shipped
  broken).
- **Live-verified (2026-07-30):** ran `bootstrap.sh` twice against local
  Directus (idempotent, 11 new rows on first run, all "exists" on
  second). Minted a real member-scoped Directus token for
  `uat-member@example.com` and directly exercised every new grant:
  public reads on `events`/`point_awards`/`countries` (200, real data);
  own-row `directus_users` update + read-back; `registrations` create
  self-succeeds (204) / on-behalf-of-another-user correctly rejected
  (400, post-fix); `policy.speaker`'s `event_speakers` read scoping
  verified with temporary test fixtures (created, tested, deleted). All
  test data cleaned up; UAT fixture identity restored to its pre-test
  state (token cleared, job_title cleared, policy.speaker detached).
- **NOT resolved by this workflow** — 5 of 7 policies remain
  unimplemented (queued follow-up above), and the issue's own original
  Symptom (`onboarded_at` 403) turned out to be two stacked bugs; only
  the permission-row half is fixed here (see
  [ISS-RBAC-ONBOARDED-AT-001](ISS-RBAC-ONBOARDED-AT-001.md) for the
  other half). Status intentionally stays `in-progress`.

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

1. ~~`policy.member` — read public collections; CRUD own `directus_users`
   row (including custom fields like `onboarded_at`, `job_title`,
   `bio_md`); create `registrations`/`feedback_responses` keyed to
   self.~~ **Done as of `wf-20260730-fix-160`**, except
   `feedback_responses`/`interaction_responses` create (see 2026-07-30
   update above — not implementable at the Directus-policy level).
2. ~~`policy.speaker` — + update own `speakers` row, read own
   `event_speakers` rows.~~ **Done as of `wf-20260730-fix-160`.**
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
