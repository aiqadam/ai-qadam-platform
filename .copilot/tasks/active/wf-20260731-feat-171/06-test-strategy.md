# Test Strategy — FEAT-BOT-1 (wf-20260731-feat-171)

workflow: wf-20260731-feat-171
agent: TestStrategist

---

## Requirement

**FEAT-BOT-1** — Ship the Telegram bot inbound-command scaffold end-to-end:

(a) new internal-only API endpoint `POST /v1/internal/telegram/lookup` on
`apps/api`, guarded by the existing `InternalAuthGuard`, resolving a raw
`telegramId` to `{ directusUserId: string | null, isTemp: boolean, country:
string | null }` — **implemented, zero tests yet** (`03-code-summary.md`);
and

(b) the Python/aiogram 3 bot scaffold in `apps/bot/` (submodule
`aiqadam/aiqadam-telegram-bot`) implementing the middleware stack, `/start`
smoke-test handler, and Coolify deployment — **implemented, 16 passing
pytest tests already written by CodeDeveloper as self-validation**
(`03b-code-summary-bot.md`).

This strategy's job: (1) formalize the API-side test plan from scratch —
that side has no test file at all yet; (2) audit the bot side's existing 16
tests against the ACs and identify only the genuine gaps, not restate
green-field coverage that already exists.

---

## Rubric Score

Applying the Test Tier Decision Rubric to the **API-side change**
(`POST /v1/internal/telegram/lookup` + `TelegramAuthService.lookupUser`):

| Criterion | Applies? | Points | Justification |
|---|---|---|---|
| Touches tenant-scoped data | **No** | 0 | Confirmed against `02-impact-analysis.md` (Risk Flags #5) and `04-security-review.md` (INV-1: N/A). This is a **global** lookup by `telegramId` over Authentik (global identity store) — not filtered by `countryCode`, not a tenant-scoped Postgres table. `country` is returned data *about* the user, not a query filter. The rubric criterion does not apply, per explicit instruction to confirm rather than assume. |
| New API endpoint | **Yes** | +2 | `POST /v1/internal/telegram/lookup` is a brand-new route, new service method, zero existing tests. |
| Business rule with edge cases (capacity, waitlist, dates) | **No** | 0 | No capacity/waitlist/date logic. The AC-2 temp-user branching (is-temp vs. not, directusUserId present vs. null) is identity-resolution branching, not the capacity/waitlist/date class of business rule the rubric example names — judged not to qualify. |
| Cross-module service call | **Yes** | +1 | `TelegramAuthService.lookupUser` calls two independently-injected clients from other modules: `AuthentikClient.getUserByTelegramId` (`modules/admin-invites`) and `DirectusClient.get` (`modules/directus`, newly injected for this change). Two distinct cross-module calls composed in one method — counted once per rubric's flat "cross-module service call" line item. |
| New database query | **Yes** | +1 | `DirectusClient.get('/users?filter[email][_eq]=...')` is a new query this service didn't previously make (`TelegramAuthService` had no Directus dependency before this change). The rubric's "database query" line item is written with Postgres/Drizzle in mind, but the impact analysis and security review both already treat this Directus HTTP read as the functional equivalent of a query for planning purposes (INV-9 N+1 check, INV-5 cross-schema check) — same reasoning applies here: it is a real external read this endpoint performs, with its own miss/hit/shape edge cases (AC-2), so it is scored rather than waved off as "not really a database." |

**Total score: 4** (2 + 0 + 0 + 1 + 1)

- Score ≥ 4 → **Integration tests required.**
- Score ≥ 6 → E2E test required. **Not met** (score is exactly 4, not 6).
- The rubric's "Integration tests required (Testcontainers)" phrasing is
  evaluated against this endpoint's actual dependency shape below (see
  Integration Test Plan) — this endpoint makes zero Postgres/Drizzle calls
  (`DB Changes Required: No`, confirmed independently by both
  `02-impact-analysis.md` and `04-security-review.md` INV-5/INV-10), so a
  real Testcontainers Postgres instance would be spun up and never touched.
  "Integration" here means **controller+service wired together with
  mocked `AuthentikClient`/`DirectusClient` HTTP boundaries** (the exact
  precedent already established by `apps/api/test/internal.spec.ts`'s
  `ensureLinkedUser` suite and `apps/api/test/checkin.integration.spec.ts`,
  both of which use this same "integration.spec.ts naming, fully-mocked
  service dependencies, no live Testcontainers Postgres" pattern for
  endpoints with no Drizzle table of their own) — not a deviation from the
  rubric, an application of it to a Postgres-free endpoint.

