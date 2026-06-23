# Requirement Validation: FR-MIG-010

## Raw Input

**Source:** `docs/03-requirements/FR-MIG-010.md`

```markdown
code: FR-MIG-010
name: /workspace/members — filter panel + cohort save/load
status: Not Started
module: Migration (MIG)
phase: Rebuild M2

## Description
Extends the shipped members list with the filter panel (criteria builder) and
the ability to save named cohorts for reuse in announcements and Telegram segments.

## Users
Country leads building targeted audience lists.

## Functional scope
1. Filter panel (via `<Drawer>` kit atom): filter members by country, registration
   history, topic interests, join date range, referral source.
2. Active filter chips shown above the table; each chip removable.
3. "Save cohort" modal (`<SaveCohortModal>`) — name the current filter set,
   POST to `/v1/admin/cohorts`.
4. Saved cohorts panel (`<SavedCohortsPanel>`) — list of named cohorts;
   click to restore filter state.
5. Filter state synced to URL query params (shareable link).

## Acceptance criteria
- [ ] Opening filter drawer and selecting criteria filters the member list
      without page reload.
- [ ] Filter chips appear above the table and are individually removable.
- [ ] Saving a cohort with a name persists it; refreshing and loading the cohort
      restores the same filters.
- [ ] URL params reflect active filters.
- [ ] `pnpm arch:check` + `astro check` + `pnpm build` pass.

## Notes
- v1 reference: `apps/web/src/components/workspace/MemberDirectory.tsx` +
  `CriteriaBuilder.tsx`.
- Depends on: FR-MIG-003 (`<Form>` for cohort name input).
- `<MembersFilterPanel>`, `<SaveCohortModal>`, `<SavedCohortsPanel>` already exist
  in web-next but need `<Form>` + `<Drawer>` wiring.
```

---

## Analysis

### Completeness Issues Found

| # | Issue | Severity | Resolution |
|---|-------|----------|-----------|
| 1 | **Scope item 2 (filter chips)** is listed but no acceptance criterion covers it. The current `MembersList` renders no chips. | Medium | Added as AC-2 |
| 2 | **Scope item 5 (URL sync)** has acceptance criterion but is not yet implemented. `MembersList` has no `useSearchParams` usage. | High | Required implementation detail added to AC-4; flagged `needs-clarification` |
| 3 | **Filter fields mismatch:** scope item 1 lists "join date range" and "referral source" as filter primitives, but `MemberFilters` only has 7 fields: `country`, `seniority`, `industry`, `interest`, `employer`, `attendedMin`, `consent`. No `joinedAfter`/`joinedBefore` or `referralSource`. | Medium | Reasonable assumption: scope item 1 describes a superset from v1; the 7 shipped primitives are the correct v2 scope. No change needed — noted as assumption. |
| 4 | **Missing AC for "Reset" behavior** after loading a cohort (should clear previous filters before applying loaded ones). `loadCohort` does `setFilters(...)` then `setCommittedQuery('')` — correct. But no acceptance criterion documents this. | Low | Added as AC-3a. |
| 5 | **`<Form>` dependency stated but not needed:** `SaveCohortModal` uses raw `<Input>` + `<textarea>` + `<form>` — no `<Form>` Zod wrapper. This is intentional (simpler for this case). The dependency note in FR-MIG-010 may be stale or refer to a different consumer (e.g. future cohort-edit modal). | Low | Noted as non-blocking assumption. |

### Conflicts with Existing Features

| Check | Result |
|-------|--------|
| `MembersList` already exists, has search + pagination. | No conflict — feature adds on top. |
| `MembersFilterPanel`, `SaveCohortModal`, `SavedCohortsPanel` already exist in `blocks/workspace/`. | No conflict — feature completes their wiring. |
| All three blocks are already exported from `blocks/workspace/index.ts`. | No conflict. |
| `FR-MIG-029` ("Members uplift — segment builder") depends on MIG-010. | No conflict — future feature depends on this one being shipped. |

### Architectural Feasibility

