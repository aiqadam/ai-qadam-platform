# Security Review — FEAT-BOT-1 (wf-20260731-feat-171)

workflow: wf-20260731-feat-171
agent: SecurityReviewer

---

## Code Changes Reviewed

API-side (`apps/api`, this repo):

- `apps/api/src/modules/auth/telegram-auth.service.ts` — new `lookupUserBodySchema`
  Zod schema, `LookupUserResult`/`DirectusUserLookupRow` types, `DirectusClient`
  constructor injection, new `lookupUser(telegramId)` public method, new
  `findDirectusUserByEmail(email)` private helper.
- `apps/api/src/modules/auth/auth.controller.ts` — new `@Post('lookup')` route
  (`lookup` method) on the existing `TelegramInternalController` class.
- `apps/api/src/modules/internal/internal-auth.guard.ts` — read only, to verify the
  reused guard's behavior (not modified by this workflow).
- `apps/api/src/modules/internal/internal.controller.ts` — read only, as
  rate-limiting precedent for sibling `/v1/internal/*` routes.

Bot-side (`apps/bot/`, submodule `aiqadam/aiqadam-telegram-bot`, commit
`1980894c5c6d02edfa3983dc808d8c34a3e156df`):

- `apps/bot/src/config.py`
- `apps/bot/src/middlewares/auth.py`
- `apps/bot/src/middlewares/rate_limit.py`
- `apps/bot/src/middlewares/tenant.py`
- `apps/bot/src/middlewares/logging_middleware.py`
- `apps/bot/src/middlewares/_util.py`
- `apps/bot/src/services/api_client.py`
- `apps/bot/src/services/user_cache.py`
- `apps/bot/src/handlers/start.py`
- `apps/bot/src/handlers/fallback.py`
- `apps/bot/src/error_handler.py`
- `apps/bot/src/logging_setup.py`
- `apps/bot/src/main.py`
- `apps/bot/.env.example`
- `apps/bot/.gitignore`
- `apps/bot/Dockerfile`

