# Step 4 — Code Summary

## Files changed (apps/api)

| File | Change |
|---|---|
| `apps/api/src/modules/points/points-directus.service.ts` | Added `totalForUser(directusUserId, countryCode): Promise<number>` — single-user variant of `leaderboard()`'s own `/items/point_awards` aggregate query, scoped by `filter[user][_eq]` instead of grouped. Returns 0 (not a throw, not NaN) when no rows exist or `sum.points` is null. |
| `apps/api/src/modules/auth/telegram-auth.service.ts` | Added `telegramMeQuerySchema` (Zod), `TelegramMeResult`/`TelegramMeRegistration`/`TelegramMeRegistrationEvent` interfaces, `getMeSummary(directusUserId, country)`. Resolves platform `userId` via the existing `directusBridge.resolveUserIdFromDirectusId()` (PR 2), then calls `registrations.listMine()` and `points.totalForUser()` in parallel (`Promise.all`). Constructor gains `points: PointsDirectusService` (no `forwardRef` needed — see module-wiring note below). |
| `apps/api/src/modules/auth/auth.controller.ts` | Added `GET /v1/internal/telegram/me` on `TelegramInternalController`, matching the file's existing Zod-`safeParse`-then-delegate convention. |
| `apps/api/src/modules/auth/auth.module.ts` | Imports `PointsModule` (plain import, not `forwardRef` — `PointsModule` only imports `DirectusModule`, no cycle back to `AuthModule`; confirmed by reading `points.module.ts` and by a live `pnpm --filter api dev` boot trace showing `Nest application successfully started` with the new route mapped). |

## Files changed (apps/bot, submodule)

| File | Change |
|---|---|
| `src/services/api_client.py` | Added `ME_PATH`, `MeRegistrationEvent`/`MeRegistration`/`MeSummary` dataclasses, `get_me_summary()`. |
| `src/handlers/me.py` (new) | `/me` command handler + Cancel-button callback (`handle_me_cancel_callback`), reusing `cancel_registration` — no new cancel logic, only a new trigger surface (button vs. `/cancel <N>` command). |
| `src/keyboards/me.py` (new) | `me_registrations_keyboard()` — one Cancel button per active registration row. Fulfils `event_detail.py`'s own PR-1-era comment: "a Cancel button here is deferred to PR 3's /me registration list." |
| `src/locales/ru.py`, `src/locales/en.py` | New `me.*` keys (title, per-status badges, empty state, points line, temp-account nudge, link CTA, cancel button label). `help.me` "coming soon" suffix dropped now that `/me` is real (same treatment PR 2 gave `help.register`/`help.cancel`). |
| `src/main.py` | Registers `me.router` in `build_dispatcher` (after `cancel.router`, before `fallback.router`). Adds `/me` to `BOT_COMMANDS` (argument-less, belongs in BotFather's menu unlike `/event`/`/register`/`/cancel`). |
| `tests/test_help_handler.py`, `tests/test_main_wiring.py` | Updated pre-existing assertions that encoded "`/me` still unimplemented" / "`BOT_COMMANDS` has 3 entries" — same maintenance PR 2 already did for `/register`/`/cancel`. |
| `tests/test_api_client_me.py` (new), `tests/test_me_command.py` (new) | See `06-test-design.md`. |

## Key design decisions

1. **Streak omitted, not fabricated.** No streak concept exists anywhere
   in this codebase. Documented in `01-requirement-validation.md` finding
   3 and enforced by a regression test
   (`test_render_me_never_mentions_streak`) so a future PR can't
   accidentally reintroduce a placeholder value without a deliberate,
   reviewed decision.
2. **Account type needs zero new API surface.** `user_context.is_temp` is
   already attached by the bot's own `AuthMiddleware` on every update.
   `/me` reads it directly, same pattern `cancel.py` uses for
   `user_context.directus_user_id`/`.country`.
3. **Link-to-web CTA is static, not computed.** The only "linked" concept
   in this repo (`directus_users.telegram_user_id`, ADR-0033) belongs to
   the old, superseded `apps/api/src/modules/telegram/` module — a
   different auth surface with no relationship to this bot's
   Authentik-attribute-based identity model (ADR-0034). `/me` shows a
   generic, always-present CTA line pointing at `/upgrade` (PR 6/6's
   scope) rather than compute a boolean from unrelated data.
4. **`totalForUser` reuses `leaderboard()`'s aggregate primitive.** No new
   points-calculation business rule — only a narrower Directus filter
   (single user instead of grouped top-N).
5. **Directus single-user aggregate row has no `user` key** — confirmed
   live (curl against the local stack): `{"data":[{"sum":{"points":"125"}}]}`,
   not `{"data":[{"user":..., "sum":...}]}`. `totalForUser`'s
   implementation and its regression test both encode this correctly.

## Live verification (Step 4, ahead of Step 13)

Ran `pnpm --filter api dev` against the local Docker stack
(`aiqadam-postgres`, `aiqadam-directus`, already up) and curled the new
endpoint directly against real Directus data:

- `GET /v1/internal/telegram/me` for a directus user NOT bridged to
  `platform.users` -> `404 {"error":"telegram_user_not_found"}` (correct
  guard).
- `GET /v1/internal/telegram/me` for `uat-member@example.com`
  (bridged, `directus_user_id=bb110099-c215-433b-8930-81e7f4dab21a`,
  country=uz) -> `200 {"registrations":[],"pointsTotal":135}`. The empty
  `registrations` array is correct — this fixture user's only
  registrations are `status=cancelled`, filtered out server-side by
  `listMine`'s own `filter[status][_neq]=cancelled`. `pointsTotal: 135`
  matches a real, non-zero `point_awards` aggregate for this user/country.
- Same user, `country=kz` (no `kz` point_awards rows) -> `pointsTotal: 0`,
  no crash — confirms the empty-aggregate edge case.
- Zod validation: malformed `directusUserId` -> `400`; missing
  `x-internal-auth` header -> `401` (guard enforced).

## Gate Result

gate_result:
  status: passed
  summary: "GET /v1/internal/telegram/me implemented end-to-end (API + bot), verified live against the real local stack with real Directus data, all reuse except one new thin PointsDirectusService method. Module wiring (PointsModule -> AuthModule) confirmed to need no forwardRef via a live boot trace."
  findings: []
