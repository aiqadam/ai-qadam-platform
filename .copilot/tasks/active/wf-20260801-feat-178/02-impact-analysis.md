# 02 — Impact Analysis: FR-BOT-002 PR 5/6 — `/interests`

## Validated Requirement

**FR-BOT-002, PR 5/6 — `/interests` command.** The bot exposes a
member-facing `/interests` command that lets a member view and toggle
their topic interests as inline-keyboard buttons, reusing the existing
`member_interests` Directus collection and `MeProfileService` the web
`/me/profile` cabinet already uses (F-S3.6b, ADR-0033 cabinet #5;
`BP-UAT-003` AC-3). Two new `InternalAuthGuard`-protected routes on
`TelegramInternalController` (`GET .../interests`, `POST
.../interests/toggle`), a new bridge method
(`resolveUserAndEmailFromDirectusId`), a `forwardRef(MeProfileModule)`
wiring fix in `AuthModule`, and a full bot-side surface (handler,
keyboard, api_client methods, locale updates, command registration). 11
draft ACs. Full spec: `01-requirement-validation.md` (read in full for
this analysis).

## Affected Layers

### API (NestJS)

| File | Module | Change |
|---|---|---|
| `apps/api/src/modules/auth/auth.controller.ts` | AuthModule | Add `GET /v1/internal/telegram/interests` and `POST /v1/internal/telegram/interests/toggle` handlers to `TelegramInternalController` (existing class, same file as `AuthController`, both registered by `AuthModule`) |
| `apps/api/src/modules/auth/telegram-auth.service.ts` | AuthModule | Add `INTEREST_TOPICS` constant (duplicated 7-slug list, independently owned per point 3 of the requirement doc — NOT imported from `TelegramEventTopicsService`), `interestsQuerySchema`/`toggleInterestBodySchema` Zod schemas (`topic: z.enum([...slugs])`), `getInterests()`/`toggleInterest()` service methods, constructor gains `@Inject(forwardRef(() => MeProfileService)) private readonly meProfile: MeProfileService` |
| `apps/api/src/modules/auth/auth.module.ts` | AuthModule | Add `forwardRef(() => MeProfileModule)` to `imports` array (currently: `UsersModule, DirectusModule, LeadsModule, AuthentikModule, InteractionsModule, PointsModule, forwardRef(() => RegistrationsModule)`) |
| `apps/api/src/modules/directus/directus-users-bridge.service.ts` | DirectusModule | Add `resolveUserAndEmailFromDirectusId(directusUserId): Promise<{userId: string; email: string} | null>` — new method, mirrors `resolveUserIdFromDirectusId` (lines 221-228) with an added `email` projection |
| `apps/api/src/modules/me-profile/me-profile.module.ts` | — | **No change** — `MeProfileService` already exported (`exports: [MeProfileService]`, line 11) |
| `apps/api/src/modules/me-profile/me-profile.service.ts` | — | **No change** — `listInterests`/`addInterest`/`removeInterest` (lines 352-393) are called as-is; toggle composition logic lives in `TelegramAuthService`, not here |

### DB Changes Required: **no**

Confirmed explicitly by reading `me-profile.service.ts` directly:
`member_interests` (topic_tag + intent columns) already exists and is
fully read/written by `MeProfileService.listInterests`/`addInterest`/
`removeInterest`. No new table, column, or constraint. **DBMigrationAuthor
(Step 3) should be skipped for this workflow.**

### Shared Types

No change. This codebase's established convention (per
`auth.controller.ts`'s own comment at line ~63) is inline Zod schemas per
endpoint, not `packages/shared-types/` — matches every prior FEAT-BOT-2
PR.

### Frontend (`apps/web/`)

No change. Out of scope — the web `/me/profile` cabinet's own interests
UI (F-S3.6b) already exists and is untouched by this PR.

### Bot (`apps/bot/`)

