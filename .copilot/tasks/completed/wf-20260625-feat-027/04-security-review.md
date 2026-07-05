# 04 — Security Review
**Workflow:** wf-20260625-feat-027
**Agent:** SecurityReviewer
**Date:** 2026-06-25 (revised — re-review after MAJ-1 fix)

---

## Code Changes Reviewed

All five changed files were read in full before writing this review.

| # | File | Status |
|---|------|--------|
| 1 | `apps/api/src/modules/auth/telegram-auth.service.ts` | Reviewed |
| 2 | `apps/api/src/modules/auth/auth.controller.ts` | Reviewed (re-read for MAJ-1 verification) |
| 3 | `apps/api/src/modules/auth/auth.module.ts` | Reviewed |
| 4 | `apps/api/src/modules/admin-invites/authentik.client.ts` | Reviewed |
| 5 | `apps/api/src/config/env.ts` | Reviewed |

Supporting files read for context:

- `apps/api/src/modules/internal/internal-auth.guard.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/lib/observe-throttler.guard.ts`
- `apps/api/src/modules/registrations/registration-checkin.controller.ts` (reference pattern)
- `docs/04-development/security/security.md`
- `.copilot/tasks/active/wf-20260625-feat-027/02-impact-analysis.md`
- `.copilot/tasks/active/wf-20260625-feat-027/03-code-summary.md`

---

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|-----------|-----------|--------|-------|
| INV-1 Tenant isolation | No | N/A | No platform DB queries; all Authentik access is via REST API. The telegram endpoints have no countryCode concept. |
| INV-2 Secrets by reference | Yes | PASS | `TELEGRAM_BOT_TOKEN` flows only into `createHash().update()` and `createHmac()`; no logging path touches it. `AUTHENTIK_ADMIN_TOKEN` in `AuthentikClient.request()` appears only in an `Authorization` header, never in logs (the warn log records `method`, `path`, and response status/body only). No literals. |
| INV-3 Auth at controller level | Yes | PASS | `TelegramInternalController` has `@UseGuards(InternalAuthGuard)` at the class level, covering all routes. `telegramExchange` is intentionally public (Login Widget design); it compensates with HMAC verification inside the service and `@UseGuards(ThrottlerGuard)` + `@Throttle` at the method level. |
| INV-4 Validation at boundaries | Yes | PASS | Both controller methods receive `body: unknown` and call `schema.safeParse(body)`, throwing `BadRequestException` on failure before any service call. Service additionally calls `telegramIdSchema.parse(telegramId)` as a belt-and-suspenders guard in `upsertTempUser`. |
| INV-5 No cross-schema queries | No | N/A | No Postgres queries at all in this diff. |
| INV-6 Rate limiting | Yes | PASS | `@UseGuards(ThrottlerGuard)` + `@Throttle({ default: { limit: 5, ttl: 900_000 } })` is applied to `telegramExchange`. The 15-minute window matches security.md §"Rate limiting": 5 req/15 min for auth endpoints. The `TelegramInternalController` is service-to-service and correctly carries no IP rate limit. |
| INV-7 CSRF protection | Yes | PASS | `telegramExchange` accepts a JSON body from a widget form post; it performs HMAC verification before any state change, which is a stronger form of CSRF protection than a standard CSRF token. The internal endpoint is protected by `X-Internal-Auth` (custom header scheme), which is CSRF-resistant by construction. No cookie-based state is written. |
| INV-8 No `dangerouslySetInnerHTML` | No | N/A | No frontend code changed. |
| INV-9 No N+1 queries | Yes | PASS | `exchangeWidgetPayload` makes sequential Authentik API calls (look up by telegram_id → look up by email → create → recovery link). Each is a single request; there are no loops with unbounded API calls. `upsertTempUser` is the same pattern. |
| INV-10 Drizzle parameterization | No | N/A | No Drizzle queries in this diff. |
| INV-11 HttpOnly tokens (web) | No | N/A | No new cookies written. The 302 response sends a one-time URL in `Location`, not in a cookie. |

---

## Task-Specific Security Checks (from FR-AUTH-002 focus areas)

These go beyond the standard INV invariants and address the security-critical items
called out in the task brief and impact analysis.

### 1. HMAC Key Derivation

