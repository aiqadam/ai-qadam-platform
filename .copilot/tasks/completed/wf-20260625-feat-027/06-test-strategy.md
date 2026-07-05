# 06 — Test Strategy
**Workflow:** wf-20260625-feat-027
**Agent:** TestStrategist
**Date:** 2026-06-25

---

## Requirement

**FEAT-AUTH-7** — FR-AUTH-002 Telegram Authentication, API layer only.

Two new endpoints and one new service:
- `POST /v1/auth/telegram/exchange` — public, rate-limited, HMAC-verified Login Widget exchange
- `POST /v1/internal/telegram/upsert-temp-user` — `InternalAuthGuard`-protected bot provisioning
- `TelegramAuthService` — HMAC verification, Authentik user lookup/provision, recovery link

No platform DB changes. No web UI changes. No bot changes.

---

## Rubric Score

| Criterion | Points | Justification |
|---|---|---|
| Touches tenant-scoped data | 0 | No platform DB; Authentik is a shared identity store, not tenant-scoped |
| New API endpoint | +2 | Two new endpoints: POST /v1/auth/telegram/exchange AND POST /v1/internal/telegram/upsert-temp-user |
| Business rule with edge cases | +2 | HMAC key derivation, auth_date freshness window, email-match fallback, idempotent upsert |
| Cross-module service call | +1 | `TelegramAuthService` (AuthModule) → `AuthentikClient` (AuthentikModule) via NestJS DI |
| New database query | 0 | No platform DB queries; Authentik accessed via REST API only |
| Pure function / utility | 0 | N/A — not the dominant characteristic |

**Total: 5**

**Score ≥ 4 → Integration tests required (Testcontainers).**
**Score < 6 → E2E tests NOT required.**

However, the orchestrator task brief has already noted that the external Authentik dependency makes true Testcontainers integration (requiring a live Authentik instance) impractical within this API-only PR. The integration-test tier here is satisfied by **controller-level tests** that wire controller + mocked service together, following the established project pattern in `registration-checkin.controller.spec.ts` and `checkin.integration.spec.ts`. These tests exercise the full HTTP-surface contract (Zod validation → service call → response shape) without a running Authentik or database. A true Authentik-container integration test is deferred to the follow-up PR that introduces the browser-facing UI (which will drive a full OIDC callback flow).

---

## Required Test Levels

- [x] Unit tests (Jest/Vitest — `telegram-auth.service.spec.ts`)
- [x] Controller-integration tests (Vitest — `telegram-auth-controller.spec.ts`, mocked `TelegramAuthService`)
- [ ] E2E tests (Playwright) — NOT required at this score; deferred to web-widget UI PR

---

## Unit Test Plan

**Test file:** `apps/api/test/telegram-auth-service.spec.ts`
**Framework:** Vitest (matches all other test files in this repo)
**Setup:** `TelegramAuthService` constructed directly (`new TelegramAuthService(mockAuthentikClient)`) — no NestJS DI overhead. `env.TELEGRAM_BOT_TOKEN` set/unset via `vi.stubEnv` or module re-import with env manipulation.

### Helper: valid fixture builder

Before the test matrix, the TestDesigner should produce:
- `makeBotToken()` — returns a test token string ≥ 20 chars
- `makeValidPayload(overrides?)` — builds a `TelegramWidgetPayload` with a correctly computed HMAC using the test token, `auth_date` set to `Math.floor(Date.now() / 1000)` (fresh)
- `makeAuthentikClient()` — `vi.fn()` stubs for all called methods

