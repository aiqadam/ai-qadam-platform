# 02 — Impact Analysis
**Workflow:** wf-20260625-feat-027
**Agent:** ImpactAnalyzer
**Date:** 2026-06-25

---

## Validated Requirement

**FEAT-AUTH-7** — NestJS API layer for Telegram authentication (FR-AUTH-002, API-only scope).

Two new endpoints + one new service inside the existing `modules/auth` module:

- `POST /v1/auth/telegram/exchange` — public Login Widget HMAC verification + Authentik session
  hand-off via recovery link → 302 into existing OIDC callback flow
- `POST /v1/internal/telegram/upsert-temp-user` — `InternalAuthGuard`-protected bot endpoint for
  `/start` provisioning
- `TelegramAuthService` — service injectable with `AuthentikClient`, owned by `AuthModule`

Web widget UI (Astro/React) and bot `/start` handler (FR-BOT-001) are deferred to future PRs.

---

## Affected Layers

### API (NestJS)

The entire change is concentrated in `apps/api/src/modules/auth/` plus one-line changes in
`apps/api/src/config/env.ts` and `apps/api/src/modules/admin-invites/authentik.client.ts`.

**Files that must change or be created:**

| # | File | Action | Reason |
|---|------|--------|--------|
| 1 | `apps/api/src/modules/auth/telegram-auth.service.ts` | **CREATE** | New service: HMAC verify, Authentik user lookup/provision, recovery link, upsert-temp-user logic |
| 2 | `apps/api/src/modules/auth/telegram-auth.service.spec.ts` | **CREATE** | Unit tests (Jest, no DB — mock AuthentikClient) |
| 3 | `apps/api/src/modules/auth/auth.module.ts` | **MODIFY** | Import `AuthentikModule`; add `TelegramAuthService` to `providers` |
| 4 | `apps/api/src/modules/auth/auth.controller.ts` | **MODIFY** | Add two new `@Post` routes + inject `TelegramAuthService` |
| 5 | `apps/api/src/config/env.ts` | **MODIFY** | Add `TELEGRAM_BOT_TOKEN: z.string().min(20).optional()` |

Additionally, **one method must be added to `AuthentikClient`** (file #6 if counted separately):

| # | File | Action | Reason |
|---|------|--------|--------|
| 6 | `apps/api/src/modules/admin-invites/authentik.client.ts` | **MODIFY** | Add `createRecoveryLink(userPk: number): Promise<string>` — calls `POST /api/v3/core/users/{pk}/recovery/` |

**5-file code limit (AGENTS.md §4) — reconciliation:**

The limit is "5 files changed per PR for code (configs and tests excepted)." Tests are excepted.
Configs (`env.ts`) are excepted. The two new files (service + spec) count as 1 new file + 1 test
(test excepted). `auth.module.ts` and `auth.controller.ts` = 2 modified code files.
`authentik.client.ts` = 1 modified code file. **Total code-counted files: 4** (service create +
module modify + controller modify + client modify). This is within the 5-file ceiling.

**Critical architectural finding — `AuthentikModule` location:**

`AuthentikModule` and `AuthentikClient` live in `apps/api/src/modules/admin-invites/`.
`AuthModule` currently does NOT import `AuthentikModule`. The `TelegramAuthService` needs
`AuthentikClient` injected; therefore `AuthModule` must add `AuthentikModule` to its `imports`.

This is a **clean module dependency** (no boundary violation): `AuthentikModule` exports
`AuthentikClient` and `SuperAdminGuard` explicitly. The only risk is circular-dependency;
verification below shows this is safe (see Cross-Module Calls section).

**Missing AuthentikClient method:**

The existing `AuthentikClient` has: `createUser`, `getUserByEmail`, `getUserById`,
`listActiveUsers`, `resolveGroupNames`, `setUserGroups`, `patchAttributes`, `disableUser`,
`getOauthProviderByName`, `setOauthProviderRedirectUris`.

Two additional capabilities are needed for FEAT-AUTH-7:

1. **`getUserByTelegramId(telegramId: string): Promise<AuthentikUser | null>`** — Authentik's
   admin API supports `?attributes__contains={"telegram_id":"<value>"}` or individual attribute
   filters. This is a new GET query, similar to `getUserByEmail`. **Must be added to `authentik.client.ts`.**

2. **`createRecoveryLink(userPk: number): Promise<string>`** — calls Authentik's
   `POST /api/v3/core/users/{pk}/recovery/`, which returns `{ recovery_link: string }`.
   **Must be added to `authentik.client.ts`.**

Both methods follow the same pattern as the existing `request<T>()` private method and are
additive with no breakage risk.

### DB Changes Required

**No.** Telegram identity is stored on the Authentik user's `attributes` object (REST API, not
platform Postgres). No new Drizzle schema files, no `pnpm db:generate`, no migration SQL.

The platform `users` table (`apps/api/src/modules/users/schema.ts`) is NOT modified.
`authentik_subject` already serves as the link; when a Telegram-provisioned user upgrades to a
full account, that column is populated via the existing OIDC callback path.

