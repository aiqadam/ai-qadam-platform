# Step 7 — Test Design

## New test files

| File | Covers |
|---|---|
| `apps/api/test/telegram-bot-me-service.spec.ts` | `TelegramAuthService.getMeSummary`: bridge resolution + parallel `listMine`/`totalForUser` fetch, empty-activity case, 404 on unresolved bridge (no downstream calls made), Promise.all-not-sequential ordering check. |
| `apps/api/test/telegram-bot-me-controller.spec.ts` | `TelegramInternalController.me`: delegates parsed query to the service, 400 on invalid/missing fields, propagates `NotFoundException` unchanged, guard-presence smoke check. |
| `apps/api/test/points-directus.spec.ts` (extended) | `PointsDirectusService.totalForUser`: happy path (confirms no `groupBy`, confirms `filter[user]`+`filter[country]` both present), zero-rows -> 0, null-sum row -> 0. |
| `apps/bot/tests/test_api_client_me.py` | `ApiClient.get_me_summary`: request shape (method/path/query/header), full response parsing (multiple registrations + points), `ApiUnavailableError` on 500 and network error. |
| `apps/bot/tests/test_me_command.py` | `/me` handler: 3 guard/error cases (no context, no country, API down), empty-state rendering, multi-registration badge rendering (AC), temp-vs-full nudge branching, link-CTA-always-present, streak-never-rendered regression, Cancel-button callback (confirm/not_registered/missing-context). |

## Naming collision avoided

`apps/api/test/telegram-me-service.spec.ts` already exists — it covers
the OLD, superseded `apps/api/src/modules/telegram/telegram-me.service.ts`
(a different module, different auth surface, per ADR-0034's 2026-07-31
update). New files use a `telegram-bot-me-*` prefix to avoid any
ambiguity between the two `/me`-shaped surfaces in this codebase.

## Updated pre-existing tests

| File | Change |
|---|---|
| `apps/bot/tests/test_help_handler.py` | Split the old combined "`/me`+leaderboard+interests+upgrade all say coming-soon" assertion: `/me` now gets its own "no longer coming-soon" test (mirrors PR 2's treatment of `/register`/`/cancel`); the remaining three (`/leaderboard`, `/interests`, `/upgrade`) keep the coming-soon assertion. |
| `apps/bot/tests/test_main_wiring.py` | `BOT_COMMANDS` now expected to include `me`; dispatcher router-set assertion now includes `"me"`. |

## Gate Result

gate_result:
  status: passed
  summary: "5 new/extended test files (2 API service/controller pairs + 1 extended points-directus + 2 bot), 2 pre-existing test files updated for the now-shipped /me. Naming collision with the pre-existing legacy telegram-me-service.spec.ts identified and avoided with a distinct prefix."
  findings: []