---

## Required Test Levels

**API side (`apps/api`):**

- [x] Unit — `TelegramAuthService.lookupUser` in isolation, mocked
      `AuthentikClient`/`DirectusClient`.
- [x] Integration — `TelegramInternalController.lookup` +
      `TelegramAuthService.lookupUser` wired together, mocked
      Authentik/Directus HTTP boundary, real Zod validation and NestJS
      exception mapping exercised end-to-end at the controller-method
      level (matching `internal.spec.ts`/`checkin.integration.spec.ts`
      convention — no Testcontainers Postgres needed, this endpoint has no
      Drizzle table).
- [ ] E2E (Playwright) — not required (score 4 < 6) and not applicable
      (no browser surface — see below).

**Bot side (`apps/bot/`, Python/pytest):**

- [x] Unit — already substantially covered (16 passing tests). Gap
      analysis below identifies what, if anything, is still missing.
- [ ] Integration (Testcontainers) — not applicable; the bot has no
      Postgres/Redis dependency of its own (ADR-0034 §Q3: bot owns no
      Postgres). Its "integration" surface with the API is already
      covered via `httpx.MockTransport` contract tests in
      `test_auth_middleware.py`.
- [ ] E2E (Playwright) — not applicable, no browser surface.

**Cross-cutting:**

- [ ] E2E (Playwright) — **not applicable to this FR at all.** Confirmed
      against `02-impact-analysis.md`'s own Test Scope section: no Astro
      pages, no React islands, no `apps/web` client calls. The endpoint is
      internal-only (shared-secret auth, never browser-called). UAT
      verification is a manual/scripted Telegram smoke test against a
      deployed Coolify instance, which is UATRunner's concern at a later
      workflow step, not a Playwright flow TestDesigner authors.

---

## Unit Test Plan

### apps/api (TypeScript) — NEW, zero tests exist today

File to create: `apps/api/test/telegram-lookup.spec.ts` (mirrors the
`internal.spec.ts` naming/mocking convention — direct instantiation of
`TelegramAuthService` with mocked `AuthentikClient`/`DirectusClient`, no
NestJS Test module bootstrap needed).

