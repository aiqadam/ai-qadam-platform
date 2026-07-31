# Step 6 — Test Strategy

## Layers

1. **API unit/service tests** (vitest, mocked `DirectusClient`/
   `DirectusUsersBridgeService`/`RegistrationsDirectusService`) — covers
   `registerViaTelegram`/`cancelViaTelegram` business logic, error mapping,
   and the ISS-BOT-REG-001 regression (403/404 -> `RegistrationNotFoundError`).
2. **API controller tests** (vitest, direct instantiation, matching PR 1's
   `telegram-auth-controller.spec.ts` pattern) — covers Zod validation at
   the boundary and NestJS exception propagation for both new routes.
3. **Bot unit tests** (pytest + httpx.MockTransport, matching PR 1's
   `test_api_client_events.py`/`test_event_detail_handler.py` pattern) —
   covers `ApiClient.register_for_event`/`cancel_registration` request
   shape + response parsing + exception mapping, and the command/callback
   handlers' message selection logic per status/error.
4. **Live integration verification** (Step 13, mandatory per
   `business_process: [BP-UAT-010]`) — real API + real Directus, not
   mocked, cross-referencing actual Directus rows against API responses.

## AC-to-test mapping

| AC | Covered by |
|---|---|
| AC-1 (register confirmation with title) | `test_register_shows_confirmation_with_event_title_on_success`, `telegram-register-service.spec.ts` happy-path test, live curl (Step 13) |
| AC-2 (distinct waitlist confirmation) | `test_register_shows_distinct_waitlist_message_when_event_is_full`, live curl against `uat-event-full-uz` |
| AC-3 (/cancel + waitlist promotion) | `test_cancel_shows_confirmation_on_success`; promotion itself is Directus-flow-owned, already covered by BP-UAT-014, not re-tested here |
| AC-4 (Register button now real) | `test_register_callback_shows_confirmation_alert_for_known_user` |
| AC-5 (idempotent re-register) | `test_register_twice_shows_same_confirmation_both_times`, live curl (registered twice, same Directus row) |
| AC-6 (nonexistent event error) | `test_register_shows_not_found_message_on_404`, live curl (also caught ISS-BOT-REG-001) |
| AC-7 (/cancel when not registered) | `test_cancel_shows_not_registered_message_without_crashing`, live curl |
| AC-8 (API-unavailable retry message) | `test_register_shows_unavailable_message_on_api_error`, `test_cancel_shows_unavailable_message_on_api_error` |

## Gate Result

gate_result:
  status: passed
  summary: "Four-layer strategy (API unit, API controller, bot unit, live Step 13) covering all 8 draft ACs; matches PR 1's established test-file conventions exactly."
  findings: []
