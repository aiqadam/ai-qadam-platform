# Step 5: Security Review — FR-BOT-002 PR 4/6 (`/leaderboard`)

## Code Changes Reviewed

- `apps/api/src/modules/auth/telegram-auth.service.ts` (new schema, interfaces, `getLeaderboard` method)
- `apps/api/src/modules/auth/auth.controller.ts` (new `GET /v1/internal/telegram/leaderboard` route)
- `apps/api/test/telegram-bot-leaderboard-service.spec.ts` (new)
- `apps/api/test/telegram-bot-leaderboard-controller.spec.ts` (new)
- `apps/bot/src/services/api_client.py` (new `get_leaderboard` method + dataclasses)
- `apps/bot/src/handlers/leaderboard.py` (new)
- `apps/bot/src/main.py` (router + command registration)
- `apps/bot/src/locales/ru.py`, `en.py` (new locale keys)
- `apps/bot/tests/test_api_client_leaderboard.py`, `test_leaderboard_handler.py` (new)
- `apps/bot/tests/test_help_handler.py`, `test_main_wiring.py` (updated assertions)

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1 Tenant isolation | Yes | Pass | `getLeaderboard` passes `country` straight through to `PointsDirectusService.leaderboard({countryCode: country, ...})`, which applies `filter[country][_eq]` server-side (pre-existing, unchanged). No cross-tenant read path added. |
| INV-2 Secrets by reference | Yes | Pass | No secret literal in the diff. The bot's `x-internal-auth` header value comes from `settings.internal_api_token` (existing config), matching every sibling call — not a new literal. |
| INV-3 Auth at controller level | Yes | Pass | New `leaderboard()` route is declared on `TelegramInternalController`, which carries the class-level `@UseGuards(InternalAuthGuard)` decorator (confirmed at `auth.controller.ts:516`) — inherited automatically, same as `me`/`register`/`events`. Covered by the existing "declared on TelegramInternalController" regression test pattern (mirrored in the new controller spec). |
| INV-4 Validation at boundaries | Yes | Pass | `telegramLeaderboardQuerySchema` (Zod, `directusUserId: uuid`, `country: countrySchema`) is `safeParse`'d before any service call; `BadRequestException` on failure — matches every sibling route exactly. Verified by 3 dedicated "throws BadRequestException without calling the service" tests. |
| INV-5 No cross-schema queries | Yes | Pass | `getLeaderboard` performs no query itself — it calls two existing methods (`PointsDirectusService.leaderboard()`, a Directus-only aggregate; `DirectusUsersBridgeService.resolveUserIdFromDirectusId()`, a Drizzle-only lookup by `directusUserId` FK). Neither is a new cross-schema JOIN; both are pre-existing, unchanged calls this PR does not modify. |
| INV-6 Rate limiting | No | N/A | This is an internal service-to-service route (bot → API over the Docker network), not a public-facing endpoint — same posture as every other `v1/internal/telegram/*` route (none carry `@Throttle`; only the two genuinely public routes in this file, `telegram/exchange` and `register`, do). Consistent with existing precedent, not a new gap. |
| INV-7 CSRF protection | No | N/A | Not a browser-initiated request; internal server-to-server call authenticated via shared-secret header, same as siblings. |
| INV-8 No `dangerouslySetInnerHTML` | Yes | Pass | Zero occurrences — no React/web code in this diff at all. |
| INV-9 No N+1 queries | Yes | Pass | `getLeaderboard` issues exactly 2 calls (`leaderboard()`, `resolveUserIdFromDirectusId()`), run in parallel via `Promise.all` — not inside a loop, not per-entry. The per-entry `.map()` that builds `TelegramLeaderboardEntry[]` is pure in-memory transformation, no I/O per iteration. |
| INV-10 Drizzle parameterization | Yes | Pass | No new raw SQL / `sql\`...\`` usage. `resolveUserIdFromDirectusId` (unchanged, pre-existing) uses Drizzle's query builder (`eq()`), not string interpolation. |
| INV-11 HttpOnly tokens (web) | No | N/A | No cookie/token handling in this diff — bot uses a static shared-secret header, not a cookie. |

## PII review (flagged at Step 2, verified here)

`PointsDirectusService.leaderboard()`'s existing `LeaderboardEntry` type
carries `email`, `displayName`, `handle`, `userId` per row (unchanged,
pre-existing — used elsewhere for the web leaderboard). The new
`TelegramAuthService.getLeaderboard()` maps this down to
`TelegramLeaderboardEntry { displayName, points, isCaller }` — **`email`,
`handle`, and `userId` are dropped before the response leaves the service
boundary**, not filtered at the controller or bot layer. Confirmed by:

1. Direct code read of the `.map()` in `getLeaderboard()` — only 3 fields
   constructed per entry, none of which is `entry.email` or `entry.userId`.
2. A dedicated test, `'never includes email or handle in the response
   shape (PII narrowing)'`, asserting `entry.email`, `entry.handle`, and
   `entry.userId` are all `undefined` on the actual returned object (not
   just a type-level check).

The bot's `render_leaderboard()`/`_render_row()` only ever reads
`entry.display_name` and `entry.points` — no path to print raw email
exists bot-side either, and there would be nothing to print even if the
bot tried, since the API response no longer carries it.

**Result: Pass.** No PII leak beyond `displayName` (already
public-by-design — same field the AC calls a "leaderboard" surface,
consistent with `appear_on_public_leaderboard`'s existing opt-out
semantics, which `leaderboard()` continues to enforce server-side
unchanged).

## Caller-identity comparison review

`isCaller` is computed by direct `===` comparison of
`entry.userId === callerUserId` inside the service, both
`platform.users.id` values resolved server-side — the bot supplies only
its own `directusUserId` (already the established identity signal for
every sibling route) and never receives or transmits another user's
identifier. No new authorization surface: a caller can only ever learn
"is this specific row mine," never any other user's raw id.

## BLOCKER Findings

None.

## MAJOR Findings

None.

## Gate Result

gate_result:
  status: passed
  summary: "No BLOCKER or MAJOR findings. All applicable invariants confirmed (auth via inherited InternalAuthGuard, Zod validation, no cross-schema query, no N+1, no secret literals). PII narrowing (dropping email/handle/userId from the wire response) verified both by code read and by a dedicated regression test."
  findings:
    - "leaderboard() and resolveUserIdFromDirectusId() are both pre-existing, unmodified calls — this PR adds zero new Directus/Drizzle query surface."
    - "INV-6/INV-7/INV-11 are N/A, consistent with every other v1/internal/telegram/* route's existing posture (internal service-to-service, not browser-facing)."
    - "isCaller comparison is resolved entirely server-side; the bot never receives or needs another user's identifier."
