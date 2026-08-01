# 06 — Test Design: FR-BOT-002 PR 6/6 (`/upgrade`)

## Tests Written

### Unit

| File | Count/Focus | Required? |
|---|---|---|
| `apps/bot/tests/test_upgrade_handler.py` | 17 tests — `/upgrade` command entry (guards, is_temp short-circuit, FSM prompt/transition), email-reply step (invalid-format re-prompt, all 4 outcome messages, API-unavailable ×2, unresolved-identity mid-flow guard), plus a state-cleared-on-every-path assertion baked into each outcome test | Yes |
| `apps/bot/tests/test_api_client_upgrade.py` | 7 tests — request shape (method/path/header/body), success (`None` return, no exception), 404, both 409 variants, 500, network error | Yes |
| `apps/bot/tests/test_main_wiring.py` (modified) | 2 existing tests extended — `BOT_COMMANDS` includes `upgrade`; `upgrade` router present in `dispatcher.sub_routers` | Yes |
| `apps/bot/tests/test_help_handler.py` (modified) | 1 stale test removed (`/upgrade` no longer "still unimplemented"), 1 new test added — `/upgrade`'s help line has no "coming soon" marker, and the full `/help` output has none anywhere (all 10 commands now shipped) | Yes |
| `apps/bot/tests/conftest.py` (modified) | New `make_fsm_context()` fixture helper — real `FSMContext` backed by fresh `MemoryStorage`, first FSM test infrastructure in this bot | Yes (infra for the above) |

### Integration

None — not required per `06-test-strategy.md`'s rubric score (3 < 4).

### E2E

None — no browser surface.

## Acceptance Criteria Coverage

| AC | Test | Status |
|---|---|---|
| AC-1: `/upgrade` sends the magic-link email | `test_upgrade_email_reply_sends_expected_payload_and_shows_success_message` | Covered (unit); also covered live at Step 8/13 |
| AC-2: full-account short-circuit, no API call | `test_upgrade_shows_already_full_account_message_and_does_not_enter_fsm` | Covered |
| AC-3: invalid-format re-prompt, state unchanged | `test_upgrade_email_reply_reprompts_on_invalid_format_without_calling_api` | Covered |
| AC-4: distinct 404 vs. 409 messages | `test_upgrade_email_reply_shows_distinct_message_on_telegram_user_not_found`, `test_upgrade_email_reply_shows_already_full_account_message_on_not_a_temp_account` | Covered |
| AC-5: `email_already_in_use` doesn't overclaim FR-AUTH-005 | `test_upgrade_email_reply_shows_email_in_use_message_without_overclaiming_linking` | Covered |
| AC-6: API-unavailable retry message | `test_upgrade_email_reply_shows_unavailable_message_on_api_error`, `_on_network_error` | Covered |
| AC-7: `/help` + `BOT_COMMANDS` include `/upgrade` | `test_help_no_longer_marks_upgrade_as_coming_soon`, `test_bot_commands_includes_the_argument_less_commands` | Covered |

Additional coverage beyond the formal AC list (defensive/regression value):
- `test_upgrade_shows_unavailable_message_when_user_context_is_none` /
  `..._when_user_is_unknown` — standard identity-guard convention, matches
  every other handler's own test suite.
- `test_upgrade_email_reply_guards_on_unresolved_identity_and_clears_state`
  — the mid-flow race case (identity becomes unresolved between the
  `/upgrade` prompt and the email reply).
- Every outcome-path test in `test_upgrade_handler.py` also asserts
  `await state.get_state() is None` — regression guard against a future
  change accidentally leaving FSM state dangling on some branch.

## Known Test Gaps

None for this PR's own scope. `apps/api`'s `upgrade-temp` endpoint already
has its own FR-AUTH-006 integration/e2e coverage (10 live round trips,
per that FR's own completion report) — not re-authored here, out of this
PR's scope (bot-side only).

## Formatter / Lint Self-Check

- No `it.skip`/`pytest.mark.skip` anywhere in the new/modified test files.
- No `Any`/untyped signatures in test code (all functions have full type
  hints, matching every existing test file's convention).
- `ruff format --check` / `ruff check` both clean across `tests/` (see
  `03-code-summary.md`'s Formatter Check section for the exact command
  output).

## Gate Result

gate_result:
  status: passed
  summary: "24 new tests + 3 modified test files, all 7 ACs covered, no it.skip, ruff clean. 165/165 total pytest passing (146 pre-PR + 19 net new)."
  findings:
    - "make_fsm_context() in conftest.py is new shared test infrastructure — first FSM test helper in this bot, available for any future FSM-based command."
    - "Every outcome-path test doubles as a state-cleared regression guard, not just a message-content assertion."
