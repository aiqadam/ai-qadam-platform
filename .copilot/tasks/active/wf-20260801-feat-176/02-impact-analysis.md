# Step 2 — Impact Analysis

**Workflow:** wf-20260801-feat-176

## DB Changes Required: no

No schema/entity changes. Every data source this PR reads already exists:
`registrations` (Directus), `point_awards` (Directus), `platform.users`
(Drizzle, via the existing bridge). Step 3 (DBMigrationAuthor) is skipped.

## Files to modify

### `apps/api/` (new)

1. **`apps/api/src/modules/points/points-directus.service.ts`** — add
   `totalForUser(directusUserId: string, countryCode: string):
   Promise<number>`. Same `/items/point_awards` aggregate endpoint as
   `leaderboard()`, filtered by `filter[user][_eq]` instead of grouped —
   returns a single sum, defaulting to 0 when the user has no
   `point_awards` rows (Directus aggregate returns an empty array in that
   case, same as `leaderboard()`'s own empty-aggregates short-circuit).

2. **`apps/api/src/modules/auth/telegram-auth.service.ts`** — add:
   - `getMeBodySchema`/`meQuerySchema` (Zod, mirrors
     `eventDetailQuerySchema`'s style: `directusUserId: z.string().uuid()`,
     `country: countrySchema`).
   - `TelegramMeResult` interface: `{ registrations:
     TelegramMeRegistration[]; pointsTotal: number }` where
     `TelegramMeRegistration` mirrors `MineResponse`'s per-row shape in
     `registrations.controller.ts` (id, status, event summary) — same
     projection, camelCase on the wire, nothing new invented.
   - `getMeSummary(directusUserId, country): Promise<TelegramMeResult>` —
     resolves `directusUserId` to platform `userId` via
     `directusBridge.resolveUserIdFromDirectusId()` (same helper PR 2
     already uses in `registerViaTelegram`/`cancelViaTelegram`), then
     calls `this.registrations.listMine({ userId, countryCode })` and
     `this.points.totalForUser(directusUserId, countryCode)` in
     parallel (`Promise.all`), and maps the result. 404s
     (`telegram_user_not_found`) if the bridge lookup misses, same
     convention as `requirePlatformUserId`.
   - Constructor gains `private readonly points: PointsDirectusService`
     — new dependency. `PointsDirectusService` lives in `PointsModule`;
     need to confirm whether `AuthModule` already imports it or needs a
     new `forwardRef`-style edge (see Risk Flag #1 below).

3. **`apps/api/src/modules/auth/auth.controller.ts`** — add `GET
   /v1/internal/telegram/me` on `TelegramInternalController`, matching
   the file's exact convention (Zod `safeParse` on `@Query()`,
   `BadRequestException` on failure, delegate to the service method,
   `@HttpCode(HttpStatus.OK)`).

### `apps/api/` module wiring

4. **`apps/api/src/modules/auth/auth.module.ts`** — likely needs
   `PointsModule` imported (possibly via `forwardRef` if a cycle exists,
   mirroring the `RegistrationsModule` wiring PR 2 already did). Must
   verify live via `pnpm --filter api dev` boot trace per PR 2's own
   documented lesson ("Nest's module graph is runtime-resolved" — not
   caught by typecheck alone). This is the main open risk of this PR
   (see Risk Flag #1).

### `apps/bot/` (submodule)

5. **`apps/bot/src/services/api_client.py`** — add `ME_PATH =
   "/v1/internal/telegram/me"`, `MeRegistration`/`MeSummary` dataclasses
   (frozen, slots — matching every existing dataclass in this file), and
   `async def get_me_summary(self, *, directus_user_id: str, country:
   str) -> MeSummary` following the exact request/error-mapping shape of
   `get_event_detail`/`list_events` (GET with `x-internal-auth` header,
   `ApiUnavailableError` on non-200, `TelegramUserNotFoundError`-style
   404 mapping is not needed here since the bot only calls this once
   `user_context.is_known` is already true).

6. **`apps/bot/src/handlers/me.py`** (new file) — `/me` command handler.
   Guards: `user_context is None or not is_known or directus_user_id is
   None` -> `event.unavailable`-style message (matches `cancel.py`'s
   guard shape exactly); `country is None` -> `events.unavailable`-style
   message (matches `event_detail.py`'s `_do_register` guard). On
   success: renders registrations with status badges + Cancel buttons,
   points total, temp-account nudge, generic link-to-web CTA line.

7. **`apps/bot/src/keyboards/me.py`** (new file) — one Cancel button per
   registration row, callback data `f"{ME_CANCEL_PREFIX}:{event_id}"`
   (mirrors `EVENT_REGISTER_PREFIX`'s pattern in `keyboards/events.py`).
   Cancel callback handler lives in `handlers/me.py` (reuses
   `api_client.cancel_registration`, same call `cancel.py`'s command
   handler already makes — no new API method needed for cancellation
   itself, only the trigger surface is new).

8. **`apps/bot/src/locales/ru.py`, `apps/bot/src/locales/en.py`** — new
   `me.*` keys: title, per-registration-status badge labels
   (`me.status_registered`, `me.status_waitlisted`, `me.status_attended`),
   empty-state, points line, temp-account nudge, link CTA, cancel button
   label, cancel confirmation reuse (existing `cancel.confirmed` /
   `cancel.not_registered` keys are reused, not duplicated). Also update
   `help.me` (drop the "(скоро)"/"(coming soon)" suffix now that `/me` is
   real, matching PR 2's precedent of updating `help.register`/
   `help.cancel` when those commands shipped — confirmed by re-reading
   `help.py`'s current locale strings, which still say "скоро" for `/me`
   from PR 1).

9. **`apps/bot/src/main.py`** — register `me.router` in
   `build_dispatcher` (before `fallback.router`, after the other command
   routers, same ordering rule the module docstring already states) and
   add `/me` to `BOT_COMMANDS` (it's an argument-less command, unlike
   `/event`/`/register`/`/cancel` — belongs in BotFather's menu).

### `apps/bot/tests/` (new)

10. `test_me_command.py` — handler-level tests (usage/guard cases +
    success rendering), mirroring `test_register_command.py`'s
    structure exactly (mock transport, `make_message_update`,
    `mock_answer`).
11. `test_api_client_me.py` — client-level tests mirroring
    `test_api_client_register.py`'s structure (status codes, error
    mapping, body shape).

### `docs/03-requirements/FR-BOT-002.md`

12. Implementation-progress table: mark PR 3/6 shipped, document the
    streak/link-CTA decisions inline (Step 9, DocWriter).

## Reuse vs. new logic

| Concern | Verdict |
|---|---|
| Registration listing | 100% reuse (`listMine`) |
| Registration status badges | New (bot-side rendering only — no new API field) |
| Points total | One new thin service method, reuses `leaderboard()`'s aggregate primitive |
| Streak | Not built (documented gap) |
| Account type | 100% reuse (already on `UserContext`) |
| Link-to-web CTA | New static copy only, no new data source |
| Cancel-from-/me | 100% reuse of PR 2's `cancel_registration` API call; only new UI trigger (button vs. command) |

No duplicated business logic anywhere in this plan — matches PR 1/PR 2's
established pattern of thin proxying to existing Directus-flow-owned
services.

## Risk Flags

**Risk Flag #1 — Module wiring for `PointsDirectusService` into
`AuthModule`.** PR 2 hit exactly this class of issue wiring
`RegistrationsDirectusService` into `AuthModule` (4 `forwardRef()` edges
needed, found only via live boot trace, not typecheck). `PointsModule`
may or may not already sit in a cycle with `AuthModule` — CodeDeveloper
must verify via `pnpm --filter api dev` before considering Step 4 done,
per PR 2's own documented lesson. If a cycle exists, apply the same
`forwardRef()` pattern PR 2 already established (Nest requires
`@Inject(forwardRef(...))` on the constructor parameter, not just the
module edge, per PR 2's specific finding about
`UnknownDependenciesException`).

**Risk Flag #2 — Directus aggregate response shape for a single-user
filter.** `leaderboard()`'s aggregate query returns an array grouped by
`user`; `totalForUser`'s ungrouped single-user filter must be verified
live to confirm Directus still returns the same
`{ user, sum: { points: string } }` row shape for exactly one row (not a
bare `{ sum: { points } }` without the `user` key, which would still work
for `totalForUser`'s purposes since the filter already pins the user,
but must be confirmed rather than assumed — same "verify live, don't
assume Directus shape" discipline `registerViaTelegram`'s own comment
about the 403-vs-404 surprise (`ISS-BOT-REG-001`) already established
for this codebase).

**Risk Flag #3 — Empty-aggregate edge case.** A user with zero
`point_awards` rows must resolve to `pointsTotal: 0`, not a crash or
`NaN` — `leaderboard()`'s own `if (aggregates.length === 0) return [];`
guard is the precedent to mirror (return 0 directly, don't index into an
empty array).

## Gate Result

gate_result:
  status: passed
  summary: "No DB changes. 12 files to touch (2 new API files touched, 1 new API route, 2 new bot files, 2 locale files, 1 dispatcher wire-up, 2 new test files, 1 doc update). All reuse except one new thin PointsDirectusService method and new bot-side rendering. Two live-verification risk flags carried into Step 4/Step 8 (module wiring, Directus aggregate shape) — same class of surprise PR 2 already hit and documented a fix pattern for."
  findings:
    - "DB Changes Required: no — Step 3 (DBMigrationAuthor) skipped, proceed to Step 4."
    - "Risk Flag #1: PointsModule <-> AuthModule wiring must be verified live (pnpm --filter api dev), same class of issue PR 2 hit with RegistrationsModule."
    - "Risk Flag #2: Directus aggregate row shape for a single-user (non-grouped) filter must be confirmed live, not assumed from leaderboard()'s grouped-query shape."
    - "Risk Flag #3: zero-points user must resolve to 0, not crash — mirror leaderboard()'s empty-aggregates guard."
