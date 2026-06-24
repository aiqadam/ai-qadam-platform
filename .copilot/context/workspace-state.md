# Workspace State

**Last updated:** 2026-06-24T23:00:00Z

---

## Active Workflows

_(none — wf-20260624-feat-022 PR open 2026-06-24)_

---

## Completed Workflows (recent)

| Workflow ID | Type | Feature/Issue | Branch | PR | Date |
|---|---|---|---|---|---|
| wf-20260624-feat-022 | requirement-development | FR-MIG-027 /workspace/badges grant + award history | feature/MIG-027-badges-grant-award-history | [PR #44](https://github.com/tvolodi/aiqadam/pull/44) | 2026-06-24 |
| wf-20260624-feat-020 | requirement-development | FR-MIG-026 /workspace/press asset manager | feature/MIG-026-press-asset-manager | [PR #43](https://github.com/tvolodi/aiqadam/pull/43) | 2026-06-24 |
| wf-20260623-feat-015 | requirement-development | FR-MIG-020 /onboard + /welcome new-member flow | feature/MIG-020-new-member-flow | [PR #31](https://github.com/tvolodi/aiqadam/pull/31) | 2026-06-24 |
| wf-20260624-feat-019 | requirement-development | FR-MIG-024 /workspace/site-settings homepage singleton editor | feature/MIG-024-site-settings | [PR #35](https://github.com/tvolodi/aiqadam/pull/35) | 2026-06-24 |
| wf-20260623-feat-011 | requirement-development | FR-MIG-018 /me hub + preferences | feature/MIG-018-me-hub | [PR #24](https://github.com/tvolodi/aiqadam/pull/24) | 2026-06-23 |
| wf-20260623-feat-012 | requirement-development | FR-MIG-012 Countries list | feature/MIG-012-countries-list | [PR #22](https://github.com/tvolodi/aiqadam/pull/22) | 2026-06-23 |
| wf-20260623-feat-010 | requirement-development | FR-MIG-010 Members filter panel | feature/MIG-010-members-filter-panel | [PR #20](https://github.com/tvolodi/aiqadam/pull/20) | 2026-06-23 |
| wf-20260622-feat-001 | requirement-development | FR-MIG-003 Form block | main → merged | — | 2026-06-22 |
| wf-20260623-feat-2 | requirement-development | FR-MIG-007 Tooltip kit atom | feature/FR-MIG-007-tooltip-kit-atom | [PR #11](https://github.com/tvolodi/aiqadam/pull/11) | 2026-06-23 |
| wf-20260623-fix-3 | issue-resolution | ISS-PREEX-001 pre-existing lint cleanup | fix/ISS-PREEX-001-pre-existing-lint | [PR #12](https://github.com/tvolodi/aiqadam/pull/12) | 2026-06-23 |
| wf-20260623-feat-004 | requirement-development | FR-WORKFLOW-001 Context drift guard | feature/FEAT-WORKFLOW-001-context-drift-guard | [PR #13](https://github.com/tvolodi/aiqadam/pull/13) | 2026-06-23 |

---

## Open Issues

| ID | Severity | Summary | Status |
|---|---|---|---|
| [ISS-CI-001](../issues/ISS-CI-001.md) | blocker | Pre-existing CI failures (arch-check 25 violations, biome 20,432 errors, pnpm audit 2 high CVEs) block all future PRs to main | open — registered 2026-06-24 |

---

## Git State

- **Current branch:** main
- **Last sync with origin:** 2026-06-24 (PR #35 merged)
- **Pending PRs:** [PR #27](https://github.com/tvolodi/aiqadam/pull/27) (FR-MIG-014)

## Next Workflow ID

See `.copilot/meta/next-workflow-id` (currently: 23)

---

## Notes

**2026-06-23:** FR-MIG-018 (/me hub + preferences + access-log + referrals) completed and PR created.
- 4 Astro pages: /me hub, preferences, access-log, referrals
- 2 TanStack Query hooks + 2 React blocks
- 80 unit tests (249 total tests pass)
- All gates passed: typecheck, biome, security review
- PR: [https://github.com/tvolodi/aiqadam/pull/24](https://github.com/tvolodi/aiqadam/pull/24)

**2026-06-23:** FR-MIG-012 (Countries list + provisioning wizard) completed and PR created.
- CountriesList React island with DataTable showing status badges, locale, currency, TZ, holidays count
- useCountries hook for GET /v1/workspace/countries API
- All gates passed: astro check (0 errors), biome check (clean), build (successful), tests (169 passed)
- PR: [https://github.com/tvolodi/aiqadam/pull/22](https://github.com/tvolodi/aiqadam/pull/22)

**2026-06-23:** FR-MIG-010 (Members filter panel + cohort save/load) completed and PR created.
- All gates passed: unit tests (102 tests), typecheck (0 errors), biome check (clean), build (successful)
- Security review: MAJOR-1 fixed (validateMemberFilters for URL param validation)
- Documentation updated: FR-MIG-010.md status changed to "Implemented", requirements-registry.md updated, blocks.md updated
- PR: [https://github.com/tvolodi/aiqadam/pull/20](https://github.com/tvolodi/aiqadam/pull/20)
