# Step 7 — Test Design: FR-ADM-011

## Tests Written

### Unit

| File | Count/Focus | Required? |
|---|---|---|
| `apps/api/test/admin-user-roles-service.spec.ts` | 24 tests — search, getRoles, changeRole (validation, grant/revoke read-merge-write, cap boundary 2/3, floor boundary 1/2, no-op skip paths, re-read integrity regression for #107, unresolved-group security guard, audit emission) | Yes |
| `apps/api/test/admin-user-roles-controller.spec.ts` | 12 tests — search/getRoles/changeRole delegation + Zod schema rejection paths (unknown enum, `.strict()` extra field, missing user claims, invalid `:id`) | Yes |
| `apps/api/test/authentik-client.spec.ts` (extended) | +2 tests — `getSuperAdminCount()` happy path + zero-result path | Yes |
| `apps/api/test/admin-bootstrap.service.spec.ts` (updated fixture) | 0 new tests; existing 20 tests updated to keep passing after the `hasSuperAdminMember()` refactor — `FakeAuthentik.getSuperAdminCount` added, delegating to the same `resolveGroupNames` mock so test intent is unchanged | Yes (regression) |
| `apps/web-next/src/lib/roles.test.ts` | 14 tests — existing predicates (`isSuperAdmin`/`isOperator`/`satisfiesRole`, previously untested) + new `roleLabel()`/`roleLabels()` (fixed labels, per-country resolution, unknown-country fallback, per-org sponsor-rep fallback, unknown-group fallback, empty-array) | Yes |

### Integration

None — per `06-test-strategy.md`, no Postgres/Redis/Directus schema is
touched by this feature; the rubric's integration-tier signal is
satisfied by the thorough hand-mocked unit coverage above (same
precedent as `admin-bootstrap.service.spec.ts`).

### E2E

None in this PR. `BP-UAT-021` (pre-authored,
`docs/02-business-processes/uat/BP-UAT-021.md`) runs at Step 13
(post-merge, same session) per this repo's established pattern for
Authentik-dependent admin FRs.

## Acceptance Criteria Coverage

| AC | Test | Status |
|---|---|---|
| AC-1 | `roles.test.ts` (`roleLabel` suite) + `admin-user-roles-service.spec.ts` (`searchUsers` returns raw groups) + `admin-user-roles-controller.spec.ts` (`search` delegation) | Unit: covered. E2E: pending Step 13. |
| AC-2 | `admin-user-roles-service.spec.ts` "re-read integrity" describe block — explicitly proves the response reflects the SECOND mock call (post-write re-read), not the first (pre-write) or the request body | Unit: covered. E2E: pending Step 13. |
| AC-3 | `admin-user-roles-service.spec.ts` "super-admin cap" describe block — boundary tests at count=2 (allowed) and count=3 (blocked, message matches `/adr_0021/`), plus the no-op-skips-check test | Unit: covered (boundary-exhaustive). E2E: pending Step 13, `three-super-admins` fixture gap pre-exists in `BP-UAT-021` itself (not introduced by this PR) — see Known Test Gaps. |
| AC-4 | `admin-user-roles-service.spec.ts` "revoke (read-merge-write)" + "super-admin floor" describe blocks | Unit: covered. E2E: pending Step 13. |
| AC-5 | `admin-user-roles-service.spec.ts` "audit trail" describe block — asserts exact `emit()` call shape for both grant and revoke | Unit: covered. E2E: pending Step 13. |
| AC-6 | Unchanged — `SuperAdminGuard` has its own existing test coverage, not modified by this PR (no new guard logic introduced; `AdminUserRolesController` reuses the guard verbatim) | Covered by pre-existing suite. E2E: pending Step 13. |

## Known Test Gaps

- **`BP-UAT-021`'s `three-super-admins` fixture** (AC-3's live scenario)
  is a pre-existing, documented gap in the BP-UAT file itself — not
  something this test-design step introduces or is expected to resolve.
  The unit-level boundary coverage (count=2/3, exhaustive) is judged
  sufficient proof of the cap logic's correctness; Step 13 will decide
  whether to also attempt the live 3-admin scenario or record the
  fixture gap as a disclosed, named follow-up per AGENTS.md §6.1's
  honesty-disclosure requirement.
- **No E2E test in this PR's own CI run** — by design, matching
  `FR-ADM-010`'s precedent. `BP-UAT-021` is the designated live-Authentik
  verification point, run once at Step 13 in this same workflow session
  (not deferred to an unscheduled future workflow).
- No `it.skip` anywhere in the new/modified test files (verified via
  `grep -r "it.skip" apps/api/test/admin-user-roles-*.spec.ts apps/web-next/src/lib/roles.test.ts` — zero matches).

## Gate Result

gate_result:
  status: passed
  summary: "All planned unit tests written and passing (67/67 api, 14/14 web-next new/affected). Existing admin-bootstrap.service.spec.ts fixture updated to accommodate the shared-primitive refactor without changing test intent — all 20 of its tests still pass. No it.skip anywhere."
  findings:
    - "admin-bootstrap.service.spec.ts required a fixture update (FakeAuthentik.getSuperAdminCount added) to keep passing after Step 4's refactor — this is expected regression-test maintenance, not a design gap; all 20 pre-existing assertions are unchanged in intent."
    - "BP-UAT-021's three-super-admins fixture gap is inherited, not introduced — flagged for Step 13 disposition, not a Step 7 blocker."