| File | Change |
|---|---|
| `apps/bot/src/handlers/interests.py` | **New file.** `/interests` command handler + toggle callback handler, following `handlers/events.py`'s `handle_events_page_callback` in-place-edit pattern (`callback.message.edit_text(...)`, not a new message) |
| `apps/bot/src/keyboards/interests.py` | **New file.** One button per topic, `[x]`/`[ ]` bracket-marker prefix per selected state; short callback-data prefix (new constant, e.g. `INTEREST_TOGGLE_PREFIX`) |
| `apps/bot/src/services/api_client.py` | Add `INTERESTS_PATH = "/v1/internal/telegram/interests"` constant, `InterestsResult`/`InterestsEntry`(-equivalent) dataclasses mirroring `{selected, available}`, `get_interests()` and `toggle_interest()` methods following `get_leaderboard`'s exact request/error-handling shape |
| `apps/bot/src/locales/ru.py` | Drop `" (скоро)"` suffix on `help.interests` (currently line 20: `"/interests — мои темы интересов (скоро)"`); add `interests.title`, `interests.empty`, `interests.unavailable`, per-topic label keys, toggle button copy |
| `apps/bot/src/locales/en.py` | Drop `" (coming soon)"` suffix on `help.interests` (currently line 19); same new keys as `ru.py` |
| `apps/bot/src/main.py` | Add `BotCommand(command="interests", ...)` to `BOT_COMMANDS` tuple (currently 5 entries, lines 41-47); import `interests` handler module (line 19's import list); register `interests.router` in `build_dispatcher()` before `fallback.router` (line 78) |

### Workers (`apps/workers/`)

No change. Not touched by this requirement.

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| `/v1/internal/telegram/interests` | GET | New. Query: `{directusUserId: uuid}`. Returns `{selected: string[], available: string[]}` | No — net-new route |
| `/v1/internal/telegram/interests/toggle` | POST | New. Body: `{directusUserId: uuid, topic: <enum of 7 fixed slugs>}`. Returns same `{selected, available}` shape post-toggle | No — net-new route |

No existing routes are modified. No changes to `upsert-temp-user`,
`lookup`, `events`, `events/:id`, `register`, `me`, or `leaderboard`.

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| `TelegramInternalController.getInterests` (new) | `TelegramAuthService.getInterests` (new) | Direct method call, same module (existing constructor injection, no new edge) |
| `TelegramInternalController.toggleInterests` (new) | `TelegramAuthService.toggleInterest` (new) | Direct method call, same module |
| `TelegramAuthService` (new methods) | `DirectusUsersBridgeService.resolveUserAndEmailFromDirectusId` (new method) | Existing constructor-injected `directusBridge` (no new provider edge — `DirectusUsersBridgeService` is already injected into `TelegramAuthService`; only the *method* is new) |
| `TelegramAuthService` (new methods) | `MeProfileService.listInterests` / `.addInterest` / `.removeInterest` (existing, unchanged) | **New** `@Inject(forwardRef(() => MeProfileService))` constructor param — requires the module-wiring fix below |
| `AuthModule` | `forwardRef(() => MeProfileModule)` | **New** module import edge — `MeProfileModule` already imports `AuthModule` (`me-profile.module.ts:8`), so this is a new cycle edge requiring `forwardRef` on the `AuthModule` side (matches the existing `RegistrationsModule` precedent at `auth.module.ts:45`, not `PointsModule`'s no-forwardRef precedent) |

**Full cycle after this change:** `AuthModule → forwardRef(MeProfileModule) → AuthModule`
(new edge, forwardRef'd on the `AuthModule` side) — structurally identical
in shape to the existing `AuthModule → forwardRef(RegistrationsModule) →
AuthModule` edge already live in the same file. Both `RegistrationsModule`
and `MeProfileModule` independently import `AuthModule` without their own
forwardRef (per the established precedent: only the side that introduces
the *new* edge wraps it — `AuthModule`'s own import here is the new edge
in both cases).

## Risk Flags

### Security Review Required: yes (standard — every new external-facing route)

- Both new routes are `InternalAuthGuard`-protected + Zod-validated,
  matching every existing `TelegramInternalController` route exactly — no
  new auth pattern introduced.
- `topic` is validated via `z.enum([...fixedSlugs])` at the controller
  boundary — an out-of-list value is rejected as 400 before it ever
  reaches `MeProfileService.addInterest`, which would otherwise accept
  arbitrary free text into `topic_tag` (the underlying Directus column has
  no enum constraint). This is a deliberate narrowing, not a gap — flag
  for SecurityReviewer to confirm the enum validation is enforced
  *before* any write path, not just at the OpenAPI/doc layer.
- No PII exposure change — `{selected, available}` are bare topic slugs,
  no email/displayName/handle in either response shape.

### Architecture Rule Risk #1 — Circular-dependency edge (flagging explicitly per task brief)

`AuthModule` importing `MeProfileModule` via `forwardRef` introduces a
**second, independent** `AuthModule ↔ X ↔ AuthModule` cycle in the module
graph, on top of the already-live `AuthModule ↔ RegistrationsModule`
cycle. Both are individually well-precedented (`RegistrationsModule` is
the exact structural twin: it already imports `AuthModule` for
`AuthGuard`, forcing the same forwardRef treatment on `AuthModule`'s
side). **However:**

- This is now the **third** module `AuthModule` forward-refs into (after
  `RegistrationsModule`; `PointsModule` needed no forwardRef).
  `TelegramModule`'s own header comment already documents a *fourth*,
  previously-reverted cycle attempt (`AuthModule → InteractionsModule →
  TelegramModule → AuthModule`) — this codebase's `AuthModule` is
  accumulating cycle edges as a structural pattern, not an exception. Not
  a blocker, but CodeDeveloper/SecurityReviewer should verify Nest's
  module resolution still initializes cleanly with three live forwardRef
  edges (not just two) — the `@Inject(forwardRef(() => MeProfileService))`
  constructor requirement (per `telegram-auth.service.ts`'s own comment on
  `RegistrationsDirectusService`, lines 301-310) is easy to forget and
  fails at **runtime** (`UnknownDependenciesException`), not at
  compile/lint time — CodeDeveloper must add it, and TestDesigner should
  ensure a unit test actually instantiates the module (or at minimum
  imports the controller/service pair) so a missing `forwardRef` on
  either the module or the `@Inject` fails CI rather than surfacing only
  in a live pre-flight check.
- Confirm no other module in the `MeProfileModule` import chain
  (`DirectusModule`) independently pulls in `AuthModule` a second way —
  not expected, but worth a quick grep before merge given the graph is
  getting dense around `AuthModule`.

### Architecture Rule Risk #2 — `intent='learn'` scope-narrowing correctness (flagging per task brief — this is a correctness risk, not a style choice)

The requirement doc (point 7, and AC-7) documents a deliberate decision:
bot toggle-off removes **only** the `'learn'`-intent row for a topic,
leaving other-intent rows (e.g. `mentor`, created via the web
`/me/profile` cabinet) untouched. This is the right design intent, but it
depends entirely on **exact, correct implementation** of the compose
logic in `TelegramAuthService`, which has no native "toggle" method to
lean on — `MeProfileService.addInterest`/`removeInterest` operate on a
specific `(topic_tag, intent)` pair or a specific `interestId`
respectively, so the new toggle logic must:

1. Call `listInterests` and correctly determine "any row for this topic
   exists" for the **selected/unselected button state** (any intent
   counts).
2. On toggle-off, correctly filter down to **only** the row(s) where
   `intent === 'learn'` before calling `removeInterest(interestId)` —
   `removeInterest` takes a single `interestId`, so if more than one
   `learn`-intent row somehow exists for the same topic (shouldn't happen
   given `addInterest`'s own dedup, but the toggle path is new code that
   must not assume this invariant blindly), the logic needs a defined
   behavior (remove all matching `learn` rows, not just the first found by
   array order).
3. **Not** remove a `mentor`/`practice`/`discuss`-intent row under any
   toggle-off path — a single off-by-one in the filter predicate (e.g.
   filtering by topic only, forgetting the intent condition) would
   silently delete web-authored data, which is exactly what AC-7 exists to
   catch.

This is architecturally sound (no schema/module issue) but is a **real
correctness risk in new business logic with no existing test coverage to
lean on** — SecurityReviewer and CodeDeveloper should treat AC-7 as the
load-bearing test, not an edge-case afterthought, and TestDesigner should
write the mixed-intent scenario (topic with both `learn` and `mentor` rows
present, toggle off, assert exactly one row remains) as a first-class unit
test, not just to satisfy AC-3/AC-4's simpler add/remove path.

### No other architecture-rule risks identified

- Tenancy: confirmed no `country_code` on `member_interests` — consistent
  with `architecture.md`'s documented "some data is global... no
  country_code" exception (§Multi-tenancy implementation, point 5). No
  `country` param needed on either new route — this is a legitimate
  difference from every other FEAT-BOT-2 route, not an omission.
  SecurityReviewer/CodeDeveloper should not "fix" this by adding a
  `country` param that doesn't exist in the data model.
- No cross-schema query — proxies through `MeProfileService` →
  `DirectusClient`, same HTTP-proxy pattern as every other Directus-backed
  bot route in this sequence.
- No new stack dependency, no deviation from the established
  `Zod-at-controller-boundary` + `InternalAuthGuard` convention.

## Test Scope

This is a two-repo change (TypeScript API + Python bot). Both layers need
new tests; **no Testcontainers/integration-DB work is needed** — confirmed
against how PR 2-4 scoped their own test layers: `telegram-bot-leaderboard-controller.spec.ts`
/ `telegram-bot-leaderboard-service.spec.ts` (PR 4) and their PR 2/PR 3
analogues (`telegram-register-*`, `telegram-bot-me-*`) are all
Vitest **unit** specs with mocked `DirectusClient`/service dependencies —
none of them stand up a real Postgres/Directus container, because every
FEAT-BOT-2 route proxies through an existing Directus-backed service via
HTTP, not a new direct DB access pattern. This PR follows the identical
shape (proxy through `MeProfileService` → `DirectusClient`), so the same
scoping applies.

### apps/api (Vitest, unit only)

- **New:** `apps/api/test/telegram-bot-interests-controller.spec.ts`
  (naming precedent: `telegram-bot-leaderboard-controller.spec.ts`) —
  covers `TelegramInternalController.getInterests`/`toggleInterests`:
  Zod validation (400 on bad `directusUserId`/unknown `topic` enum value —
  AC-11), `InternalAuthGuard` rejection (AC-10, likely covered by the
  guard's own existing spec `telegram-auth-guard.spec.ts` plus a
  route-specific assertion here), happy-path delegation to the service.
- **New:** `apps/api/test/telegram-bot-interests-service.spec.ts`
  (naming precedent: `telegram-bot-leaderboard-service.spec.ts`) —
  covers `TelegramAuthService.getInterests`/`toggleInterest`: bridge
  resolution success/miss (404 `telegram_user_not_found`), toggle-on
  (no existing row → `addInterest` called with `intent='learn'`),
  toggle-off single-intent (existing `learn` row → `removeInterest`
  called), **and the AC-7 mixed-intent scenario** (existing `learn` +
  `mentor` rows for the same topic → toggle-off removes only the `learn`
  row, `mentor` row untouched in the mocked `MeProfileService` calls) —
  this is the single most important test given Risk Flag #2 above.
- **Modified:** `apps/api/test/telegram-auth-service.spec.ts` or
  equivalent — if the constructor signature change
  (`@Inject(forwardRef(() => MeProfileService))`) breaks existing
  instantiation in other `TelegramAuthService` specs, those test setups
  need a `MeProfileService` mock added. Grep all `new TelegramAuthService(`
  / testing-module constructions before merge.
- **New/modified:** a bridge-service spec covering
  `resolveUserAndEmailFromDirectusId` (hit/miss), likely appended to
  whatever existing spec covers `directus-users-bridge.service.ts` (search
  for its current test file — not confirmed to exist by name in this
  pass; CodeDeveloper/TestDesigner should locate or create it).
- **Module-graph smoke check:** at least one spec (could be the new
  controller spec, via Nest `Test.createTestingModule`) should actually
  compile `AuthModule` (or at minimum instantiate
  `TelegramInternalController` + `TelegramAuthService` through Nest DI,
  not just `new`) so a missing `forwardRef` fails CI — see Risk Flag #1.

### apps/bot (pytest, unit only)

- **New:** `apps/bot/tests/test_interests_handler.py` (naming precedent:
  `test_leaderboard_handler.py`) — covers the `/interests` command
  handler (render selected/unselected buttons, AC-1/AC-2), the toggle
  callback handler (in-place `edit_text` re-render, AC-3/AC-4), and the
  `ApiUnavailableError` → `interests.unavailable` path (AC-5).
- **New:** a keyboard-construction test (either inline in the handler
  test file or a dedicated `test_interests_keyboard.py`, following
  whichever convention `keyboards/events.py`'s own test coverage uses) —
  covers the `[x]`/`[ ]` bracket-marker rendering per selected state and
  the 64-byte `callback_data` limit (AC-6).
- **Modified:** `apps/bot/tests/` — an `api_client` test file (locate the
  existing convention, likely alongside `get_leaderboard`'s own test
  coverage) gains cases for `get_interests()`/`toggle_interest()` — status
  code handling, response-shape mapping, `ApiUnavailableError` on non-2xx.
- **Modified:** any test asserting the full `BOT_COMMANDS` tuple contents
  or count (if one exists) needs updating for the new `/interests` entry.
- **Modified:** any test asserting `help.interests` string content
  literally (if one exists) needs updating for the dropped "(coming
  soon)"/"(скоро)" suffix (AC-8).

### E2E (Playwright)

Not applicable — this PR has no web-facing surface. No Playwright changes.

### Confirmed assumption

PR 2 (`register`/`cancel`) and PR 4 (`leaderboard`) both scoped identically:
Vitest unit specs on the API side (controller + service, mocked Directus/
bridge/points dependencies) and pytest unit specs on the bot side
(handler + api_client), with zero Testcontainers usage anywhere in the
FEAT-BOT-2 sequence so far. This PR's proxy-through-existing-service shape
is not a new DB access pattern, so the same unit-only scope applies here
too — no deviation from precedent.

## Gate Result

gate_result:
  status: passed
  summary: "Impact is fully scoped: two new internal routes proxying through the existing MeProfileService (no new DB pattern), one module-wiring forwardRef fix with proven precedent, one new bridge method, and a full bot-side surface — DB Changes Required: no."
  findings:
    - "DB Changes Required: NO — confirmed by reading me-profile.service.ts directly; member_interests already exists and listInterests/addInterest/removeInterest cover it fully. DBMigrationAuthor (Step 3) should be skipped."
    - "Cross-module calls confirmed: TelegramInternalController -> TelegramAuthService -> MeProfileService (new, via @Inject(forwardRef(() => MeProfileService))), TelegramAuthService -> DirectusUsersBridgeService.resolveUserAndEmailFromDirectusId (new method), and AuthModule -> forwardRef(() => MeProfileModule) (new module-wiring edge, MeProfileService already exported so no me-profile.module.ts change needed)."
    - "Risk flag — circular dependency: this is AuthModule's THIRD forwardRef'd cycle edge (after RegistrationsModule; PointsModule needed none), on top of a fourth, previously-reverted cycle documented in telegram.module.ts's own header comment. Individually proven-safe but the graph around AuthModule is getting dense — CodeDeveloper must remember the @Inject(forwardRef(...)) constructor annotation (a missing one fails at RUNTIME via UnknownDependenciesException, not at compile time, per telegram-auth-service.ts's own comment on the RegistrationsDirectusService precedent), and at least one test should instantiate the module/controller pair through Nest DI so this fails CI rather than only a live pre-flight check."
    - "Risk flag — intent='learn' toggle-off correctness (not a style choice): the new toggle-off logic must filter removeInterest calls to ONLY the learn-intent row for a topic, never mass-deleting other-intent rows (e.g. web-authored 'mentor') sharing the same topic_tag. This is new compose logic in TelegramAuthService with no existing test coverage to lean on. AC-7 is the load-bearing test for this — TestDesigner must implement the mixed-intent scenario (topic with both learn and mentor rows, toggle off, assert only the learn row is removed) as a first-class case, not an edge-case afterthought."
    - "Test scope confirmed against PR 2/PR 4 precedent: apps/api unit specs only (Vitest, mocked Directus/bridge/MeProfileService — new telegram-bot-interests-controller.spec.ts / telegram-bot-interests-service.spec.ts following the telegram-bot-leaderboard-* naming convention) and apps/bot unit specs only (pytest, mocked httpx — new test_interests_handler.py following test_leaderboard_handler.py). No Testcontainers/integration-DB layer needed anywhere in this sequence; this PR's proxy-through-MeProfileService shape is not a new DB access pattern, matching every prior FEAT-BOT-2 PR's own scoping."
    - "No architecture-rule violations: no cross-schema query, no new stack dependency, no shared-types change (inline Zod per this codebase's established convention), tenancy correctly excluded (member_interests has no country_code column — confirmed against architecture.md §Multi-tenancy point 5's documented 'some data is global' exception, consistent with every MemberInterest interface carrying no country field)."
