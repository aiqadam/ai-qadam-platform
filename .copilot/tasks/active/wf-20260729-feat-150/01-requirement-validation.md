# Step 1 — Requirement Validation: FR-ADM-011

## Raw Input

`docs/03-requirements/FR-ADM-011.md` — "Admin user and role management
screen." Already fully drafted (status: `Proposed`) via the
business-process-development workflow `wf-20260728-bp-147`, including a
matching UAT script `docs/02-business-processes/uat/BP-UAT-021.md`. This
step formalizes it for implementation rather than drafting from scratch.

## Analysis

### Completeness Issues Found

The FR document is complete against the 5-criteria bar (specific,
testable, non-conflicting, scoped, referenced), but a direct code survey
(this workflow, prior to Step 1) found two of its stated reuse premises
do not match current code and must be corrected before CodeDeveloper
starts:

1. **"reuses the same role-label mapping `apps/web-next/src/lib/roles.ts`
   already encodes as predicates"** — `roles.ts` (42 lines) contains only
   boolean predicates (`isSuperAdmin`, `isOperator`, `satisfiesRole`)
   operating on raw group-slug arrays. **No plain-language label mapping
   exists there today.** CodeDeveloper must ADD a label function (e.g.
   `roleLabel(group: string): string`) to this file — consistent with its
   "single source of truth" framing — not merely import one.
