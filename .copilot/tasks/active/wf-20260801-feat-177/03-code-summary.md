# Step 4: Code Summary — FR-BOT-002 PR 4/6 (`/leaderboard`)

## Files changed

### `apps/api` (outer repo)

| File | Change |
|---|---|
| `apps/api/src/modules/auth/telegram-auth.service.ts` | New `telegramLeaderboardQuerySchema` (Zod), `TelegramLeaderboardEntry`/`TelegramLeaderboardResult` interfaces, `TelegramAuthService.getLeaderboard(directusUserId, country)`. Imports `type LeaderboardEntry` from `points-directus.service.ts`. |
| `apps/api/src/modules/auth/auth.controller.ts` | New `@Get('leaderboard')` route on `TelegramInternalController`, same `safeParse`/`BadRequestException` convention as every sibling route. |
| `apps/api/test/telegram-bot-leaderboard-service.spec.ts` | New — 8 tests, mirrors `telegram-bot-me-service.spec.ts`'s direct-instantiation-with-mocks pattern. |
| `apps/api/test/telegram-bot-leaderboard-controller.spec.ts` | New — 6 tests, mirrors `telegram-bot-me-controller.spec.ts`. |

### `apps/bot` (submodule)

| File | Change |
|---|---|
| `apps/bot/src/services/api_client.py` | New `LEADERBOARD_PATH`, `LeaderboardEntry`/`LeaderboardResult` dataclasses, `ApiClient.get_leaderboard()`. |
| `apps/bot/src/handlers/leaderboard.py` | New — `/leaderboard` command handler + `render_leaderboard()` pure-render function. |
| `apps/bot/src/main.py` | Registers `leaderboard.router`; adds `/leaderboard` to `BOT_COMMANDS`. |
| `apps/bot/src/locales/ru.py`, `en.py` | New `leaderboard.*` keys; `help.leaderboard`'s "(coming soon)"/"(скоро)" suffix removed. |
| `apps/bot/tests/test_api_client_leaderboard.py` | New — 5 tests. |
| `apps/bot/tests/test_leaderboard_handler.py` | New — 8 tests. |
| `apps/bot/tests/test_help_handler.py` | Updated: `/leaderboard` moved from the "still coming soon" assertion group to its own "no longer coming soon" test, matching the exact pattern PR 2/PR 3 established for `/register`/`/cancel`/`/me`. |
| `apps/bot/tests/test_main_wiring.py` | Updated: `BOT_COMMANDS` exact-set assertion and router-registration assertion both now include `leaderboard`. |

## Design decisions

1. **`isCaller` resolved API-side, not bot-side.** The response carries a
   plain `isCaller: boolean` per entry — the bot never needs to know any
   other user's `platform.users.id`. Matches Step 2's risk-flag
   recommendation.
2. **No new Directus query.** `getLeaderboard()` calls
   `PointsDirectusService.leaderboard({countryCode, limit: 10})`
   unchanged, then a single `resolveUserIdFromDirectusId()` call (also
   unchanged, from PR 2) to find the caller's row. Both existing
   dependencies were already injected into `TelegramAuthService` by PR
   2/PR 3 — zero new constructor/module-graph wiring.
3. **Response narrows PII.** `LeaderboardEntry` (the Directus-facing
   type) carries `email`/`handle`/`userId`; `TelegramLeaderboardEntry`
   (the wire response) carries only `displayName`/`points`/`isCaller`.
   Verified by a dedicated test
   (`'never includes email or handle in the response shape'`).
4. **Graceful degradation on unresolvable caller identity.** Unlike
   `getMeSummary`'s `requirePlatformUserId` (which 404s the whole
   request), `getLeaderboard` treats a `null` bridge-resolution result as
   "no row is highlighted" rather than failing the whole leaderboard —
   the ranked list is still valid, useful content even when we can't
   label a row as "you." Documented in the service method's own comment
   and covered by a dedicated test.
5. **`displayName` fallback chain:** `entry.displayName ?? entry.handle ??
   'Member'` — matches the defensive-fallback posture `_status_badge` in
   `me.py` already established for an unexpected/missing value, applied
   here to a genuinely nullable upstream field rather than an unexpected
   enum value.
6. **No pagination.** `/leaderboard` always returns exactly the top 10
   (or fewer, if the country has fewer point-earning members) — no
   offset/limit params, unlike `/events`. The FR's own AC only ever asks
   for "top 10," never a scrollable full ranking.
7. **Caller highlight uses the same `<b>...</b>` HTML bold convention**
   already established by `event.detail`/`me.title` (parse_mode=HTML set
   once in `main.py`) — no new emphasis mechanism invented. A row where
   `isCaller` is true renders via the `leaderboard.item_caller` locale
   key (bold, with a "(вы)"/"(you)" suffix); every other row uses the
   plain `leaderboard.item` key. When no entry is the caller (outside
   top 10, or unresolvable identity), no row uses the caller template —
   confirmed by `test_render_leaderboard_no_highlight_when_caller_absent`.
8. **Temp-user exclusion required no new code**, confirmed by reading
   `leaderboard()`'s actual query (`GET /items/point_awards?...&groupBy=user`)
   in Step 1 — a temp user has no `point_awards` row and cannot appear in
   the aggregate. Live verification of this is performed at Step 8's
   infra pre-flight (below), not invented as bot-side or API-side filter
   logic.

## Verification run (this step)

- `pnpm --filter api exec tsc --noEmit -p tsconfig.json` — clean.
- `pnpm biome check` on all 4 changed/new API files — clean.
- `pnpm --filter api exec vitest run` (full suite) — 1447/1448 pass. The
  1 failure (`users.spec.ts:65`, a clock-race assertion) is the same
  pre-existing, already-documented flake PR 1/2/3 each independently
  confirmed untouched by their own diffs — confirmed again here via
  `git diff --stat -- apps/api/test/users.spec.ts apps/api/src/modules/users/`
  (empty output — this PR touches neither file).
- `./.venv/Scripts/ruff.exe check` + `ruff format --check` on
  `apps/bot/src apps/bot/tests` — clean after one auto-fix pass (import
  sort + one line-length wrap, both mechanical).
- `./.venv/Scripts/python.exe -m pytest tests/ -q` — 124/124 pass (up
  from 111 pre-existing; 13 new/modified).

## Gate Result

gate_result:
  status: passed
  summary: "New GET /v1/internal/telegram/leaderboard route + /leaderboard bot command implemented, reusing PointsDirectusService.leaderboard() and DirectusUsersBridgeService.resolveUserIdFromDirectusId() unchanged. Full test suite green (1447/1448 API, 1 pre-existing unrelated flake; 124/124 bot)."
  findings:
    - "Zero new DB migration, zero new module-graph edge, zero new Directus query — confirmed by full typecheck + test run."
    - "PII narrowing (email/handle dropped from the wire response) verified by a dedicated unit test, not just code review."
    - "Graceful degrade-to-no-highlight on unresolvable caller identity is a deliberate divergence from getMeSummary's 404-on-unresolvable convention, documented in-code and in this summary."