| Target | Happy Path | Failure Paths |
|---|---|---|
| `TelegramAuthService.lookupUser` — linked, non-temp user (AC-1) | `getUserByTelegramId` returns a user with `attributes.is_temporary` unset/false; `findDirectusUserByEmail`-driven Directus `get` returns a matching row → `{ directusUserId: <row.id>, isTemp: false, country: <row.country> }`. | — |
| `TelegramAuthService.lookupUser` — temp-only user, no Directus row (AC-2, common case) | `getUserByTelegramId` returns a user with `attributes.is_temporary === true`; Directus `get` returns `{ data: [] }` (no row for the synthetic `tg<id>@telegram.local` email) → `{ directusUserId: null, isTemp: true, country: null }`. Resolved value confirmed against `03-code-summary.md` Key Design Decision #5 — `directusRow?.id ?? null`, not a synthetic/pending id. | — |
| `TelegramAuthService.lookupUser` — temp-only user WITH a matching Directus row (AC-2, edge case explicitly called out in code summary #5: "member registered fully before ever hitting `/start` again with a stale local bot cache") | `is_temporary === true` AND Directus `get` returns a real row → `{ directusUserId: <real id>, isTemp: true, country: <row.country> }`. Assert `isTemp` reflects the Authentik attribute independent of whether a Directus mirror exists — this is the one branch most likely to be silently skipped if TestDesigner only tests the "common" temp case. | — |
| `TelegramAuthService.lookupUser` — no Authentik user at all (AC-3) | — | `getUserByTelegramId` returns `null` → `lookupUser` rejects with `NotFoundException({ error: 'telegram_user_not_found' })`. Assert the exception's `getResponse()` body shape, not just the exception class, since AC-3 requires "a structured error body (not a bare 500)." |
| `TelegramAuthService.lookupUser` — malformed `telegramId` at service boundary | — | Non-numeric-string / oversized `telegramId` passed directly to the service (bypassing the controller) → `lookupUserBodySchema.shape.telegramId.parse` throws `ZodError`. Belt-and-suspenders check matching the controller-level test below; confirms the service does not silently trust an already-validated caller. |
| `TelegramAuthService.lookupUser` — idempotency / no side effects (AC-5) | Any of the above happy-path fixtures; assert `authentikClientMock.createUser`/`patchAttributes` and `directusClientMock.post`/`patch`/`put`/`delete` are **never called**, across all scenarios in this file. | — |
| `TelegramAuthService.findDirectusUserByEmail` (private, exercised indirectly) — Directus query shape | Assert the mocked `directus.get` is called with a URL containing `filter[email][_eq]=<encoded email>` and `fields=id,country` and `limit=1` — locks in the "no PII over-fetch" property the security review explicitly credited (`04-security-review.md` PII exposure assessment). | — |

### apps/bot (Python) — already covered by CodeDeveloper's self-validation tests, gaps only

Existing coverage confirmed by reading `apps/bot/tests/*.py` directly
(16 tests, `pytest -v` → `16 passed` per `03b-code-summary-bot.md`):

| File | Covers | AC |
|---|---|---|
| `test_rate_limit_middleware.py` (4 tests) | Under-limit passthrough, over-limit block+reply, per-user independence, window reset | AC-9 |
| `test_auth_middleware.py` (5 tests) | Exact HTTP request shape (method/URL/header/body) via `httpx.MockTransport`; known-user context attachment; 404-passthrough; API-unavailable passthrough; exactly-once-per-update call count | AC-7 (fully), AC-6 (indirectly, via the 404-passthrough test confirming `/start` isn't blocked) |
| `test_handlers.py` (2 tests) | `/start` welcome message; unknown-command fallback message | AC-6 (message content), AC-8 |
| `test_user_cache.py` (4 tests) | SQLite miss/roundtrip/upsert/clear | supports AC-7's cache fallback path, no AC of its own |
| `test_thin_bot_guarantee.py` (1 test) | Regression grep for live env-var reads of the three forbidden tokens | AC-10 |

**Gaps identified (genuinely new work, not already covered):**

1. **No dedicated log-shape test for AC-11's stdout side.** The code
   summary's own Known Limitations flags this explicitly: "no dedicated
   log-shape test was added — a reasonable gap for a later TestDesigner
   pass." `LoggingMiddleware` emits one JSON line per update with
   `telegram_id`, `command`, `duration_ms`, `status`, but no test asserts
   this shape today (only that the middleware exists and is wired, via
   indirect exercise in the auth-middleware tests' downstream chain — not
   a direct log-content assertion). **New unit test needed**: capture
   stdout (or patch the configured logger's handler) around a simulated
   update and assert the emitted line parses as JSON with exactly those
   four keys present and correctly typed (`telegram_id: str`,
   `duration_ms: number`, etc.).
2. **`RateLimitMiddleware` + `AuthMiddleware` + `TenantMiddleware`
   ordering is asserted only implicitly** (via `main.py`'s wiring, not a
   test). `TenantMiddleware`'s own module has **zero direct test file** —
   `tenant.py` is listed as an "Added" file in the code summary but no
   `test_tenant_middleware.py` exists in the `Glob` results. This is a
   real gap: nothing currently asserts `TenantMiddleware` derives
   `data["country"]` from `user_context` correctly, including the case
   where `user_context.country` is `None` (unknown/temp user). **New unit
   test needed**: `test_tenant_middleware.py` — asserts `data["country"]`
   is set from `user_context.country` when present, and is `None`
   (not a KeyError / crash) when `user_context` itself has `country=None`
   or `is_known=False`.
3. **`error_handler.py` (global aiogram error router) has no direct
   test.** Not explicitly required by any single AC, but it's new code
   with a security-relevant property already asserted by the security
   review (INV-2: exception text not leaked via `extra={"update_id":...}`)
   — that property was verified by SecurityReviewer via code reading, not
   by an automated test, so nothing guards against a future regression.
   **New unit test recommended** (not strictly AC-mapped, so lower
   priority than #1/#2): simulate a handler raising, assert the generic
   user-facing message is sent and the structured log line does not
   contain the raw exception message string in a loggable field other
   than the stdlib-formatted traceback.

None of the 16 existing tests need to be rewritten or duplicated —
TestDesigner's bot-side scope is exactly items 1–3 above, all net-new
files/cases, not a re-plan of what already exists.

---

## Integration Test Plan

### apps/api (TypeScript) — NEW

| Scenario | Infrastructure | Key Assertions |
|---|---|---|
| `POST /v1/internal/telegram/lookup` via `TelegramInternalController.lookup` — full request/response cycle, controller + service wired together, AC-1 | Mocked `AuthentikClient`/`DirectusClient` (no Testcontainers Postgres — this endpoint makes zero Drizzle/Postgres calls, confirmed by impact analysis "DB Changes Required: No" and security review INV-5/INV-10). Matches `internal.spec.ts`/`checkin.integration.spec.ts` convention exactly. | Valid body `{ telegramId: "123" }` → controller returns `200`-shaped `LookupUserResult` object (Nest's return-value-as-body, no explicit `res.json` call in this codebase's convention) matching the service's resolved value. |
| Malformed/missing body → `400` (Zod at controller boundary) | Same as above | `controller.lookup({})` and `controller.lookup({ telegramId: 'not-numeric' })` both reject with `BadRequestException`, mirroring `ensureLinkedUser`'s existing "rejects a body without email" / "rejects a non-email" tests one-for-one. |
| No Authentik user → `404` (AC-3), full controller path | Same as above | `controller.lookup({ telegramId: '999' })` with `authentikMock.getUserByTelegramId` resolving `null` rejects with `NotFoundException`; assert `error.getResponse()` equals `{ error: 'telegram_user_not_found' }` (exact body, not just the status class) — this is the "distinguish unknown-user from API-down" contract the bot's `AuthMiddleware` depends on structurally. |
| `InternalAuthGuard` applied to the new route (AC-4) | None — pure guard unit test, same pattern as `internal.spec.ts`'s existing `InternalAuthGuard` `describe` block | Reuse (do not duplicate) the existing guard tests' pattern: construct a fake `ExecutionContext` with/without the correct `x-internal-auth` header and assert `canActivate` throws/returns as expected. This is technically guard-level, not route-level, but per the impact analysis's Risk Flag #1 ("confirm no code path allows the guard to be bypassed... a misplaced route outside `TelegramInternalController` would silently lose protection"), the actually-decisive check is a **class-level assertion**: read `TelegramInternalController`'s own `@UseGuards` metadata (via `Reflect.getMetadata('__guards__', TelegramInternalController)` or NestJS's guard-introspection helper already used elsewhere in this repo, if any) OR — simpler and equally valid — a source-level assertion that both `lookup` and `upsertTempUser` are declared inside the same `TelegramInternalController` class body (structural test, not a runtime guard bypass simulation). TestDesigner's call on exact mechanism; either satisfies AC-4's intent. |
| Read-path idempotency across two rapid identical calls (AC-5) | Mocked clients, call `lookup` twice in sequence within one test | Both calls return an identical `LookupUserResult`; assert zero `.create`/`.patch`/`.post`/`.put`/`.delete` calls on either mock across both invocations — the multi-call variant of the unit-level AC-5 check, exercising the full controller→service path rather than the service alone. |
| Directus query-shape lock-in (defends the "no PII over-fetch" property credited in the security review) | Mocked `DirectusClient.get` | Assert the exact query string passed to `directus.get` for a known `telegramId` includes `fields=id,country` — regression guard against someone widening the projection later without noticing. |

**Note on "Testcontainers" in the rubric's literal sense:** the rubric
says "Score ≥ 4: Integration tests required (Testcontainers)." This
endpoint has no Postgres/Drizzle dependency at all (confirmed twice,
independently, by ImpactAnalyzer and SecurityReviewer), so a literal
Testcontainers Postgres spin-up would test nothing this endpoint actually
touches. The integration tests above satisfy the rubric's *intent*
(exercise the full controller+service+guard+validation stack together,
not just isolated units) using this codebase's own established pattern
for Postgres-free internal endpoints. If TestDesigner disagrees and wants
a literal Testcontainers instance wired in anyway (e.g. for
forward-compatibility with a future AC that does touch Postgres), that's
an acceptable superset, not a requirement of this strategy.

### apps/bot (Python) — already covered, no integration gap

The bot's one "integration" surface — its HTTP contract with the API — is
already fully exercised via `httpx.MockTransport` in
`test_auth_middleware.py`'s `test_lookup_sends_expected_request_shape`
(asserts exact method/URL/header/body). No Testcontainers-equivalent is
applicable on the bot side (no Postgres/Redis dependency — ADR-0034 §Q3).
No new integration-level bot work identified beyond the unit-level gaps
already listed above.

---

## E2E Test Plan

**Not applicable — no table populated.**

Confirmed against `02-impact-analysis.md`'s own Test Scope section and
independently re-verified here: this FR has zero browser-facing surface.
`POST /v1/internal/telegram/lookup` is bot-internal only
(shared-secret auth, never called from `apps/web`); the bot itself is a
Telegram long-polling process, not a Playwright-drivable UI. Rubric score
(4) is also below the E2E threshold (≥6) independently, so both the
rubric and the "no browser surface" check agree: no Playwright flow is
in scope for TestDesigner. UAT verification (AC-6 timing,
AC-9 rate-limit behavior in a live deployment, AC-11 Loki delivery) is a
manual/scripted Telegram smoke test owned by UATRunner at a later
workflow step — not this FR's TestDesigner/Playwright scope.

---

## Acceptance Criteria → Test Mapping

| AC | Test Level | Test Description |
|---|---|---|
| AC-1 (linked, non-temp user → real data) | Unit + Integration (apps/api) | `TelegramAuthService.lookupUser` unit test (happy path) + `TelegramInternalController.lookup` integration test — both assert `{ directusUserId: <real>, isTemp: false, country: <real> }` for a fully-linked user. |
| AC-2 (temp-only user → `isTemp: true`, `directusUserId` per CodeDeveloper's resolved decision) | Unit (apps/api) | Two unit-test cases on `lookupUser`: (a) common case, no Directus row → `directusUserId: null`; (b) edge case, Directus row exists despite `is_temporary: true` → real `directusUserId`, `isTemp: true` still. Resolved per `03-code-summary.md` Key Design Decision #5 (`directusRow?.id ?? null` — no synthetic/pending id was introduced); both branches must be tested, not just the common one, since the code path genuinely has two outcomes. |
| AC-3 (no Authentik user → `404` structured body) | Unit + Integration (apps/api) | Unit: `lookupUser` rejects `NotFoundException({ error: 'telegram_user_not_found' })`. Integration: controller-level assertion of the same, confirming the exact body reaches the HTTP layer un-mangled. |
| AC-4 (missing/wrong `x-internal-auth` → `401`, guard reused not reimplemented) | Integration (apps/api) | Guard-level test (reusing existing `InternalAuthGuard` test pattern from `internal.spec.ts`) + a structural/class-level check that `lookup` lives inside the same `@UseGuards(InternalAuthGuard)`-decorated `TelegramInternalController` as `upsertTempUser`, per the impact analysis's Risk Flag #1 concern about a misplaced route silently losing protection. |
| AC-5 (read-path idempotency, no side effects) | Unit + Integration (apps/api) | Both levels assert zero write-method calls (`create`/`patch`/`post`/`put`/`delete`) on the mocked Authentik/Directus clients across single and repeated-call scenarios. |
| AC-6 (`/start` responds within 3s, works for brand-new users) | Unit (apps/bot, **already covered**) + deferred (timing bound) | Message-content assertion already covered by `test_handlers.py`; the 404-passthrough behavior that makes this possible for brand-new users is covered by `test_auth_middleware.py`. **The literal "3 seconds" wall-clock bound is explicitly deferred to UAT/deploy-verification** — a unit test asserting handler latency in an isolated pytest run would measure test-harness overhead, not real network/API round-trip time, and would be flaky/meaningless. UATRunner should assert this against a live deployment (manual or scripted Telegram smoke test), per `02-impact-analysis.md`'s own Test Scope conclusion. |
| AC-7 (auth middleware calls lookup exactly once, attaches context) | Unit (apps/bot, **already covered**) | Fully covered by `test_auth_middleware.py`'s five tests (request shape, context attachment, 404/unavailable passthrough, exactly-once call count). No gap. |
| AC-8 (unknown command → fallback message) | Unit (apps/bot, **already covered**) | Covered by `test_handlers.py`'s unknown-command test. No gap. |
| AC-9 (rate limit, 10+/min → "slow down") | Unit (apps/bot, **already covered**) | Fully covered by `test_rate_limit_middleware.py`'s four tests. No gap. |
| AC-10 (thin-bot guarantee — forbidden env vars absent) | Unit (apps/bot, **already covered**) | Covered by `test_thin_bot_guarantee.py`'s regression test (matches actual read patterns, not naive substring search) + independently re-verified by SecurityReviewer via direct grep (`04-security-review.md`). Concrete automated test exists; not a deploy-only concern despite initially looking like one — the code-level guarantee (no live reference to the three forbidden vars) is exactly what the existing test asserts. **Deploy-side reinforcement** (confirming the Coolify env definition itself never *sets* these three vars, which the code-level test cannot see) is a separate, complementary deploy-config checklist item for whoever provisions the `aiqadam-bot` Coolify service — explicitly out of TestDesigner's pytest scope, called out here so it isn't silently dropped. |
| AC-11 (structured JSON logs; Grafana/Loki delivery) | Unit (apps/bot, **gap — new test needed**) + deferred (Loki delivery) | **Automatable and in-scope**: new `test_logging_middleware.py` asserting the emitted stdout line is valid JSON containing `telegram_id`, `command`, `duration_ms`, `status` (gap #1 in Unit Test Plan above — the code summary itself flags this as missing). **Explicitly deferred to UAT/deploy-verification**: actual delivery into Grafana/Loki depends on Coolify + Promtail/Loki pipeline config, which cannot be exercised from a local pytest run or this repo's CI — UATRunner confirms this against the live deployment, per both code summaries' Known Limitations sections agreeing on this boundary. |

Every AC (1–11) is mapped to a concrete test level. AC-6's timing bound
and AC-11's Loki delivery are the two pieces explicitly deferred, each
with a one-line reason and an owner (UATRunner); AC-10 was initially
flagged by the impact analysis as a possible deploy-only concern but is
in fact already covered by a genuine automated code-level test, with only
its deploy-side reinforcement (Coolify env definition) left as a
non-code checklist item.

---

## Gate Result

```yaml
gate: test-strategist
workflow: wf-20260731-feat-171
status: passed
timestamp: 2026-07-31T00:00:00Z
summary: >
  Rubric score for the API-side change: 4 (new API endpoint +2, cross-module
  service call +1, new database-equivalent query [Directus HTTP read] +1,
  tenant-scoping confirmed N/A against impact analysis and security review's
  own INV-1 disposition, business-rule-with-edge-cases criterion judged not
  to apply). Score 4 requires integration tests, does not reach the E2E
  threshold (6) — consistent with the impact analysis's independent
  conclusion that no Playwright flow applies (no browser surface at all).
  "Integration (Testcontainers)" interpreted per this endpoint's actual
  dependency shape: zero Postgres/Drizzle calls (confirmed twice,
  independently), so integration tests here mean controller+service wired
  together with mocked Authentik/Directus HTTP boundaries, matching the
  established apps/api/test/internal.spec.ts and checkin.integration.spec.ts
  convention for Postgres-free internal endpoints, not a deviation from the
  rubric. AC-2's open directusUserId question resolved by reading
  03-code-summary.md Key Design Decision #5 (directusRow?.id ?? null, with
  a real id returned if a Directus row happens to exist despite
  is_temporary=true) — both branches written into the unit test plan rather
  than left as an open question for TestDesigner. Bot-side: audited all 16
  existing pytest tests directly against AC-6 through AC-11; identified
  three genuine coverage gaps (AC-11 log-shape test entirely missing —
  self-flagged by CodeDeveloper's own Known Limitations; TenantMiddleware
  has zero dedicated test file; error_handler.py has no direct test,
  lower-priority) rather than restating the existing green-field coverage.
  All 11 ACs mapped to a specific test level; AC-6's 3-second bound and
  AC-11's Loki delivery are explicitly deferred to UAT/deploy-verification
  with a one-line reason and owner (UATRunner) each — not left unmapped.
  AC-10, initially flagged by the impact analysis as a possible deploy-only
  concern, resolved as already having a genuine automated code-level test
  (test_thin_bot_guarantee.py), with only its deploy-side reinforcement
  (Coolify env definition) carried forward as a non-code checklist item.
rubric_score: 4
required_levels:
  unit: true
  integration: true
  integration_mechanism: "mocked Authentik/Directus HTTP boundary, no Testcontainers Postgres (endpoint has no Drizzle/Postgres dependency)"
  e2e: false
acs_mapped: 11
acs_deferred_to_uat:
  - ac: AC-6
    reason: "3-second wall-clock bound is not meaningfully unit-testable in isolation; message-content and unblock-on-404 behavior already unit-tested"
  - ac: AC-11
    reason: "Grafana/Loki ingestion depends on Coolify + Promtail/Loki pipeline config, unreachable from local pytest/CI; JSON log-shape itself IS unit-testable and is scoped as a new test, not deferred"
acs_with_new_gap_identified:
  - AC-11
open_questions_resolved:
  - "AC-2 directusUserId value: resolved as directusRow?.id ?? null (real id if a Directus row exists despite is_temporary=true, else null) — read directly from 03-code-summary.md Key Design Decision #5, not re-deferred to TestDesigner"
next_agent: test-designer
```
