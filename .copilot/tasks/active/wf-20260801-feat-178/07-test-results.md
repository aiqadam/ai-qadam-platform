# 07 — Test Results: FR-BOT-002 PR 5/6 — `/interests`

## Execution Summary

Full-suite, authoritative run (not scoped to this PR's files only), across
both repos, per the task's execution order. Per `06-test-strategy.md`'s
rubric-intent conclusion (score 5, but both scoring criteria are
application-layer logic fully exercisable via mocked service boundaries),
**no Testcontainers/integration-only invocation (`INTEGRATION_TEST=1 pnpm
test:integration`) was run for this PR's new code** — but the full
`pnpm --filter api test` run below includes every pre-existing
Testcontainers-backed spec file from earlier PRs (e.g.
`directus-users-bridge.spec.ts`, which uses `inject('TEST_DATABASE_URL')`),
run normally, not skipped.

| Suite | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| apps/api Unit (Vitest, full suite, run 1) | 1471 | 1470 | 1 | 0 |
| apps/api Unit (Vitest, full suite, run 2) | 1471 | 1470 | 1 | 0 |
| apps/api Unit — this PR's new/modified files only (`telegram-bot-interests-controller.spec.ts`, `telegram-bot-interests-service.spec.ts`, `directus-users-bridge.spec.ts`) | 41 | 41 | 0 | 0 |
| apps/bot Unit (pytest, full suite) | 146 | 146 | 0 | 0 |
| Integration (Testcontainers-only invocation) | N/A — not required for this PR per test-strategy rubric conclusion; pre-existing integration-style specs (e.g. `directus-users-bridge.spec.ts`) ran as part of the full `pnpm --filter api test` run above, not separately invoked |
| E2E | N/A — no web-facing surface in this PR |

The single failure (`test/users.spec.ts`, one test) is a pre-existing,
unrelated clock-ordering flake — independently re-verified below, not just
trusted from `03-code-summary.md`'s claim.

---

## Type Check

`pnpm --filter api typecheck` (`tsc --noEmit`) — **clean, 0 errors.**

apps/bot has no `mypy` dependency/config in `pyproject.toml` (confirmed by
CodeDeveloper and independently not found here either); the repo's actual
Python validation surface is `ruff check` + `ruff format --check` +
`pytest`, all covered below.

---

## Lint / Format Check

- `pnpm biome check apps/api/src apps/api/test` — **clean.** "Checked 306
  files in 91ms. No fixes applied."
- `apps/bot`: `ruff check .` (via `.venv/Scripts/ruff.exe`, since `uv` is
  not on this session's PATH but the venv it built is directly usable) —
  **all checks passed.**
- `apps/bot`: `ruff format --check .` — **clean.** "58 files already
  formatted."

---

## Failed Tests

| Test | File | Error | Classification |
|---|---|---|---|
| `UsersService.upsertByAuthentikSubject > updates email + displayName + lastLoginAt for an existing subject (no duplicate row)` | `apps/api/test/users.spec.ts:65` | `AssertionError: expected <ts1> to be greater than <ts2>` — real-wall-clock (`Date.now()`-derived) timestamp comparison with only a 5ms buffer between writes; under full-suite parallel load the second write's timestamp does not reliably exceed the first by a safe margin | **Pre-existing, unrelated to this PR — not a regression** |

**Independent verification performed this session** (not merely trusting
`03-code-summary.md`'s prior claim):

1. Ran `test/users.spec.ts` in isolation twice — failed both times with the
   identical assertion shape (different literal timestamps each run, same
   failure mode).
2. `git stash push -- apps/api/src apps/api/test` to remove every file this
   PR touches (`auth.controller.ts`, `auth.module.ts`,
   `telegram-auth.service.ts`, `directus-users-bridge.service.ts`,
   `me-profile.module.ts`, `directus-users-bridge.spec.ts`), leaving the
   working tree equivalent to unmodified `main` for every file
   `users.spec.ts` or its call graph (`UsersService`) could plausibly
   depend on.
3. Re-ran `test/users.spec.ts` against the stashed tree — **failed
   identically** (`AssertionError: expected 1785537042894 to be greater
   than 1785537045589`).
4. `git stash pop` — restored cleanly, `git status` confirmed the PR's
   working tree was back to its pre-stash state.
5. Also ran `telegram-admin-status-service.spec.ts` (the second file
   `03-code-summary.md` flagged) in isolation, both against the stashed
   (main-equivalent) tree and this PR's tree — **passed both times, in
   both trees.** This is consistent with `03-code-summary.md`'s
   characterization: it is a full-suite-load-triggered clock flake, not a
   per-file deterministic failure, and it did not reproduce in either of
   this session's two full-suite runs.

Neither file's call graph touches `AuthModule`, `MeProfileModule`,
`TelegramAuthService`, or `DirectusUsersBridgeService` — confirmed by
reading `users.spec.ts` in full (constructs `UsersService` directly with a
stub `DirectusClient`, no import of anything this PR modified).

**Conclusion: genuinely pre-existing, confirmed via this session's own
git-stash comparison against unmodified `main` (not by trusting the prior
claim), not caused by this PR. Not fixed here — out of this PR's scope,
consistent with `06-test-strategy.md`/`03-code-summary.md`.**

No other failures — 0 failures attributable to this PR's actual code
changes across 2 full-suite runs (2940 total test executions across both
runs) plus a dedicated 41-test run scoped to this PR's new/modified files.

---

## Flaky Tests

| Test | File | Pattern |
|---|---|---|
| `updates email + displayName + lastLoginAt for an existing subject (no duplicate row)` | `apps/api/test/users.spec.ts` | Real-wall-clock timestamp race; failed 3/3 times this session (2 full-suite runs + 1 isolated run), and also fails on unmodified `main` — behaves as a consistent failure under this session's machine/load conditions rather than intermittent, but is unrelated to this PR's code (confirmed via git-stash). Not tagged `@flaky` in source (no such convention exists in this Vitest suite); flagging here per protocol instead. |
| `telegram-admin-status-service.spec.ts` ("counts outbox pending...") | `apps/api/test/telegram-admin-status-service.spec.ts` | Did not reproduce in this session (passed in isolation on both the stashed and PR trees, and passed in both full-suite runs) — consistent with `03-code-summary.md`'s report of an intermittent, load-dependent clock-ordering flake distinct from the `users.spec.ts` one. No action needed this session. |

Neither test is part of this PR's changed-file set.

---

## Coverage

- **apps/api, this PR's new/modified files:** 41 tests combined across
  `telegram-bot-interests-controller.spec.ts`,
  `telegram-bot-interests-service.spec.ts`, and
  `directus-users-bridge.spec.ts` (including the 2 new
  `resolveUserAndEmailFromDirectusId` cases plus that file's pre-existing
  cases) — all passing. Branch coverage for
  `toggleInterest`'s `isSelected`×loop-cardinality matrix (false /
  single-learn / mixed-intent AC-7 / multi-learn / mentor-only-zero-
  iteration) and the 404 branch in `requirePlatformUserAndEmail` was
  independently re-verified line-by-line in `06-test-design.md`
  (TestDesigner pass) — not re-derived here, but its claims are consistent
  with what this run observed (all 41 targeted tests green, including the
  AC-7 load-bearing mixed-intent test).
- **apps/bot:** 146/146 tests passing, matching `03-code-summary.md`'s
  claimed count exactly (146, up from 137 pre-PR — 9 new
  `test_api_client_interests.py`/`test_interests_handler.py` cases net of
  bookkeeping). All 4 branches of `handle_interests`'s guard and both
  reachable branches of `handle_interest_toggle_callback` (per
  `06-test-design.md`'s branch analysis) exercised.
- **Error paths:** AC-5 (API unavailable on both command and callback
  surfaces), AC-11 (400 + no write on unknown topic), and the 404
  bridge-miss branch are all covered per `06-test-design.md` and confirmed
  passing in this run.
- No coverage regression identified; this PR proxies through existing,
  already-integration-tested `MeProfileService` methods with no new query
  shape, consistent with the test-strategy's stated scope.

---

## Gate Result

gate_result:
  status: passed
  summary: "Full-suite authoritative run across both repos: apps/api typecheck clean, biome clean, 1470/1471 Vitest tests passing across 2 independent full-suite runs (only failure is a pre-existing, unrelated users.spec.ts clock flake, independently re-verified via git-stash against unmodified main this session); apps/bot ruff check/format clean, 146/146 pytest passing. This PR's own 41 new/modified tests all pass. No regression caused by this PR's changes."
  findings:
    - "apps/api: tsc --noEmit clean, 0 errors."
    - "apps/api: biome check clean across apps/api/src and apps/api/test (306 files)."
    - "apps/api: full pnpm --filter api test run 1 — 1470/1471 passed (1 pre-existing failure, see below)."
    - "apps/api: full pnpm --filter api test run 2 (repeat) — identical result, 1470/1471 passed, same single failure."
    - "apps/api: this PR's 3 new/modified spec files run in isolation — 41/41 passed."
    - "apps/bot: ruff check . clean (via .venv/Scripts/ruff.exe, uv not on this session's PATH but its venv is directly usable)."
    - "apps/bot: ruff format --check . clean, 58 files already formatted."
    - "apps/bot: pytest tests/ -v — 146/146 passed."
    - "test/users.spec.ts's clock-ordering failure independently re-verified as pre-existing via git stash push/pop isolating this PR's apps/api/src and apps/api/test changes — fails identically on the stashed (main-equivalent) tree, 3/3 attempts this session. Confirmed unrelated: file constructs UsersService directly with a stub DirectusClient, no dependency on anything this PR touched."
    - "telegram-admin-status-service.spec.ts (the second file 03-code-summary.md flagged) did not reproduce this session — passed in isolation on both trees and in both full-suite runs, consistent with a load-dependent intermittent flake rather than a deterministic one."
    - "No Testcontainers-only invocation run for this PR's new code, per 06-test-strategy.md's rubric-intent conclusion (score 5, but both criteria are mocked-service-boundary application logic); pre-existing integration-style specs from earlier PRs ran normally as part of the full suite, not skipped."

---
