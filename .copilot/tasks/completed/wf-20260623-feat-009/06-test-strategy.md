# Test Strategy: FR-MIG-010

## Requirement

**Code:** FEAT-MIG-010 (`FR-MIG-010`)
**Statement:** Add filter panel, active filter chips, cohort save/load, and URL query param sync to `/workspace/members`.

---

## Rubric Score

| Criterion | Points | Justification |
|-----------|--------|---------------|
| Touches tenant-scoped data | 0 | Operator-scoped page, no multi-tenant data |
| New API endpoint | 0 | No new endpoints; uses existing `/v1/workspace/cohorts` |
| Business rule with edge cases | 0 | Pure utility functions with clear enum validation |
| Cross-module service call | 0 | No new cross-module calls |
| New database query | 0 | Cohorts table pre-existing |
| Pure function / utility | 0 | All new code is pure helper functions |

**Total Score: 0** → Unit tests sufficient.

---

## Required Test Levels

- [x] **Unit tests** — required
- [ ] Integration tests (Testcontainers) — not required (score < 4)
- [ ] E2E tests (Playwright) — not required (score < 4)

---

## Unit Test Plan

| Target | Happy Path | Failure Paths |
|--------|------------|---------------|
| `serializeFiltersToParams` | All 7 fields empty → empty params; single field set → one param; all fields set → all 7 params | Empty string values are skipped |
| `parseParamsToFilters` | Valid params for each field parse correctly; empty params → EMPTY_MEMBER_FILTERS; partial params → only non-empty fields set | Invalid enum values stripped (country, seniority, consent); invalid attendedMin stripped; params without "f_" prefix ignored |
| `validateMemberFilters` | All valid enum values pass through; valid positive integer for attendedMin passes | Invalid country stripped to empty; invalid seniority stripped; invalid consent stripped; zero or negative attendedMin stripped to empty; non-numeric attendedMin stripped |
| `countActiveFilters` | All empty → 0; single field → 1; all 7 fields → 7 | (all-empty is both happy and edge case) |
| `getActiveFilterChips` | All empty → empty array; partial → correct subset; all 7 → 7 chips with correct labels | Correct FILTER_LABELS mapping for each field |
| `FilterChip` component | active=true renders primary style; active=false renders muted style; onClick fires on button click | N/A (pure presentation) |

### Additional Edge Cases

| Function | Edge Case |
|----------|-----------|
| `serializeFiltersToParams` | `attendedMin: "0"` — should serialize (0 is a valid string for parsing, though `buildMemberFilter` will reject it at API level) |
| `parseParamsToFilters` | Duplicate params (URLSearchParams handles last value) |
| `validateMemberFilters` | Case sensitivity for enums (e.g., "UZ" vs "uz") — should fail since enum values are lowercase |
| `validateMemberFilters` | `attendedMin: "1.5"` — `Number.parseInt` returns 1, which is > 0, so passes. Is this intentional? (Reasonable — means attended at least 1 event) |
| `getActiveFilterChips` | Verify `FILTER_LABELS` are human-readable ("Country", "Seniority", etc.) |

---

## Integration Test Plan

No integration tests required. Rationale:
- No new API endpoints
- Cohort CRUD hooks already tested elsewhere (or are thin wrappers)
- Filter state is client-side only
- URL sync is a client-side concern (useEffect + history.pushState)

---

## E2E Test Plan

No E2E tests required. Rationale:
- Score < 4 (unit scope only)
- Filter chip UI is a thin wrapper around existing state
- Cohort save/load uses existing hooks already validated
- URL param sync is covered by unit tests for serialize/parse

---

## Acceptance Criteria → Test Mapping

| AC | Test Level | Test Description |
|----|------------|------------------|
| **AC-1:** Opening filter drawer and selecting criteria filters the member list without page reload | N/A | TanStack Query wired in MembersList — server-side re-fetch triggered on filter state change. Covered by existing hook behavior. |
| **AC-2:** Filter chips appear above the table and are individually removable | Unit | `getActiveFilterChips` returns correct chip array; `FilterChip` renders with correct props; MembersList renders `<FilterChipsBar>` |
| **AC-3:** Saving a cohort with a name persists it | N/A | Uses existing `useSaveCohort` hook — not new code in this PR |
| **AC-3a:** Loading a cohort replaces previous filters | Unit | Covered by `parseDirectusToMemberFilters` (already implemented) — setFilters replaces, setCommittedQuery clears |
| **AC-4:** URL params reflect active filters | Unit | `serializeFiltersToParams` + `parseParamsToFilters` round-trip; `validateMemberFilters` strips invalid values |
| **AC-5:** `pnpm arch:check` + `astro check` + `pnpm build` pass | CI gate | Not a unit test — enforced in CI pipeline |

---

## Test File Location

Following project conventions (standards.md §IV):
```
apps/web-next/src/lib/member-filters.test.ts   ← unit tests
apps/web-next/src/blocks/workspace/FilterChip.test.tsx   ← component tests
```

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: >
    FEAT-MIG-010 is a pure-utility + presentation feature. Rubric score is 0
    (no API changes, no DB changes, no cross-module calls, pure functions only).
    Unit tests cover all 7 filter primitives for serialize, parse, validate,
    count, and getActiveFilterChips. FilterChip component tested for active/inactive
    rendering. No integration or E2E tests needed. All acceptance criteria are
    either unit-tested or covered by existing TanStack Query behavior.
  blockers: []
  test_level_decision:
    unit: required
    integration: not_required
    e2e: not_required
  files_to_test:
    - apps/web-next/src/lib/member-filters.ts
    - apps/web-next/src/blocks/workspace/FilterChip.tsx
  edge_cases_identified:
    - "Case sensitivity for enum validation (e.g., 'UZ' vs 'uz')"
    - "Decimal values for attendedMin (Number.parseInt truncates)"
    - "Duplicate URL params handled by URLSearchParams"
  coverage_targets:
    line: 80
    branch: 70
    error_paths: 100
```
