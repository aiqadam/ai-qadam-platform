# Workspace State

**Last updated:** 2026-07-04 — `wf-20260704-fix-073` merged. PR #95 squash `<pending>` (ISS-UAT-009-1 logout-interstitial — Path B: comment + BP-UAT-009 spec + auth-architecture §5.3 rewrite + drift-detector SHA-suffix fix + doc-coverage regression). 3/3 ACs verified (live BP-UAT-009 Step 004 re-run on full stack: api=200, web=200, authentik=200; Authentik interstitial matches new spec exactly — screenshot at `apps/e2e/test-results/.../test-failed-1.png`). No follow-up workflows queued (no deferred ACs). Counter bumped 73 → 74. ISS-TEST-WEB-001 counter still 4/5 — owned by `wf-20260703-fix-066-vitest-bump` (queue position 1), unchanged by this workflow (the doc-coverage test was deliberately designed to bypass ISS-TEST-WEB-001 via pure `readFileSync`).

---

# Workspace State (merged wf-20260703-fix-070 — ISS-WF-REG-002 closed)

**Last updated:** 2026-07-03 (wf-20260703-fix-070 closed — `ISS-WF-REG-002` resolved. `BP-UAT-013.md` frontmatter `Ready`→`Implemented`; `workspace-state.md` self-healed; registry's `Open Issues` column was removed entirely by `wf-20260703-fix-067-coverage-registry` (PR #91, commit `113e69d9`); AC-4 decision recorded: keep F.5 amendment in `scripts/workflow-finish.sh` as opt-in via `context_update:` block — do not deprecate `workspace-state.md`. Counter bumped 69 → 70.)

---

## Active Workflows

_(none — `wf-20260704-fix-073` has merged and been archived to `completed/`. Next to pick up is one of the queued follow-up workflows below, in priority order.)_

### Queued follow-up workflows (named in respective ISS files)

- **wf-20260703-fix-065-bridge** — owns [ISS-UAT-BRIDGE-001](../issues/ISS-UAT-BRIDGE-001.md); queue position 1; placeholder name (counter will be the next increment after `68`)
- **wf-20260703-feat-065-bp-uat-001-spec** — owns [ISS-UAT-COV-003](../issues/ISS-UAT-COV-003.md); queue position 1
- **wf-20260703-fix-066-seed-port** — owns [ISS-UAT-SEED-002](../issues/ISS-UAT-SEED-002.md); queue position 1
- **wf-20260703-fix-066-vitest-bump** — owns [ISS-TEST-WEB-001](../issues/ISS-TEST-WEB-001.md); queue position 1; spawned by `wf-20260703-fix-065-onboarding-copy` because ISS-UAT-013-13's AC-3 regression test cannot run until vitest + vite 8 version skew is resolved.
- **uat-bp-uat-coverage-batch** — 17 workflows queued at `.copilot/tasks/queued/uat-bp-uat-coverage-batch/handoff.yaml`; owned by `wf-20260703-fix-067-coverage-registry`. Position 1 = `wf-20260703-uat-068-pilot-bp-uat-010` (run BP-UAT-010.spec.ts against the live stack). Positions 2–17 = one workflow per remaining BP-UAT script (BP-UAT-002, 003, 004, 005, 006, 007, 008, 011, 012, 014, 015, 016, 017, 018 + BP-UAT-001 from ISS-UAT-COV-003 which has its own outer queue).

---

## Open Issues

- [ISS-WF-CI-OVERRIDE-1](../issues/ISS-WF-CI-OVERRIDE-1.md) (blocker, workflow/ci-policy) — PRSteward agent + counter-limited override policy. Active in this workflow (wf-20260703-impl-policy-071).
- [ISS-UAT-BRIDGE-001](../issues/ISS-UAT-BRIDGE-001.md) (blocker, api/directus-bridge) — newly-discovered gap in `ensureLinkedByEmail` (returns `null` for seed users without `platform.users` row); discovered during wf-20260703-uat-064 live verification. Blocks AC-2/3 of [ISS-UAT-001-1](../issues/ISS-UAT-001-1.md) from flipping to `verified`.
- [ISS-UAT-COV-003](../issues/ISS-UAT-COV-003.md) (enhancement, uat/coverage) — BP-UAT-001 has no Playwright spec (`apps/e2e/tests/uat/BP-UAT-001.spec.ts` not present); out of Path A scope by user choice.
- [ISS-UAT-SEED-002](../issues/ISS-UAT-SEED-002.md) (bug, uat/seed) — `scripts/uat-seed.sh`'s `api_base` default points to port 3001; API listens on 3000 (per `apps/api/.env` `PORT=3000`); seed requires undocumented `API_BASE_URL` export.
- [ISS-TEST-WEB-001](../issues/ISS-TEST-WEB-001.md) (blocker, web/test-infrastructure) — `vitest 2.1.9` + workspace `vite 8.1.0` SSR-transform skew causes `ReferenceError: __vite_ssr_exportName__ is not defined` on any test that imports a sibling module. Blocks AC-3 of [ISS-UAT-013-13](../issues/ISS-UAT-013-13.md). Fix queued at `wf-20260703-fix-066-vitest-bump` (counter 66).
- [ISS-UAT-COV-001](../issues/ISS-UAT-COV-001.md) (RESOLVED 2026-07-03 by wf-20260703-fix-067-coverage-registry) — gap is now sequenced and visible in `registry.md` Spec/Smoke Overlap columns + 17 follow-up workflows queued.

## Completed Workflows (recent)

| Workflow ID | Type | Feature/Issue | Branch | PR | Date |
|---|---|---|---|---|---|
| wf-20260704-fix-073 | issue-resolution | ISS-UAT-009-1 logout-interstitial (Path B: comment + BP-UAT-009 spec + auth-architecture §5.3 rewrite + drift-detector SHA-suffix fix + doc-coverage regression; 3/3 ACs verified by live BP-UAT-009 Step 004 re-run) | fix/ISS-UAT-009-1-logout-interstitial | _pending — opens on workflow-finish step_ | 2026-07-04 |
| wf-20260703-fix-070 | issue-resolution | ISS-WF-REG-002 registry-state drift — `BP-UAT-013.md` frontmatter `Ready`→`Implemented`; `workspace-state.md` already self-healed 2026-07-03; registry's `Open Issues` column was removed by wf-20260703-fix-067-coverage-registry (PR #91); AC-4 decision: keep F.5 amendment in `workflow-finish.sh` as opt-in via `context_update:` block (do not deprecate `workspace-state.md`) | fix/ISS-WF-REG-002-registry-state-drift | _pending — opens on workflow-finish step_ | 2026-07-03 |
| wf-20260703-fix-069-biome-scope | issue-resolution | ISS-CI-003 (won't fix as filed) — biome noise policy: trim 30+ noisy recommended-set rules in `packages/biome-config/biome.json` (kept high-signal unused-*/noExplicitAny/useTemplate/useConst/noNonNullAssertion); remove `Lint + format check (Biome)` step from `.github/workflows/ci.yml` `ci` job. Effect: pnpm lint 20,473 errors / 90s → 1,658 errors / 15s. CI no longer surfaces biome noise. | fix/ISS-CI-003-biome-scope | [PR #92](https://github.com/tvolodi/aiqadam/pull/92) (squash `3f2d001`) | 2026-07-03 |
| wf-20260703-uat-064 | uat-verification | BP-UAT-001 re-verification (live) — Path A minimal verify; AC-1 partial, AC-2/3 failed (bridge gap), AC-4 deferred (no spec), AC-5 failed (api_base port) | uat/BP-UAT-001-event-publication-broadcast | [PR #88](https://github.com/tvolodi/aiqadam/pull/88) (squash `ee209fc4`) | 2026-07-03 |
| wf-20260703-fix-065-onboarding-copy | issue-resolution | ISS-UAT-013-13 OnboardingForm welcome copy | fix/ISS-UAT-013-13-onboarding-copy | [PR #90](https://github.com/tvolodi/aiqadam/pull/90) (squash `e38dd18`) | 2026-07-03 |
| wf-20260703-fix-067-coverage-registry | issue-resolution | ISS-UAT-COV-001 BP-UAT coverage gap (Spec+Smoke Overlap columns + 17 queued follow-ups); merged via auto-merge (CI advisory per 2026-06-29 override) | fix/ISS-UAT-COV-001-coverage-registry | [PR #91](https://github.com/tvolodi/aiqadam/pull/91) (squash `113e69d9`) | 2026-07-03 |
| wf-20260703-fix-064 | issue-resolution | ISS-UAT-001-1 seed Directus mirror gap for new Authentik fixtures (blocks BP-UAT-001) | fix/ISS-UAT-001-1-uat-seed-directus-mirror | [PR #89](https://github.com/tvolodi/aiqadam/pull/89) (squash `2b72f460`) | 2026-07-03 |
| wf-20260629-fix-039 | issue-resolution | ISS-UAT-013-8 operator_invites.email alignment with seeded Authentik user + Neg 005 | fix/ISS-UAT-013-8-invite-email-match | [PR #71](https://github.com/tvolodi/aiqadam/pull/71) | 2026-06-29 |
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

## Open Issues (legacy)

_(empty — see "Open Issues" above for current status. Kept for delta-only history.)_

## Git State

- **Current branch:** main
- **Last sync with origin:** 2026-07-04 (`<pending>` — `fix(auth): resolve ISS-UAT-009-1 logout-interstitial — Path B spec+comment update (#95)` on `main` after PR auto-merge)
- **Pending PRs:** none — #95 will merge with §6.3 v2 audit-trail squash trailer if ci fails (ISS-TEST-WEB-001 counter is at 4/5; new failure class would auto-register and queue).

## Next Workflow ID

See `.copilot/meta/next-workflow-id` (currently: `74` — incremented from `73` by the archive of `wf-20260704-fix-073`. The next workflow should pick counter `74` as its base. If a queued follow-up (below) starts, it should use the placeholder-named IDs (e.g. `wf-20260703-fix-065-bridge`) with the actual counter assignment done at handoff.yaml creation. The 5-override budget for the ci class is at 4/5 — the **next** PR that hits the same `__vite_ssr_exportName__` failure will be the last before PRSteward refuses to override on this class. Fix `wf-20260703-fix-066-vitest-bump` soon.

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