### Shared Types (`packages/shared-types/`)

`packages/shared-types/` contains only a `.gitkeep` — the package exists as a placeholder with
no source files yet. **No changes required.** DTOs for the new endpoints are internal NestJS
(Zod-validated in the controller/service layer) and do not need to be published as shared types
for this API-only PR. The web-widget and bot callers will need types when their PRs land; that
is explicitly deferred.

### Frontend (`apps/web/`, `apps/web-next/`)

**None.** The Telegram Login Widget JS snippet and the UI on `/auth/sign-in` are deferred to a
future PR (see Deferred Items in `01-requirement-validation.md`). No Astro pages, React islands,
or `apps/web/src/lib/api.ts` changes.

### Bot (`apps/bot/`)

**None.** The bot `/start` command handler that calls `POST /v1/internal/telegram/upsert-temp-user`
is FR-BOT-001, deferred. This PR exposes the endpoint; the bot is not modified.

### Workers (`apps/workers/`)

**None.** No new BullMQ queues or processors.

---

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|----------|--------|--------|-----------|
| `/v1/auth/telegram/exchange` | POST | New — public, no auth guard, rate-limited (5 req/15 min/IP observe-mode) | No |
| `/v1/internal/telegram/upsert-temp-user` | POST | New — guarded by `InternalAuthGuard` (`X-Internal-Auth`) | No |

**Rate limiting note:** The global `ObserveThrottlerGuard` (60 req/60s) already applies to all
routes. AC-10 requires a tighter auth-class limit (5 req/15 min/IP) on the exchange endpoint.
The existing pattern (`@Throttle({ default: { limit: 5, ttl: 900_000 } })` + `@UseGuards(ThrottlerGuard)`)
is established in `registrations/registration-checkin.controller.ts`. The same pattern applies
here. When `RATE_LIMIT_ENFORCE=false` (default), the observe guard logs but allows; when `true`,
it enforces. No new infrastructure.

**Endpoint response shapes:**

`POST /v1/auth/telegram/exchange`:
- Success: `302 Location: <authentik-recovery-link>` (browser follows through Authentik OIDC flow
  to `/v1/auth/callback`)
- Invalid HMAC: `401 { "status": 401, "title": "telegram_hmac_invalid" }`
- Expired `auth_date`: `401 { "status": 401, "title": "telegram_auth_date_expired" }`
- Bot token absent: `503 { "title": "telegram_not_configured" }`

`POST /v1/internal/telegram/upsert-temp-user`:
- Success: `200 { authentikUserPk: number, directusUserId: string | null, country: string | null }`
- Missing/wrong `X-Internal-Auth`: `401`
- Bot token absent: `503 { "title": "telegram_not_configured" }`

---

## Cross-Module Calls

| Caller | Called | Via |
|--------|--------|-----|
| `TelegramAuthService` (in `AuthModule`) | `AuthentikClient` (from `AuthentikModule`) | NestJS DI — `AuthModule` imports `AuthentikModule` |
| `auth.controller.ts` | `TelegramAuthService` | Constructor DI (same module) |
| `auth.controller.ts` (existing) | `DirectusUsersBridgeService` | Already in place (via `DirectusModule` import) |

**Circular-dependency check for new `AuthModule → AuthentikModule` import:**

Current dependency graph touching `AuthModule`:
```
AuthModule → UsersModule → (no auth)
AuthModule → DirectusModule → (no auth)
AuthModule → LeadsModule → InteractionsModule → TelegramModule → AuthModule (forwardRef)
```

`AuthentikModule` currently imports: nothing (it only has `AuthentikClient` + `SuperAdminGuard`
as providers and exports; zero module imports). Adding `AuthModule → AuthentikModule` does NOT
create a cycle. `AuthentikModule` is also already imported by `TelegramModule`, which works fine
with `forwardRef(() => AuthModule)` on the other side. Safe.

---

## Risk Flags

### Security Review Required

**Yes.** The following security-sensitive operations are introduced:

1. **HMAC verification of Telegram Login Widget** — must use `HMAC-SHA256(SHA256(BOT_TOKEN), data_check_string)` exactly per Telegram docs. Implementation error here (e.g. using `HMAC-SHA256(BOT_TOKEN, ...)` directly, which is wrong) is a critical authentication bypass. SecurityReviewer must verify the key derivation step.

2. **`auth_date` freshness window** — 86 400 s (24 h) per spec. Code must use server clock,
   not client-supplied time. Reviewer must confirm no client-controlled bypass.

3. **`TELEGRAM_BOT_TOKEN` never in logs** — env var used only for HMAC key derivation in a
   `crypto.createHmac` call. Must not be echoed into error messages or logs.

4. **Authentik recovery link handling** — the recovery link is a one-use, short-TTL bearer URL.
   The 302 redirect must set `Cache-Control: no-store` (or the existing framework default) to
   prevent caching by intermediaries. SecurityReviewer must verify.

