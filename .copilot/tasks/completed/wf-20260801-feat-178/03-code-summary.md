# 03 — Code Summary: FR-BOT-002 PR 5/6 — `/interests`

## Requirement Implemented

`/interests` command: the bot shows a member's current topic interests as
`[x]`/`[ ]` inline-keyboard toggle buttons; tapping a topic adds or removes
it, re-rendering the message in place. Two new `InternalAuthGuard`-protected
routes (`GET /v1/internal/telegram/interests`, `POST
/v1/internal/telegram/interests/toggle`) proxy through the existing
`MeProfileService` (the same service/collection the web `/me/profile`
cabinet already uses — no new DB pattern, no new write path). Toggle-off
removes only the bot-created `'learn'`-intent row for a topic, never
touching web-authored rows under a different intent (AC-7) — the
documented scope decision from `01-requirement-validation.md` point 7.

All 11 draft ACs from the requirement-validation doc are covered by tests
(see Files Changed below).

## Files Changed

| File | Change Type | Description |
|---|---|---|
| `apps/api/src/modules/directus/directus-users-bridge.service.ts` | Modified | Added `resolveUserAndEmailFromDirectusId(directusUserId): Promise<{userId, email} \| null>`, mirroring `resolveUserIdFromDirectusId` with an added `email` projection |
| `apps/api/src/modules/auth/auth.module.ts` | Modified | Added `forwardRef(() => MeProfileModule)` to `imports` |
| `apps/api/src/modules/me-profile/me-profile.module.ts` | Modified (unplanned, required) | Wrapped this module's own `AuthModule` import in `forwardRef(() => AuthModule)` — see Key Design Decisions |
| `apps/api/src/modules/auth/telegram-auth.service.ts` | Modified | Added `INTEREST_TOPICS` constant (7 duplicated slugs), `interestsQuerySchema`/`toggleInterestBodySchema` Zod schemas, `TelegramInterestsResult` interface, constructor gained `@Inject(forwardRef(() => MeProfileService)) meProfile`, added `getInterests()`, `toggleInterest()`, `requirePlatformUserAndEmail()`, `toInterestsResult()` |
| `apps/api/src/modules/auth/auth.controller.ts` | Modified | Added `GET interests` and `POST interests/toggle` handlers to `TelegramInternalController` |
| `apps/api/test/telegram-bot-interests-controller.spec.ts` | New | Controller-level Zod validation, guard presence, delegation tests |
| `apps/api/test/telegram-bot-interests-service.spec.ts` | New | Service-level tests incl. AC-7 mixed-intent load-bearing test |
| `apps/api/test/directus-users-bridge.spec.ts` | Modified | Added `resolveUserAndEmailFromDirectusId` hit/miss cases |
| `apps/bot/src/services/api_client.py` | Modified | Added `INTERESTS_PATH`/`INTERESTS_TOGGLE_PATH` constants, `InterestsResult` dataclass, `get_interests()`/`toggle_interest()` methods |
| `apps/bot/src/keyboards/interests.py` | New | Toggle keyboard: `[x]`/`[ ]` bracket markers, `INTEREST_TOGGLE_PREFIX` callback prefix, fixed topic order |
| `apps/bot/src/handlers/interests.py` | New | `/interests` command handler + toggle callback handler (in-place `edit_text`, matching `events.py` precedent) |
| `apps/bot/src/locales/ru.py` | Modified | Dropped `" (скоро)"` on `help.interests`; added `interests.title`/`interests.unavailable`/7 `interests.topic.<slug>` keys |
| `apps/bot/src/locales/en.py` | Modified | Dropped `" (coming soon)"` on `help.interests`; same new keys |
| `apps/bot/src/main.py` | Modified | Added `interests` import, `BotCommand(command="interests", ...)`, registered `interests.router` before `fallback.router` |
| `apps/bot/tests/test_api_client_interests.py` | New | `get_interests`/`toggle_interest` request-shape and error-mapping tests |
| `apps/bot/tests/test_interests_handler.py` | New | Guard, render, toggle-callback (in-place edit), AC-6 callback-data-length, AC-5 unavailable-on-both-surfaces tests |
| `apps/bot/tests/test_help_handler.py` | Modified | Moved `help.interests` from "still coming soon" to its own "no longer marks as coming soon" test |
| `apps/bot/tests/test_main_wiring.py` | Modified | `BOT_COMMANDS` set and router-name assertions now include `"interests"` |

## Key Design Decisions

