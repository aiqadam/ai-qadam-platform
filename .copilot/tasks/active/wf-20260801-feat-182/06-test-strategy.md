# 06 — Test Strategy: FR-BOT-002 PR 6/6 (`/upgrade`)

## Requirement

`FR-BOT-002` PR 6/6: `/upgrade` bot command — email-collection FSM, calls
`POST /v1/internal/telegram/upgrade-temp`, 4 distinct outcome messages.

## Rubric Score

| Criterion | Applies? | Points |
|---|---|---|
| Touches tenant-scoped data | No | 0 |
| New API endpoint | No (already shipped by FR-AUTH-006) | 0 |
| Business rule with edge cases | Yes — 4 distinct outcome branches + client-side format validation + FSM state transitions | +2 |
| Cross-module service call | Yes — bot -> API via HTTP | +1 |
| New database query | No (bot has no DB access) | 0 |

**Score: 3.** Below the integration-test (≥4) and E2E (≥6) thresholds —
**unit tests are sufficient** per the rubric.

This matches every prior FR-BOT-002 PR's own strategy (1 through 5, all
bot-only, all unit-test-only at this step) — the actual Testcontainers/API
integration coverage for the endpoint this PR calls already exists in
`apps/api` from FR-AUTH-006's own workflow and is unmodified here. Live
verification of the bot's HTTP client against the real local API is
performed directly by the Orchestrator at Step 8/13 (see
`07-test-results.md`), which is the correct place for a bot-side
integration check in this repo's established pattern (no Testcontainers
run inside `apps/bot`'s own test suite — it's a thin HTTP client, not a
service with a DB to spin up).

## Required Test Levels

- [x] Unit (pytest, `apps/bot/tests/`)
- [ ] Integration (Testcontainers) — not required by rubric; substituted by
      direct live HTTP verification at Step 8/13 (bot-side scope only, per
      task brief — the underlying mechanism was already live-verified with
      10 round trips by FR-AUTH-006's own workflow).
- [ ] E2E (Playwright) — N/A, no browser surface (Telegram bot).

## Unit Test Plan

| Target | Happy Path | Failure Paths |
|---|---|---|
| `handle_upgrade_command` | Temp user -> prompt + FSM state set | `user_context is None`; `is_known=False`; full account (`is_temp=False`) -> no FSM entry, no API call |
| `handle_upgrade_email_reply` | Valid email -> API call -> success message, state cleared | Invalid format -> re-prompt, state unchanged, no API call; unresolved identity mid-flow -> guard message, state cleared; 404 `telegram_user_not_found`; 409 `not_a_temp_account`; 409 `email_already_in_use`; API unavailable (500 and network error) |
| `ApiClient.request_upgrade` | 200 -> returns None, no exception | 404 -> `TelegramUserNotFoundError`; 409 (`not_a_temp_account`) -> `NotATempAccountError`; 409 (`email_already_in_use`) -> `EmailAlreadyInUseError`; 500 -> `ApiUnavailableError`; network error -> `ApiUnavailableError` |
| `main.py` wiring | `upgrade` router registered, `/upgrade` in `BOT_COMMANDS` | N/A (structural test) |
| `/help` output | `help.upgrade` has no "coming soon" marker; no command in the full output has one | N/A |

## Integration Test Plan

Not required per rubric (score 3 < 4). See "Required Test Levels" above
for the substitution rationale (direct live HTTP verification at
Step 8/13, scoped to the bot's own new caller code, not re-proving
FR-AUTH-006's already-verified mechanism).

## E2E Test Plan

N/A — no browser surface.

## Acceptance Criteria → Test Mapping

| AC | Test Level | Test Description |
|---|---|---|
| AC-1 (FR-BOT-002 existing): `/upgrade` starts the email verification flow and sends the magic-link email | Unit + live HTTP (Step 8/13) | `test_upgrade_email_reply_sends_expected_payload_and_shows_success_message`; live-verified against real local API at Step 8 |
| AC-2 (new): full-account user gets "already a member," no API call | Unit | `test_upgrade_shows_already_full_account_message_and_does_not_enter_fsm` |
| AC-3 (new): invalid-format email re-prompts without leaving state | Unit | `test_upgrade_email_reply_reprompts_on_invalid_format_without_calling_api` |
| AC-4 (new): `telegram_user_not_found` vs. `not_a_temp_account`/`email_already_in_use` render distinctly | Unit | `test_upgrade_email_reply_shows_distinct_message_on_telegram_user_not_found`, `test_upgrade_email_reply_shows_already_full_account_message_on_not_a_temp_account` |
| AC-5 (new): `email_already_in_use` messaging doesn't overclaim FR-AUTH-005 | Unit | `test_upgrade_email_reply_shows_email_in_use_message_without_overclaiming_linking` — asserts `"telegram"` absent from the rendered message |
| AC-6 (new): API-unavailable renders standard retry message | Unit | `test_upgrade_email_reply_shows_unavailable_message_on_api_error`, `..._on_network_error` |
| AC-7 (new): `/help` includes `/upgrade` without "(coming soon)"; `BOT_COMMANDS` includes it | Unit | `test_help_no_longer_marks_upgrade_as_coming_soon`, `test_bot_commands_includes_the_argument_less_commands` |

## Gate Result

gate_result:
  status: passed
  summary: "Rubric score 3 (unit-only per threshold), matches every prior FR-BOT-002 PR's own strategy tier. All 7 ACs mapped to at least one unit test; AC-1 additionally covered by Step 8/13 live HTTP verification."
  findings:
    - "No integration/E2E tier required — the API endpoint this PR calls has its own existing FR-AUTH-006 integration coverage, unmodified; bot-side live verification substitutes at Step 8/13 per the task brief's explicit scoping."