2. **"Shared enforcement logic with FR-ADM-010's bootstrap-time check
   (single source of truth for 'how many super-admins exist and is 3 the
   limit')"** — `AdminBootstrapService.hasSuperAdminMember()`
   (`admin-bootstrap.service.ts:91-95`) is a private method answering only
   "≥1 member" (bootstrap-needed check), not a count, and not compared
   against 3 anywhere in the codebase. FR-ADM-010's own Notes section
   confirms this explicitly: "Ongoing enforcement (blocking further
   grants once at 3) is FR-ADM-011's responsibility, not this
   requirement's." **No reusable cap-check function exists yet — this
   workflow must create it** (natural home: exported from
   `authentik.client.ts`, next to the existing `SUPER_ADMIN_GROUP`
   constant, whose comment already anticipates this: "so FR-ADM-011
   (ongoing super-admin cap enforcement) has a natural shared home to
   import from too"). `AdminBootstrapService` should then be refactored
   to call the same shared primitive for its own `>=1` check, so the two
   call sites can never disagree on what "super-admin count" means.

Both corrections are additive clarifications, not conflicts — the FR's
intent ("single source of truth," "reuse rather than duplicate") is
unchanged; only the starting state was slightly ahead of actual code.

### Conflicts with Existing Features

None. This FR explicitly extends `FR-ADM-005` (invite list →
invite+manage) and depends on infrastructure from `FR-ADM-007` (RBAC
sync's `AuthentikClient`), `FR-ADM-008` (audit log), and `FR-ADM-010`
(bootstrap, cap language) — all `Shipped`/`Implemented`. No overlapping
in-flight FR touches `/workspace/admin/users` or `/v1/admin/users/*`.

### Architectural Feasibility

Fits cleanly within existing module boundaries:
- **API**: new controller/service inside `apps/api/src/modules/admin-invites/`
  (or a small sibling module importing `AuthentikModule` directly, per
  `admin-invites.module.ts`'s comment that `SuperAdminGuard` was moved to
  `AuthentikModule` specifically "so it can be reused... by future admin
  surfaces without each importing `AdminInvitesModule`"). Reuses
  `AuthentikClient`, `SuperAdminGuard`, `AuditEventsService` — no new
  cross-module dependency.
- **Frontend**: extends the existing `/workspace/admin/users` Astro page
  and adds a new island alongside `InvitesList`, following the exact
  `AuthGate role="aiqadam-super-admin"` + TanStack Query hook pattern
  already used by `use-invites.ts`.
- **No DB schema change** — Authentik remains the sole write target for
  role state per ADR-0021 §1 ("Authentik is the source of truth... no app
  reads `users.role` from Postgres for authorisation"). Audit events are
  the only new persisted rows, and `audit_events` (Directus collection)
  already exists per FR-ADM-008 — no migration needed.
- No violation of module boundaries, no cross-schema queries, no new
  circular dependency.

### Test Scope

No Testcontainers-Authentik double exists in this repo (confirmed by
direct grep and by `admin-bootstrap.service.ts`'s own comment). Unit
tests for anything touching `AuthentikClient` will follow the established
`FakeAuthentik` hand-mock pattern (`apps/api/test/admin-bootstrap.service.spec.ts`),
not attempt a live-Authentik integration test. This matches
`FR-ADM-010`'s own precedent of shipping with `Implemented` status while
the true end-to-end Authentik behavior is confirmed by post-merge
`BP-UAT-021` (agent-driven live session), not by the unit suite.

`BP-UAT-021` already exists (authored at `wf-20260728-bp-147` Step 4) and
is marked "not runnable today... becomes runnable once FR-ADM-011 ships."
Its own Notes section flags an **unresolved fixture gap**: Negative-001
(cap-blocks-4th-grant) needs an environment with exactly 3 existing
`aiqadam-super-admin` members, which the standard UAT seed (1 super-admin)
does not provide. This is inherited as an open risk for
Step 13 (post-merge UAT) — TestDesigner/Orchestrator must decide at that
point whether to seed 2 additional throwaway super-admin fixtures or unit-
test the cap boundary exhaustively instead (recommended: cover the exact
boundary — count=2→allow, count=3→block — thoroughly at the unit level
per AGENTS.md §3 "every public function has a unit test," and treat the
live 3-admin scenario as best-effort/deferred-with-disclosure at
Step 13 if fixture provisioning proves unsafe against shared local state).

## Formalized Requirement

**FR-ADM-011** — Admin user and role management screen (module `ADM`,
already assigned; no new FEAT-ID needed since the FR file and number
pre-exist from the business-process-development workflow).

Scope, users, and acceptance criteria are as written in
`docs/03-requirements/FR-ADM-011.md` — reproduced here for traceability,
with the two corrections above layered in as implementation guidance:

1. Extend `/workspace/admin/users` with a "Manage users" tab/mode
   alongside the existing "Invites" view (`InvitesList`). Exact IA is
   CodeDeveloper's call.
2. User search by email/name (`AuthentikClient` currently has
   `getUserByEmail`, `getUserById`, `listActiveUsers` — no filtered
   search method; CodeDeveloper decides whether client-side filtering of
   `listActiveUsers()` suffices for current scale (~100 operators per
   existing code comments) or a new Authentik query-filter method is
   needed).
3. Plain-language current-role display — requires the new `roleLabel()`
   addition to `roles.ts` (see Completeness Issues #1).
4. Grant/revoke form (dropdown/checkbox, no free text), with the
   ADR-0021 ≤3-super-admin hard-block cap check reusing the new shared
   primitive (see Completeness Issues #2).
5. Apply via `AuthentikClient.setUserGroups()` — note this method
   **replaces** the full group list (not additive/subtractive) per its
   own doc comment; grant/revoke must read the user's current
   `groups_obj` first (via `getUserById`), compute the merged/reduced
   set, then call `setUserGroups()` with the complete resulting pk list.
   Then re-read (`getUserById` again) and return the actually-applied
   state — never an optimistic assumption.
6. Audit log entry via `AuditEventsService.emit()` — new dot-namespaced
   event names (e.g. `admin.role.granted` / `admin.role.revoked`,
   consistent with the existing `invite.created`/`invite.revoked`
   convention, not the FR doc's prose example `role_changed`), severity
   `high` (matches the audit precedent for admin/role-sensitive actions
   in ADR-0021 §8), payload carrying before/after group state.
7. New endpoints: `GET /v1/admin/users/:id/roles`,
   `PATCH /v1/admin/users/:id/roles` — both behind
   `@UseGuards(AuthGuard, SuperAdminGuard)`, the exact pattern used by
   `AdminInvitesController` and `AdminRbacController`.

**Cross-refs:** `FR-ADM-005` (extends), `FR-ADM-007` (shares
`AuthentikClient`), `FR-ADM-008` (audit sink), `FR-ADM-010` (shares cap
concept + `AuthentikClient`), `ADR-0021` (RBAC manifest, ≤3 cap
language), `BP-UAT-021` (post-merge verification script, pre-authored).

**Requirements-registry update needed at Step 9:** add row `# 68` to the
implementation-order table in `docs/03-requirements/requirements-registry.md`
(`FR-ADM-011 | Admin user and role management screen | <status> | ADM-005,
ADM-007, ADM-008, ADM-010`) — currently the table stops at row 67
(`FR-ADM-010`); FR-ADM-011 is listed in the module index line but not yet
in the ordered implementation table.

## Acceptance Criteria (draft, formalizing FR doc's AC-1..AC-6 for TestDesigner)

- **AC-1** (Given a super-admin is signed in and on `/workspace/admin/users`
  "Manage users" view, When they search an existing user's email, Then
  the result shows that user's current role(s) in plain language derived
  from `roleLabel()`, never a raw `aiqadam-*` slug string in the UI).
- **AC-2** (Given a super-admin submits a role grant for a target user,
  When the API call succeeds, Then the response body contains the
  freshly re-read post-change group state — not merely `{ok:true}` — and
  the UI renders that re-read state before allowing navigation away).
- **AC-3** (Given exactly 3 users already hold `aiqadam-super-admin`,
  When a super-admin attempts to grant `aiqadam-super-admin` to a 4th
  user, Then the API returns a non-200 rejection citing the ADR-0021 cap
  and no group mutation occurs — verified at both the unit level, boundary
  count=2→allowed/count=3→blocked, and (best-effort) at Step 13 live UAT).
- **AC-4** (Given a super-admin submits a role revoke for a target user,
  When the API call succeeds, Then the response contains the re-read
  post-change state showing the role removed, mirroring AC-2's pattern).
- **AC-5** (Given any grant or revoke completes, When the audit log is
  queried, Then exactly one new entry exists showing requester
  (`actor_id`), target user (`target_id`), the role, and before/after
  group state in `payload_json`).
- **AC-6** (Given a user without `aiqadam-super-admin` membership, When
  they call `GET/PATCH /v1/admin/users/:id/roles` directly or navigate to
  the screen, Then they receive `403 Forbidden` from the API and cannot
  reach the screen's data, matching `SuperAdminGuard`'s existing
  behavior for `FR-ADM-005`/`FR-ADM-007`).

## Gate Result

gate_result:
  status: passed
  summary: "FR-ADM-011 is specific, testable, non-conflicting, and architecturally feasible; two reuse premises in the FR text (role-label mapping, shared cap-check) require new code rather than pure import, documented above as implementation guidance rather than blocking issues."
  findings:
    - "roles.ts has no plain-language label mapping today — CodeDeveloper must add roleLabel() as new code, not import an existing one."
    - "No shared >=1/<=3 super-admin cap-check function exists yet — CodeDeveloper must extract one (natural home: authentik.client.ts next to SUPER_ADMIN_GROUP) and refactor AdminBootstrapService to use it too, per FR-ADM-010's own Notes deferring this responsibility to FR-ADM-011."
    - "AuthentikClient.setUserGroups() is REPLACE semantics, not additive — grant/revoke must read-merge-write."
    - "BP-UAT-021 pre-exists and flags an open fixture gap (3-super-admin scenario) for Step 13, not a Step 1 blocker."
    - "requirements-registry.md implementation-order table needs a new row (#68) for FR-ADM-011 at Step 9 — currently only listed in the module index, not the ordered table."
