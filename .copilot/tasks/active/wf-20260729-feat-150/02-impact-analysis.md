# Step 2 — Impact Analysis: FR-ADM-011

## Validated Requirement

FR-ADM-011 — Admin user and role management screen. Extends
`/workspace/admin/users` with a "Manage users" view: search any user,
show plain-language roles, grant/revoke with a hard ≤3-super-admin cap,
live re-read confirmation, and an audit trail. Full detail in
`01-requirement-validation.md`.

## Affected Layers

### API (NestJS)

| Module | File | Change |
|---|---|---|
| `apps/api/src/modules/admin-invites/` | `authentik.client.ts` | Add `superAdminGroupCount(): Promise<number>` (or equivalent) exported alongside `SUPER_ADMIN_GROUP` — the shared cap-count primitive. No change to existing methods; `setUserGroups`/`getUserById`/`resolveGroupNames` reused as-is. |
| `apps/api/src/modules/admin-invites/` | `admin-bootstrap.service.ts` | Refactor `hasSuperAdminMember()` to call the new shared primitive instead of its own inline `resolveGroupNames` + `.users.length` check — same source of truth, per FR text. Behavior-preserving refactor (still `>=1`). |
| `apps/api/src/modules/admin-invites/` | **new** `admin-user-roles.service.ts` | Core logic: search users, read current roles (plain-language + raw), grant/revoke via read-merge-write against `setUserGroups()`, cap check, re-read, emit audit event. |
| `apps/api/src/modules/admin-invites/` | **new** `admin-user-roles.controller.ts` | `GET /v1/admin/users/:id/roles`, `PATCH /v1/admin/users/:id/roles`, plus a list/search endpoint (`GET /v1/admin/users?q=`) needed to satisfy AC-1's "search for an existing user" — the FR's endpoint list (item 7) only names the `:id/roles` pair; search needs its own list endpoint, added here as an impact-analysis addition since the FR's functional-scope item 2 requires it but item 7 omitted it. |
| `apps/api/src/modules/admin-invites/` | `admin-invites.module.ts` | Register new controller + service in `providers`/`controllers`. No new module-level import needed — `AuthentikModule`, `AuditModule` already imported. |
| `apps/web-next/src/lib/` | `roles.ts` | Add `roleLabel(group: string): string` (or `roleLabels(groups): {group,label}[]`) plain-language mapping, covering every ADR-0021 §2 group (member, speaker, sponsor_rep, per-country organizer/country_lead, super_admin) — service-account groups (`aiqadam-svc-bot`/`aiqadam-svc-worker`) excluded from the grantable-role list per ADR-0021 §8 ("a human user must never be a member of a `aiqadam-svc-*` group"). |

### DB Changes Required: **no**

Authentik remains the sole write target for role state (ADR-0021 §1).
`audit_events` (Directus collection) already exists per FR-ADM-008 — no
new columns, no new table, no Drizzle migration. **Step 3
(DBMigrationAuthor) is skipped for this workflow.**

### Shared Types

`apps/web-next/src/lib/types.ts` gains new interfaces: `AdminUserSummary`
(search-result row), `AdminUserRoles` (current roles: plain-language +
raw group list), `GrantRevokeRoleBody`, `GrantRevokeRoleResult` (the
re-read post-change state). Follows the existing pattern of
`InviteSummary`/`CreateInviteBody`/`CreateInviteResult` in the same file
— no `packages/shared-types` changes needed since this repo's established
convention keeps web-next's API-facing types local to `apps/web-next/src/lib/types.ts`,
not the shared package (confirmed: `InviteSummary` etc. are not in
`packages/shared-types`).

### Frontend

- `apps/web-next/src/pages/workspace/admin/users/index.astro` — add a
  tab/mode toggle ("Invites" | "Manage users") per FR functional-scope
  item 1. CodeDeveloper's IA choice; recommend a simple client-side tab
  (no new route) to minimize surface — consistent with AGENTS.md §4
  small-PR discipline and avoiding a second Astro page + duplicate
  `AuthGate` wrapper.
