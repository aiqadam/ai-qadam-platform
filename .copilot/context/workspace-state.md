# Workspace State

**Last updated:** 2026-06-25 (wf-20260625-feat-028)

---

## Active Workflows

_(none — web-next migration complete as of 2026-06-25)_

---

## Completed Workflows (recent)

| Workflow ID | Type | Feature/Issue | Branch | PR | Date |
|---|---|---|---|---|---|
| wf-20260625-feat-028 | requirement-development | FR-WORKFLOW-002 BusinessAnalyst + UATRunner agents + uat-verification workflow | feature/WORKFLOW-002-uat-agents | _pending_ | 2026-06-25 |
| wf-20260625-feat-027 | requirement-development | FR-AUTH-002 Telegram auth API layer | feature/AUTH-002-telegram-signin | [PR #52](https://github.com/tvolodi/aiqadam/pull/52) | 2026-06-25 |
| wf-20260625-feat-026 | requirement-development | FR-CRM-001 Twenty CRM deployment + SSO | feature/CRM-001-twenty-crm-deployment | [PR #51](https://github.com/tvolodi/aiqadam/pull/51) | 2026-06-25 |
| wf-20260625-feat-025 | requirement-development | FR-MIG-031 production cutover — cookie parity, SEO re-enable | feature/MIG-031-production-cutover | [PR #48](https://github.com/tvolodi/aiqadam/pull/48) | 2026-06-25 |
| wf-20260625-feat-024 | requirement-development | FR-MIG-030 parity E2E suite + Lighthouse CI | feature/MIG-030-parity-e2e-suite | [PR #47](https://github.com/tvolodi/aiqadam/pull/47) | 2026-06-25 |
| wf-20260625-feat-023 | requirement-development | FR-MIG-029 /workspace/members uplift — segment builder | feature/MIG-029-members-segment-builder | [PR #46](https://github.com/tvolodi/aiqadam/pull/46) | 2026-06-25 |
| wf-20260624-feat-023 | requirement-development | FR-MIG-028 /workspace/country-leads onboarding cabinet | feature/MIG-028-country-leads-onboarding | [PR #45](https://github.com/tvolodi/aiqadam/pull/45) | 2026-06-25 |
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

_(none — ISS-CI-001 resolved 2026-06-24 via PRs #37–41)_

---

## Git State

- **Current branch:** main
- **Last sync with origin:** 2026-06-25
- **Pending PRs:** _pending_ — FR-WORKFLOW-002 (wf-20260625-feat-028, being created)

## Next Workflow ID

See `.copilot/meta/next-workflow-id` (currently: 29)

---

## Notes

**2026-06-25:** FR-WORKFLOW-002 (BusinessAnalyst + UATRunner agents) — introduces `business-analyst.md`, `uat-runner.md`, `uat-verification.md` workflow, UAT script template and registry under `docs/02-business-processes/uat/`. PR 1 of 2 (docs/agents/workflow only). PR 2 will add `scripts/uat-seed.ts` + `apps/e2e/playwright.uat.config.ts`.

**2026-06-25:** FR-AUTH-002 (Telegram authentication) — API layer implemented (wf-20260625-feat-027, branch `feature/AUTH-002-telegram-signin`, PR pending). Delivers `TelegramAuthService`, `POST /v1/auth/telegram/exchange`, `POST /v1/internal/telegram/upsert-temp-user`, two new `AuthentikClient` methods, and `TELEGRAM_BOT_TOKEN` env var. Web widget UI (Telegram Login Widget JS on `/auth/sign-in`) and bot `/start` handler are deferred to FR-BOT-001. Status in registry set to `In Progress` (not Shipped) because the full end-to-end feature requires the deferred UI and bot entry points.

**2026-06-25:** FR-CRM-001 (Twenty CRM deployment + SSO) — PR #51 open. Delivers `infrastructure/twenty/docker-compose.yml` (production Coolify compose, 4 services), local-dev compose additions, postgres-init twenty DB, env.example stubs. C5.2 (Authentik OIDC SSO) already shipped 2026-05-18. Manual smoke tests S1–S7 required post-merge before marking production-verified. Next: FR-CRM-002 (contact sync) unblocked once PR #51 merges.

**2026-06-25:** `apps/web` → `apps/web-next` migration COMPLETE. All 31 FR-MIG items shipped and merged. Production cutover steps executed (FR-MIG-031): cookie parity, SEO re-enabled, Authentik redirect URI repointed.

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
