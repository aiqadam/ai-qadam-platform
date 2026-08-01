# 07 — Test Results: FR-AUTH-006

Agent: TestRunner
Workflow: wf-20260801-feat-181
Branch: feature/FR-AUTH-006-temp-account-upgrade

## Execution Summary

This repo has no separate unit/integration script split: `apps/api/package.json`'s
`test` script is `vitest run` against `apps/api/vitest.config.ts`, whose
`globalSetup` (`test/setup-pg.ts`) starts a real Testcontainers Postgres 16 +
Redis 7 for the whole run and applies all migrations before any spec executes.
So `pnpm --filter api test` **is** the integration-inclusive full suite — there
is no separate `INTEGRATION_TEST=1 pnpm test:integration` command to invoke in
this repo (confirmed by reading `package.json` at repo root and
`apps/api/package.json`, and `apps/api/vitest.config.ts` /
`apps/api/test/setup-pg.ts`). The table below reflects that reality rather than
force-splitting counts that the tooling doesn't split.

| Suite | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| Full suite (unit + integration, real Testcontainers Postgres+Redis) — `pnpm --filter api test` | 1529 | 1528 | 1 | 0 |
| FR-AUTH-006 new/modified files only (subset of above, isolated run for traceability) — `pnpm vitest run test/upgrade-service.spec.ts test/authentik-client.spec.ts test/auth-controller-callback.spec.ts` | 44 | 44 | 0 | 0 |
| FR-AUTH-006 integration (subset of above, isolated run) — `pnpm vitest run test/upgrade-service.integration.spec.ts` | 10 | 10 | 0 | 0 |
| E2E | — | — | — | — |

**E2E note:** per `06-test-strategy.md`'s explicit "E2E Decision," no new
Playwright file was written for this FR — bot-only mechanism, no browser UI in
scope. There is nothing new to run at this step. This is not a silent
omission; the live-verification leg (curl against real local Authentik +
Mailpit) is explicitly Orchestrator-owned per that document, not
TestRunner's.

