# Step 2: Impact Analysis — FR-BOT-002 PR 4/6 (`/leaderboard`)

## Validated Requirement

FR-BOT-002 PR 4/6: `GET /v1/internal/telegram/leaderboard` (new API route)
+ `/leaderboard` bot command. Top 10 members for the caller's country,
temp users structurally excluded (no `point_awards` row), caller's own
row highlighted only if present in the top 10. See
`01-requirement-validation.md` for full detail.

## Affected Layers

### API (`apps/api/src/modules/`)

| File | Change |
|---|---|
| `apps/api/src/modules/auth/telegram-auth.service.ts` | New `leaderboardQuerySchema` (Zod), new `TelegramLeaderboardResult`/`TelegramLeaderboardEntry` interfaces, new `getLeaderboard(directusUserId, country)` method on `TelegramAuthService`. |
| `apps/api/src/modules/auth/auth.controller.ts` | New `@Get('leaderboard')` handler on `TelegramInternalController`, same `safeParse` + `BadRequestException` convention as every sibling route. |

No new module. `TelegramAuthService` already has `PointsDirectusService`
and `DirectusUsersBridgeService` injected (both used by `/me`'s
`getMeSummary`) — this method reuses both, no constructor/module-graph
change, no new `forwardRef` edge.

### DB Changes Required: **no**

No new table, column, or constraint. `PointsDirectusService.leaderboard()`
and `DirectusUsersBridgeService.resolveUserIdFromDirectusId()` are both
pre-existing and called unchanged. `point_awards` and `directus_users`
schemas are untouched.

### Shared Types (`packages/shared-types/`)

Not used by this codebase's established convention — every prior
`v1/internal/telegram/*` route defines its Zod schema and result
interface inline in `telegram-auth.service.ts` (confirmed: `packages/shared-types`
is an empty, unused placeholder per `auth.controller.ts`'s own header
comment). This PR follows the same convention — no shared-types change.

### Frontend (`apps/web` / `apps/web-next`)

None. This PR is bot + internal-API only.

### Bot (`apps/bot/`, submodule)

