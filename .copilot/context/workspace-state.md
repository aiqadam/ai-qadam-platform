# Workspace State

**Last updated:** 2026-07-05 — `wf-20260705-fix-105` MERGED (PR #120 squash `f55ce74`). ISS-UAT-013-15 resolved: `scripts/uat-seed.sh` is now MSYS-aware. Top of script resolves `CURL_BIN='curl.exe'` when `command -v curl.exe` succeeds, otherwise falls back to bare `curl`. All 14 runtime `curl` invocations route through `"$CURL_BIN"`. `check_deps()` extended with `command -v "$CURL_BIN"` guard + `'Missing required curl binary'` message. 4 new bats rows (38-41) added to `scripts/tests/uat-seed.bats` — bats 41/41 pass. AGENTS.md §6.1 subsection "Shell-script HTTP client binary selection (added 2026-07-05, ISS-UAT-013-15)" documents the canonical curl.exe-detection idiom for future scripts. Refinement vs. issue body (recorded per §13 in PR Risks): chose `command -v curl.exe` over the issue's `uname -s | grep mingw` heuristic — strictly broader (covers WSL bash too), matches the `uat-preflight-email.sh` precedent. AC-2 verified 4/4. AC-1 (live `bash scripts/uat-seed.sh` from MSYS) + AC-4 (BP-UAT-013 live re-run) deferred with honesty disclosure to queued `wf-20260705-fix-103-uat-013-verify` (queue position 3). AC-3 (Path B AGENTS.md note) moot — Path A landed and supersedes the workaround. Counter bumped 106 → 107. Auto-merge per AGENTS.md §6.2 + §6.3 user CI opt-out (PR was squashed and merged at 2026-07-05 06:26:17 UTC with `--auto --squash --delete-branch`). `wf-20260705-uat-100` parent workflow remains STOPPED at Step 2 with `failed-escalate` — needs-review.md unreviewed. Active workflow directory `.copilot/tasks/active/wf-20260705-fix-105/` archived → `.copilot/tasks/completed/wf-20260705-fix-105/`.

---

**Last updated:** 2026-07-05 — `wf-20260705-uat-100` STOPPED at Step 2 (Pre-Flight) `failed-escalate`. User-requested BP-UAT-013 re-verification (`Run UAT testing for BP-UAT-013`). Step 1 (BusinessAnalyst script validation) PASSED; Step 2 (pre-flight) failed on two distinct non-product issues: (a) `scripts/uat-seed.sh --reset BP-UAT-013` POSTs manifests without `token_hash`/`token_prefix` (Directus 400 — registered as [ISS-UAT-013-14](../issues/ISS-UAT-013-14.md), queue position 1 → [wf-20260705-fix-101-bp-uat-013-seed-reset](../tasks/queued/wf-20260705-fix-101-bp-uat-013-seed-reset/handoff.yaml)); (b) bash GNU curl from inside this machine's Copilot-Chat terminal sandbox cannot reach Windows-host `localhost:<api-port>` even though `curl.exe` from the same PowerShell reaches `:3001` HTTP 200 (registered as [ISS-UAT-013-15](../issues/ISS-UAT-013-15.md), queue position 2 → [wf-20260705-fix-102-uat-seed-curl-exe-aware](../tasks/queued/wf-20260705-fix-102-uat-seed-curl-exe-aware/handoff.yaml)). Both fixes must land before [wf-20260705-fix-103-uat-013-verify](../tasks/queued/wf-20260705-fix-103-uat-013-verify/handoff.yaml) (queue position 3 — the actual Playwright UAT run) can complete. Cleanup: api I started on `:3001` (PID 5488) was stopped; `operator_invites` table is empty (4 rows deleted by failed `--reset`); `apps/e2e/uat-results/BP-UAT-013/` is empty (no Playwright run occurred); `registry.md` BP-UAT-013 row's `last_run` is HONESTLY unchanged at 2026-07-02 — no run completed, so no `last_run` bump. Active task artifacts at [`.copilot/tasks/active/wf-20260705-uat-100/`](../tasks/active/wf-20260705-uat-100/) (status `needs-review`); NEEDS_REVIEW at [`NEEDS_REVIEW.md`](../tasks/active/wf-20260705-uat-100/NEEDS_REVIEW.md).

---

---

**Superseded entry, retained for delta-only history:**

**Last updated:** 2026-07-04 — `wf-20260704-fix-095` merged. [PR #110](https://github.com/tvolodi/aiqadam/pull/110) squash `69b2bc6` (ISS-TEST-WEB-001 — root cause: `vitest ^2.1.8` (pinned in apps/web, apps/web-next, apps/api) bundles vite 5.x/6.x whose SSR transform is missing `__vite_ssr_exportName__` (added in vite v8). The workspace's hoisted `vite@8.1.0` defines that helper, so any cross-module `import` in a test crashed the suite load with `ReferenceError: __vite_ssr_exportName__ is not defined`, blocking ISS-UAT-013-13 AC-3 regression test. Fix: bump `vitest ^2.1.8` → `^4.1.9` in all three apps + `@vitest/coverage-v8 ^2.1.8` → `^4.1.9` in apps/api (vitest 4.1.9 declares peer `vite: ^6.0.0 || ^7.0.0 || ^8.0.0`, satisfied by vite 8.1.0); removed obsolete `transformMode: 'web'` from `apps/api/vitest.unit.config.ts` (option removed in vitest 3.0); wired `@vitejs/plugin-react@^5.2.0` as first plugin in `apps/web-next/vitest.config.ts` (mirroring PR #109 / ISS-CI-OVERRIDE-ebd184b storybook pattern) so `.tsx` test files parse under vite 8.1.0/rolldown. Regression test `apps/web/src/components/OnboardingForm.test.ts` 5/5 pass (was blocked pre-fix); apps/web 54/54; apps/web-next 923/923 across 33 files; apps/api unit-config 15/15; apps/api full Testcontainers 1251/1257 (6 pre-existing test-design bugs owned by `wf-20260704-fix-096-pre-existing-api-test-flakes` — none caused by this PR, they were masked by the `__vite_ssr_exportName__` block). biome 0 errors; astro check 0 errors. Counter bumped 96 → 97. Auto-merge per AGENTS.md §6.2 + §6.3 user CI opt-out. Predecessor `wf-20260704-fix-093` (PR #109 squash `255d2bb`).

---

---

# Workspace State (merged wf-20260703-fix-070 — ISS-WF-REG-002 closed)

**Last updated:** 2026-07-03 (wf-20260703-fix-070 closed — `ISS-WF-REG-002` resolved. `BP-UAT-013.md` frontmatter `Ready`→`Implemented`; `workspace-state.md` self-healed; registry's `Open Issues` column was removed entirely by `wf-20260703-fix-067-coverage-registry` (PR #91, commit `113e69d9`); AC-4 decision recorded: keep F.5 amendment in `scripts/workflow-finish.sh` as opt-in via `context_update:` block — do not deprecate `workspace-state.md`. Counter bumped 69 → 70.)

---

## Active Workflows

_(none — `wf-20260704-fix-095` has merged. Next to pick up is one of the queued follow-up workflows below, in priority order.)_

### Queued follow-up workflows (named in respective ISS files)

- **wf-20260703-fix-065-bridge** — owns [ISS-UAT-BRIDGE-001](../issues/ISS-UAT-BRIDGE-001.md); queue position 1; placeholder name (counter will be the next increment after `68`)
- ~~**wf-20260703-fix-066-vitest-bump**~~ — SUPERSEDED 2026-07-04 by `wf-20260704-fix-095` (PR #110 squash `69b2bc6`); the original placeholder queue name resolved to a different counter block than initially projected. Owning issue ISS-TEST-WEB-001 → RESOLVED.
- **wf-20260704-fix-096-pre-existing-api-test-flakes** — owns 3 apps/api test-design bugs unmasked by `wf-20260704-fix-095` (users.spec.ts:65 timestamp race; telegram-auth-controller.spec.ts:161 reflect-metadata; port-guard.spec.ts cases 4+8 Linux-only mocks).
- **uat-bp-uat-coverage-batch** — 17 workflows queued at `.copilot/tasks/queued/uat-bp-uat-coverage-batch/handoff.yaml`; owned by `wf-20260703-fix-067-coverage-registry`. Position 1 = `wf-20260703-uat-068-pilot-bp-uat-010` (run BP-UAT-010.spec.ts against the live stack). Positions 2–17 = one workflow per remaining BP-UAT script (BP-UAT-002, 003, 004, 005, 006, 007, 008, 011, 012, 014, 015, 016, 017, 018 + **BP-UAT-001 from ISS-UAT-COV-003** at position 12 — spec now authored by `wf-20260704-feat-090` PR #107 squash `c013f6e`; only the live re-run against the local stack remains).

---

## Open Issues

- [ISS-UAT-BRIDGE-001](../issues/ISS-UAT-BRIDGE-001.md) (blocker, api/directus-bridge) — newly-discovered gap in `ensureLinkedByEmail` (returns `null` for seed users without `platform.users` row); discovered during wf-20260703-uat-064 live verification. Blocks AC-2/3 of [ISS-UAT-001-1](../issues/ISS-UAT-001-1.md) from flipping to `verified`.
- [ISS-TEST-WEB-001](../issues/ISS-TEST-WEB-001.md) (RESOLVED 2026-07-04 by wf-20260704-fix-095, PR #110 squash `69b2bc6`) — vitest 2.1.9 → 4.1.9 in apps/{web,web-next,api}; companion edits to apps/api/vitest.unit.config.ts (transformMode removal) and apps/web-next/vitest.config.ts (@vitejs/plugin-react wiring mirroring PR #109 storybook pattern). Unblocks ISS-UAT-013-13 AC-3 regression test (now 5/5 passes). Follow-up queue: `wf-20260704-fix-096-pre-existing-api-test-flakes` for 3 apps/api test-design bugs unmasked by this fix.
- [ISS-UAT-COV-003](../issues/ISS-UAT-COV-003.md) (RESOLVED 2026-07-04 by wf-20260704-feat-090, PR #107 squash `c013f6e`) — BP-UAT-001 now has `apps/e2e/tests/uat/BP-UAT-001.spec.ts` (7 Playwright tests) + bats row 22. Live re-run deferred to position 12 of `uat-bp-uat-coverage-batch/`.
- [ISS-UAT-BATS-001](../issues/ISS-UAT-BATS-001.md) (RESOLVED 2026-07-04 by wf-20260704-fix-092, PR #108 squash `69f2b3f`) — `scripts/tests/uat-seed.bats` row 6 (FR-WORKFLOW-003 row 6) regression assertion has 2 interacting bugs: (a) baseline source-of-truth `git show origin/main:scripts/uat-seed.sh` is no longer pre-fix after main advanced past `2b72f46`; (b) byte-equality assertion too strict for `wf-20260704-fix-086`'s documented `@aiqadam.test → @example.com` TLD migration.
- [ISS-UAT-SEED-002](../issues/ISS-UAT-SEED-002.md) (RESOLVED 2026-07-04 by wf-20260704-fix-089, PR #106 squash `3e524bd`) — `scripts/uat-seed.sh`'s `api_base` default now derived from `apps/api/.env` `PORT` via `env_get`; `:3000` fallback for fresh-checkout UX.
- [ISS-UAT-COV-001](../issues/ISS-UAT-COV-001.md) (RESOLVED 2026-07-03 by wf-20260703-fix-067-coverage-registry) — gap is now sequenced and visible in `registry.md` Spec/Smoke Overlap columns + 17 follow-up workflows queued.
- [ISS-CI-OVERRIDE-ebd184b](../issues/ISS-CI-OVERRIDE-ebd184b.md) (RESOLVED 2026-07-04 by wf-20260704-fix-093, PR #109 squash `255d2bb`) — root cause: `@storybook/react-vite@8.6.18` is a pass-through adapter; rolldown 1.1.3 (transitive via `@astrojs/react` → `vite@8`) parses `.tsx` with JSX disabled by default → 12 `PARSE_ERROR`. Fix: added `@vitejs/plugin-react@^5.2.0` as direct devDep of `apps/storybook`; injected `react({ jsxRuntime: 'automatic' })` as first plugin in `viteFinal`. Build now exits 0 with 226 modules transformed. Counter for failure class `ebd184bfe1c7b3c4fde6d4d0685be02d595d8be7` reset to 0 per AGENTS.md §6.3 step 5.

## Completed Workflows (recent)

| Workflow ID | Type | Feature/Issue | Branch | PR | Date |
| wf-20260705-fix-105 | issue-resolution | ISS-UAT-013-15 — `scripts/uat-seed.sh` MSYS-aware: top-of-script `command -v curl.exe` detection routes 14 runtime `curl` invocations through `"$CURL_BIN"`; `check_deps()` extended with `command -v "$CURL_BIN"` guard. 4 new bats rows (38-41) added to `scripts/tests/uat-seed.bats`. Refinement vs. issue body (per §13 Risks): `command -v curl.exe` is strictly broader than the issue's `uname -s \| grep mingw` heuristic (also covers WSL bash; matches `uat-preflight-email.sh` precedent). bats 41/41 pass. AGENTS.md §6.1 subsection documents the canonical idiom. AC-2 verified 4/4; AC-1 + AC-4 deferred with honesty disclosure to `wf-20260705-fix-103-uat-013-verify` (queue position 3); AC-3 moot — Path A landed. | fix/ISS-UAT-013-15-uat-seed-curl-exe-aware | [PR #120](https://github.com/tvolodi/aiqadam/pull/120) (squash `f55ce74`) | 2026-07-05 |
| wf-20260704-fix-095 | issue-resolution | ISS-TEST-WEB-001 — vitest 2.1.9 → 4.1.9 in apps/{web,web-next,api} to align with workspace's hoisted vite 8.1.0. Companion edits: removed obsolete `transformMode: 'web'` from `apps/api/vitest.unit.config.ts`; wired `@vitejs/plugin-react@^5.2.0` as first plugin in `apps/web-next/vitest.config.ts` mirroring PR #109 / ISS-CI-OVERRIDE-ebd184b storybook pattern. Regression test `apps/web/src/components/OnboardingForm.test.ts` 5/5 pass (was blocked pre-fix). Full vitest runs: apps/web 54/54, apps/web-next 923/923 across 33 files, apps/api unit-config 15/15, apps/api full Testcontainers 1251/1257 (94/97 files; 6 pre-existing test-design bugs owned by `wf-20260704-fix-096` — unmasked by this fix, none caused by it). biome 0 errors; astro check 0 errors. Counter bumped 96 → 97. | fix/ISS-TEST-WEB-001-vitest-bump | [PR #110](https://github.com/tvolodi/aiqadam/pull/110) (squash `69b2bc6`) | 2026-07-04 |
|---|---|---|---|---|---|---|
| wf-20260704-fix-093 | issue-resolution | ISS-CI-OVERRIDE-ebd184b — rolldown 1.1.3 [PARSE_ERROR] on apps/web-next .tsx files during storybook-static build. Root cause: @storybook/react-vite@8.6.18 is a thin pass-through adapter that does NOT inject any Vite plugin for JSX; rolldown 1.1.3 (transitive via @astrojs/react → vite@8) parses .tsx files itself with JSX disabled by default. Fix: added @vitejs/plugin-react@^5.2.0 as direct devDep of apps/storybook; prepended react({ jsxRuntime: automatic }) as first plugin in viteFinal so Babel transpiles JSX before rolldowns parser sees it. pnpm --filter @aiqadam/storybook build now exits 0 with 226 modules transformed (31+ asset chunks including per-atom stories). biome clean; tsc has 2 pre-existing errors on origin/main (unrelated). Counter for failure class ebd184b…d8be7 reset to 0 per AGENTS.md §6.3 step 5. | fix/ISS-CI-OVERRIDE-ebd184b-rolldown-jsx | [PR #109](https://github.com/tvolodi/aiqadam/pull/109) (squash 255d2bb) | 2026-07-04 |
| wf-20260704-feat-090 | requirement-development | FEAT-UAT-COV-003 / ISS-UAT-COV-003 — authored `apps/e2e/tests/uat/BP-UAT-001.spec.ts` (7 Playwright tests mapping to Steps 002-006 + Neg 001/002) + appended FEAT-UAT-COV-003 row 22 to `scripts/tests/uat-seed.bats` (`--reset BP-UAT-001` idempotency). 5/5 ACs (4 hermetic verified; AC-3 live Playwright re-run deferred to position 12 of `uat-bp-uat-coverage-batch/`). Typecheck clean; pre-existing FR-WORKFLOW-003 row 6 unrelated at the time (later resolved by `wf-20260704-fix-092` PR #108 squash `69f2b3f`). | feat/UAT-COV-003-bp-uat-001-spec | [PR #107](https://github.com/tvolodi/aiqadam/pull/107) (squash `c013f6e`) | 2026-07-04 |
| wf-20260704-fix-092 | issue-resolution | ISS-UAT-BATS-001 — `scripts/tests/uat-seed.bats` row 6 baseline pinned to immutable SHA `8db37ac^` (Bug A); replaced strict byte-equality with structural assertion + drift-whitelist (Bug B). bats 34/34 pass (was 33/34). Per `AGENTS.md §14`, dedicated issue file registered and resolved in the same workflow per `ISS-PREEX-001` precedent (severity: minor, module: uat/test-design). Closes the loop that 3 prior PRs (#105, #106, #107) had disclosed as "owned by follow-up `wf-20260704-fix-087-fix-fr-workflow-003-row-6`" but never actually queued. | fix/ISS-UAT-BATS-001-fr-workflow-003-row-6 | [PR #108](https://github.com/tvolodi/aiqadam/pull/108) (squash `69f2b3f`) | 2026-07-04 |
| wf-20260704-fix-089 | issue-resolution | ISS-UAT-SEED-002 — `scripts/uat-seed.sh`'s `api_ensure_directus_user_link` derived `api_base` from `apps/api/.env` `PORT` via `env_get` (`:3000` fallback); replaced wrong `http://host.docker.internal:3001` literal + misleading WSL2 comment. 5/5 ACs verified by 2 grep regressions + 3 helper-extraction bats cases in `scripts/tests/uat-seed.bats`. Pre-existing FR-WORKFLOW-003 row 6 bats failure unrelated, present on origin/main. | fix/ISS-UAT-SEED-002-seed-port-default | [PR #106](https://github.com/tvolodi/aiqadam/pull/106) (squash `3e524bd`) | 2026-07-04 |
| wf-20260704-fix-075 | issue-resolution | ISS-UAT-009-2 — BP-UAT-009 /me anon-CTA + /workspace 302 per-surface mechanism (Path B: docs-only — spec reword to security intent + per-surface mechanism block + "Why two anon-gating mechanisms?" rationale + post-MIG-031 redirect description; 4/4 ACs verified by live curl + screenshot; no code, no DB, no security delta) | fix/ISS-UAT-009-2-me-anon-cta-spec | [PR #96](https://github.com/tvolodi/aiqadam/pull/96) (squash `dbe43bf`) | 2026-07-04 |
| wf-20260704-fix-073 | issue-resolution | ISS-UAT-009-1 logout-interstitial (Path B: comment + BP-UAT-009 spec + auth-architecture §5.3 rewrite + drift-detector SHA-suffix fix + doc-coverage regression; 3/3 ACs verified by live BP-UAT-009 Step 004 re-run) | fix/ISS-UAT-009-1-logout-interstitial | [PR #95](https://github.com/tvolodi/aiqadam/pull/95) (squash `5b23e74`) | 2026-07-04 |
| wf-20260703-fix-070 | issue-resolution | ISS-WF-REG-002 registry-state drift — `BP-UAT-013.md` frontmatter `Ready`→`Implemented`; `workspace-state.md` already self-healed 2026-07-03; registry's `Open Issues` column was removed by wf-20260703-fix-067-coverage-registry (PR #91); AC-4 decision: keep F.5 amendment in `workflow-finish.sh` as opt-in via `context_update:` block (do not deprecate `workspace-state.md`) | fix/ISS-WF-REG-002-registry-state-drift | [PR #93](https://github.com/tvolodi/aiqadam/pull/93) (squash `854d4d6`) | 2026-07-03 |
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
- **Last sync with origin:** 2026-07-04 (`3e524bd` — `chore(workflow): finalize artifacts for ISS-UAT-SEED-002 (#106)` on `main` after PR auto-merge; prior PR #105 squash `5bb819b` for ISS-UAT-BRIDGE-002)
- **Pending PRs:** none. ISS-TEST-WEB-001 counter still 4/5 — unchanged by this workflow (no test code touched).

## Next Workflow ID

See `.copilot/meta/next-workflow-id` (currently: `90` — incremented from `89` by the merge of `wf-20260704-fix-089` for ISS-UAT-SEED-002. The next workflow should pick counter `90` as its base. If a queued follow-up (below) starts, it should use the placeholder-named IDs (e.g. `wf-20260703-fix-065-bridge`) with the actual counter assignment done at handoff.yaml creation. The 5-override budget for the ci class is at 4/5 — the **next** PR that hits the same `__vite_ssr_exportName__` failure will be the last before PRSteward refuses to override on this class. Fix `wf-20260703-fix-066-vitest-bump` soon.

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