1. **`MeProfileModule` needed `forwardRef` on its own `AuthModule` import
   too — not just `AuthModule`'s new edge.** The requirement-validation doc
   (point 5) predicted, by analogy with `RegistrationsModule`, that only the
   side introducing the new edge (`AuthModule`) would need `forwardRef`,
   with `MeProfileModule`'s existing plain `AuthModule` import left
   untouched. A full-suite run (`main-bootstrap.spec.ts`, which boots the
   real Nest app) proved this wrong: `UndefinedModuleException` at
   `MeProfileModule` `imports[1]`. Root cause, confirmed by reading
   `registrations.module.ts`'s own header comment describing the *identical*
   failure it hit for the `RegistrationsModule` edge: Nest's scanner reaches
   `AuthModule` via a second, pre-existing path
   (`AuthModule -> LeadsModule -> InteractionsModule -> TelegramModule ->
   AuthModule`) before it reaches the new module's own forwardRef-wrapped
   import — so the *other* side's plain import resolves to `undefined` at
   that point in the scan. Fix: `me-profile.module.ts` now wraps its
   `AuthModule` import in `forwardRef(() => AuthModule)` too. Both
   `auth.module.ts` and `me-profile.module.ts` carry updated comments
   documenting this, cross-referencing `registrations.module.ts`'s original
   discovery of the same failure mode. This is exactly the kind of gap
   `02-impact-analysis.md` Risk Flag #1 anticipated ("CodeDeveloper must
   remember... at least one test should instantiate the module... so this
   fails CI rather than only a live pre-flight check") — the existing
   `main-bootstrap.spec.ts` caught it as intended.

2. **`toggleInterest` calls `getInterests` again at the end** rather than
   computing the post-toggle delta locally, per the task brief's explicit
   "your call, but document it" — chose correctness/single-source-of-truth
   over the extra round trip, matching the requirement doc's own
   recommendation.

3. **Toggle-off removes ALL `'learn'`-intent rows for a topic**, not just
   the first found, defensively — `addInterest`'s own dedup means this
   shouldn't normally produce more than one, but the toggle path is new
   compose logic that must not silently assume the invariant (Risk Flag #2
   point 2). Covered by a dedicated test.

4. **`INTEREST_TOPICS` is a duplicated, independently-owned constant** in
   `telegram-auth.service.ts` (not imported from `TelegramEventTopicsService`)
   — per the requirement doc's Architectural Feasibility point 3:
   `TelegramEventTopicsService` isn't exported from `TelegramModule`, and
   importing `TelegramModule` into `AuthModule` would add a new edge onto
   an already-documented, previously-reverted cycle. Same precedent as PR
   1/6's event-topic duplication.

5. **Bot-side keyboard duplicates the same 7-slug order** in
   `keyboards/interests.py`'s `INTERESTS_TOPIC_ORDER` rather than trusting
   API response ordering, so button order is deterministic even if the
   API's `available` array iteration order ever changes.

6. **No `country` param on either new route or the bot's `api_client`
   calls** — interests are not tenant-scoped (`member_interests` has no
   `country_code` column), a documented, deliberate difference from every
   other FEAT-BOT-2 bot-facing route.

7. **Bracket markers (`[x]`/`[ ]`), not emoji**, for toggle state — a
   deliberately different convention from this bot's existing
   emoji-as-navigation-affordance usage (`events.button_next`/`button_prev`),
   per the task brief's explicit instruction.

## Architecture Rule Compliance

- **Module boundaries**: `TelegramInternalController -> TelegramAuthService
  -> MeProfileService` via constructor injection only; no direct
  entity/repository import across modules.
