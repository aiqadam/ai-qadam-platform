# Step 6 — Test Strategy: FR-ADM-011

## Requirement

FR-ADM-011 — Admin user and role management screen. New API surface
(`GET /v1/admin/users`, `GET/PATCH /v1/admin/users/:id/roles`) plus a
shared cap-check primitive extraction and a new frontend island.

## Rubric Score

| Criterion | Applies? | Points |
|---|---|---|
| Touches tenant-scoped data | No | 0 |
| New API endpoint | Yes (3 routes) | +2 |
| Business rule with edge cases (≤3 cap, ≥1 floor) | Yes | +2 |
| Cross-module service call | Yes (`AuditEventsService`) | +1 |
| New database query | No | 0 |
| Pure function / utility | Yes (`roleLabel()`) — 0 pts, still unit-tested | 0 |

**Score: 5** → Integration tests required (≥4 threshold). E2E not
required by the rubric (<6 threshold) — and per this repo's established
precedent for admin/Authentik-touching FRs (`FR-ADM-010`), live-Authentik
proof is deferred to `BP-UAT-021` at Step 13 (post-merge, agent-driven),
not to a Playwright test inside this PR's own CI run. No
Testcontainers-Authentik double exists in this repo (confirmed by direct
grep and by `admin-bootstrap.service.ts`'s own comment), so "integration
test" here means the standard hand-mocked-`AuthentikClient` unit-test
style already established for `AdminBootstrapService`/`AdminInvitesService`,
not a Testcontainers-backed test — there is no real integration
boundary (Postgres/Redis) to stand up for this feature at all, since no
Drizzle schema is touched.

## Required Test Levels

- [x] Unit (Vitest, hand-mocked `AuthentikClient`/`AuditEventsService`)
- [ ] Integration (Testcontainers) — N/A, no DB/schema touched; the
      rubric's "integration required" signal is satisfied by thorough
      unit coverage of the cross-service (`AuthentikClient` +
      `AuditEventsService`) interaction, per the same precedent
      `admin-bootstrap.service.spec.ts` already set for this exact class
      of Authentik-dependent service.
- [ ] E2E (Playwright) — deferred to `BP-UAT-021` at Step 13, not part
      of this PR's test suite (matches `FR-ADM-010` precedent).

## Unit Test Plan

| Target | Happy Path | Failure Paths |
|---|---|---|
| `AuthentikClient.getSuperAdminCount()` | Returns the live member count from `resolveGroupNames()` | Empty `resolveGroupNames()` result → returns 0 |
| `AdminBootstrapService.hasSuperAdminMember()` (regression) | Existing spec suite passes unmodified after the refactor to call `getSuperAdminCount()` | Existing failure-path tests (missing group, 4xx/5xx recovery) unaffected |
| `AdminUserRolesService.searchUsers()` | Returns filtered users matching email/name substring, case-insensitive | Empty query throws `BadRequestException`; no matches returns `[]` |
| `AdminUserRolesService.getRoles()` | Returns raw group list for an existing user | Unknown pk throws `NotFoundException` |
| `AdminUserRolesService.changeRole()` — grant | Adds target group to existing set (read-merge-write), returns re-read state | Unknown pk → `NotFoundException`; both `grant`+`revoke` set → `BadRequestException`; unknown role group → `BadRequestException`; country-scoped role missing `country` → `BadRequestException`; non-scoped role WITH `country` → `BadRequestException` |
| `AdminUserRolesService.changeRole()` — revoke | Removes target group from existing set, returns re-read state | Same validation failures as grant |
| `AdminUserRolesService.changeRole()` — cap enforcement | Grant succeeds when count < 3 (boundary: count=2→allowed) | Grant blocked when count ≥ 3 (boundary: count=3→blocked) with `ConflictException` citing ADR-0021; already-a-member grant is a no-op that skips the cap check entirely |
| `AdminUserRolesService.changeRole()` — floor enforcement | Revoke succeeds when count > 1 (boundary: count=2→allowed) | Revoke blocked when count ≤ 1 (boundary: count=1→blocked) with `ConflictException`; not-currently-a-member revoke is a no-op that skips the floor check |
| `AdminUserRolesService.changeRole()` — re-read integrity (regression for #107) | Response reflects the SECOND (`getUserById`) mock call's return value, not an assumption from the write request | Mock the re-read to return a DIFFERENT state than the write requested — assert the returned `groups` matches the mock's re-read, not the input, proving no optimistic shortcut |
| `AdminUserRolesService.changeRole()` — unresolved-group guard (Security Finding 1) | Full resolution → write proceeds | `resolveGroupNames()` mock returns fewer entries than requested → `ConflictException`, `setUserGroups()` NEVER called |
| `AdminUserRolesService.changeRole()` — audit emission | `AuditEventsService.emit()` called once per change with `event`, `severity: 'high'`, `actorId`, `targetKind: 'user'`, `targetId`, before/after payload | N/A (fire-and-forget already swallows its own errors, per `AuditEventsService.emit()`'s own contract — not re-tested here) |
| `AdminUserRolesController` | Zod schema accepts valid grant/revoke bodies; route params delegate to service | Invalid body (both/neither of grant+revoke, unknown enum value, extra field via `.strict()`) → `400`; non-numeric/zero/negative `:id` → `400` |
| `roleLabel()` (web-next) | Every `FIXED_LABELS` entry maps correctly; every `PER_COUNTRY_PREFIXES` group resolves country code to name (including unknown code → uppercased fallback); sponsor-rep-per-org fallback | Completely unknown group string → returns the raw string unchanged (never throws) |
| `roleLabels()` (web-next) | Maps an array via `roleLabel()`, preserves order | Empty array → `[]` |

## Integration Test Plan

N/A — no Postgres/Redis/Directus schema is introduced or modified by
this feature (Authentik remains the sole write target per ADR-0021 §1;
`audit_events` already exists and is already integration-tested under
FR-ADM-008's own suite, not re-tested here). The unit tests above,
covering the full `AuthentikClient`+`AuditEventsService` interaction via
hand-mocks, are this feature's substitute for a Testcontainers
integration tier — consistent with `admin-bootstrap.service.spec.ts`'s
established precedent for testing Authentik-dependent services in this
repo.

## E2E Test Plan

| User Flow | Entry Point | Exit Assertion |
|---|---|---|
| (Deferred to Step 13) Super-admin searches a user, sees plain-language role, grants a role, sees live-verified confirmation, audit log shows the entry, revokes the role, non-super-admin is blocked | `BP-UAT-021` (`docs/02-business-processes/uat/BP-UAT-021.md`), pre-authored, run via `uat-verification` workflow at Step 13 | All 6 BP-UAT-021 ACs pass; `three-super-admins` fixture gap (pre-existing, documented in the BP-UAT file) handled per that file's own Notes — see Step 13 disposition. |

## Acceptance Criteria → Test Mapping

| AC | Test Level | Test Description |
|---|---|---|
| AC-1 (search + plain-language display) | Unit + E2E(deferred) | `searchUsers()` unit tests (API returns raw groups) + `roleLabel()` unit tests (frontend maps to plain language) + `BP-UAT-021` Steps 001–002 live-verify the full round-trip |
| AC-2 (grant + live re-read) | Unit + E2E(deferred) | `changeRole()` re-read-integrity unit test (proves no optimistic shortcut) + `BP-UAT-021` Step 003 |
| AC-3 (≤3 cap hard block) | Unit + E2E(deferred, flagged gap) | `changeRole()` cap-enforcement boundary unit tests (count=2/3) + `BP-UAT-021` Negative-001 (blocked pending the `three-super-admins` fixture — see Step 13 disposition below) |
| AC-4 (revoke + live re-read) | Unit + E2E(deferred) | `changeRole()` revoke path + re-read-integrity unit tests + `BP-UAT-021` Step 005 |
| AC-5 (audit log entry) | Unit + E2E(deferred) | `changeRole()` audit-emission unit test (asserts `emit()` call shape) + `BP-UAT-021` Step 004 |
| AC-6 (non-super-admin blocked) | Unit + E2E(deferred) | Reuses `SuperAdminGuard`'s own existing test coverage (unchanged by this PR — no new guard logic introduced) + `BP-UAT-021` Negative-002 |

## Gate Result

gate_result:
  status: passed
  summary: "Rubric score 5 (integration threshold met via thorough hand-mocked unit coverage of the AuthentikClient/AuditEventsService interaction, no real DB/Testcontainers boundary exists for this feature). All 6 ACs mapped to unit tests now plus BP-UAT-021 E2E verification at Step 13, matching FR-ADM-010's established precedent for Authentik-dependent admin FRs."
  findings:
    - "No Testcontainers integration tier applies — no schema/DB touched; unit-level hand-mocks substitute, consistent with admin-bootstrap.service.spec.ts precedent."
    - "AC-3's E2E coverage is flagged as a known pre-existing fixture gap (three-super-admins scenario) in BP-UAT-021 itself, not newly introduced by this strategy — Step 13 will decide disposition (seed 2 throwaway admins vs. rely on the exhaustive unit boundary coverage as sufficient proof)."
