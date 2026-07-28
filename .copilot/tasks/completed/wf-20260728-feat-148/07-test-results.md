# Step 8 — Test Results: FR-ADM-010 (Platform Admin Bootstrap)

> Output for: `.copilot/tasks/active/wf-20260728-feat-148/07-test-results.md`
> Agent: TestRunner
> Workflow: wf-20260728-feat-148 (requirement-development)

---

## Scope confirmation

`git status --short` at start of this step confirmed the working tree matches
the expected changeset: `apps/api/src/modules/admin-invites/admin-bootstrap.service.ts`
(new), `apps/api/test/admin-bootstrap.service.spec.ts` (new), plus modified
`authentik.client.ts`, `super-admin.guard.ts`, `admin-invites.module.ts`,
`apps/api/src/config/env.ts`, `apps/api/.env.example`,
`docs/04-development/architecture/auth-architecture.md`. Confined entirely to
`apps/api` — no web/bot/worker source changes, matching the impact analysis
and code summary.

---

## Integration-tier interpretation (per task brief's explicit ask)

This repo has **no separate `test:integration` script and no
`INTEGRATION_TEST` env gate** anywhere in `apps/api` — independently
confirmed via `grep -rn INTEGRATION_TEST apps/api` (0 hits in source/config)
and `grep test:integration apps/api/package.json ../../package.json` (0
hits). `apps/api/vitest.config.ts` **is** the Testcontainers-backed config
itself (`globalSetup: ['./test/setup-pg.ts']`, real Postgres container via
Testcontainers, `fileParallelism: false`) — `pnpm test` / `vitest run`
already runs unit specs and `*.integration.spec.ts` files together in one
pass. This matches the precedent already established in this repo
(`wf-20260718-fix-122/07-test-results.md` reached the identical conclusion
independently).

Given ImpactAnalyzer's and TestStrategist's conclusion that
`AdminBootstrapService` makes zero Postgres/Drizzle calls (Authentik-only —
independently re-confirmed here by grep: no `drizzle-orm`, `db.*`, or `sql`
import anywhere in `admin-bootstrap.service.ts`), the correct interpretation
of "integration tests are mandatory" for this workflow is: run the existing
Testcontainers-backed integration tier to confirm no regression, not author
a new integration test for a feature with no DB interaction. Did exactly
that — see Execution Summary rows 4–5 below.

**Docker pre-flight:** `docker ps` showed a live, healthy project
docker-compose stack (Postgres `aiqadam-postgres`, Directus, Authentik
server+worker, Redis, Mailpit, MinIO, Twenty) plus a second unrelated
Postgres container (`ai-dala-next-db-1`) — all healthy except one
pre-existing `unhealthy` Telegram Bot API mock container, unrelated to this
workflow. `docker info` succeeded (Docker Desktop 29.1.3, running). No
infrastructure gap — Testcontainers had a working Docker daemon throughout.

---

## Execution Summary

| Suite | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| `apps/api` new spec in isolation (`test/admin-bootstrap.service.spec.ts`) | 15 | 15 | 0 | 0 |
| `apps/api` admin-invites module (new spec + 2 siblings + boot-smoke test together) | 48 | 48 | 0 | 0 |
| `apps/api` full suite (`vitest run`, Testcontainers Postgres) — run 1 | 1315 | 1314 | 1 | 0 |
| `apps/api` full suite (`vitest run`, Testcontainers Postgres) — run 2 | 1315 | 1314 | 1 | 0 |
| `apps/api` full suite via repo-root `pnpm test` — run 3 | 1315 | 1314 | 1 | 0 |
| `apps/api` Testcontainers-backed integration specs directly (`checkin.integration.spec.ts`, `members-onboarding.integration.spec.ts`) | 29 | 29 | 0 | 0 |
| `apps/web-next` (`vitest run`, via `pnpm test`) | 932 | 932 | 0 | 0 |
| `apps/web` (via `pnpm test`, cached) | 54 | 54 | 0 | 0 |
| E2E | — | — | — | N/A (see below) |