5. **`upsert-temp-user` body validation** — `telegramId` field is user-controlled (relayed
   from Telegram by the bot). Must be validated as a non-empty numeric string (bigint-safe);
   no SQL injection risk (goes into Authentik API body, not SQL), but must not accept arbitrary
   strings in the `email` synthesis path (`tg<id>@telegram.local`).

6. **Rate limiting** — AC-10 requires 5 req/15 min/IP. Must be applied with `@Throttle` on
   the exchange endpoint (observe mode by default; enforces when `RATE_LIMIT_ENFORCE=true`).
   SecurityReviewer must confirm the guard is correctly scoped to the public endpoint only (the
   internal endpoint is service-to-service, not IP-rate-limited).

### Architecture Rule Risks

| Rule | Assessment |
|------|------------|
| Module boundary: `AuthModule` importing `AuthentikModule` | SAFE — `AuthentikModule` is explicitly designed for cross-module import (comment in `authentik.module.ts` says "Standalone module so other features can import it") |
| No circular dependency | SAFE — verified above; `AuthentikModule` has no imports |
| No cross-schema Postgres queries | NOT APPLICABLE — this PR touches Authentik via REST API only |
| 5-file code limit | WITHIN LIMIT — 4 code-counted files (tests + config are excepted) |
| `TELEGRAM_BOT_TOKEN` vs `TELEGRAM_BOT_SERVICE_TOKEN` naming | Two distinct env vars: `TELEGRAM_BOT_TOKEN` (new, Login Widget HMAC key) and `TELEGRAM_BOT_SERVICE_TOKEN` (existing, bot ↔ API bearer auth). Code must use the correct one in each context. Confusion here would be a silent security failure. |

---

## Test Scope

### Unit Tests (Jest — `telegram-auth.service.spec.ts`)

All tests mock `AuthentikClient` — no DB, no network.

| AC | Test |
|----|------|
| AC-1 | `exchangeWidget()` with valid hash + recent `auth_date` → returns recovery link URL |
| AC-2 | `exchangeWidget()` with tampered `hash` → throws `401 telegram_hmac_invalid` |
| AC-3 | `exchangeWidget()` with valid `hash` but `auth_date` > 86400s ago → throws `401 telegram_auth_date_expired` |
| AC-4 | `upsertTempUser()` for new `telegramId` → calls `createUser` on AuthentikClient with correct attributes |
| AC-5 | `upsertTempUser()` for existing `telegramId` → calls `getUserByTelegramId`, does NOT call `createUser` |
| AC-6 | `exchangeWidget()` for existing `telegram_id` → uses existing user, does not call `createUser` |
| AC-7 | `exchangeWidget()` where `telegram_id` not found but `email` matches → calls `patchAttributes` on existing user |
| AC-8 | Both service methods when `TELEGRAM_BOT_TOKEN` is absent → throw `503 telegram_not_configured` |
| AC-9 | `POST /v1/internal/telegram/upsert-temp-user` without `X-Internal-Auth` → `401` (guard unit test) |
| AC-10 | Rate-limit decorator applied to exchange endpoint (verify `@Throttle` metadata is present) |

### Integration Tests (Testcontainers)

**Deferred / not in this PR.** Integration tests against a real Authentik instance are out of
scope for the API-layer PR. The unit tests with mocked `AuthentikClient` are sufficient to
validate the service logic; true end-to-end Authentik integration is covered when the web widget
UI lands (a subsequent PR that will drive a full browser flow).

### E2E Tests (Playwright)

**Deferred.** No browser-visible surface changes in this PR.

---

## Gate Result

```
gate_result:
  status: passed
  summary: "Impact fully analyzed; FEAT-AUTH-7 API layer touches 4 code files (within 5-file limit), requires no DB migration, and has clear security-review requirements around HMAC key derivation and recovery-link handling."
  findings:
    - "No platform DB migration required — Telegram identity stored in Authentik user attributes via REST API only."
    - "AuthModule must import AuthentikModule; no circular dependency risk — AuthentikModule has no imports of its own."
    - "Two new AuthentikClient methods required: getUserByTelegramId(telegramId) and createRecoveryLink(userPk); both are additive and follow the existing request<T>() pattern."
    - "TELEGRAM_BOT_TOKEN (new, HMAC key) is distinct from TELEGRAM_BOT_SERVICE_TOKEN (existing, bearer auth); must not be confused in implementation."
    - "packages/shared-types/ is a .gitkeep placeholder — no shared types needed for the API-only scope."
    - "Rate limiting: @Throttle({default:{limit:5,ttl:900_000}}) on exchange endpoint follows the established pattern in registration-checkin.controller.ts."
    - "Security review flagged for: HMAC key derivation correctness (SHA256 of BOT_TOKEN as HMAC key, not raw token), auth_date freshness check using server clock, recovery link cache-control, and upsert-temp-user input validation."
    - "4 code-counted files (telegram-auth.service.ts create, auth.module.ts modify, auth.controller.ts modify, authentik.client.ts modify); spec file + env.ts are test/config-excepted."
    - "DB Changes Required: no"
```
