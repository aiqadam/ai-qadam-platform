# Impact Analysis: FEAT-MIG-010

## Validated Requirement

**Code:** FEAT-MIG-010 (`FR-MIG-010`)
**Statement:** Add filter panel (criteria builder), active filter chips, cohort save/load, and URL query param sync to the `/workspace/members` cabinet.

---

## Affected Layers

### API (NestJS)
**No changes required.** The cohort CRUD endpoints (`/v1/workspace/cohorts`) are fully implemented and wired:
- `GET /v1/workspace/cohorts` — list cohorts
- `POST /v1/workspace/cohorts` — create cohort
- `DELETE /v1/workspace/cohorts/:id` — delete cohort
- All endpoints already use `AuthGuard` and `requireUser()` for operator-scoped data
- `useSaveCohort` and `useDeleteCohort` hooks in `apps/web-next/src/lib/use-cohorts.ts` are already implemented

### DB Changes Required
**No changes required.** Cohorts are stored in the existing `cohorts` Directus collection (managed collection, not Drizzle). No new tables, columns, or constraints needed.

### Shared Types
**No changes required.** `CohortRow` is already defined in both:
- `apps/api/src/modules/workspace/cohorts.service.ts` (API side)
- `apps/web-next/src/lib/types.ts` (frontend side, line 294)

### Frontend
**Modified files:**

| File | Change | Rationale |
|------|--------|-----------|
| `apps/web-next/src/blocks/workspace/MembersList.tsx` | **Modify** | Add `<FilterChipsBar>` above `<DataTable>`, add URL param sync via `useSearchParams` |
| `apps/web-next/src/pages/workspace/members/index.astro` | **Modify** | Update `PageShell` description text (remove "Filters + cohorts come in follow-up PRs") |

**New files:**

| File | Change | Rationale |
|------|--------|-----------|
| `apps/web-next/src/blocks/workspace/FilterChip.tsx` | **Create** | Shared filter-chip atom used in `AuditLogList` and `EventsList` (currently duplicated inline) — export from `blocks/workspace/index.ts` |

### Bot
No bot-surface changes.

### Workers
No worker-surface changes.

---

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|----------|--------|--------|-----------|
| `/v1/workspace/cohorts` | GET | No change | No |
| `/v1/workspace/cohorts` | POST | No change | No |
| `/v1/workspace/cohorts/:id` | DELETE | No change | No |

---

## Cross-Module Calls

| Caller | Called | Via |
|--------|--------|-----|
| `MembersList.tsx` (React island) | NestJS API | `useCohorts`, `useSaveCohort`, `useDeleteCohort` (TanStack Query hooks) |
| `MembersList.tsx` | `useMembersSearch` | TanStack Query hook → `/v1/workspace/members` |

No cross-module service calls within the NestJS API. No new cross-domain data flows.

---

## Risk Flags

### Security Review Required
- **Low risk.** Cohort data is already operator-scoped (auth-gated via `AuthGuard`); the frontend only adds UI affordances on top of existing CRUD hooks. No new data access patterns.

### Architecture Rule Risks
| Rule | Status | Notes |
|------|--------|-------|
| **L3 block isolation** | OK | Filter state stays inside `MembersList` island; URL sync uses client-side `useSearchParams` only — no `lib/api-*` imports. Complies with ADR-0038 locks. |
| **No `<Form>` Zod dependency** | OK | Per requirement validation, `SaveCohortModal` uses raw form elements — no Zod wiring needed. |
| **TanStack Query for server state** | OK | All data fetching uses existing `use-*` hooks; no raw fetch introduced. |
| **PR size (5 files, 400 LOC)** | Monitor | `MembersList.tsx` will grow ~100 LOC (chips bar + URL sync). `FilterChip.tsx` is new (~30 LOC). Total well within budget. |

---

## Implementation Notes

### URL Param Sync Strategy
Filters are serialized to a flat query string using a simple prefix convention:
```
?f_country=UZ&f_seniority=senior&f_industry=fintech
```
Parser/serializer should live in `apps/web-next/src/lib/member-filters.ts` as:
- `serializeFiltersToParams(filters: MemberFilters): URLSearchParams`
- `parseParamsToFilters(params: URLSearchParams): MemberFilters`

`MembersList` will:
1. Read initial state from `useSearchParams` on mount
2. Call `router.push` (or `window.history.pushState`) when filters change
3. Wrap filter-setting functions to also update URL

### FilterChip Export
`FilterChip` currently exists as an inline function in both `AuditLogList.tsx` (line 40) and `EventsList.tsx` (line 37). Extracting to `blocks/workspace/FilterChip.tsx` and exporting from `index.ts` enables reuse in `MembersList` without duplication.

### Cohort Load Behavior
Per AC-3a (confirmed in requirement validation), loading a cohort calls `setFilters(parseDirectusToMemberFilters(cohort.filter_query))` + `setCommittedQuery('')`. This already clears previous filters before applying loaded ones — correct.

---

## Test Scope

| Layer | Tests Needed | Coverage |
|-------|-------------|----------|
| **Unit** | `serializeFiltersToParams` and `parseParamsToFilters` in `member-filters.ts` | All 7 filter primitives, empty state, single filter, multi-filter |
| **Unit** | `countActiveFilters` edge cases | All blank, partial, all filled |
| **Integration** | `MembersList` with TanStack Query mocks: filter-apply → re-fetch cycle | Server-side re-filtering without page reload |
| **Integration** | Cohort save → panel refresh → load → filters applied | Full save/load round-trip |
| **E2E (Playwright)** | `/workspace/members` — open filter drawer, select criteria, verify chips appear, remove chip, save cohort, reload page, load cohort | URL params + cohort persistence |

No DB migration tests needed (cohorts table is pre-existing Directus collection).

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: >
    FEAT-MIG-010 is a wiring + small additions feature. All three target blocks
    (MembersFilterPanel, SaveCohortModal, SavedCohortsPanel) already exist and are
    wired to MembersList. The remaining work is: (1) FilterChip extraction to shared
    component, (2) FilterChipsBar between Toolbar and DataTable, (3) URL param
    serialization/deserialization in member-filters.ts, (4) URL sync in MembersList.
    No API changes, no DB migrations, no shared-types changes. Estimated 150–180
    net-new LOC across 2 new/modified files. Architecture-compatible with all ADR-0038
    rules. Ready for CodeDeveloper.
  findings:
    - "All three cohort/filter blocks already exist in blocks/workspace/ and are exported from index.ts."
    - "Cohort CRUD hooks (useCohorts, useSaveCohort, useDeleteCohort) are fully implemented in use-cohorts.ts."
    - "MembersList already owns filter state, calls buildMemberFilter, passes filters to useMembersSearch — server-side re-filtering is wired."
    - "loadCohort already clears committedQuery before applying filters — AC-3a satisfied."
    - "FilterChip exists as duplicate inline function in AuditLogList and EventsList — should be extracted to blocks/workspace/FilterChip.tsx."
    - "URL param sync is the only genuinely new piece — useSearchParams + history.pushState pattern is straightforward and already SSR-compatible (prerender = false)."
    - "No DB migrations needed — cohorts collection exists in Directus."
    - "No conflicts with existing features or future MIG requirements (FR-MIG-029)."
  files_to_create:
    - apps/web-next/src/blocks/workspace/FilterChip.tsx
  files_to_modify:
    - apps/web-next/src/blocks/workspace/MembersList.tsx
    - apps/web-next/src/pages/workspace/members/index.astro
  files_to_export:
    - blocks/workspace/index.ts (add FilterChip export)
```