---

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1 Tenant isolation | N/A | N/A | No `countryCode`-scoped Postgres table is touched. `lookupUser` is a global lookup by `telegramId` over Authentik (global identity store) and Directus (`GET /users?filter[email]`), matching the existing `upsertTempUser`/`ensure-linked` precedent — none of these internal-lookup routes are tenant-scoped queries. The returned `country` field is data *about* the resolved user, not a query filter, so there is no cross-tenant read path to police. |
| INV-2 Secrets by reference | Applicable | PASS | Grepped both diffs for `password`/`secret`/`apiKey`/`token`/`Bearer` literals in strings, logs, or responses. API side: `telegram-auth.service.ts` has zero `logger.*`/`console.*` calls in the whole file — no logging surface exists in the changed code, so no leak path. Bot side: `internal_api_token` flows exactly once, into `headers={"x-internal-auth": self._token}` in `api_client.py`; never passed to `logger.*`. `error_handler.py`'s `logger.error(..., exc_info=event.exception, extra={"update_id": ...})` only attaches `update_id`, not exception text, to `extra`; `exc_info` is handled by stdlib traceback formatting. Verified `httpx`'s exception hierarchy (`_exceptions.py` in the vendored `.venv`) — `HTTPError`/`RequestError`/timeout/network exceptions are constructed from plain message strings and never serialize request headers into `__str__`, so `ApiUnavailableError(f"... {exc}")` in `api_client.py:79` cannot leak the token via a wrapped httpx exception. `TELEGRAM_BOT_TOKEN` is read once in `main.py:56` to construct the `Bot` object and never logged. |
| INV-3 Auth at controller level | Applicable | PASS | Read `auth.controller.ts` directly (not the summary). `TelegramInternalController` (line 497-499) declares `@Controller('v1/internal/telegram')` + `@UseGuards(InternalAuthGuard)` at class level. The new `lookup` method (line 527-535) is declared inside that same class, alongside `upsertTempUser` — it inherits the class-level guard automatically; there is no per-method `@UseGuards` to omit or misplace, and the route was not added to any other controller. Confirmed no code path bypasses the guard. |
| INV-4 Validation at boundaries | Applicable | PASS | Controller: `lookupUserBodySchema.safeParse(body)` in `auth.controller.ts`'s `lookup` method, `BadRequestException` on failure. Service: `lookupUserBodySchema.shape.telegramId.parse(telegramId)` re-validated in `telegram-auth.service.ts`'s `lookupUser` (belt-and-suspenders, matching `upsertTempUser`'s existing pattern). `telegramIdSchema` (`^\d{1,19}$`) rejects non-numeric/oversized input before it reaches Authentik/Directus calls. Bot side: `ApiClient.lookup_telegram_user` sends a `telegram_id: str` sourced from aiogram's own typed `from_user.id` (Telegram-guaranteed integer), not raw user text. |
| INV-5 No cross-schema queries | Applicable | PASS | `lookupUser` makes two independent HTTP calls (`AuthentikClient.getUserByTelegramId`, `DirectusClient.get(...)`) and composes the results in application code — no Drizzle/SQL join across `platform`/`directus`/`authentik`/`twenty`/`listmonk`. Confirmed no Postgres query at all appears in the new code path (grepped `telegram-auth.service.ts` for `.create(`/`.patch(`/`.post(`/`.put(`/`.delete(` — zero matches, and there's no `db.` / `sql\`` usage in this file). |
| INV-6 Rate limiting | Applicable, judged **acceptable risk** | PASS (with rationale) | See dedicated section below. |
| INV-7 CSRF protection | N/A | N/A | Not browser-initiated. `POST /v1/internal/telegram/lookup` is called server-to-server (bot → API) with a shared-secret header, never from a browser context with cookies; there is no session-cookie attack surface for CSRF to exploit. Consistent with every other `/v1/internal/*` route, none of which carry CSRF protection either. |
| INV-8 No `dangerouslySetInnerHTML` | N/A | N/A | No React/JSX in this diff — TypeScript backend service/controller + Python bot code only. Grepped both diffs; zero occurrences, as expected for a non-frontend change. |
| INV-9 No N+1 queries | Applicable | PASS | `lookupUser` makes exactly one Authentik call and, only if that succeeds, exactly one Directus call — both singular, not inside a loop. `findDirectusUserByEmail` uses `limit=1` and `filter[email][_eq]=` (indexed-equality, single-row fetch), not an unbounded scan. Bot's `AuthMiddleware._resolve` calls the API exactly once per update (confirmed by the code summary's own test: `test_auth_middleware.py`'s "exactly-once-per-update call count" case), and `UserCache.get`/`.set` are single-row keyed SQLite lookups, not iterated. |
| INV-10 Drizzle parameterization | N/A | N/A | No Drizzle/raw SQL usage anywhere in the new code path — confirmed above under INV-5. The bot's SQLite queries (`user_cache.py`) use `?`-parameterized placeholders throughout (`WHERE telegram_id = ?`, `VALUES (?, ?)`), not string interpolation, so even though this isn't the Drizzle stack the same parameterization discipline is honored. |
| INV-11 HttpOnly tokens (web) | N/A | N/A | No web/cookie/browser surface in this change. The endpoint is internal-only (shared-secret header, not a session token), and the bot has no cookie storage at all — `INTERNAL_API_TOKEN` lives in bot process env/config (`config.py`, sourced from `.env`, gitignored), not a cookie or `localStorage`. |

---

## INV-6 — Rate limiting: explicit disposition

**Judgment: acceptable risk, not a BLOCKER or MAJOR, given this endpoint's actual
threat model — same as every existing sibling `/v1/internal/*` route.**

Findings:

1. **No existing `/v1/internal/*` route has endpoint-side rate limiting.**
   Read `apps/api/src/modules/internal/internal.controller.ts` and
   `apps/api/src/modules/auth/auth.controller.ts` directly. `@Throttle`/`ThrottlerGuard`
   appear in `auth.controller.ts` **only** on `telegram/exchange` and `register` —
   both genuinely public, unauthenticated, browser-facing endpoints under `v1/auth`.
   None of the shared-secret-gated internal routes carry it:
   `InternalController.sendEmail` (`POST /v1/internal/email`),
   `InternalController.ensureLinkedUser` (`POST /v1/internal/users/ensure-linked`),
   `TelegramInternalController.upsertTempUser` (`POST /v1/internal/telegram/upsert-temp-user`).
   The new `lookup` route matches this existing convention exactly — it does not
   introduce a weaker posture than its siblings, and holding it to a stricter
   standard than `upsert-temp-user` (its direct neighbor, same controller, same
   guard) would be an arbitrary inconsistency, not a principled security bar.
2. **Threat model match.** `security.md`'s rate-limiting section ("All public API
   endpoints are rate-limited... Auth endpoints: stricter") is written for
   endpoints reachable by an anonymous or credential-guessing caller. This route
   requires `x-internal-auth` to already match `INTERNAL_API_TOKEN` via
   `timingSafeEqual` (`internal-auth.guard.ts`) before any application code runs —
   a caller without the token gets `401` before the `lookup` handler is ever
   invoked, identical to every other internal route. The realistic threat is not
   "brute-force the token via this endpoint" (the guard's constant-time compare
   before touching any per-endpoint logic prevents that regardless of downstream
   rate limiting) but "a caller who has *already* obtained a valid
   `INTERNAL_API_TOKEN` enumerates `telegram_id → directusUserId` mappings." That
   threat is bounded by the token's own secrecy (rotated quarterly per
   `security.md` §Secrets management, `.env`-only, never committed) — the same
   trust boundary every sibling internal route already relies on for its own
   PII-adjacent behavior (`ensure-linked` resolves email → `directusUserId`;
   `upsert-temp-user` creates/looks up Authentik users by telegram_id).
3. **Bot-side throttling is real but insufficient on its own, and the impact
   analysis is right to flag it as non-protective against a direct caller** —
   `RateLimitMiddleware` (10 req/min per `telegram_id`) only runs inside the bot
   process and only throttles Telegram-originated traffic; anyone with the shared
   secret can call the endpoint directly, bypassing it entirely. This is accurately
   described in the impact analysis and does not change the INV-6 disposition
   above, since the endpoint's actual defense is the guard, not the bot's
   client-side throttle.
4. **Recommendation, not a blocking requirement**: if/when a second, less-trusted
   internal caller is ever introduced (e.g. a webhook-style integration with a
   token that isn't Viktor-only), revisit this — at that point the "only a caller
   who already has the shared secret" trust argument weakens. For the current
   single-consumer (bot-only) design, no code change is required.

**Disposition: PASS (informational), not a retry-blocking finding.** Documented
here rather than silently skipped per the task's explicit instruction to resolve,
not just note, INV-6.

---

## AC-5 idempotency / no side effects — independently verified

Grepped `apps/api/src/modules/auth/telegram-auth.service.ts` for
`\.create\(|\.patch\(|\.post\(|\.put\(|\.delete\(` — **zero matches in the entire
file**, not just the new code. `lookupUser` calls only
`this.authentik.getUserByTelegramId(telegramId)` (a GET-shaped client method) and
its own private `findDirectusUserByEmail`, which calls only
`this.directus.get<...>(...)`. No write method from either client is reachable on
this path. `upsertTempUser`'s body (the sibling method that *does* write) is
confirmed byte-for-byte unchanged by this diff. AC-5 holds — this is a pure
read/compose endpoint, independently confirmed rather than trusted from the code
summary.

---

## PII exposure assessment

The endpoint returns `{ directusUserId, isTemp, country }` to any caller
presenting a valid `INTERNAL_API_TOKEN`. Per `security.md`'s data classification,
`directusUserId` and `country` fall under **Confidential** (member-identifying,
profiling-adjacent), the same tier as the Telegram IDs and emails already handled
by `upsert-temp-user` and `ensure-linked`. Given:

- The endpoint's sole declared consumer is the bot's own auth middleware
  (single-purpose: resolve its own caller's identity/tenant context for
  in-conversation use), not a bulk-export or admin-reporting surface;
- The response shape is minimal and proportionate to that purpose — no email,
  no name, no Directus row beyond `id`/`country` (confirmed by
  `findDirectusUserByEmail`'s explicit `fields=id,country` projection, which
  avoids over-fetching PII the endpoint doesn't return); and
- Access is gated by the same shared-secret trust boundary as every sibling
  internal route returning comparable data;

this is **proportionate**. No change requested. This mirrors INV-6's reasoning:
the endpoint is exactly as protected, and returns data exactly as sensitive, as
its established siblings — not a new, weaker precedent.

---

## Bot-side checks

**SQLite cache encryption at rest**: `UserCache` stores only
`(telegram_id, directus_user_id, updated_at)` — no token, no email, no name. This
is a strict subset of what `directusUserId` already is (an opaque Confidential-tier
identifier, not a Secret-tier credential per `security.md`'s classification). There
is no comparable local/ephemeral cache elsewhere in this codebase to benchmark
against (the bot is the first non-Postgres persistent store in the stack), but
applying `security.md`'s own tiering directly: encryption-at-rest is explicitly
scoped to "Database disk" and "MinIO bucket" (server-side, Confidential+ data at
rest on shared infrastructure) — a single-process bot's local SQLite holding only
an opaque ID pairing is lower-sensitivity than either. **No encryption-at-rest
requirement for this data at this sensitivity tier.** Acceptable as-is; revisit
only if the cache is ever extended to store email, name, or any Secret-tier value
(it explicitly must not, per FR-BOT-001 §2's "ONLY (telegram_id → directusUserId)"
constraint, which the schema in `user_cache.py` enforces structurally — the table
has no column for anything else).

**Thin-bot guarantee (AC-10) — grepped directly, not trusted from the summary**:
searched `apps/bot/src` for `token|TOKEN|secret|SECRET` (case-insensitive). All
matches are: (a) `config.py`'s three legitimate aliases
(`TELEGRAM_BOT_TOKEN`, `INTERNAL_API_TOKEN`) plus its own docstring naming the
three *forbidden* vars in prose (not a live reference); (b) `main.py`/`api_client.py`
consuming the two legitimate tokens exactly as declared. **Zero occurrences** of
`DIRECTUS_TOKEN`, `AUTHENTIK_API_TOKEN`, or `TWENTY_API_TOKEN` anywhere in `src/`.
Also checked `apps/bot/.env.example` directly: declares only `TELEGRAM_BOT_TOKEN`,
`INTERNAL_API_URL`, `INTERNAL_API_TOKEN`, plus non-secret `BOT_*` overrides — no
forbidden var present, and its own header comment restates the guarantee. AC-10
holds, independently confirmed.

**`.gitignore`/`Dockerfile`**: `.env` is gitignored (`apps/bot/.gitignore` line 9);
`Dockerfile` only `COPY`s `pyproject.toml`, `README.md`, `src` — never `.env` or
any credential file. No secret-baking-into-image risk.

---

### BLOCKER Findings

None.

### MAJOR Findings

None.

---

## Gate Result

```yaml
gate: security-reviewer
workflow: wf-20260731-feat-171
status: passed
timestamp: 2026-07-31T00:00:00Z
summary: >
  Reviewed POST /v1/internal/telegram/lookup (apps/api) and the full bot-side
  scaffold (apps/bot/, submodule commit 1980894c5c6d02edfa3983dc808d8c34a3e156df)
  against the INV-1..INV-11 checklist. INV-3 (auth at controller level) confirmed
  by direct file read: TelegramInternalController's class-level @UseGuards
  (InternalAuthGuard) covers the new `lookup` route with no per-route gap. AC-5
  read-path idempotency independently verified via grep — zero write-method calls
  anywhere in telegram-auth.service.ts. INV-6 (no endpoint-side rate limiting)
  judged an acceptable risk, not a blocker or major: confirmed by direct read
  that no existing /v1/internal/* sibling route (upsert-temp-user,
  ensure-linked, email) has endpoint-side throttling either, so this endpoint
  does not weaken the established precedent; the shared-secret guard (timingSafeEqual
  against INTERNAL_API_TOKEN) is the actual defense, not the bot's own
  client-side rate limiter, and that guard rejects unauthorized callers before
  any lookup logic runs regardless of request volume. INV-2 (secrets by
  reference) confirmed on both sides: no logging in telegram-auth.service.ts at
  all; bot's INTERNAL_API_TOKEN flows only into the x-internal-auth request
  header, never into logger.*() calls, including exception paths (verified
  against httpx's actual exception __str__ behavior in the vendored .venv).
  PII exposure (directusUserId/isTemp/country) judged proportionate given the
  endpoint's single declared consumer and its Confidential (not Secret) data
  tier, same trust boundary as sibling internal routes. Bot-side thin-bot
  guarantee (AC-10) and SQLite cache scope independently re-grepped, not just
  trusted from the code summary — both hold. No BLOCKER or MAJOR findings.
invariants_checked: 11
invariants_na: 5
invariants_pass: 6
blocker_count: 0
major_count: 0
next_agent: quality-gate
```
