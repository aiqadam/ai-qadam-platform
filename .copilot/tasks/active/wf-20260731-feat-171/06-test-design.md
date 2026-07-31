# Test Design — FEAT-BOT-1 (wf-20260731-feat-171)

workflow: wf-20260731-feat-171
agent: TestDesigner

---

## Scope note — existing spec files extended, not net-new

The test strategy referenced `apps/api/test/telegram-lookup.spec.ts` as an
illustrative new-file name, but a live repo check found `apps/api/test/`
already has `telegram-auth-service.spec.ts` (unit, covers
`verifyWidgetHash`/`exchangeWidgetPayload`/`upsertTempUser`) and
`telegram-auth-controller.spec.ts` (controller-level, covers
`AuthController.telegramExchange` + `TelegramInternalController.upsertTempUser`)
— both for the exact same `TelegramAuthService`/`TelegramInternalController`
classes `lookupUser`/`lookup` were added to. Per this repo's one-file-per-
source-module convention (confirmed by the file list — no service has two
sibling unit-test files), the new tests were added as additional
`describe` blocks in these two existing files rather than creating a third,
overlapping `telegram-lookup.spec.ts`. No existing test in either file was
modified or rewritten — only new `describe` blocks appended.

---

## Tests Written — apps/api (TypeScript/Vitest)

### Unit

| File | Focus | Count | Required? |
|---|---|---|---|
| `apps/api/test/telegram-auth-service.spec.ts` — new `describe('TelegramAuthService.lookupUser', …)` block | AC-1 (linked/non-temp happy path), AC-2 common case (temp, no Directus row), AC-2 edge case (temp WITH Directus row), AC-3 (404 structured body, both `rejects.toBeInstanceOf` and `getResponse()` body-shape checks), malformed telegramId (non-numeric + oversized, ZodError, no Authentik call), AC-5 (zero write calls across 3 chained scenarios), Directus query-shape lock-in (`filter[email][_eq]=`, `fields=id,country`, `limit=1`, URI-encoded email) | 9 | Yes |

### Integration

| File | Focus | Count | Required? |
|---|---|---|---|
| `apps/api/test/telegram-auth-controller.spec.ts` — new `describe('TelegramInternalController.lookup …', …)` block | AC-1 (full controller call → `LookupUserResult`), 400 on empty body, 400 on non-numeric telegramId, AC-3 (404 propagated with exact `{ error: 'telegram_user_not_found' }` body through the controller), AC-4 (`lookup` is a method on `TelegramInternalController`, which carries the class-level `InternalAuthGuard` — reuses, does not duplicate, the guard-behavior tests already in `internal.spec.ts` and the existing class-level guard test in this same file for `upsertTempUser`), AC-5 (two rapid identical calls → identical result, `lookupUser` called exactly twice with the same arg) | 6 | Yes |

Guard-*behavior* (401 on missing/wrong header) is intentionally not
re-tested here — that's `apps/api/test/internal.spec.ts`'s
`InternalAuthGuard` describe block, reused per the strategy's explicit
instruction not to duplicate it. What's added here is the *structural*
check (the route lives inside the guarded class), scoped to `lookup`
specifically.

### E2E

Not applicable — no browser surface, rubric score (4) below the E2E
threshold (6). Confirmed independently by the impact analysis, security
review, and this workflow's test strategy. No table populated.

---

## Tests Written — apps/bot (Python/pytest)

All three gap files below are **new, untracked files inside the
`apps/bot/` submodule** — not committed by TestDesigner per the task
instruction (Orchestrator commits inside the submodule after TestRunner
validates). `ruff check` and `ruff format --check` both pass clean;
`pytest --collect-only` (import/collection only, no test execution) also
passes clean for all three new files.

### Unit

| File | Focus | Count | Required? |
|---|---|---|---|
| `apps/bot/tests/test_logging_middleware.py` (new) | AC-11 gap #1 — asserts the actual emitted stdout line (via a real `JsonFormatter`-backed handler on the `"bot.update"` logger, not just the raw `LogRecord.extra` dict) is valid, single-line JSON containing `telegram_id` (str), `command` (str or null for non-command text), `duration_ms` (number), `status` (`"ok"` / `"error"` on handler exception, propagated correctly) | 4 | Yes (AC-11 log-shape, explicitly flagged as missing by both the code summary and the strategy) |
| `apps/bot/tests/test_tenant_middleware.py` (new) | Gap #2 — `TenantMiddleware` had zero test file. Asserts `data["country"]` is set from `user_context.country` when present; is `None` (no crash) when `user_context.country` is `None` (unknown/temp user); is `None` (no `KeyError`) when `user_context` key is altogether absent from `data`; is `None` when `data["user_context"]` is explicitly `None` | 4 | Yes |
| `apps/bot/tests/test_error_handler.py` (new) | Gap #3, lower priority — global error router: generic user-facing message sent on handler exception; raw exception text never appears in the sent message; structured log line carries `update_id` + real `exc_info` (not swallowed/stringified); `answer()` itself failing doesn't propagate (best-effort swallow); an `Update` with neither `message` nor `callback_query` doesn't crash the handler | 5 | No (see Known Test Gaps — included per TestDesigner's judgment, not silently skipped) |

