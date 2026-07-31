# Step 4 — Code Summary

## Files changed (apps/api, outer repo)

| File | Change |
|---|---|
| `apps/api/src/modules/auth/telegram-auth.service.ts` | Added `telegramRegisterBodySchema`/`telegramCancelBodySchema` Zod schemas, `TelegramRegisterResult`/`TelegramCancelResult` types, and `registerViaTelegram()`/`cancelViaTelegram()` methods. Constructor now also injects `DirectusUsersBridgeService` + `RegistrationsDirectusService` (the latter via `@Inject(forwardRef(...))`). |
| `apps/api/src/modules/auth/auth.controller.ts` | `TelegramInternalController` gains `POST /v1/internal/telegram/register` and `DELETE /v1/internal/telegram/register`, both Zod-validated, both `InternalAuthGuard`-protected (class-level guard, unchanged). |
| `apps/api/src/modules/auth/auth.module.ts` | Imports `RegistrationsModule` via `forwardRef()` — new edge that closes a module cycle (see below). |
| `apps/api/src/modules/registrations/registrations.module.ts` | Now `forwardRef()`-wraps its own pre-existing `AuthModule` import (both edges of the new cycle needed the wrap, confirmed live — see Risks). Exports `RegistrationsDirectusService` (previously unexported). |
| `apps/api/src/modules/eula/eula.module.ts` | `forwardRef()`-wraps its `AuthModule` import — newly reachable from `AuthModule` via the new `RegistrationsModule` edge. |
| `apps/api/src/modules/badges/badges.module.ts` | Same `forwardRef()` fix, same reason. |
| `apps/api/src/modules/directus/directus-users-bridge.service.ts` | Added `resolveUserIdFromDirectusId()` — the reverse lookup (`directusUserId` -> platform `users.id`) that didn't exist anywhere in the codebase before this PR. |
| `apps/api/src/modules/registrations/registrations-directus.service.ts` | **Bug fix, not new-PR scope**: `assertEventInTenant`'s catch clause now treats Directus `403` the same as `404` (both -> `RegistrationNotFoundError`). Found live during Step 13 verification — see `ISS-BOT-REG-001` below. |

## Files changed (apps/bot, submodule)

| File | Change |
|---|---|
| `src/services/api_client.py` | Added `register_for_event()`, `cancel_registration()`, `RegisterResult`/`CancelResult` dataclasses, `RegistrationConsentRequiredError`/`RegistrationIneligibleError` exceptions. |
| `src/handlers/event_detail.py` | `handle_register_placeholder` replaced by `handle_register_callback` (real registration, shared `_do_register` helper). New `/register <N>` command handler (`handle_register_command`). |
| `src/handlers/cancel.py` (new) | `/cancel <N>` command handler. |
| `src/keyboards/events.py` | Docstring updated to reflect the button now does a real registration. |
| `src/locales/ru.py` / `src/locales/en.py` | New `register.*`/`cancel.*` strings; removed the now-dead `event.register_placeholder`; `/help`'s `register`/`cancel` lines no longer say "coming soon." |
| `src/main.py` | Registers the new `cancel` router; updates the stale BOT_COMMANDS comment (previously said PR 2/3 would exclude `/register`/`/cancel` from BotFather — now correctly says they ARE excluded, present tense). |

## Module-cycle resolution (Risk Flag #1 from impact analysis, resolved)

Confirmed live at `pnpm --filter api dev` boot (not just typecheck — Nest's
module graph is runtime-resolved): adding `AuthModule -> RegistrationsModule`
closes a cycle with the pre-existing `RegistrationsModule -> AuthModule`
edge, and transitively re-exposed the same cycle through `EulaModule` and
`BadgesModule` (both of which `RegistrationsModule` also imports, both of
which ALSO import `AuthModule` directly). All four edges needed
`forwardRef()`. This was discovered iteratively via boot-log
`UndefinedModuleException` traces, each one pointing at the next module in
the chain, not predicted up front — documented in each file's own comment
for the next person who touches this module graph.