| File | Change |
|---|---|
| `apps/bot/src/services/api_client.py` | New `LEADERBOARD_PATH`, `LeaderboardEntry`/`LeaderboardResult` dataclasses, new `get_leaderboard()` method — same shape as `get_me_summary()`. |
| `apps/bot/src/handlers/leaderboard.py` (new) | New `/leaderboard` command handler, `render_leaderboard()` pure-render function (mirrors `render_me`'s testable-pure-function pattern). |
| `apps/bot/src/keyboards/` | None needed — `/leaderboard` is a static top-10 list, no pagination/buttons per the FR (unlike `/events`). |
| `apps/bot/src/main.py` | Register `leaderboard.router`; add `BotCommand("leaderboard", ...)` to `BOT_COMMANDS` (argument-less, like `/me`). |
| `apps/bot/src/locales/ru.py`, `en.py` | New `leaderboard.*` keys; `help.leaderboard`'s "(скоро)/(coming soon)" suffix removed now that the command ships. |

### Workers (`apps/workers/`)

None.

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| `/v1/internal/telegram/leaderboard` | GET | New route | No — additive |

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| `TelegramInternalController.leaderboard()` | `TelegramAuthService.getLeaderboard()` | Direct method call (existing controller→service pattern) |
| `TelegramAuthService.getLeaderboard()` | `PointsDirectusService.leaderboard()` | Existing injected provider (already used by `getMeSummary`'s sibling total; here reused for the ranked list) |
| `TelegramAuthService.getLeaderboard()` | `DirectusUsersBridgeService.resolveUserIdFromDirectusId()` | Existing injected provider (same reverse lookup PR 2 built and PR 3 did not need) |
| `apps/bot` `handlers/leaderboard.py` | `ApiClient.get_leaderboard()` | New method, same `httpx` + `x-internal-auth` header pattern as every sibling call |

## Risk Flags

### Security Review Required

- **PII exposure in a country-scoped leaderboard.** `leaderboard()`
  already returns `email`/`displayName`/`handle` per entry (existing
  `LeaderboardEntry` interface, unchanged by this PR). The bot must only
  render `displayName` (falling back to a safe default, never raw email)
  — matching what a public/semi-public leaderboard surface should show.
  This is not a new risk introduced by this PR (the underlying service
  already returns this shape to the web leaderboard consumer), but the
  bot-side render function is new code and SecurityReviewer should
  confirm it does not print `entry.email` into a Telegram message.
- **`appear_on_public_leaderboard` opt-out must still be honored.**
  Confirmed: `leaderboard()`'s own query already applies this filter
  server-side — no bot-side re-implementation risk since the bot never
  sees excluded rows in the first place.
- **Caller-highlight comparison must not leak.** Comparing
  `entry.userId === callerPlatformUserId` server-side (API) rather than
  bot-side is the safer design — the bot never needs to know any other
  user's `platform.users.id` to render the highlight; the API can attach
  an `isCaller: boolean` per entry before the response leaves the
  service boundary. Confirms this PR's planned response shape.

### Architecture Rule Risks

None identified. No cross-schema query, no tenant-isolation risk beyond
what `leaderboard()`'s existing `filter[country][_eq]` already enforces,
no new module boundary crossed.

## Test Scope

- **Unit (API):** `telegram-auth.service.spec.ts` (or equivalent) —
  `getLeaderboard()` correctly maps `leaderboard()`'s entries, sets
  `isCaller` for the matching row and `false` otherwise, returns an
  unmarked list when the caller isn't present, handles a caller with no
  resolvable platform user id (falls back to no highlight rather than
  throwing — matches `requirePlatformUserId`'s existing 404 precedent
  used by register/cancel, but `/leaderboard` should degrade gracefully
  rather than 404 the whole leaderboard for an unresolvable identity,
  since the leaderboard itself is still valid content even if we can't
  say which row is "you" — this is a specific implementation decision
  CodeDeveloper should make and document).
- **Integration (API, Testcontainers):** extend
  `apps/api/test/points-directus.spec.ts` conventions if a new
  Directus-facing method is added — but per Step 1's design, no NEW
  `PointsDirectusService` method is needed (`leaderboard()` is reused
  unchanged), so this is likely unnecessary; `telegram-auth.service`
  level tests (mocked collaborators) should suffice, matching PR 2/3's
  own precedent (both PRs' new logic lived in `TelegramAuthService`, not
  in a Directus-facing service, and were tested at that level).
- **Bot (pytest, mocked `httpx.MockTransport`):** `test_leaderboard_handler.py`
  — empty-country-leaderboard state, top-10 render, caller-highlighted
  row, caller-absent-from-top-10 (no highlight, no extra rank line per
  the AC-literal decision), API-unavailable retry message, temp-user
  path is implicitly covered by the API-level exclusion (bot has no
  separate temp-user-filtering code to test — nothing to assert there
  beyond "temp users never appear," which is an API/live-verification
  concern, not a bot unit-test concern).
- **Live verification (Orchestrator, Step 8 infra pre-flight):** seed one
  temp user + one full user with `point_awards` rows in the same
  country, call the new endpoint directly, confirm only the full user's
  row appears — the concrete proof the task instructions require for the
  temp-exclusion AC.

## Gate Result

gate_result:
  status: passed
  summary: "Impact is fully scoped: one new API route reusing two existing services unchanged, one new bot handler + api_client method, no DB migration, no shared-types change, no module-graph edge change."
  findings:
    - "TelegramAuthService already has both PointsDirectusService and DirectusUsersBridgeService injected (from PR 2/PR 3) — this PR adds zero new constructor dependencies."
    - "PII (email) is present in leaderboard()'s existing response shape; SecurityReviewer must confirm the bot's render function never prints raw email, only displayName."
    - "isCaller comparison belongs API-side (server compares platform.users.id), not bot-side, so the bot never needs another user's identity to render the highlight."