All counts above were produced by actually running the commands in this
session (not copied from `06-test-design.md`'s prior report), per the task's
explicit instruction to independently re-verify rather than trust a prior
agent's claim. The full-suite numbers (1528/1529) match what TestDesigner
reported, confirming that report was accurate — but this is an independent
re-run, not a rubber-stamp.

## Type Check

`pnpm --filter api typecheck` (`tsc --noEmit`) — **clean, 0 errors.**

## Lint / Format Check

`pnpm --filter api lint` (`biome check .`) — **clean.** Output: "Checked 320
files in 109ms. No fixes applied."

## Failed Tests

| Test | File | Error | Classification |
|---|---|---|---|
| `UsersService.upsertByAuthentikSubject > updates email + displayName + lastLoginAt for an existing subject (no duplicate row)` | `apps/api/test/users.spec.ts:65` | `AssertionError: expected <firstLogin ms> to be greater than <secondLogin ms>` (in the full-suite run: `expected 1785565417482 to be greater than 1785565420633`; in the isolated re-run below: `expected 1785565632028 to be greater than 1785565637023` — in both observed failures the "first" value came out numerically *larger* than the "second" one, a multi-second gap, not a same-millisecond tie) | **Pre-existing, unrelated to this workflow — not a code-bug or test-bug introduced here.** See diagnosis below. |

### Independent diagnosis (re-verified, not trusted from `06-test-design.md`)

**Not caused by this workflow.** Verified two ways:

1. `git diff main -- apps/api/test/users.spec.ts` returns **zero lines** —
   this branch has not touched this file at all.
2. `git diff main --stat -- apps/api/src/modules/users/` also returns
   **empty** — this branch has not touched `UsersService` or its schema
   either. FR-AUTH-006's only interaction with `UsersService` is that
   `AuthController.callback()` already called
   `upsertByAuthentikSubject()` before this workflow started (pre-existing
   call site); this workflow adds a `resolvePendingUpgrade`/`commitUpgrade`
   call *around* it but does not modify `UsersService` itself.

**Reproduces identically in isolation** — re-ran `pnpm vitest run
test/users.spec.ts` standalone (no other spec files racing it): same single
test fails, same assertion, same shape (21/22 passing).

**Refined root cause (more precise than "sub-millisecond clock-precision
flake" as prior agents characterized it):** this is a **clock-source
mismatch between two different clocks**, not a same-millisecond tie:

- `apps/api/src/modules/users/schema.ts:40` — `lastLoginAt` is
  `.defaultNow()`, a **Postgres-side** `DEFAULT now()`. On the test's first
  call (`INSERT` path, no conflict yet), `first.lastLoginAt` is timestamped
  by the **Testcontainers Postgres container's own clock**.
- `apps/api/src/modules/users/users.service.ts:69,84` —
  `upsertByAuthentikSubject`'s `onConflictDoUpdate` branch sets
  `lastLoginAt: now` where `now = new Date()` is evaluated in **Node**,
  i.e. the **host/test-runner process's clock**.
- The test (`apps/api/test/users.spec.ts:53-54`) only guards against a
  same-millisecond collision with a 5ms `setTimeout`, which is sufficient
  if both timestamps come from the same clock — but here they don't. Both
  observed failures in this session show the *first* (Postgres-clock)
  timestamp several seconds *ahead* of the *second* (Node-clock) timestamp,
  consistent with the well-known Docker Desktop host/container clock-drift
  behavior after the host sleeps/resumes or under load — not a race that a
  longer `setTimeout` would reliably fix.
- This means the test's implicit assumption (both timestamps are
  comparable because they're "close together in wall-clock time") is
  false whenever the two clocks disagree, independent of how much time
  elapses between the two calls. This is a **test-design gap**, not a
  `UsersService` logic bug — the service's behavior (stamping
  `lastLoginAt` from whichever clock the operation naturally uses) is
  correct and unremarkable.
- Fixing this properly belongs to whichever agent owns
  `apps/api/test/users.spec.ts` next (not in this workflow's scope): e.g.
  compare against a Postgres-side `now()` read for both sides, or assert
  `>=` with a tolerance, or read both timestamps back from a single
  `SELECT ... now()` call. Flagging the precise mechanism here so a future
  fix targets the actual cause instead of "add a longer sleep," which
  would not reliably fix a clock-skew issue.

**Classification: pre-existing, unrelated — no action required by this
workflow.** Not routed to CodeDeveloper or TestDesigner for FR-AUTH-006;
noted here for whichever future workflow next touches `users.spec.ts`.

No other failures in this suite. No failures in any FR-AUTH-006 new/modified
file (`upgrade.service.ts`, `upgrade.service.spec.ts`,
`upgrade-service.integration.spec.ts`, `authentik.client.ts`,
`authentik-client.spec.ts`, `auth.controller.ts`,
`auth-controller-callback.spec.ts`, `auth.module.ts`,
`telegram-auth.service.ts`).

## Flaky Tests

None tagged `@flaky` in this codebase's convention. The `users.spec.ts`
failure above is flake-shaped (timing-dependent, reproduces via a race
rather than a deterministic logic error) but is not this workflow's test to
tag — left as-is per scope.

## Coverage

No `pnpm test:coverage` run requested or performed in this pass (matches
TestDesigner's own note that line/branch coverage was not separately
measured). Business-logic coverage assessment, by inspection of the test
files actually exercised in this run:

- `UpgradeService.requestUpgrade()` — happy path + all enumerated
  404/409×3/degraded-path branches covered (unit), plus a real end-to-end
  round trip against Postgres (integration).
- `UpgradeService.resolvePendingUpgrade()` / `commitUpgrade()` — happy
  path, no-Authentik-user, no-intent-row, expired, consumed,
  multiple-rows-returns-most-recent all covered (unit + integration, with
  integration exercising the real `gt()`/`isNull()`/`orderBy(desc)` SQL
  filters rather than mocked results).
- `AuthentikClient.setUserEmail()` — happy path + error propagation
  covered, matching sibling methods' existing coverage level.
- MAJOR-2 race/collision regression (the security-critical case) —
  covered end-to-end against real Postgres in both required sub-cases (a:
  common-case collision caught by the re-check; b: residual-race
  invariant proving a losing racer never reaches `is_temporary=false`
  with no `platform.users` row), independently re-run in this session as
  part of the full-suite pass (10/10 integration tests in
  `upgrade-service.integration.spec.ts` passing).
- AC-3/4/5 — no dedicated new test, consistent with the strategy's own
  explicit "out of scope" reasoning (re-verified against
  `06-test-design.md`'s AC table, not just copied).

No error path in the new code was found untested during this run.

## Gate Result

```yaml
gate: TestRunner
status: passed
reason: >
  Independently re-ran (not trusted from 06-test-design.md's report) the
  full Execution Order: pnpm --filter api typecheck (clean, 0 errors),
  pnpm --filter api lint / biome check . (clean, 320 files, no fixes
  applied), and pnpm --filter api test -- this repo's single `test` script
  IS the integration-inclusive full suite (vitest run against
  vitest.config.ts, whose globalSetup starts a real Testcontainers
  Postgres 16 + Redis 7 and applies all migrations; there is no separate
  test:integration script to invoke, confirmed by reading package.json at
  both repo root and apps/api, and vitest.config.ts / test/setup-pg.ts).
  Docker daemon confirmed accessible (docker info succeeded, v29.1.3)
  before running; Testcontainers started its own ephemeral Postgres+Redis
  successfully, distinct from the docker-compose stack.
  Full suite: 1528/1529 passing (117/118 files). The sole failure
  (test/users.spec.ts's lastLoginAt timestamp-ordering assertion) was
  independently re-verified as pre-existing and unrelated to this
  workflow via two checks: git diff main -- apps/api/test/users.spec.ts
  returns empty (zero lines changed), and git diff main --stat --
  apps/api/src/modules/users/ is also empty (UsersService and its schema
  untouched by this branch). Re-ran the file in isolation
  (pnpm vitest run test/users.spec.ts) and it reproduces identically
  (21/22 passing, same assertion, same failure shape). Root-caused more
  precisely than prior agents' "sub-millisecond clock-precision flake"
  characterization: this is a clock-source mismatch, not a same-millisecond
  race -- the first timestamp comes from Postgres's own defaultNow() (the
  Testcontainers container's clock, on INSERT) while the second comes from
  Node's new Date() (the host/test-runner's clock, on the
  onConflictDoUpdate branch in users.service.ts); both observed failures in
  this session showed multi-second skew between the two clocks, consistent
  with Docker Desktop host/container clock drift, not insufficient delay
  between the two calls. This is a test-design gap in a file this workflow
  never touches, not a regression it introduced -- correctly left
  unrouted (no CodeDeveloper/TestDesigner retry triggered by this
  workflow's gate). All FR-AUTH-006 new/modified files re-verified failure-
  free both within the full run and in isolated subset runs (44/44 unit,
  10/10 integration, including the MAJOR-2 race/collision regression). No
  new Playwright/E2E file to run, per 06-test-strategy.md's explicit E2E
  Decision -- live Authentik+Mailpit verification is Orchestrator-owned,
  noted here rather than silently omitted.
next_agent: Orchestrator
```