| Target | Happy Path | Failure Paths |
|---|---|---|
| `verifyWidgetHash` | Valid payload + correct hash + fresh `auth_date` → does not throw | (a) Tampered hash → throws `UnauthorizedException` with message `telegram_hmac_invalid`; (b) auth_date `> 300 s` old → throws `UnauthorizedException` with message `telegram_auth_date_expired`; (c) TELEGRAM_BOT_TOKEN absent → throws `ServiceUnavailableException` with message `telegram_not_configured` |
| `buildDataCheckString` (private, tested via `verifyWidgetHash`) | All non-hash fields sorted alphabetically, `hash` excluded, `undefined` fields omitted | — |
| `deriveHmacKey` (private, tested via `verifyWidgetHash`) | SHA-256 hash of bot token returned as Buffer (not hex string) — verified implicitly by the HMAC comparison passing | Using raw token string as key produces wrong HMAC → fails hash check |
| `exchangeWidgetPayload` | Valid payload → `getUserByTelegramId` returns user → `createRecoveryLink` called → returns URL | (a) `getUserByTelegramId` returns null, `email` absent, `getUserByEmail` not called → `createTelegramUser` called → new user created; (b) `getUserByTelegramId` returns null, `email` present, `getUserByEmail` returns existing user → `patchAttributes` called with merged telegram_id, `createUser` NOT called; (c) HMAC failure propagated from `verifyWidgetHash` → `UnauthorizedException` thrown before any Authentik call |
| `upsertTempUser` | telegramId exists in Authentik → returns `{ authentikUserId, isNew: false }`, `createUser` NOT called | (a) telegramId not found → `createUser` called with `is_temporary: true`, synthetic email `tg<id>@telegram.local`, returns `{ authentikUserId, isNew: true }`; (b) Invalid telegramId (non-numeric) → throws `ZodError` from `telegramIdSchema.parse`; (c) TELEGRAM_BOT_TOKEN absent → throws `ServiceUnavailableException telegram_not_configured` |

### Mock shape

```ts
const mockAuthentik = {
  getUserByTelegramId: vi.fn(),
  getUserByEmail: vi.fn(),
  createUser: vi.fn(),
  patchAttributes: vi.fn(),
  createRecoveryLink: vi.fn(),
};
```

No `fetch` stubs needed — only `AuthentikClient` methods are mocked.

---

## Integration Test Plan

**Test file:** `apps/api/test/telegram-auth-controller.spec.ts`
**Framework:** Vitest — follows the `registration-checkin.controller.spec.ts` pattern:
- `AuthController` and `TelegramInternalController` instantiated directly with mocked `TelegramAuthService`
- No NestJS module compilation, no Testcontainers
- Tests the HTTP contract: Zod validation → service delegation → response shape + headers

| Scenario | Infrastructure | Key Assertions |
|---|---|---|
| Valid widget payload → 302 redirect | Express mock `res` (`.redirect()` spy, `.setHeader()` spy) | `telegramAuth.exchangeWidgetPayload` called once; `res.setHeader('Cache-Control', 'no-store')` set before redirect; `res.redirect(302, recoveryUrl)` called |
| Invalid JSON body → 400 | Mock `res` | `BadRequestException` thrown before service call; `exchangeWidgetPayload` not called |
| `exchangeWidgetPayload` throws `UnauthorizedException('telegram_hmac_invalid')` → 401 | Mock `res` | Exception propagates to caller unchanged (NestJS filter maps it to 401) |
| `exchangeWidgetPayload` throws `ServiceUnavailableException('telegram_not_configured')` → 503 | Mock `res` | Exception propagates unchanged |
| `upsert-temp-user` valid body → 200 JSON | No `res` mock needed (JSON return) | `telegramAuth.upsertTempUser` called with parsed `telegramId`, `firstName`, `username`; result returned |
| `upsert-temp-user` invalid body → 400 | — | `BadRequestException` thrown before service call; `upsertTempUser` not called |
| `upsert-temp-user` missing `X-Internal-Auth` → 401 | `InternalAuthGuard` unit test in `internal.spec.ts` (already exists) | Guard rejects; no controller method called — covered by existing guard tests, not duplicated here |
| Rate limit decorator metadata on `telegramExchange` | `Reflect.getMetadata` on `AuthController.prototype.telegramExchange` | `@Throttle` metadata present with `{ default: { limit: 5, ttl: 900_000 } }` |

**Note on `InternalAuthGuard`:** The existing file `apps/api/test/internal.spec.ts` already covers `InternalAuthGuard` behavior. The controller integration test only needs to verify that the guard decorator is applied at the class level on `TelegramInternalController` — this can be checked with `Reflect.getMetadata` or by checking the controller's guard chain, not by re-testing the guard's logic.

