# Test Results — FEAT-BOT-1 (wf-20260731-feat-171)

workflow: wf-20260731-feat-171
agent: TestRunner
scope: two codebases — `apps/api` (TypeScript/NestJS/Vitest) and `apps/bot`
(Python/aiogram/pytest, git submodule)

---

## Execution Summary

### apps/api

| Suite | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| Unit + Integration (Vitest, repo convention — no separate integration runner exists, see note below) | 1375 | 1374 | 1 | 0 |
| — of which: this workflow's new tests (`telegram-auth-service.spec.ts` + `telegram-auth-controller.spec.ts`, scoped run) | 51 | 51 | 0 | 0 |
| E2E | — | — | — | N/A — not applicable per test design (no browser surface, rubric score 4, below E2E threshold) |

The 1 failure is `test/users.spec.ts` — pre-existing, unrelated to this
workflow (see **Failed Tests** and **Root Cause Investigation** below).

### apps/bot

| Suite | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| Unit (pytest) | 29 | 29 | 0 | 0 |
| Integration | 0 | — | — | N/A — per test design, the bot's one integration surface (HTTP contract with the API) is already covered by `test_auth_middleware.py`'s `httpx.MockTransport` tests, counted in the 29 above |
| E2E | — | — | — | N/A — no browser surface (long-polling process) |

**29/29 confirmed — exactly matches the predicted 16 (CodeDeveloper) + 13
(TestDesigner: 4 `test_logging_middleware.py` + 4 `test_tenant_middleware.py`
+ 5 `test_error_handler.py`) = 29.** No collection errors, no discrepancy to
investigate.

---

## Type Check

**apps/api:** `pnpm --filter api typecheck` (`tsc --noEmit`) — **pass, 0
errors.**

Repo-wide `pnpm typecheck` was also run per instructions. First attempt hit a
transient Windows `EPERM` (`operation not permitted, rename ... .vite\deps_temp_... -> ...\deps`)
in `@aiqadam/web-next`'s `build` step (which `typecheck` depends on via
`turbo.json`'s `dependsOn: ["^build"]`) — a Windows filesystem race
unrelated to this workflow's `apps/api`/`apps/bot` changes. Re-ran
immediately after: all 4 tasks succeeded, `@aiqadam/web-next:typecheck`
itself reports `0 errors, 0 warnings, 41 hints` (hints are pre-existing,
in files this workflow does not touch — `FormEvent`-deprecation notices
and unused-var hints in `apps/web`/`apps/web-next`).

**apps/bot:** No `tsc`-equivalent; ruff covers static analysis (see below).

## Lint / Format Check