A second, distinct issue after the module-graph fix: Nest's
`design:paramtypes` reflection can't resolve a `forwardRef`'d provider
through a plain constructor-parameter type — needed an explicit
`@Inject(forwardRef(() => RegistrationsDirectusService))` on
`TelegramAuthService`'s constructor parameter too (confirmed via a
`Function` type showing up at the unresolved parameter index in the error
trace).

## New issue found and fixed live: ISS-BOT-REG-001

**Pre-existing bug, not introduced by this PR** (confirmed via
`git diff --stat` on `registrations-directus.service.ts` showing zero
prior changes on this branch before this fix): `assertEventInTenant`'s
catch clause only mapped Directus `404` to `RegistrationNotFoundError`.
This Directus instance's actual behavior for a single-item GET on a
nonexistent id is `403` (permission-denied framing), not `404` — found
live via `curl -X POST .../register` with a random UUID `eventId` against
the local stack, which returned an unhandled 500 instead of a clean 404.
Same bug is reachable identically today via the pre-existing
browser-facing `POST /v1/events/:eventId/register` for a bogus `eventId`
— it just had no test coverage using a genuinely nonexistent UUID before
now. Fixed in the same file/method (both 403 and 404 now map to
`RegistrationNotFoundError`), with 3 new regression tests in
`registrations-directus.spec.ts`. This is a small, surgical fix on the
exact surface this PR already touches — fixed in-session per
`protocol.md`'s "worth a second look before declaring victory" guidance
rather than filed as a separate follow-up issue, since the fix is a
2-line diff with test coverage, not a design change.

## Identity-mapping approach

`directusUserId` (bot-resolved via the existing `lookup` endpoint) ->
platform `users.id` (what `RegistrationsDirectusService` needs): new
`DirectusUsersBridgeService.resolveUserIdFromDirectusId()`, a plain
`SELECT id FROM users WHERE directus_user_id = $1` via Drizzle. No
upsert-on-miss (unlike the bridge's existing `findOrCreate`) — a miss
here means "no platform user is linked to this Directus user," mapped to
404 `telegram_user_not_found`, the same convention `lookupUser` already
uses for an unresolvable identity.

## QR deep-link finding

Confirmed stale (see `01-requirement-validation.md` for the full
investigation): no QR code / deep-link field exists anywhere in
`RegistrationView`/the register response, nor in the live web UI's
registration flow. `BP-UAT-010.md`'s own Notes section independently
confirms this ("the current `RegistrationCTA` implementation has no QR
code element anywhere... this was corrected from an earlier doc revision
that assumed a QR-code confirmation UI that was never built"). The bot's
confirmation message echoes only the event title, matching the real API
response shape.

## EULA / consent-required handling

No mature precedent exists to mirror (the web UI's `RegistrationCTA`
calls register with no `acceptance` body at all). The bot's fallback on
`RegistrationConsentRequiredError` (mapped to 409 by the new internal
routes) is a plain one-line message pointing to aiqadam.org — not a
built consent flow. Documented as a deliberate minimum-viable choice
(AGENTS.md §14) rather than a silent gap.

## Gate Result

gate_result:
  status: passed
  summary: "PR 2/6 implemented: /register + /cancel internal API routes (reusing RegistrationsDirectusService via a resolved module-cycle), bot handlers wired to real registration/cancellation, one pre-existing bug (ISS-BOT-REG-001) found and fixed live during verification."
  findings:
    - "Module-cycle fix required forwardRef on 4 edges (AuthModule<->RegistrationsModule, EulaModule->AuthModule, BadgesModule->AuthModule), confirmed via live boot, not just typecheck."
    - "ISS-BOT-REG-001 (pre-existing 403-not-mapped-to-404 bug in assertEventInTenant) found and fixed in the same PR, with regression tests."
    - "QR deep-link confirmed stale per BP-UAT-010.md's own Notes; not implemented."