---

## E2E Test Plan

E2E tests (Playwright) are **NOT required** for this PR. Justification:

- Rubric score is 5 (threshold for E2E is 6).
- No browser-visible surface change in this PR — the Telegram Login Widget JS snippet is deferred.
- The 302 redirect target (Authentik recovery link) requires a real Authentik instance to drive through to `/v1/auth/callback` — that is the integration concern for the follow-up web-widget UI PR.

| User Flow | Entry Point | Exit Assertion |
|---|---|---|
| (deferred) Telegram Login Widget sign-in on `/auth/sign-in` | `/auth/sign-in` page | Browser lands at `/me` after Authentik callback | 
| (deferred) New Telegram user created on first sign-in | Same | Authentik user with `telegram_id` attribute exists |

These are placeholders for the web-widget UI PR. The TestStrategist for that PR must pick these up.

---

## Acceptance Criteria → Test Mapping

| AC | Test Level | Test Description | File |
|---|---|---|---|
| AC-1: Valid widget payload → 302 redirect | Unit + Integration | Unit: `exchangeWidgetPayload` returns recovery URL; Integration: `telegramExchange` calls `res.redirect(302, url)` | `telegram-auth-service.spec.ts`, `telegram-auth-controller.spec.ts` |
| AC-2: Invalid hash → 401 | Unit + Integration | Unit: `verifyWidgetHash` throws `UnauthorizedException('telegram_hmac_invalid')`; Integration: exception propagates through controller | `telegram-auth-service.spec.ts`, `telegram-auth-controller.spec.ts` |
| AC-3: Expired `auth_date` (> 300 s) → 401 | Unit | `verifyWidgetHash` with `auth_date = nowSeconds - 301` throws `UnauthorizedException('telegram_auth_date_expired')` | `telegram-auth-service.spec.ts` |
| AC-4: New Telegram user → created with `is_temporary=true` + synthetic email | Unit | `upsertTempUser` with unknown `telegramId` → `createUser` called with `attributes: { telegram_id, is_temporary: true }`, email `tg<id>@telegram.local` | `telegram-auth-service.spec.ts` |
| AC-5: Existing Telegram user → idempotent (no duplicate) | Unit | `upsertTempUser` called twice with same `telegramId`: second call → `getUserByTelegramId` returns existing user, `createUser` NOT called | `telegram-auth-service.spec.ts` |
| AC-6: Existing `telegram_id` on widget exchange → no new user created | Unit | `exchangeWidgetPayload` with `getUserByTelegramId` returning user → `createUser` NOT called | `telegram-auth-service.spec.ts` |
| AC-7: Prior email user + widget with same email → matched, no duplicate | Unit | `exchangeWidgetPayload` with `getUserByTelegramId` null, `email` present, `getUserByEmail` returning user → `patchAttributes` called, `createUser` NOT called | `telegram-auth-service.spec.ts` |
| AC-8: Missing `TELEGRAM_BOT_TOKEN` → 503 | Unit | `getBotToken()` (tested via `verifyWidgetHash` and `upsertTempUser`) throws `ServiceUnavailableException('telegram_not_configured')` when env var absent | `telegram-auth-service.spec.ts` |
| AC-9: `upsert-temp-user` without `X-Internal-Auth` → 401 | Existing guard tests | `InternalAuthGuard` rejects missing/invalid header — already covered by `apps/api/test/internal.spec.ts` | Existing: `internal.spec.ts` |
| AC-10: 6th request in 15 min → 429 | Integration (metadata) | `@Throttle({ default: { limit: 5, ttl: 900_000 } })` metadata verified on `telegramExchange` method | `telegram-auth-controller.spec.ts` |

### Coverage note on AC-10

The `@UseGuards(ThrottlerGuard)` + `@Throttle(...)` enforcement path is tested by verifying the decorator metadata is correctly applied. The actual rate-limit enforcement logic is owned by `@nestjs/throttler` (a tested third-party library). Duplicating a full HTTP-layer rate-limit integration test (which would require Testcontainers + Redis + NestJS DI bootstrap) is out of scope for this PR and would be covered in an end-to-end environment test.