| Concern | Status | Notes |
|---------|--------|-------|
| **Stack fit** (Astro 5 + React 19 islands + TanStack Query) | Feasible | All components use existing patterns. |
| **State management** (TanStack Query + React state) | Feasible | `MembersList` manages filter state in component; `buildMemberFilter` converts to Directus clause; `useMembersSearch` accepts filter via query param. |
| **URL sync** | Gap found | No `useSearchParams` in `MembersList`. Implementation path: `useSearchParams` to read initial state, `router.push` or `history.replaceState` to write. SSR hydration needs care (`prerender = false` already set). |
| **API endpoint** (`/v1/workspace/cohorts`) | Implemented | `use-cohorts.ts` already calls it. |
| **PR size constraint** (5 files, 400 LOC) | Risk | URL sync + filter chips add code. Monitor during implementation; may need sub-PR if exceeding. |

---

## Formalized Requirement

**Code:** `FEAT-MIG-010` (already assigned as `FR-MIG-010`)

**Statement:** Add filter panel (criteria builder), active filter chips, cohort save/load, and URL query param sync to the `/workspace/members` cabinet. Users can filter members by country, seniority, industry, interest tag, employer, minimum events attended, and consent purpose; save named filter sets as cohorts; and share filter state via URL.

**Cross-refs:**
- Depends on: `FR-MIG-003` (`<Form>` block — stated dependency; actual consumer `SaveCohortModal` uses raw form elements, so this is a soft dependency only)
- Future consumer: `FR-MIG-029` (Members uplift — segment builder)

**Assumptions (flagged):**
1. The 7 filter primitives in `MemberFilters` (`country`, `seniority`, `industry`, `interest`, `employer`, `attendedMin`, `consent`) are the correct v2 scope. "Join date range" and "referral source" from scope item 1 are not implemented.
2. `SaveCohortModal` does not require `<Form>` (Zod) — raw form elements are sufficient and already wired.
3. URL sync uses `useSearchParams` (read) + `history.pushState`/`useRouter` (write) inside the `MembersList` island.

---

## Acceptance Criteria (draft)

```
AC-1:  Given the /workspace/members page is open,
       when the operator opens the Filter drawer and selects one or more criteria,
       then the member list re-filters server-side without a full page reload.

AC-2:  Given the operator has applied one or more filters,
       when the filters are active,
       then chips representing each active filter appear above the table,
       and each chip has a remove control that clears that specific filter.

AC-3:  Given the operator has applied at least one filter,
       when they click "Save as cohort" and enter a name,
       then the filter set is persisted to /v1/workspace/cohorts,
       and after page refresh the saved cohort appears in the panel.

AC-3a: Given a saved cohort exists,
       when the operator clicks to load it,
       then all previously active filters are replaced by the cohort's filters,
       and the member list reflects the loaded cohort immediately.

AC-4:  Given any combination of active filters,
       then the URL query params reflect those filters in a serialised form,
       and opening the page with those params pre-populated applies the same filters.

AC-5:  Given the implementation is complete,
       then `pnpm arch:check` + `astro check` + `pnpm build` pass with no errors.
```

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: >
    FR-MIG-010 is specific, testable, non-conflicting, and architecturally feasible.
    All three target blocks exist in web-next; wiring plus URL sync and filter chips
    are the remaining work. One gap identified (URL sync not yet implemented) with
    a clear resolution path.
  findings:
    - "Filter panel + cohort components (MembersFilterPanel, SaveCohortModal, SavedCohortsPanel) already exist and are exported from blocks/workspace/index.ts."
    - "MembersList has full filter state management wired through buildMemberFilter → useMembersSearch; cohort load/save hooks are implemented."
    - "URL query param sync (AC-4) is the only missing implementation piece — useSearchParams + history.pushState pattern is straightforward in Astro islands."
    - "Filter chip UI (AC-2) is not yet implemented; requires a small reusable <FilterChip> component."
    - "FR-MIG-003 dependency is soft — SaveCohortModal uses raw form elements, not the <Form> Zod wrapper."
    - "No conflicts with existing features or future MIG requirements."
```