The single failure is the same test, same file, same assertion, on all
three full-suite runs — see Failed Tests / Flaky Tests below.

---

## Type Check

`pnpm typecheck` (repo-wide, all 4 workspace packages via turbo) —
**0 errors.** `@aiqadam/web-next` reports 39 pre-existing hints (deprecated
`React.FormEvent` usage, unused-var lints in test files, one astro hint) —
all in files untouched by this branch (`MembersList.tsx`,
`SaveCohortModal.tsx`, `SponsorForm.tsx`, `TgSegmentsList.tsx`,
`api-ssr.test.ts`, `cms-landing-page.test.ts`, `csat-form.test.ts`,
`use-tg-broadcasts.test.ts`, `onboard.astro`) — 0 warnings, 0 errors.

`pnpm --filter @aiqadam/api typecheck` (`tsc --noEmit`) run separately —
**clean, zero output, 0 errors.** Matches CodeDeveloper's report.

---

## Lint / Format Check

`pnpm biome check .` (repo-wide, 633 files) — **clean, exit code 0.** 2
pre-existing warnings (not errors — do not fail the gate):

- `apps/web-next/src/blocks/workspace/AsyncSelect.tsx:251` — "Suppression
  comment has no effect" (`suppressions/unused`)
- `apps/web-next/src/blocks/workspace/TgBroadcastComposer.tsx:478` — same
  rule

Both confirmed **not** in this branch's changed-file list
(`git status --short` at session start) — pre-existing and unrelated,
matching CodeDeveloper's and TestDesigner's own flags. No dirty/unformatted
files among any of the 7 files this workflow touched.

---

## Failed Tests

| Test | File | Error | Classification |
|---|---|---|---|
| `UsersService.upsertByAuthentikSubject > updates email + displayName + lastLoginAt for an existing subject (no duplicate row)` | `apps/api/test/users.spec.ts:65` | `AssertionError: expected <ms> to be greater than <ms>` — `expect(second.lastLoginAt.getTime()).toBeGreaterThan(firstLogin.getTime())` fails when both writes land within the same clock-resolution window | **Pre-existing, unrelated to this PR.** File not touched by this workflow (`git status --short apps/api/test/users.spec.ts` → empty). Already tracked in `.copilot/context/workspace-state.md` (lines 143–144) as one of 3 bugs owned by follow-up workflow `wf-20260704-fix-096-pre-existing-api-test-flakes`, queued 2026-07-04, still not executed as of this session. Test-design bug (assertion assumes strictly-increasing timestamps at sub-ms write intervals), not a code bug in `AdminBootstrapService` or any file this workflow changed. |

No other failures in any suite, any run, across `apps/api`, `apps/web-next`,
or `apps/web`.

---

## Flaky Tests

| Test | File | Behavior observed |
|---|---|---|
| `updates email + displayName + lastLoginAt for an existing subject (no duplicate row)` | `apps/api/test/users.spec.ts:65` | **Confirmed flaky/reproducible, not a one-off.** Failed identically on all 3 full-suite runs performed this session (direct `vitest run` x2, repo-root `pnpm test` x1) — 1314/1315 pass each time, same test, same file, same assertion shape, different millisecond values each run. This is consistent with the already-tracked timestamp-precision race, independent of anything this branch changed. |

No flakiness observed in `admin-bootstrap.service.spec.ts` (15/15, run both
standalone and within the 48-test combined module run), the two
Testcontainers integration specs (29/29, run directly), or the full
`web-next`/`web` suites (986/986 combined).

---

## Coverage