### AuthentikClient new methods

AC-1 through AC-7 all depend on new `AuthentikClient` methods (`getUserByTelegramId`, `createRecoveryLink`). These should have dedicated unit tests in `apps/api/test/authentik-client.spec.ts` as addendum to the existing file:

| Target | Happy Path | Failure Paths |
|---|---|---|
| `getUserByTelegramId(telegramId)` | fetch called with URL containing `attributes={"telegram_id":"<id>"}`, returns first result | No match → returns null; non-2xx → throws `AuthentikError` |
| `createRecoveryLink(userPk)` | POSTs to `/api/v3/core/users/<pk>/recovery/`, extracts `recovery_link` from response body | non-2xx → throws `AuthentikError` |

---

## Test Environment Notes

### Env var isolation

Tests that exercise the missing-bot-token path need to temporarily suppress `env.TELEGRAM_BOT_TOKEN`. The established pattern in this repo is to stub the module-level `env` object via `vi.mock` or `vi.stubGlobal`. Since `env.ts` is imported at module load time, the preferred approach is:

1. In the test file, use `vi.mock('../../src/config/env', () => ({ env: { ...realEnv, TELEGRAM_BOT_TOKEN: undefined } }))` for the unconfigured-path tests.
2. For the configured-path tests (default), load the real `env` with a test-scoped `TELEGRAM_BOT_TOKEN` override in the `beforeEach` via `vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token-32chars-minimum-ok')`.

The TestDesigner must pick the approach that aligns with the existing pattern — reviewing `telegram-token-crypto.spec.ts` and `observe-throttler-guard.spec.ts` for precedent in this repo.

### HMAC fixture generation

The TestDesigner must generate a valid `hash` in test fixtures by running the actual derivation:
```ts
import { createHash, createHmac } from 'node:crypto';
const BOT_TOKEN = 'test-bot-token-that-is-at-least-20-chars-long';
function makeHash(fields: Record<string, unknown>): string {
  const key = createHash('sha256').update(BOT_TOKEN).digest();
  const dataCheckString = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join('\n');
  return createHmac('sha256', key).update(dataCheckString).digest('hex');
}
```
This keeps the HMAC fixture honest — it uses the same algorithm as the production code, so a regression in `deriveHmacKey` or `buildDataCheckString` will correctly fail these tests.

---

## Gate Result

```
gate_result:
  status: passed
  summary: "Test strategy complete for FEAT-AUTH-7 API layer; rubric score 5 requires unit + controller-integration tests; all 10 ACs mapped; two new AuthentikClient methods (getUserByTelegramId, createRecoveryLink) added to existing authentik-client.spec.ts; E2E deferred to web-widget UI PR."
  findings:
    - "Rubric score: 5 (2 new endpoints + 2 business-rule edge cases + 1 cross-module call). Integration tests required; E2E not required."
    - "Primary test files: apps/api/test/telegram-auth-service.spec.ts (new) and apps/api/test/telegram-auth-controller.spec.ts (new); authentik-client.spec.ts (addendum)."
    - "Framework: Vitest throughout — consistent with all 80+ existing spec files in apps/api/test/."
    - "Controller tests follow established project pattern (direct instantiation, mocked service) from registration-checkin.controller.spec.ts."
    - "AC-9 (InternalAuthGuard protection) is already covered by apps/api/test/internal.spec.ts — not duplicated."
    - "AC-10 (rate limit) verified via Reflect.getMetadata on the @Throttle decorator — ThrottlerGuard enforcement logic is owned by @nestjs/throttler and not re-tested."
    - "auth_date window in tests must use 300 s (AUTH_DATE_MAX_AGE_SECONDS), not 86 400 s — matching the implementation, which the SecurityReviewer confirmed is more secure."
    - "HMAC fixture generation uses the real SHA-256 derivation so test hashes remain honest and algorithmic regressions are caught."
    - "Env var isolation for missing-TELEGRAM_BOT_TOKEN tests uses vi.stubEnv per test scope."
    - "True Authentik-container integration and E2E deferred to follow-up web-widget UI PR per orchestrator scope constraint and Testcontainers impracticality for Authentik."
```