- **New** `apps/web-next/src/blocks/workspace/UserRolesManager.tsx` — the
  new island: search box, result list/detail, role grant/revoke form
  controls (checkbox/dropdown, no free text per FR item 4), live
  re-read confirmation panel. Mirrors `InvitesList.tsx`'s structure
  (`IslandRoot` wrapper, `DataTable` reuse for search results).
- **New** `apps/web-next/src/lib/use-admin-user-roles.ts` — TanStack Query
  hooks (`useUserSearch`, `useUserRoles`, `useGrantRevokeRole`) mirroring
  `use-invites.ts`'s exact structure (`apiClient`, query-key arrays,
  `invalidateQueries` on mutation success).

### Bot

None. Out of scope — this is a web-only operator surface per
`docs/adr/0015-bot-scope-and-web-authoring-split.md` (authoring/admin
stays web-only).

### Workers

None. No new BullMQ queue — grant/revoke is synchronous
(`AuthentikClient.setUserGroups()` + immediate re-read), matching the
existing invite-consume pattern's synchronous Authentik calls.

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| `/v1/admin/users` | GET | **New.** Search/list users (query param `q` matching email/name). Guarded `AuthGuard, SuperAdminGuard`. | No |
| `/v1/admin/users/:id/roles` | GET | **New.** Current roles (plain-language + raw group names) for target user. Guarded. | No |
| `/v1/admin/users/:id/roles` | PATCH | **New.** Grant/revoke body `{ grant?: RoleGroup, revoke?: RoleGroup, country?: CountryCode }`; returns re-read post-change state. Guarded. Blocks with a non-200 + ADR-0021-citing message when the change would exceed the ≤3 super-admin cap. | No |

No existing endpoint is modified. `AdminInvitesController`'s
`/v1/admin/invites/*` surface is untouched.

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| `AdminUserRolesService` | `AuthentikClient` | Direct injection (existing `AuthentikModule` export) |
| `AdminUserRolesService` | `AuditEventsService.emit()` | Direct injection (existing `AuditModule` export) |
| `AdminBootstrapService` (refactor) | new shared cap-count primitive in `authentik.client.ts` | Same-file function call, not cross-module |
| `apps/web-next` island | `GET/PATCH /v1/admin/users*` | `apiClient` (existing HTTP wrapper, same as `use-invites.ts`) |

No new cross-module service-to-service call outside what's already
wired. No tenant (`country_code`) filtering concern — role management is
inherently a global super-admin-only surface; `country` is a request
parameter (which per-country group to grant/revoke), not a tenant-scope
filter on the query itself.

## Risk Flags

### Security Review Required: **yes**

- **Authorization**: new endpoints must use the exact
  `@UseGuards(AuthGuard, SuperAdminGuard)` chain — no shortcuts, no
  caching of the super-admin check (matches `SuperAdminGuard`'s existing
  no-cache-by-design posture, important here since this IS the screen
  that revokes super-admin access, so a stale-cache false-positive would
  be a real privilege-escalation-adjacent bug).
- **Cap-check race condition**: two concurrent grant requests could both
  read count=2 and both proceed, landing at count=4. Flag for
  SecurityReviewer: is a naive read-then-write check sufficient given
  Authentik's admin API has no transactional guarantee visible to us? A
  practical mitigation (re-check count immediately before the
  `setUserGroups()` write, accept a narrow TOCTOU window given this is a
  human-paced, low-frequency admin action, not a hot path) is
  recommended over building distributed locking for a ≤3-cap, human-rate
  operation — SecurityReviewer to confirm this judgment is acceptable
  or require a stricter guard.