- **`AdminBootstrapService`** (new, this PR): 15 tests across 6 `describe`
  blocks provide full behavioral-branch coverage — both degraded-mode skips
  (unconfigured `AuthentikClient`; missing `ADMIN_BOOTSTRAP_DEFAULT_PASSWORD`),
  the already-bootstrapped no-op (AC-2, incl. the `>=1` boundary and the
  empty-array optional-chaining edge), the zero-member bootstrap happy path
  (AC-1, incl. attribute-spread preservation on `patchAttributes`), the
  missing-group failure (both empty-array and no-pk shapes), the
  duplicate-email recovery edge case (`setPassword` confirmed NOT re-called
  on the recovered path), the unrecoverable-4xx case (original error
  rethrown by reference), the 5xx/non-`AuthentikError` boundary (pinned
  exactly at status 500 plus a plain-`Error` case), and two
  password-never-logged regression tests spanning all four `Logger.prototype`
  levels the service calls. Independently re-run and confirmed green, not
  just cited from `06-test-design.md`.
- **Integration tier**: no new Postgres/Drizzle surface added by this PR —
  independently confirmed via `grep` across `admin-bootstrap.service.ts` for
  `drizzle-orm`/`db.`/`sql` imports (0 hits); the service's only
  collaborator is `AuthentikClient`. Existing Testcontainers-backed
  integration specs re-run directly (29/29 pass), confirming no regression
  to the Postgres-backed surface elsewhere in `apps/api` from this PR's
  changes to `authentik.client.ts`/`super-admin.guard.ts`/
  `admin-invites.module.ts`.
- **`AuthentikClient` / `SuperAdminGuard` changes** (constant extraction
  only, no behavior change per CodeDeveloper): covered transitively by
  `authentik-client.spec.ts`'s existing 31 tests (unchanged, still passing)
  — no dedicated new test needed since this was a pure refactor (private
  constant → shared exported constant), confirmed by direct diff read.
- **`admin-invites.module.ts` DI wiring**: covered by
  `main-bootstrap.spec.ts`'s full Nest module-graph boot-smoke test (2/2
  pass within the 48-test combined run), confirming `AdminBootstrapService`
  registration doesn't break DI resolution or introduce a circular
  dependency — this is the same evidence CodeDeveloper cited, independently
  re-run here rather than trusted at face value.
- **Known, explicitly-flagged, non-blocking gaps** (per TestDesigner's own
  analysis, independently reviewed and agreed with, not just copied): AC-3's
  forced-password-change-screen half and AC-4 (no code path exists) are
  correctly routed to `BP-UAT-020` / noted as untestable rather than faked
  with a hollow test. `OnModuleInit`-throws-crashes-Nest-boot is
  framework-level behavior out of scope for a unit test of this service in
  isolation. `resolveGroupNames()` itself rejecting has no dedicated test
  (generic error propagation, no FR-ADM-010-specific branch logic) — minor,
  accepted gap.
- **E2E**: genuinely not applicable — confirmed independently by reading
  `admin-bootstrap.service.ts` in full: zero new HTTP routes/controllers,
  zero frontend changes anywhere in this diff (`git status --short` shows
  no `apps/web-next` or `apps/web` files touched). No E2E flow exists to run
  for this feature; not silently skipped, genuinely absent.

---

## Gate Result