- **Tenant scoping**: correctly *excluded* — `member_interests` has no
  `country_code` column; adding a `country` param would have been the
  actual rule violation here (architecture.md's documented "some data is
  global" exception).
- **Zod at boundaries**: `interestsQuerySchema` (query) and
  `toggleInterestBodySchema` (body, `topic: z.enum(INTEREST_TOPICS)`) both
  validated at the controller before any service call; an out-of-list
  `topic` value never reaches `MeProfileService.addInterest` (AC-11,
  confirmed by test).
- **No cross-schema queries**: proxies through `MeProfileService ->
  DirectusClient`, identical pattern to every other Directus-backed bot
  route in this sequence.
- **No `any`**: none introduced. `MemberInterest` type imported from
  `me-profile.service.ts` for the toggle-filter logic.
- **Auth at controller level**: both new routes inherit
  `TelegramInternalController`'s class-level `@UseGuards(InternalAuthGuard)`
  — no new guard pattern.
- **Named constants, no magic strings**: `INTEREST_TOPICS`,
  `INTEREST_TOGGLE_PREFIX`, `SELECTED_MARKER`/`UNSELECTED_MARKER`,
  `INTERESTS_PATH`/`INTERESTS_TOGGLE_PATH` all named.

## Submodule Commit Sequencing (apps/bot)

Followed the established PR 1–4 precedent exactly, confirmed by inspecting
`apps/bot`'s own git log/remote before writing any code
(`git log --oneline -10` showed one commit per PR directly on `main`, e.g.
`f6ed6cf feat(bot): /leaderboard command...`, each pushed straight to
`origin/main` with no separate bot-repo branch or PR):

1. Committed all 10 changed/new bot files directly on `apps/bot`'s `main`
   branch: commit `c1be007`
   `feat(bot): /interests command — view and toggle topic interests
   (FR-BOT-002 PR 5/6)`.
2. Pushed `c1be007` to `origin/main` at
   `https://github.com/aiqadam/aiqadam-telegram-bot.git` — succeeded
   (`f6ed6cf..c1be007 main -> main`).
3. In the OUTER repo, ran `git add apps/bot` only (no commit) — the
   submodule pointer bump is now staged alongside the `apps/api` changes,
   confirmed via `git diff --submodule=log apps/bot` showing the one new
   commit. **No commit was made in the outer `aiqadam` repo** — that stays
   for workflow Step 11 (`workflow-finish.sh`), per the task's explicit
   instruction.

## Formatter Check

- **TypeScript**: `pnpm biome check` on all changed `apps/api` files —
  clean, no fixes applied. `pnpm --filter api lint` (full repo) — clean,
  312 files checked.
- **Python**: `ruff check .` — all checks passed (one auto-fixed import-sort
  in `test_interests_handler.py`, applied). `ruff format --check .` — all
  58 files already formatted.

## Known Limitations

- **`BP-UAT-003` adjacency not actioned** — per `01-requirement-validation.md`'s
  Business process linkage finding, `BP-UAT-003` (web-only interests AC-3)
  is topically adjacent but out of this PR's scope to retrofit with bot
  steps; flagged as a candidate follow-up for BusinessAnalyst, not created
  as an issue.
- **No E2E/Playwright coverage** — correctly out of scope; this PR has no
  web-facing surface.
- **`mypy` not run** — `apps/bot/pyproject.toml` has no `mypy` dependency
  or config (checked directly; not omitted by oversight). The task
  instructions' example validation command listed it as a possibility to
  adjust to the repo's actual tooling; the repo's actual Python validation
  surface is `ruff check` + `ruff format --check` + `pytest`, all run and
  clean.
- **Two pre-existing, unrelated test failures** observed in a full
  `pnpm --filter api test` run: `telegram-admin-status-service.spec.ts`
  ("counts outbox pending...") and `users.spec.ts` ("updates email +
  displayName + lastLoginAt...") — both are `Date.now()`-based clock-ordering
  assertions. Verified via `git stash` that both fail identically on
  unmodified `main` with the exact same assertion values, confirming they
  are pre-existing flakes unrelated to this PR's changes (neither test file
  nor its call graph touches `AuthModule`, `MeProfileModule`,
  `TelegramAuthService`, or `DirectusUsersBridgeService`). Not fixed here —
  out of this PR's scope; flagging for awareness in case Quality Gate's own
  run hits them.

## Gate Result

```yaml
gate: code-developer
status: passed
reasoning: >
  Compiles clean (tsc --noEmit, nest build). Lint clean (biome check,
  312 files). All architecture rules confirmed: module boundaries via
  constructor injection only, tenant scoping correctly excluded (no
  country_code on member_interests), Zod validation at the controller
  boundary before any service/DB call, no cross-schema queries, no `any`,
  auth guard at controller level (inherited InternalAuthGuard).
  Scoped test run (telegram-bot-interests, telegram-bot-leaderboard,
  directus-users-bridge, telegram-auth, main-bootstrap) — 9 files, 108
  tests, all passing, including the AC-7 mixed-intent load-bearing test
  and the live Nest module-graph boot check that caught and validated the
  fix for a real forwardRef gap not anticipated by the requirement doc.
  Bot side: ruff check clean, ruff format clean, 146 pytest tests passing
  (up from 137 pre-PR — 9 new interests-specific + 2 help-suffix tests net
  of the one removed "still coming soon" assertion).
  Two pre-existing, unrelated clock-flake test failures confirmed via
  git-stash comparison against unmodified main — not introduced by this
  PR, not fixed here (out of scope).
blocking_issues: []
needs_clarification: []
notes: >
  One real gap found and fixed during self-validation (not present in the
  requirement/impact docs): MeProfileModule's own AuthModule import needed
  forwardRef too, not just AuthModule's new edge into MeProfileModule —
  caught by main-bootstrap.spec.ts's live Nest DI boot check, exactly the
  test-coverage recommendation impact-analysis Risk Flag #1 called for.
  Documented in both auth.module.ts and me-profile.module.ts with
  cross-references to registrations.module.ts's original discovery of the
  identical failure mode for the RegistrationsModule edge.
```