### Integration

None — the strategy confirmed the bot's one integration surface (its HTTP
contract with the API) is already fully covered by
`test_auth_middleware.py`'s `httpx.MockTransport`-based test, and no new
integration-level bot work was identified.

### E2E

Not applicable — no browser surface (Telegram long-polling process, not
Playwright-drivable).

---

## Acceptance Criteria Coverage

| AC | Test | Status |
|---|---|---|
| AC-1 (linked, non-temp user → real data) | `telegram-auth-service.spec.ts` "returns real directusUserId/country and isTemp=false…" (unit) + `telegram-auth-controller.spec.ts` "returns the LookupUserResult from the service…" (integration) | Covered |
| AC-2 (temp-only user → isTemp:true, directusUserId per resolved decision) | `telegram-auth-service.spec.ts` two cases: "…no Directus row (common case)" and "…real directusUserId while isTemp stays true when a temp user already has a matching Directus row" (edge case) | Covered |
| AC-3 (no Authentik user → 404 structured body) | `telegram-auth-service.spec.ts` "throws NotFoundException with a structured … body" (unit, asserts `getResponse()`) + `telegram-auth-controller.spec.ts` "propagates NotFoundException with { error: … } body…" (integration) | Covered |
| AC-4 (missing/wrong x-internal-auth → 401, guard reused not reimplemented) | `telegram-auth-controller.spec.ts` "is declared on TelegramInternalController, which carries the class-level InternalAuthGuard" (structural) + existing `internal.spec.ts` `InternalAuthGuard` describe block (behavioral, reused not duplicated) | Covered |
| AC-5 (read-path idempotency, no side effects) | `telegram-auth-service.spec.ts` "never calls a write method…" (unit, 3 chained scenarios) + `telegram-auth-controller.spec.ts` "returns an identical result across two rapid identical calls…" (integration) | Covered |
| AC-6 (`/start` responds within 3s, works for brand-new users) | Message-content: `test_handlers.py` (pre-existing). 404-passthrough: `test_auth_middleware.py` (pre-existing). Literal 3s wall-clock bound | Deferred to UAT (per strategy — not meaningfully unit-testable) |
| AC-7 (auth middleware calls lookup exactly once, attaches context) | `test_auth_middleware.py` (pre-existing, 5 tests) | Covered, no new work needed |
| AC-8 (unknown command → fallback message) | `test_handlers.py` (pre-existing) | Covered, no new work needed |
| AC-9 (rate limit, 10+/min → "slow down") | `test_rate_limit_middleware.py` (pre-existing, 4 tests) | Covered, no new work needed |
| AC-10 (thin-bot guarantee — forbidden env vars absent) | `test_thin_bot_guarantee.py` (pre-existing) | Covered, no new work needed |
| AC-11 (structured JSON logs; Grafana/Loki delivery) | `test_logging_middleware.py` (new, this pass) for the JSON log-shape. Actual Loki delivery | Log-shape covered (new); Loki ingestion deferred to UAT/deploy-verification (Coolify + Promtail/Loki, unreachable from pytest/CI) |

All 11 ACs mapped. AC-6's 3-second bound and AC-11's Loki delivery remain
explicitly deferred to UATRunner, per the test strategy — not silently
dropped.

---

## Known Test Gaps

- **`error_handler.py` (gap #3) was written, not skipped**, despite the
  strategy marking it lower priority / not directly AC-mapped. Judgment
  call: it directly regression-tests a security-relevant property
  (04-security-review.md INV-2 — raw exception text must not leak into the
  user-facing message) that was previously verified only by manual code
  review, and the cost of writing it was low given the existing
  `mock_answer`/`caplog` fixtures already available. Nothing was silently
  left out here.
- **AC-6's literal "3 seconds" wall-clock bound** is not unit-tested
  anywhere (API or bot side) — per the strategy, an isolated pytest/vitest
  run would measure test-harness overhead, not real network/API round-trip
  time, and would be flaky/meaningless. Owner: UATRunner, against a live
  deployment.
- **AC-11's actual Grafana/Loki delivery** is not tested — depends on
  Coolify + Promtail/Loki pipeline config, unreachable from local
  pytest/CI. The JSON *shape* itself (what this pass adds,
  `test_logging_middleware.py`) is fully unit-tested; only the downstream
  ingestion pipeline is out of reach. Owner: UATRunner.
- **No literal Testcontainers Postgres instance was spun up** for the
  API-side integration tests, per the test strategy's explicit reasoning:
  `lookupUser`/`lookup` make zero Postgres/Drizzle calls (confirmed
  independently by the impact analysis and security review), so a real
  Postgres container would test nothing this endpoint touches. Integration
  tests instead wire controller + service together with mocked
  Authentik/Directus HTTP boundaries, matching the established
  `internal.spec.ts`/`checkin.integration.spec.ts` convention for
  Postgres-free internal endpoints. This is a strategy-endorsed
  interpretation, not an oversight.
- **AC-10's deploy-side reinforcement** (confirming the Coolify env
  definition for the `aiqadam-bot` service never *sets* the three
  forbidden vars) remains a non-code checklist item for whoever
  provisions that service — out of pytest's reach by construction (the
  existing `test_thin_bot_guarantee.py` already covers the code-level
  guarantee; this is deploy-config, not app code).