```yaml
gate_result:
  agent: test-runner
  workflow_id: wf-20260728-feat-148
  status: passed
  summary: >
    Full mandated execution order run independently and verified with real
    command output, not trusted from prior agents' self-reports. Repo-wide
    typecheck clean (0 errors across all 4 packages; apps/api's tsc --noEmit
    run separately also confirmed clean with zero output). Repo-wide biome
    check clean (exit 0, 633 files; 2 pre-existing warnings in
    AsyncSelect.tsx/TgBroadcastComposer.tsx, independently confirmed
    untouched by this branch via git status). New
    admin-bootstrap.service.spec.ts (15 tests) run standalone (15/15 pass)
    and combined with its 2 siblings + the boot-smoke test (48/48 pass,
    zero regression). Full apps/api suite run THREE times (two direct
    vitest run invocations plus one via repo-root pnpm test): identical
    result each time, 1314/1315 pass, one reproducible pre-existing failure
    (test/users.spec.ts:65, a timestamp-race flake) — confirmed via git
    status that this file is untouched by this branch and confirmed via
    workspace-state.md lines 143-144 that this exact failure is already
    tracked under queued follow-up workflow
    wf-20260704-fix-096-pre-existing-api-test-flakes (queued 2026-07-04,
    still not executed). Integration-tier interpretation resolved per the
    task brief's explicit instruction: this repo has no separate
    test:integration script or INTEGRATION_TEST env gate anywhere in
    apps/api (confirmed via grep, 0 hits both places) -- vitest.config.ts
    IS the Testcontainers-backed config and pnpm test / vitest run already
    covers unit + *.integration.spec.ts together in one pass. Correctly
    did NOT author a new integration test for a feature with zero
    Postgres/Drizzle calls (independently confirmed via grep for
    drizzle-orm/db./sql imports in admin-bootstrap.service.ts -- 0 hits);
    instead ran the existing Testcontainers-backed integration specs
    directly (checkin.integration.spec.ts, members-onboarding.integration.spec.ts
    -- 29/29 pass) to positively confirm no regression to the Postgres
    surface this PR's module-boundary changes touch. Docker confirmed
    running and healthy via docker ps / docker info before any test run --
    no infrastructure gap, no escalation needed. apps/web-next (932/932)
    and apps/web (54/54, cached) both pass clean via the same pnpm test
    run, confirming zero cross-package regression despite this PR being
    apps/api-only. E2E genuinely not applicable -- zero new routes, zero
    frontend changes, independently confirmed by direct source read and
    git status, not just cited from ImpactAnalyzer.
  findings:
    - "Independently reproduced test/users.spec.ts:65's pre-existing timestamp-race flake on all 3 full-suite runs performed this session (2 direct vitest run + 1 repo-root pnpm test) -- consistent, not a one-off. Confirmed unrelated to this PR: file untouched by this branch (git status --short empty), already tracked under wf-20260704-fix-096-pre-existing-api-test-flakes since 2026-07-04, still unexecuted."
    - "Confirmed via grep that apps/api has no test:integration script and no INTEGRATION_TEST env var anywhere -- apps/api/vitest.config.ts is itself the Testcontainers-backed config (globalSetup: setup-pg.ts, real Postgres container). Resolved the task brief's explicit ambiguity: ran the existing integration specs directly (29/29 pass) to confirm no regression, rather than either skipping this tier or inventing a pointless new integration test for a feature with zero DB access."
    - "Independently verified (via grep, not trusted from ImpactAnalyzer's claim) that admin-bootstrap.service.ts has zero drizzle-orm/db./sql imports -- the unit-only test scope is correct on this PR's own merits."
    - "Docker pre-flight was not a gap: docker ps showed a live, healthy project docker-compose stack (Postgres, Directus, Authentik, Redis, Mailpit, MinIO, Twenty) and docker info succeeded before any test run began. No need to start Docker or escalate."
    - "New admin-bootstrap.service.spec.ts's 15/15 pass claim from 06-test-design.md independently re-verified true, both standalone and combined with siblings (48/48)."
  known_limitations:
    - "test/users.spec.ts:65 pre-existing timestamp-race flake remains unresolved -- owned by wf-20260704-fix-096-pre-existing-api-test-flakes, not this workflow. That follow-up has been queued since 2026-07-04 (24 days) and appears never executed; recommend the Orchestrator consider finally dispatching it, independent of this PR's merge readiness."
    - "AC-3 half 2 (forced password-change screen) and AC-4 (no special-casing post-change) have no unit-testable code path in this codebase -- correctly routed to BP-UAT-020 per test strategy, not invented as hollow tests here either."
    - "OnModuleInit-throws-crashes-Nest-boot framework-level behavior is out of scope for a unit test of this service in isolation -- noted, not newly closed by this test run."
    - "resolveGroupNames() itself rejecting has no dedicated test -- minor, accepted gap, generic error propagation with no FR-ADM-010-specific branch logic."
  next_agent: quality-gate
```