**apps/api — scoped to this workflow's files:** `pnpm biome check
apps/api/test/telegram-auth-controller.spec.ts apps/api/test/telegram-auth-service.spec.ts
apps/api/src/modules/auth/telegram-auth.service.ts apps/api/src/modules/auth/auth.controller.ts`
→ **clean.** `Checked 4 files in 9ms. No fixes applied.`

**apps/api — repo-wide `pnpm biome check .`:** reports 84 errors / 2
warnings, **all** attributable to a local, untracked, gitignored directory:
`apps/e2e/uat-results/html-report/trace/assets/*.js` — a generated
Playwright trace-viewer bundle from a prior UAT run on this machine.
Confirmed via `git check-ignore -v` (matched by `apps/e2e/.gitignore:4:uat-results/`)
and `git ls-files apps/e2e/uat-results` (empty — not tracked anywhere).
`biome.json`'s `files.ignore` list excludes the sibling directories
`apps/e2e/playwright-report/**` and `apps/e2e/test-results/**` but was
never updated to also exclude `apps/e2e/uat-results/**` — a pre-existing
repo-config gap (confirmed `biome.json` has zero diff vs `main`). Not
introduced by, or related to, this workflow. **Dirty file list (this
workflow's own files): none.**

**apps/bot:** `python -m ruff check .` → **All checks passed!**
`python -m ruff format --check .` → **33 files already formatted.**

## Failed Tests

| Test | File | Error | Classification |
|---|---|---|---|
| `UsersService.upsertByAuthentikSubject > updates email + displayName + lastLoginAt for an existing subject (no duplicate row)` | `apps/api/test/users.spec.ts:65` | `AssertionError: expected <N> to be greater than <M>` — `second.lastLoginAt` intermittently/consistently resolves earlier than `firstLogin` despite being written later in wall-clock time | **code-bug, pre-existing, out of this workflow's scope** — see Root Cause Investigation |

No failures in any file this workflow added or modified.

### Root Cause Investigation — `users.spec.ts`

Confirmed **not** a regression from this workflow: `git log` and `git diff
main` show zero commits/diffs touching `users.spec.ts` or
`src/modules/users/**` on this branch. Reproduced deterministically (failed
3/3 isolated re-runs, `pnpm --filter api test -- users.spec.ts`).

Traced with an instrumented standalone repro (Testcontainers Postgres +
Drizzle, mirroring the exact `upsertByAuthentikSubject` call pattern):

- `UsersService.upsertByAuthentikSubject` (`apps/api/src/modules/users/users.service.ts:61-94`)
  calls `.insert(users).values({...}).onConflictDoUpdate({ set: { lastLoginAt: now, ... } })`.
- The `.values({...})` object for the **insert** path does **not** include
  `lastLoginAt` — so on first insert it falls back to the column's
  `.defaultNow()` (`schema.ts:40`), which Postgres evaluates **server-side**,
  using the Testcontainer's own clock.
- The `onConflictDoUpdate` (**update**) path explicitly sets
  `lastLoginAt: now`, where `now = new Date()` is computed **in Node**,
  using the host/test-runner clock.
- Measured directly on this machine: the Testcontainers Postgres container
  clock is running **~1-2.7 seconds ahead** of the host clock (Docker
  Desktop/WSL2 VM clock-sync drift). Repro output:
  ```
  [node] about to write now= 1785506279164   (first insert, Node time)
  [node] row.lastLoginAt returned= 1785506280243   (server defaultNow() — 1.08s AHEAD)
  [node] about to write now= 1785506279188   (second call, Node time)
  [node] row.lastLoginAt returned= 1785506279188   (update path — matches Node exactly)
  second > first? false
  ```
- Net effect: the first row's `lastLoginAt` (server clock, ahead) ends up
  numerically **later** than the second row's `lastLoginAt` (host clock),
  even though the second write genuinely happened afterward in real time —
  failing the test's ordering assertion.

This is a latent bug in `UsersService.upsertByAuthentikSubject` itself (two
different clock sources feed the same column depending on insert-vs-update
path) that the test's 5ms sleep assumed would never manifest, combined with
this specific host's Docker Desktop clock drift making it manifest
reliably. It is real and worth fixing, but it is **unrelated to
`POST /v1/internal/telegram/lookup`** (this workflow's entire scope) and
touches a different service/table (`users`, OIDC-account records — not
`TelegramAuthService` or the Directus/Authentik lookup path this FR adds).
Per role definition's failure-routing table this is `failed-retry-code`,
but against `UsersService`, not `TelegramAuthService` — recommending this be
registered as a **new, separate issue** rather than blocking this
workflow's gate, consistent with how out-of-scope pre-existing gaps are
handled elsewhere in this repo's workflow history.

Repro scripts used for diagnosis were temporary (`apps/api/clock-drift-check*.mjs`)
and have been deleted; not part of the commit.

## Flaky Tests

None tagged `@flaky`. Note: `users.spec.ts`'s failure above reproduced
consistently (3/3) on this run, so it is a deterministic environment-clock
issue rather than a genuinely intermittent flake — not tagged `@flaky`,
documented instead as a pre-existing code bug (see above).

## Integration Test Tier — interpretation note

**No `test:integration` script or `INTEGRATION_TEST` env-gated runner exists
anywhere in this repo** (confirmed: no `package.json` at root or in
`apps/api` defines `test:integration`; only `node_modules/**` third-party
packages have a same-named script). This is a pre-existing, repo-wide
condition — confirmed identical in multiple prior completed workflows'
`07-test-results.md` (e.g. `wf-20260730-feat-155`: *"no `test:integration`
script/gate exists anywhere in this repo"*), not something introduced or
newly discovered by this workflow.

The repo's actual integration-testing convention (per multiple existing
files: `checkin.integration.spec.ts`, `members-onboarding.integration.spec.ts`,
and now `telegram-auth-controller.spec.ts`) is: Vitest spec files matching
`test/**/*.spec.ts` (the same glob plain `pnpm test` already covers), wiring
real controller + service together with mocked Authentik/Directus HTTP
boundaries rather than a separate Testcontainers-gated command. This
workflow's integration tier — the new `describe('TelegramInternalController.lookup
…')` block in `telegram-auth-controller.spec.ts` (6 tests, AC-1 through
AC-5) — already ran and passed as part of the `pnpm test` run above (part of
the 1374/1375, and independently confirmed in the scoped 51/51 telegram-auth
run). Docker containers (postgres, directus, authentik, redis, minio) were
confirmed healthy per task instructions, but this endpoint makes zero
Postgres/Drizzle calls (confirmed by the impact analysis, security review,
and code summary — pure Authentik + Directus HTTP reads), so a literal
Testcontainers Postgres instance would exercise nothing this endpoint
touches, consistent with the test design's explicit reasoning.

## Coverage

### apps/api

- `TelegramAuthService.lookupUser`: happy path (linked/non-temp, AC-1),
  both AC-2 branches (temp with/without existing Directus row), 404/failure
  path (AC-3, both `rejects.toBeInstanceOf` and body-shape assertions),
  malformed-input validation path (non-numeric/oversized telegramId, Zod
  rejection before any Authentik call), idempotency/no-write-calls
  invariant (AC-5, 3 chained scenarios), and the exact Directus query-shape
  lock-in (filter/fields/limit/encoding). All branches in the new method
  and its private helper are exercised.
- `TelegramInternalController.lookup`: full request→response path (AC-1),
  input-validation 400s (empty body, non-numeric telegramId), 404
  propagation with exact body shape (AC-3), guard-placement structural
  check (AC-4, reusing not duplicating existing `InternalAuthGuard`
  behavioral tests), repeat-call idempotency at the controller layer (AC-5).