- **Self-revocation**: can a super-admin revoke their own
  `aiqadam-super-admin` membership, potentially locking themselves out
  (or the last admin locking out everyone)? Not addressed in the FR text.
  Flag as a finding for SecurityReviewer/CodeDeveloper — recommend
  blocking self-revoke-to-zero the same way the cap blocks over-grant
  (symmetry: the invariant is "1 ≤ super-admin count ≤ 3" for any
  post-change state produced through this screen, not just the upper
  bound the FR states).
- **Audit payload PII**: grant/revoke payload includes target email —
  matches existing `invite.created`/`invite.revoked` precedent (already
  logs `target_email`), consistent with SECURITY.md's "Confidential" tier
  (access logged, not restricted from audit trail itself).
- **Input validation**: `PATCH` body validated via Zod `.strict()`
  schema mirroring `admin-invites.controller.ts`'s `createSchema`
  pattern — `grant`/`revoke` restricted to the `RoleGroup`-equivalent
  enum, never free text (FR item 4 explicit requirement).

### Architecture Rule Risks: none identified

No module-boundary violation, no cross-schema query, no new dependency,
no deviation from the approved stack. Fits the existing `admin-invites`
module cleanly.

## Test Scope

- **Unit** (Vitest, `apps/api/test/`, hand-rolled `FakeAuthentik` +
  `FakeAudit` mocks per `admin-bootstrap.service.spec.ts` precedent):
  - New shared cap-count primitive: 0/1/2/3/4+ member counts.
  - `AdminUserRolesService.grantRole()` / `.revokeRole()`: read-merge-write
    correctness (existing groups preserved, only target group
    added/removed), cap-block at exactly 3→4, self-revoke-to-zero guard
    (if adopted per Risk Flags), re-read-not-optimistic assertion (mock
    `setUserGroups` succeeding but `getUserById` returning a DIFFERENT
    state than expected — response must reflect the mock's re-read, not
    the requested change, proving no optimistic shortcut exists).
  - `AdminBootstrapService` regression: existing spec continues to pass
    unmodified after the refactor to call the shared primitive (behavior-
    preserving refactor, not a rewrite).
  - `roles.ts` `roleLabel()`: every ADR-0021 §2 group → correct label,
    unknown/service-account groups handled without throwing.
- **Integration**: none required — no Postgres/Redis/Directus schema
  touched beyond the existing `audit_events` write path (already
  integration-tested via FR-ADM-008's suite, not re-tested here).
  `AuthentikClient` itself has no Testcontainers double in this repo
  (confirmed); mocked at the service-unit level per established
  convention.
- **E2E (Playwright)**: `BP-UAT-021` (pre-authored,
  `docs/02-business-processes/uat/BP-UAT-021.md`) is the designated
  live-verification script, run at Step 13 (post-merge UAT) per
  `business_process: [BP-UAT-021]`. Not a Step 8 CI gate — matches this
  repo's established pattern of `FR-ADM-010`/other admin FRs deferring
  live-Authentik proof to the post-merge UAT step, not the PR's own test
  run.

## Gate Result

gate_result:
  status: passed
  summary: "Impact fully scoped: no DB migration needed (Step 3 skipped); new admin-invites-module controller+service, roles.ts label addition, shared cap-check extraction, new web-next island+hooks. Two additional risk flags raised for SecurityReviewer beyond the FR's own text: cap-check race condition and self-revocation-to-zero guard."
  findings:
    - "DB Changes Required: no — Step 3 (DBMigrationAuthor) skipped, proceed directly to Step 4."
    - "FR's endpoint list (item 7) omits a user-search/list endpoint needed to satisfy AC-1 — added as GET /v1/admin/users to the API surface table."
    - "New risk not in the original FR text: self-revocation could let a super-admin revoke their own last-admin membership — flagged for SecurityReviewer to confirm the symmetry guard (block any change producing count=0, not just count>3)."
    - "Cap-check race condition (TOCTOU) flagged for SecurityReviewer with a proposed low-risk mitigation (re-check immediately before write) given human-rate admin usage."
