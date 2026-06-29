# Workspace State

**Last updated:** 2026-06-29 (wf-20260629-fix-038 MERGED, PR #70)

---

## Active Workflows

_(none — see Completed Workflows below)_

---

## Completed Workflows (recent)

| Workflow ID | Type | Feature/Issue | Branch | PR | Date |
|---|---|---|---|---|---|
| wf-20260629-fix-038 | issue-resolution | ISS-UAT-013-6 Negative-scenario assertion rule + bats regression test | fix/ISS-UAT-013-6-uat-test-design | [PR #70](https://github.com/tvolodi/aiqadam/pull/70) | 2026-06-29 |
| wf-20260629-fix-037 | issue-resolution | ISS-UAT-013-5 Directus 503 bounded-exponential-back-off retry | fix/ISS-UAT-013-5-directus-retry | [PR #69](https://github.com/tvolodi/aiqadam/pull/69) | 2026-06-29 |
| wf-20260629-fix-036 | issue-resolution | ISS-UAT-013-4 seed operator_invites fix | fix/ISS-UAT-013-4-seed-operator-invites | [PR #68](https://github.com/tvolodi/aiqadam/pull/68) | 2026-06-29 |
| wf-20260629-fix-035 | issue-resolution | ISS-UAT-013-3 LeadCaptureForm on homepage | fix/ISS-UAT-013-3-lead-capture-web-next | [PR #67](https://github.com/tvolodi/aiqadam/pull/67) | 2026-06-29 |
| wf-20260629-fix-034 | issue-resolution | ISS-UAT-013-7 SMTP/Mailpit email transport | fix/ISS-UAT-013-7-smtp-mailpit | [PR #66](https://github.com/tvolodi/aiqadam/pull/66) | 2026-06-29 |
| wf-20260629-fix-033 | issue-resolution | ISS-UAT-013-1 port guard + api startup | fix/ISS-UAT-013-1-port-guard | [PR #65](https://github.com/tvolodi/aiqadam/pull/65) | 2026-06-29 |
| wf-20260628-fix-031 | issue-resolution | ISS-UAT-013-2 preflight process-identity fix | fix/ISS-UAT-013-2-preflight-identity | [PR #60](https://github.com/tvolodi/aiqadam/pull/60) | 2026-06-28 |
| wf-20260625-feat-029 | requirement-development | FR-WORKFLOW-002 UAT runnable infra — seed + Playwright config | feature/WORKFLOW-002-uat-infra | [PR #54](https://github.com/tvolodi/aiqadam/pull/54) | 2026-06-25 |
| wf-20260625-feat-028 | requirement-development | FR-WORKFLOW-002 BusinessAnalyst + UATRunner agents + uat-verification workflow | feature/WORKFLOW-002-uat-agents | [PR #53](https://github.com/tvolodi/aiqadam/pull/53) | 2026-06-25 |
| wf-20260625-feat-027 | requirement-development | FR-AUTH-002 Telegram auth API layer | feature/AUTH-002-telegram-signin | [PR #52](https://github.com/tvolodi/aiqadam/pull/52) | 2026-06-25 |
| wf-20260625-feat-026 | requirement-development | FR-CRM-001 Twenty CRM deployment + SSO | feature/CRM-001-twenty-crm-deployment | [PR #51](https://github.com/tvolodi/aiqadam/pull/51) | 2026-06-25 |
| wf-20260625-feat-025 | requirement-development | FR-MIG-031 production cutover — cookie parity, SEO re-enable | feature/MIG-031-production-cutover | [PR #48](https://github.com/tvolodi/aiqadam/pull/48) | 2026-06-25 |
| wf-20260625-feat-024 | requirement-development | FR-MIG-030 parity E2E suite + Lighthouse CI | feature/MIG-030-parity-e2e-suite | [PR #47](https://github.com/tvolodi/aiqadam/pull/47) | 2026-06-25 |

---

## Open Issues

_(ISS-UAT-013-8 remains open — see registry.md; ISS-UAT-013-6 resolved via PR #70)_

---

## Git State

- **Current branch:** main
- **Last sync with origin:** 2026-06-29
- **Pending PRs:** none

## Next Workflow ID

See `.copilot/meta/next-workflow-id` (currently: 40)

---

## Notes

**2026-06-25:** FR-WORKFLOW-002 PR 2 (wf-20260625-feat-029) — UAT runnable infrastructure. Adds `scripts/uat-seed.ts` (idempotent, Authentik + Directus API-based seeding), `apps/e2e/playwright.uat.config.ts` (localhost-only, sequential, screenshot-every-step), `apps/api/.env.example` additions (TELEGRAM_BOT_TOKEN, AUTHENTIK_ADMIN_URL/TOKEN, UAT_*), and `pnpm uat:seed` script in root `package.json`.

**2026-06-25:** FR-WORKFLOW-002 PR 1 (wf-20260625-feat-028, PR #53) — introduces `business-analyst.md`, `uat-runner.md`, `uat-verification.md` workflow, UAT script template and registry under `docs/02-business-processes/uat/`.

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