`telegram-auth.service.ts` lines 89–91:

```ts
private deriveHmacKey(botToken: string): Buffer {
  return createHash('sha256').update(botToken).digest();
}
```

This is **correct**. The HMAC key is `SHA256(BOT_TOKEN)` returned as a raw Buffer (not
a hex string). The key is then passed directly to `createHmac('sha256', key)` at line
116. This matches the Telegram Login Widget specification exactly. Using the raw token
string as the HMAC key (the wrong approach) would silently produce different MACs —
the derivation isolation in `deriveHmacKey` makes this easy to audit.

**Result: PASS**

### 2. `auth_date` Freshness Window

`telegram-auth.service.ts` lines 129–132:

```ts
const nowSeconds = Math.floor(Date.now() / 1000);
if (nowSeconds - payload.auth_date > AUTH_DATE_MAX_AGE_SECONDS) {
  throw new UnauthorizedException('telegram_auth_date_expired');
}
```

Server clock is used (`Date.now()`), not the client-supplied `auth_date`. The
`auth_date` value participates in the HMAC verification before the freshness check,
so a tampered `auth_date` (e.g. a future timestamp to extend the window) would fail
HMAC first. The constant `AUTH_DATE_MAX_AGE_SECONDS = 300` is documented and named.

The code summary notes a discrepancy: the impact analysis acceptance criterion
specifies 86 400 s (24 h) while the implementation uses 300 s. This review confirms
300 s is the **more secure choice** and recommends keeping it. The AC in the
requirement doc appears to have copied the default Telegram recommendation verbatim
(24 h is their max); 5 minutes is tighter and appropriate for a server-side flow
where the browser posts the widget payload immediately. The constant is named so
updating it requires a single-line change. Leaving at 300 s.

**Result: PASS**

### 3. Timing-Safe HMAC Comparison

`telegram-auth.service.ts` lines 119–126:

```ts
const expectedBuf = Buffer.from(expected, 'hex');
const providedBuf = Buffer.from(payload.hash, 'hex');
if (
  expectedBuf.length !== providedBuf.length ||
  !timingSafeEqual(expectedBuf, providedBuf)
) {
  throw new UnauthorizedException('telegram_hmac_invalid');
}
```

Both sides are decoded to Buffers before comparison. The length guard precedes
`timingSafeEqual` (required because `timingSafeEqual` throws if lengths differ).
`sha256` output is always 32 bytes on both sides (expected is from `createHmac`
which always produces 32 bytes; provided is validated by the Zod regex
`/^[0-9a-f]{64}$/` which enforces exactly 64 hex chars = 32 bytes). The length check
is therefore belt-and-suspenders. Both are correct.

**Result: PASS**

### 4. `TELEGRAM_BOT_TOKEN` in Logs or Error Messages

Searched all error throw sites and log statements in `telegram-auth.service.ts`:

- `ServiceUnavailableException('telegram_not_configured')` — no token value.
- `UnauthorizedException('telegram_hmac_invalid')` — no token value.
- `UnauthorizedException('telegram_auth_date_expired')` — no token value.
- `getBotToken()` returns the token to the calling method only; never passed to a logger.
- `env.TELEGRAM_BOT_TOKEN` is referenced in `env.ts` in a comment only
  (`// The HMAC key is derived as SHA256(TELEGRAM_BOT_TOKEN)`); the comment mentions
  the var name, not its value.
- `AuthentikClient.request()` logs `method`, `path`, and the first 200 chars of the
  response body — does not log Authorization headers.

**Result: PASS**

### 5. `InternalAuthGuard` on the Upsert Endpoint

`auth.controller.ts` lines 413–416:

```ts
@Controller('v1/internal/telegram')
@UseGuards(InternalAuthGuard)
export class TelegramInternalController {
```

The guard is placed at the class level, not the method level. This means every route
defined in `TelegramInternalController` inherits it — including any future routes
added to this controller. The `InternalAuthGuard` itself (`internal-auth.guard.ts`)
uses timing-safe comparison of the `X-Internal-Auth` header against
`env.INTERNAL_API_TOKEN` (min 32 chars). Implementation is correct.

**Result: PASS**

### 6. Rate Limiting on Public Exchange Endpoint

`auth.controller.ts` lines 366–369:

