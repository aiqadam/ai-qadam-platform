# Step 2 — Impact Analysis

## Affected modules

| Module | Files | Change type |
|---|---|---|
| `apps/api/src/modules/directus` | `directus-users-bridge.service.ts` | Add one reverse-lookup method (`resolveUserIdFromDirectusId` or similar) |
| `apps/api/src/modules/auth` | `auth.controller.ts` (`TelegramInternalController`), `telegram-auth.service.ts` OR a new sibling service — see below | Add 2 routes: `POST /v1/internal/telegram/register`, `DELETE /v1/internal/telegram/register` |
| `apps/api/src/modules/registrations` | `registrations-directus.service.ts` | No change — reused directly, injected into the new controller path |
| `apps/bot` (submodule) | `src/handlers/event_detail.py` (or new `src/handlers/registration.py`), `src/keyboards/events.py`, `src/services/api_client.py`, `src/locales/ru.py`, `src/locales/en.py`, `src/main.py` (BotFather command registration excludes `/register`/`/cancel` — both take required args, same precedent as `/event`) | New handlers + API client methods + locale strings |

## DB Changes Required: no

Confirmed: `RegistrationsDirectusService.register()`/`.cancel()` already
exist and do all the Directus-side work (capacity, waitlist, emails via
Directus flows per the service's own header comment). No new Drizzle
table/column needed. The one new piece of platform-DB logic (reverse
`directusUserId` -> `users.id` lookup) is a **read** against the existing
`users` table's existing `directus_user_id` unique column — no schema
change, just a new query in `DirectusUsersBridgeService`.

**Step 3 (DBMigrationAuthor) is skipped.** Proceeding directly to Step 4.

## Design decision: where the new service logic lives

Two options considered:
1. Add `registerViaTelegram`/`cancelViaTelegram` methods to
   `TelegramAuthService` (telegram-auth.service.ts) — matches PR 1's
   pattern of that service owning all `TelegramInternalController` logic.
2. Inject `RegistrationsDirectusService` + `DirectusUsersBridgeService`
   directly into `TelegramInternalController`, bypassing
   `TelegramAuthService` for this one pair of routes.

**Decision: option 1**, for consistency — every existing route on
`TelegramInternalController` (`upsert-temp-user`, `lookup`, `events`,
`events/:id`) is a thin controller method delegating to
`TelegramAuthService`. Adding a `RegistrationsDirectusService` dependency
to `TelegramAuthService`'s constructor (alongside the existing
`AuthentikClient`/`DirectusClient`) keeps that one-service-per-controller
shape intact and matches the task brief's own instruction to "inject
[RegistrationsDirectusService] into your new internal controller/service."
`TelegramAuthService` also needs `DirectusUsersBridgeService` injected for
the reverse-lookup call. Verified no circular-import risk: `AuthModule`
already imports nothing from `RegistrationsModule` today; check needed
before implementation — see Risk Flag #1 below.

## Reuse vs. duplicate

Direct reuse of `RegistrationsDirectusService.register()` /`.cancel()` —
zero duplicated capacity/waitlist/email logic, per the task brief's
explicit instruction. This mirrors PR 1's own "Reuse vs. duplicate"
precedent for `listUpcomingEvents`/`getEventDetail` EXCEPT PR 1 chose to
duplicate a small filter-building subset to avoid a circular import; here
the direction is different (registrations module has no reverse
dependency on auth/telegram), so direct injection is expected to be
clean — confirmed at implementation time (Risk Flag #1).

## Risk Flags

1. **Potential circular import**: `RegistrationsModule` exports
   `RegistrationsDirectusService`; must confirm `AuthModule` can import
   `RegistrationsModule` without `RegistrationsModule` (transitively)
   importing `AuthModule` back. `RegistrationsDirectusService` itself
   depends on `DirectusUsersBridgeService`, `EulaService`,
   `BadgeAwarderService` — none of those are expected to depend on
   `AuthModule`, but CodeDeveloper must verify via `nest build`/typecheck
   before considering this done, not just visually inspect imports. If a
   cycle is found, the fallback is PR 1's own pattern: inject
   `RegistrationsDirectusService` directly into
   `TelegramInternalController`'s constructor instead of routing through
   `TelegramAuthService`, sidestepping any `AuthModule` <-> module cycle
   at the service-construction level (Nest DI still requires the module
   import, so this doesn't fully avoid the risk — CodeDeveloper's
   judgement call if it surfaces).
2. **DELETE-with-body** is unconventional for some HTTP intermediaries
   (proxies/caches sometimes drop DELETE bodies) but is safe here: both
   caller (bot's `ApiClient`) and callee (`TelegramInternalController`)
   are code we control end-to-end, calling directly over the internal
   Docker network — no browser, no CDN, no public proxy in the path. NestJS
   `@Delete()` + `@Body()` works identically to `@Post()` + `@Body()`.
   Documented so a future reader doesn't "fix" this into a query-param
   shape unnecessarily.
3. **Error-code mapping for `RegistrationConsentRequiredError`**: the
   existing browser-facing `RegistrationsController` maps this to 400
   (`BadRequestException`) — same as `RegistrationIneligibleError`. This
   PR's internal controller uses 409 Conflict instead, to let the bot
   distinguish "needs consent, show a different message" from "bad
   input/ineligible, show a generic error" without string-matching. This
   is a deliberate, minor divergence from the existing controller's
   mapping — noted for SecurityReviewer/QualityGate visibility, not a
   silent inconsistency.

## Gate Result

gate_result:
  status: passed
  summary: "No DB changes required; new logic lives in TelegramAuthService + a new DirectusUsersBridgeService reverse-lookup method, reusing RegistrationsDirectusService directly. One circular-import risk flagged for CodeDeveloper to verify at build time."
  findings:
    - "DB Changes Required: no — Step 3 skipped."
    - "Potential AuthModule <-> RegistrationsModule import cycle must be verified at typecheck/build time, not just by inspection."
    - "409 chosen over 400 for RegistrationConsentRequiredError on the new internal routes, deliberately diverging from RegistrationsController's 400 mapping, to give the bot a distinguishable signal."