- Error paths: 404 (no Authentik user), 400 (malformed body/telegramId) —
  both covered. No untested branch identified in the new code path.

### apps/bot

- `LoggingMiddleware`: real end-to-end JSON-line emission via an actual
  `JsonFormatter`-backed handler (not just inspecting `LogRecord.extra`) —
  success path, error/exception path (`status: "error"`), command-vs-null
  for non-command text, single-line valid-JSON structural check.
- `TenantMiddleware`: all 4 branches — `country` present, `None` (temp
  user), `user_context` key absent entirely, `user_context` explicitly
  `None` — no `KeyError` in any branch.
- `error_handler.handle_error`: generic user-facing message on exception,
  raw exception text never leaks into the sent message (security-relevant,
  regression-tests `04-security-review.md` INV-2), structured log carries
  `update_id` + real `exc_info`, `answer()` failure itself doesn't
  propagate (best-effort swallow), update with neither `message` nor
  `callback_query` doesn't crash.
- Pre-existing coverage unchanged and still passing: rate limiting (4),
  auth middleware (5), handlers (2), user cache (4), thin-bot guarantee (1).

**Deferred to UAT (per test design, not silently dropped):** AC-6's literal
3-second wall-clock bound (not meaningfully unit-testable in isolation);
AC-11's actual Grafana/Loki ingestion (depends on Coolify + Promtail/Loki
pipeline, unreachable from local pytest/CI — the JSON log-shape itself is
now fully unit-tested by `test_logging_middleware.py`).

## Gate Result

```yaml
gate: test-runner
workflow: wf-20260731-feat-171
status: passed
timestamp: 2026-07-31T19:05:00Z
summary: >
  Full execution order run for both codebases. apps/api: tsc --noEmit clean
  (0 errors); biome check clean on all 4 files this workflow touched (repo-
  wide biome check surfaces 84 pre-existing errors, 100% confined to a
  local/untracked/gitignored apps/e2e/uat-results/ Playwright trace bundle
  missing from biome.json's ignore list — confirmed zero diff on biome.json
  vs main, not this workflow's concern). Vitest: 1374/1375 passing repo-
  wide; the 1 failure (test/users.spec.ts) is a pre-existing, reproducible
  (3/3) code bug in UsersService.upsertByAuthentikSubject — traced to two
  different clock sources (Postgres server defaultNow() on insert vs.
  Node-side new Date() on update) combined with ~1-2.7s Testcontainers-
  Postgres/host clock drift on this machine, fully unrelated to
  TelegramAuthService/this FR (confirmed via git diff/log — zero touches to
  users.spec.ts or modules/users on this branch). This workflow's own new
  tests (telegram-auth-service.spec.ts + telegram-auth-controller.spec.ts,
  51 tests) pass 100% in isolation and within the full run. No
  test:integration script exists anywhere in this repo (confirmed
  repo-wide, consistent with multiple prior completed workflows) — the
  repo's actual integration-test convention (Vitest, mocked HTTP
  boundaries, matching checkin.integration.spec.ts) is what this workflow's
  controller-level tests already follow, and they already ran/passed as
  part of pnpm test. apps/bot: ruff check clean, ruff format --check clean
  (33 files), pytest 29/29 passing — exactly matches the predicted 16
  (CodeDeveloper) + 13 (TestDesigner: 4 logging + 4 tenant + 5
  error_handler) with zero collection errors, no discrepancy requiring
  investigation.
execution_summary:
  api_unit_and_integration: { tests: 1375, passed: 1374, failed: 1, skipped: 0 }
  api_this_workflow_scoped: { tests: 51, passed: 51, failed: 0, skipped: 0 }
  api_e2e: not_applicable
  bot_unit: { tests: 29, passed: 29, failed: 0, skipped: 0 }
  bot_integration: not_applicable_covered_by_unit
  bot_e2e: not_applicable
typecheck_api: pass
lint_api_scoped: pass
lint_api_repo_wide: pre_existing_unrelated_failures (uat-results trace bundle, not this workflow)
lint_format_bot: pass
failed_tests:
  - test: "UsersService.upsertByAuthentikSubject > updates email + displayName + lastLoginAt for an existing subject"
    file: apps/api/test/users.spec.ts
    classification: failed-retry-code
    scope: pre-existing, unrelated to this workflow (users module, not telegram)
    recommendation: register as new issue, do not block this workflow's gate
flaky_tests: []
deferred_to_uat:
  - ac: AC-6
    reason: "3-second wall-clock bound not meaningfully unit-testable in isolation"
  - ac: AC-11
    reason: "Grafana/Loki ingestion depends on Coolify + Promtail/Loki pipeline config, unreachable from local pytest/CI; JSON log-shape itself fully unit-tested"
docker_containers_confirmed_healthy:
  - aiqadam-postgres
  - aiqadam-directus
  - aiqadam-authentik-server
  - aiqadam-authentik-worker
  - aiqadam-redis
  - aiqadam-minio
next_agent: security-reviewer
```