```ts
@Post('telegram/exchange')
@HttpCode(HttpStatus.FOUND)
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 5, ttl: 900_000 } })
```

The `@UseGuards(ThrottlerGuard)` applies the vanilla (enforcing) ThrottlerGuard,
while the global `ObserveThrottlerGuard` (observe-mode, non-enforcing by default) is
registered as `APP_GUARD`. This is the same pattern used in
`registration-checkin.controller.ts`. The local `ThrottlerGuard` takes precedence
for this route and enforces immediately regardless of `RATE_LIMIT_ENFORCE`, which is
the correct and intentional design for auth endpoints.

**MAJ-1 RESOLVED:** The TTL is now `900_000` ms (15 minutes), matching the
security.md §"Rate limiting" requirement of 5 req / 15 min for auth endpoints.
Previously `60_000` ms (1 min). Fix confirmed on line 368.

**Result: PASS**

### 7. Zod Validation on All Controller Inputs

Both controller methods receive `body: unknown` and apply `schema.safeParse`:

- `telegramExchange` → `telegramWidgetPayloadSchema.safeParse(body)` (line 374)
- `upsertTempUser` → `upsertTempUserBodySchema.safeParse(body)` (line 424)

Both throw `BadRequestException(parsed.error.flatten())` on failure. No service call
is made on parse failure. All schema fields have appropriate constraints
(regex on `id`, min/max on strings, `.email()` on email, `.url()` on photo_url).

**Result: PASS**

### 8. `Cache-Control: no-store` on the Recovery Link Redirect

`auth.controller.ts` lines 379–380:

```ts
res.setHeader('Cache-Control', 'no-store');
res.redirect(HttpStatus.FOUND, recoveryUrl);
```

The header is explicitly set before the redirect. The `no-store` directive prevents
browsers, CDNs, and intermediary proxies from caching the one-time recovery URL.
`no-store` is stronger than `no-cache` (which would still allow storage for
revalidation). This is the correct directive for a single-use bearer URL.

**Result: PASS**

### 9. `telegramId` Validated as Numeric String

The Zod schema at `telegram-auth.service.ts` line 35:

```ts
const telegramIdSchema = z.string().regex(/^\d{1,19}$/, 'telegramId must be a numeric string');
```

This accepts 1–19 digit strings (covering the full Telegram user ID range up to
~9.2 × 10^18, which is bigint-safe as a string). Non-numeric characters, empty
strings, and values longer than 19 digits are all rejected. The synthetic email
`tg${telegramId}@telegram.local` built from a validated numeric ID is safe —
no injection risk in the Authentik REST API body, and the email domain is hardcoded.

**Result: PASS**

### 10. No Secret Values Committed to Code

Searched the diff for literals that could be secrets:

- `env.TELEGRAM_BOT_TOKEN` is loaded from `process.env` via Zod-validated `env.ts`.
- `TELEGRAM_BOT_TOKEN: z.string().min(20).optional()` in `env.ts` declares the schema
  with no default value.
- No hard-coded token, password, or API key in any changed file.

**Result: PASS**

---

## Findings by Severity

### BLOCKER Findings

**None.**

All ten security-critical areas from the task brief pass. HMAC key derivation,
timing-safe comparison, freshness check, secret handling, guard placement, Zod
validation, and Cache-Control are all correctly implemented.

---

### MAJOR Findings

**None.**

**~~MAJ-1 — Rate limit TTL is 60 s (1 min), not 900 s (15 min) as required by AC-10~~
RESOLVED:** `@Throttle({ default: { limit: 5, ttl: 900_000 } })` confirmed at
`apps/api/src/modules/auth/auth.controller.ts` line 368. Fix applied by CodeDeveloper
and verified by this re-review.

---

### MINOR Findings (downgraded to INFO — do not block gate)

**INFO-4 — `photo_url` field accepted from widget payload but not used**

`telegramWidgetPayloadSchema` includes `photo_url: z.string().url().optional()`. The
field is included in the `data_check_string` (because `buildDataCheckString` iterates
all fields except `hash`), which is correct — omitting it would break HMAC
verification if Telegram includes it. However, no code currently reads
`payload.photo_url`. This is not a security risk.

