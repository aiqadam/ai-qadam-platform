---
code: FR-MIG-010
name: /workspace/members — filter panel + cohort save/load
status: Implemented
module: Migration (MIG)
phase: Rebuild M2
---

## Description
Extends the shipped members list with the filter panel (criteria builder) and the ability to save named cohorts for reuse in announcements and Telegram segments.

## Users
Country leads building targeted audience lists.

## Functional scope
1. Filter panel (via `<Drawer>` kit atom): filter members by country, registration history, topic interests, join date range, referral source.
2. Active filter chips shown above the table; each chip removable.
3. "Save cohort" modal (`<SaveCohortModal>`) — name the current filter set, POST to `/v1/admin/cohorts`.
4. Saved cohorts panel (`<SavedCohortsPanel>`) — list of named cohorts; click to restore filter state.
5. Filter state synced to URL query params (shareable link).

## Acceptance criteria
- [ ] Opening filter drawer and selecting criteria filters the member list without page reload.
- [ ] Filter chips appear above the table and are individually removable.
- [ ] Saving a cohort with a name persists it; refreshing and loading the cohort restores the same filters.
- [ ] URL params reflect active filters.
- [ ] `pnpm arch:check` + `astro check` + `pnpm build` pass.

## Notes
- v1 reference: `apps/web/src/components/workspace/MemberDirectory.tsx` + `CriteriaBuilder.tsx`.
- Depends on: FR-MIG-003 (`<Form>` for cohort name input).
- `<MembersFilterPanel>`, `<SaveCohortModal>`, `<SavedCohortsPanel>` already exist in web-next but need `<Form>` + `<Drawer>` wiring.
