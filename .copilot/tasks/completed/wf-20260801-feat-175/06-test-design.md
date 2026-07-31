# Step 7 — Test Design

## New/modified test files

### apps/api (outer repo)

- `apps/api/test/telegram-register-service.spec.ts` (new) — 15 tests:
  `registerViaTelegram` happy path, waitlisted pass-through, title-fetched-
  after-register-not-before ordering guard, 404-on-unresolved-bridge,
  RegistrationNotFoundError/ConsentRequired/Ineligible mapping,
  unrecognized-error passthrough; `cancelViaTelegram` happy path,
  not_registered pass-through, 404-on-unresolved-bridge, NotFoundError
  mapping.
- `apps/api/test/telegram-register-controller.spec.ts` (new) — 12 tests:
  Zod validation (missing/invalid directusUserId/eventId/country) for both
  routes, service-call argument passthrough, exception propagation,
  not_registered-is-not-an-error check, guard-presence structural check.
- `apps/api/test/registrations-directus.spec.ts` (modified) — added 3
  tests for `assertEventInTenant`'s 404/403 mapping (ISS-BOT-REG-001
  regression guard) + one passthrough-of-other-statuses test.

### apps/bot (submodule)

- `apps/bot/tests/test_api_client_register.py` (new) — 13 tests: request
  shape (method/url/body/header) for both `register_for_event` and
  `cancel_registration`, status-code -> exception mapping for each (404,
  409×2, 500, network error), not_registered pass-through.
- `apps/bot/tests/test_register_command.py` (new) — 11 tests: usage
  message, AC-1/AC-2 confirmation copy, idempotent double-register,
  404/409/500 error messages, user_context=None and country=None guards.
- `apps/bot/tests/test_cancel_handler.py` (new) — 8 tests: usage message,
  confirmation, not_registered message, 404/500 error messages,
  user_context=None and country=None guards.
- `apps/bot/tests/test_event_detail_handler.py` (modified) — replaced the
  placeholder-callback test with two tests for the real
  `handle_register_callback` (confirmation alert, unavailable-when-no-context).
- `apps/bot/tests/test_help_handler.py` (modified) — split the single
  "marks unimplemented as coming soon" test into two: one for the still-
  unimplemented commands (me/leaderboard/interests/upgrade), one asserting
  register/cancel NO LONGER carry the coming-soon marker.
- `apps/bot/tests/test_main_wiring.py` (modified) — asserts `register`/
  `cancel` are excluded from BOT_COMMANDS (both take required args) and
  that the new `cancel` router is registered.

## Gate Result

gate_result:
  status: passed
  summary: "59 new/modified tests across API and bot, following each layer's established per-handler test-file convention from PR 1."
  findings: []