- **No `it.skip` / no Python-equivalent skip decorator was used anywhere**
  in the new tests — every test written asserts a real outcome; nothing
  was stubbed out as a placeholder.

---

## Self-Check (per role definition checklist)

- [x] All new public functions have unit tests (happy path + at least one
      failure path): `TelegramAuthService.lookupUser` (API), `LoggingMiddleware`,
      `TenantMiddleware`, `error_handler.handle_error` (bot).
- [x] Integration tests use the repo's established mocked-HTTP-boundary
      convention for Postgres-free internal endpoints (no DB calls exist on
      this endpoint to mock — literal Testcontainers would be a no-op, see
      Known Test Gaps).
- [x] No `it.skip` / no Python-equivalent skip without a TODO anywhere in
      the new tests.
- [x] No `any` in the new TypeScript test code (verified by `tsc --noEmit`
      passing clean across the whole `apps/api` project after these edits).
- [x] Coverage of happy path + failure paths for every new public function
      on both sides.
- [x] `pnpm biome check` on both modified `apps/api` spec files: clean, no
      fixes applied.
- [x] `ruff check` and `ruff format --check` on all three new `apps/bot`
      test files: clean, no fixes applied (one line-length fix and one
      nested-`with` simplification were applied by hand during authoring,
      re-verified clean afterward).
- [x] `pytest --collect-only` (import/collection only, not execution) on
      all three new bot test files: 13/13 tests collected with zero
      collection errors.
- [x] Did not run the test suites themselves — that is TestRunner's job
      per role definition.

---

## Gate Result

```yaml
gate: test-designer
workflow: wf-20260731-feat-171
status: passed
timestamp: 2026-07-31T00:00:00Z
summary: >
  Wrote all required API-side unit + integration tests for
  TelegramAuthService.lookupUser and POST /v1/internal/telegram/lookup,
  appended as new describe blocks to the pre-existing
  telegram-auth-service.spec.ts and telegram-auth-controller.spec.ts
  (discovered these already exist for the same source files, so extended
  rather than creating a duplicate telegram-lookup.spec.ts as the
  strategy's illustrative filename suggested) — 9 unit + 6 integration
  tests, covering every scenario in the strategy's Unit/Integration Test
  Plan tables (AC-1 through AC-5, including both AC-2 branches and the
  Directus query-shape lock-in). tsc --noEmit passes clean across
  apps/api; biome check on both modified files is clean. Bot-side: closed
  both required gaps identified by the strategy (AC-11 JSON log-shape via
  new test_logging_middleware.py, 4 tests; TenantMiddleware via new
  test_tenant_middleware.py, 4 tests) and additionally wrote the
  lower-priority gap #3 (error_handler.py, 5 tests) rather than silently
  skipping it, on the grounds that it regression-tests a security-relevant
  property at low cost. ruff check + ruff format --check clean on all
  three new bot files; pytest --collect-only confirms all 13 new bot
  tests import/collect with zero errors (execution itself deferred to
  TestRunner per role scope). No it.skip/skip-equivalent anywhere; no
  `any` in new TypeScript test code. AC-6's 3-second bound and AC-11's
  Loki delivery remain explicitly deferred to UATRunner, matching the
  strategy — not newly deferred here.
tests_written:
  api_unit: 9
  api_integration: 6
  bot_unit_new: 13
  bot_integration_new: 0
files_modified:
  - apps/api/test/telegram-auth-service.spec.ts
  - apps/api/test/telegram-auth-controller.spec.ts
files_added:
  - apps/bot/tests/test_logging_middleware.py
  - apps/bot/tests/test_tenant_middleware.py
  - apps/bot/tests/test_error_handler.py
typecheck_api: pass
lint_api: pass
lint_bot: pass
format_bot: pass
bot_collect_only: pass (13/13 collected, 0 errors)
acs_mapped: 11
acs_deferred_to_uat:
  - ac: AC-6
    reason: "3-second wall-clock bound not meaningfully unit-testable in isolation"
  - ac: AC-11
    reason: "Grafana/Loki ingestion depends on Coolify + Promtail/Loki pipeline config, unreachable from local pytest/CI; JSON log-shape itself now covered"
known_gaps:
  - "error_handler.py (gap #3) was included, not skipped, per TestDesigner judgment call — see Known Test Gaps"
next_agent: test-runner
```
