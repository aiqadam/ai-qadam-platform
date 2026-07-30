# ISS-RBAC-PERMS-001 — The seven ADR-0021 RBAC policies have zero permission rows; policy attachment alone grants no access

| Field | Value |
|---|---|
| ID | ISS-RBAC-PERMS-001 |
| GitHub-Issue | https://github.com/aiqadam/ai-qadam-platform/issues/124 |
| Severity | blocker |
| Module | infrastructure/directus-bootstrap, api/rbac-sync |
| Status | resolved |
| Reported | 2026-07-28 |
| Resolved | 2026-07-31 |
| Workflow | `wf-20260728-fix-144` (policy.member own-row slice) → `wf-20260730-fix-160` (policy.member public-read/create-registration + policy.speaker, [PR #170](https://github.com/aiqadam/ai-qadam-platform/pull/170) squash `08932ab`) → `wf-20260731-fix-161` (remaining 5 policies: sponsor_rep/organizer/country_lead/svc_bot/svc_worker, PR TBD) |
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

## Update 2026-07-31 (`wf-20260731-fix-161`) — all 7 policies now implemented; 2 more real bugs found and fixed

Implemented and live-verified the remaining 5 policies:

- **`policy.sponsor_rep`:** read own `sponsors` row + own `event_sponsors`
  rows, scoped via `sponsors.rep_user == $CURRENT_USER`. **Confirmed with
  the user before implementing:** the ADR-0021 §4.2 / prior policy
  description referenced `companies.rep_user`, which does not exist —
  `companies` is a separate ADR-0033 cohort/entitlement primitive with no
  rep-linking field. The `partner_audiences`/cohort-entitlement half of
  the Effect (which links to `companies`, not `sponsors`) is out of
  scope pending that relationship being reconciled — not guessed at.
- **`policy.organizer`:** CRUD `events`/`event_speakers` and read/update
  `registrations` scoped to `directus_users.country == $CURRENT_USER.country`.
  `registrations` PII gated on the registrant's own
  `appear_on_attendee_list` opt-in (the pre-existing, already-shipped
  consent mechanism for exactly this "shown to organizers" purpose).
- **`policy.country_lead`:** same country-scoped events/registrations/
  event_speakers as organizer, but WITHOUT the opt-in PII gate (matches
  the Effect column's "see PII" vs organizer's "only on opt-in flag"),
  plus roster (`directus_users` read in-country) and sponsor-pipeline
  (`sponsors`/`event_sponsors` read in-country) grants. Implemented as a
  full standalone grant set, not additive on `policy.organizer` — found
  live that `group-mapping.ts` attaches ONLY `policy.country_lead` for
  the `aiqadam-country-lead-<c>` group, never `policy.organizer`
  alongside it, contrary to what the ADR's "organizer permissions +"
  phrasing implies.
- **`policy.svc_bot`:** read all `events`, read/write `registrations`
  (fields limited to `checked_in_at`/`status` for write), read
  `point_awards`. No `directus_users` grant at all (verified live that
  the bot still can't read a *different* user's PII — its own built-in
  self-read of `email` is a separate Directus system default unrelated
  to this policy, not a leak).
- **`policy.svc_worker`:** full CRUD on `interactions`/
  `interaction_deliveries`/`interaction_responses` (ADR's shorthand
  "deliveries"/"responses" — same naming-shorthand pattern already seen
  elsewhere in this file). Verified live it correctly CANNOT write
  `registrations` (403), matching "no registration writes".

### Two more real bugs found and fixed (bringing this issue's live-bug-discovery total to 5)

1. **`DirectusPolicyApplier` PATCHed the wrong field name.**
   `apps/api/src/modules/rbac-sync/directus-policy-applier.ts` sent
   `country_code: expected.filter_country` in its PATCH body — but the
   real field on `directus_users` is named `country`, not `country_code`.
   Directus silently ignores unknown body keys rather than erroring, so
   this PATCH always 200'd while writing nothing: confirmed live, every
   country-scoped RBAC policy (`organizer`, `country_lead`, and this
   workflow's own new grants) depended on this field and it had never
   actually been set by the sync service, ever. Fixed the field name
   in both the applier and its unit test (`rbac-directus-applier.spec.ts`,
   which mirrored the same bug in its assertions — same "test mirrors
   the bug" class already seen in `ISS-USR-REG-002`).
2. **`ensure_perm_for_policy`'s idempotency key silently collides when a
   policy needs two different-purpose grants on the SAME
   `(collection, action)`.** Tried to add `policy.country_lead` a narrow
   "self-only" `directus_users/read` grant (for `$CURRENT_USER.country`
   resolution) separate from its broader "roster" `directus_users/read`
   grant — Directus only permits ONE row per `(policy, collection,
   action)`, so the second `ensure_perm_for_policy` call silently no-op'd
   ("exists") against the first row instead of erroring. Fixed by
   consolidating into a single grant whose field list and filter cover
   both purposes (a country_lead's own row satisfies its own country
   filter, so no separate self-grant is needed). Documented as a
   reusable gotcha in the code comment for the next policy that needs
   two purposes on one collection+action.

### Live verification (2026-07-31)

Ran `bootstrap.sh` three times against local Directus: first run created
all new rows, second/third runs showed 100% "exists" (fully idempotent,
zero duplicate rows). Directly exercised every new grant with real
member-scoped Directus tokens, swapping the UAT fixture's attached
policy between runs and restoring it to a clean, no-policy state after:

- `policy.sponsor_rep`: created two `sponsors` rows (one `rep_user`'d to
  the test identity, one not) — confirmed the rep only sees their own
  org once the broader `policy.member` public-read grant was removed
  from the test identity (the two grants legitimately compose for a
  real user who holds both roles; this was a test-isolation artifact,
  not a bug).
- `policy.organizer`: confirmed events/registrations/event_speakers
  scoped strictly to the organizer's own `country` (a real `kz`-country
  user in the roster was correctly invisible to a `uz` organizer).
  Confirmed the `appear_on_attendee_list` PII gate with a genuine
  negative test — flipped a registrant's opt-in off, watched the exact
  affected rows (not just a count) disappear from the organizer's view,
  then restored it.
- `policy.country_lead`: same country-scoping verification; confirmed
  registrations are visible WITHOUT the opt-in gate (the "see PII"
  distinction from organizer).
- `policy.svc_bot`: confirmed collection-wide reads, a real
  `checked_in_at` write, and — critically — a 403 when attempting to
  read a DIFFERENT user's PII (proving "no PII except telegram_user_id"
  actually holds, not just that the policy has no grant on paper).
- `policy.svc_worker`: confirmed full interactions CRUD and a 403 on
  attempting to write `registrations`.

All test fixtures (sponsors, event_sponsors, interactions,
event_speakers rows) created during verification were deleted; the UAT
member identity (`uat-member@example.com`) was restored to its original
state (no attached policy beyond what it started with, `country: null`,
`token: null`).

## Resolution

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
- **Completed 2026-07-31 via `wf-20260731-fix-161`:** implemented the
  remaining 5 policies (`sponsor_rep`, `organizer`, `country_lead`,
  `svc_bot`, `svc_worker`), fixed 2 more real bugs found live (the
  `country_code`/`country` field-name mismatch in
  `DirectusPolicyApplier`, and an `ensure_perm_for_policy` idempotency-
  key collision when a policy needs two grants on the same
  collection+action) — see the 2026-07-31 update above for full detail
  and live-verification evidence. **All seven ADR-0021 §4.1 policies now
  have real, live-verified permission rows.** This issue's original
  Symptom (`onboarded_at` 403) turned out to be two stacked bugs; the
  permission-row half is fully fixed by this issue, but the field itself
  still doesn't exist in the schema — tracked separately at
  [ISS-RBAC-ONBOARDED-AT-001](ISS-RBAC-ONBOARDED-AT-001.md)
  ([GitHub #168](https://github.com/aiqadam/ai-qadam-platform/issues/168)),
  which is NOT resolved by closing this issue.
- **Known remaining gaps, deliberately out of scope, each with its own
  tracking:** `policy.member`'s `interaction_responses`/
  "feedback_responses" create clause (Directus-policy-level enforcement
  is architecturally impossible, needs an API-layer guard — see the
  2026-07-30 update above); `policy.sponsor_rep`'s
  `partner_audiences`/cohort-entitlement half (needs the `sponsors` ↔
  `companies` relationship reconciled first); the unmanaged Public-role
  grants on `events`/`speakers`/`event_speakers` found along the way
  ([ISS-SEC-PUBLIC-UNMANAGED-001](ISS-SEC-PUBLIC-UNMANAGED-001.md),
  [GitHub #169](https://github.com/aiqadam/ai-qadam-platform/issues/169)).

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
3. ~~`policy.sponsor_rep` — read own org's `sponsorships`/opt-in leads via
   dynamic filter `{ sponsorships: { sponsor_id: { _eq:
   $CURRENT_USER.sponsor_id } } }`.~~ **Done as of `wf-20260731-fix-161`**
   — implemented against the real `sponsors.rep_user` FK (confirmed with
   user; `sponsorships`/`companies.rep_user` don't exist), the
   `partner_audiences` cohort half remains out of scope.
4. ~~`policy.organizer` — CRUD `events`/`registrations`/`event_speakers` in
   country, via `{ country_code: { _eq: "<country>" } }` filter; PII
   fields gated on opt-in flag per the PII data-flow doc referenced in
   ADR-0021 §3.~~ **Done as of `wf-20260731-fix-161`** — the real field
   is `country`, not `country_code` (also fixed in `DirectusPolicyApplier`,
   see 2026-07-31 update); PII gate uses `appear_on_attendee_list`.
5. ~~`policy.country_lead` — organizer permissions + roster management +
   sponsor pipeline + PII.~~ **Done as of `wf-20260731-fix-161`** — as a
   full standalone grant set, not additive on `policy.organizer` (see
   2026-07-31 update for why).
6. ~~`policy.svc_bot` — read all `events`, write
   `registrations.checked_in_at`, read `point_awards`; no PII except
   `telegram_user_id`.~~ **Done as of `wf-20260731-fix-161`.**
7. ~~`policy.svc_worker` — CRUD `interactions`/`deliveries`/`responses`; no
   registration writes.~~ **Done as of `wf-20260731-fix-161`** — real
   collection names `interactions`/`interaction_deliveries`/
   `interaction_responses`.

All seven policies now have live-verified permission rows. Remaining
gaps are tracked separately (see the 2026-07-31 Resolution update
above) rather than blocking this issue's closure.
