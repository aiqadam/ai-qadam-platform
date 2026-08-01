# Step 4 — Security Review: FR-BOT-003 Bot Operator Runtime Commands

**Gate: passed**
**Reviewer:** SecurityReviewer

---

## Invariants checked

### 1. Authentication at controller level ✅
All 7 new `TelegramInternalController` endpoints are decorated with `@UseGuards(InternalAuthGuard)` at the class level — inherited from the class decorator, not individually. Confirmed by reading the class-level `@UseGuards(InternalAuthGuard)` at line 595 of `auth.controller.ts`. No endpoint is reachable without the shared-secret check.

### 2. Tenant isolation (country scoping) ✅
- `/attendance`: `filter[event][country][_eq]=${encodedCountry}` ensures counts are scoped to the caller's country.
- `/operator/checkin`: No country filter on checkin itself (the checkin_code is the auth; country is supplied but unused in the `operatorCheckin` method body — this is intentional: the checkin_code is unguessable and belongs to exactly one registration; the country param is present in the schema for future use). Minor note: the checkin endpoint itself (`POST /v1/checkin/:code`) is already public and unguarded by country — this is pre-existing and documented in `checkin.controller.ts` ("Open by design — the unguessable UUID + physical possession of the QR is the auth").
- `/push-announcement`: `event.country !== country` check before fetching recipients. Cross-country operator calls get a 404.
- `/operator/stats`: `filter[event][country][_eq]` on both queries.

### 3. Input validation at boundaries ✅
Every new endpoint parses its input with Zod before calling the service:
- Event IDs validated as UUIDs (`z.string().uuid()`).
- Country validated against the allowed enum `['uz', 'kz', 'tj', 'xx']`.
- Message body validated `min(1)` and `max(4000)`.
- QR code data validated `min(1)` and `max(500)`.

### 4. No string-built SQL ✅
All Directus queries use URL-encoded parameters (`encodeURIComponent`) with filter syntax, not string concatenation into raw SQL.

### 5. No secrets logged ✅
`pushAnnouncement`'s `logger.warn` logs only `chat_id` (a public Telegram user ID) and error message, not the message content or bot token.

### 6. Bot token handling ✅
`pushAnnouncement` calls `this.getBotToken()` which throws 503 if unconfigured. The token appears only in the fetch URL (TLS), never in logs. The Telegram Bot API URL is constructed with the token inline (standard Bot API usage pattern).

### 7. Rate limiting ✅
New internal endpoints inherit the `ThrottlerModule` global rate limit from the app. They are internal-network-only (protected by `InternalAuthGuard` shared secret), so additional per-endpoint rate limits are not required.

### 8. Role gate in bot handlers ✅
All 4 new operator handlers check `user_context.is_operator()` before any API call. Non-operators and anonymous users receive the access-denied message and no API call is made.

### 9. Pyzbar/Pillow security ✅
- `pyzbar>=0.1.9` — MIT license, no known CVEs as of 2026-08-01 (npm audit equivalent: no vulnerabilities listed on PyPI safety DB).
- `Pillow>=10.0` — actively maintained, MIT license. Latest stable series with security fixes.
- Image bytes are processed in-memory (never written to disk). The `_decode_qr` function wraps both imports in try/except, gracefully degrading if the library is unavailable rather than crashing.

### 10. No PII over-fetch ✅
- `/attendance`: returns only aggregate counts and event title.
- `/operator/checkin`: returns member name (display-only) and event title.
- `/push-announcement`: recipient `telegram_user_id` values are used only as Telegram chat IDs for delivery — never returned to the caller.
- `/operator/stats`: aggregate counts only.

## Findings

**None blocking.** No OWASP Top 10 issues found.

**Minor observation (non-blocking)**: The `/operator/checkin` endpoint does not enforce country scope on the check-in itself. This is consistent with `POST /v1/checkin/:code` (the public check-in endpoint) which is explicitly documented as "Open by design — the unguessable UUID + physical possession of the QR is the auth." The internal operator endpoint wraps the same service method; no change needed.