**Recommendation (non-blocking):** Add a comment to the field noting it is included
for HMAC completeness but not stored, so future callers do not assume it is persisted
or forwarded.

---

**INFO-5 — `email` field in widget payload is dead code in practice**

`telegramWidgetPayloadSchema` validates `email: z.string().email().optional()`.
Telegram no longer sends `email` in Login Widget payloads (removed from Telegram's
docs around 2023). The field must remain in the schema for HMAC correctness (it
participates in `buildDataCheckString` if present). This is not a security risk.

**Recommendation (non-blocking):** Add a comment noting Telegram no longer sends
`email` in widget payloads; the field is retained for HMAC completeness and
forward-compatibility.

---

### INFO Findings (carried forward from initial review)

**INFO-1 — `auth_date` checked after HMAC rather than before**

In `verifyWidgetHash`, HMAC verification runs first (lines 118–126), and freshness
check runs second (lines 129–132). An alternative order would check freshness first
to fail cheaply before doing HMAC work. However, the current order is actually more
secure: it prevents an attacker from using timing differences in freshness rejection
to probe the HMAC without incurring the full crypto cost on every try. The current
order is correct. No change needed.

**INFO-2 — Double `ThrottlerGuard` on the exchange endpoint**

The global `ObserveThrottlerGuard` (`APP_GUARD`) and the per-method
`@UseGuards(ThrottlerGuard)` are both active on `telegramExchange`. In
`@nestjs/throttler`, multiple guards with the same route context each run their
own quota check using the `@Throttle` metadata. The per-method `ThrottlerGuard`
applies the 5-req/900 s limit; the global guard applies the 60-req/60 s limit (in
observe mode by default). The per-method limit is always tighter, so the global
observe-mode guard will never trigger before the per-method enforcer does. No action
needed; the layering is correct.

**INFO-3 — Recovery link is a one-use bearer URL with no explicit TTL check**

Authentik's recovery link TTL is configured on the Authentik side (typically 30 min).
The API does not check or surface this TTL. If Authentik is slow (e.g., returning an
already-used or expired recovery link), the browser will follow the 302 to Authentik
and receive an error there. This is the correct architecture — the API's job is to
mint and redirect; Authentik's job is to enforce the link's validity. No change
needed, but the integration test (deferred to the next PR) should verify Authentik's
error response flow.

---

## Gate Result

```yaml
gate_result:
  agent: security-reviewer
  workflow_instance_id: wf-20260625-feat-027
  step: 4
  status: passed
  summary: >
    Re-review confirms MAJ-1 is resolved: @Throttle TTL on POST /v1/auth/telegram/exchange
    is now 900_000 ms (15 min / 5 req), matching security.md §Rate limiting requirement
    for auth endpoints. No BLOCKER or MAJOR findings. All ten task-specific
    security-critical areas pass: HMAC key derivation correct (SHA256 Buffer),
    timing-safe comparison correct, auth_date freshness uses server clock, BOT_TOKEN
    never in logs, InternalAuthGuard at class level, Zod validation on all inputs,
    Cache-Control no-store on redirect, telegramId numeric regex valid,
    no secrets in code. Two prior MINOR findings (photo_url comment, email dead code)
    downgraded to INFO — non-blocking documentation suggestions only.
  findings:
    - severity: MAJOR
      id: MAJ-1
      status: RESOLVED
      file: apps/api/src/modules/auth/auth.controller.ts
      line: 368
      description: >
        @Throttle TTL changed from 60_000 ms (1 min) to 900_000 ms (15 min), matching
        security.md §Rate limiting: 5 req/15 min for auth endpoints. Verified on re-read.
    - severity: INFO
      id: INFO-4
      file: apps/api/src/modules/auth/telegram-auth.service.ts
      description: >
        photo_url field included for HMAC completeness but not stored. Add comment to
        clarify intent. Non-blocking.
    - severity: INFO
      id: INFO-5
      file: apps/api/src/modules/auth/telegram-auth.service.ts
      description: >
        email field in widget schema is dead code (Telegram no longer sends it) but
        must remain for HMAC correctness. Add comment noting this. Non-blocking.
  invariants_checked: [INV-1, INV-2, INV-3, INV-4, INV-5, INV-6, INV-7, INV-8, INV-9, INV-10, INV-11]
  invariants_failed: []
```
