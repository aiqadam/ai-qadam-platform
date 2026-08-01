# 02 — Impact Analysis: FR-BOT-002 PR 6/6 (`/upgrade`)

## Validated Requirement

`FR-BOT-002` PR 6/6: bot-side `/upgrade` command — email-collection FSM,
calls the already-shipped `POST /v1/internal/telegram/upgrade-temp`, renders
4 distinct outcome messages, updates `/help` and `BOT_COMMANDS`.

## Affected Layers

### API (NestJS)

No changes. `POST /v1/internal/telegram/upgrade-temp` already exists,
already matches the required contract exactly (verified in
`01-requirement-validation.md`). This PR is read-only against
`apps/api/` — confirmed no edits needed to
`auth.controller.ts`/`upgrade.service.ts`/`upgrade-intent.schema.ts`.

### DB Changes Required

**No.** No new table, column, or constraint. `upgrade_intents` already
exists (FR-AUTH-006's migration). Step 3 (DBMigrationAuthor) is skipped.

### Shared Types

None. `packages/shared-types/` is not touched — the bot's Python dataclasses
in `api_client.py` are the bot-side mirror convention already established
per-endpoint (no shared TS/Python type-generation exists in this repo).

### Frontend (`apps/web`)

None. Out of scope — `/upgrade` is bot-only.

### Bot (`apps/bot`, git submodule)

New/modified files:

| File | Change |
|---|---|
| `src/states/upgrade.py` | NEW — `UpgradeStates(StatesGroup)` with one state, `awaiting_email`. First real content in the `states/` package. |
| `src/handlers/upgrade.py` | NEW — `/upgrade` command entry (guards on `is_temp`), FSM message handler for email collection + API call + 5-way outcome rendering (success, not-found, not-temp, email-in-use, api-unavailable), plus the client-side invalid-format re-prompt. |
| `src/services/api_client.py` | MODIFIED — add `UPGRADE_TEMP_PATH` constant, `UpgradeResult` dataclass (or reuse a plain `{ok: bool}`-shaped return — decided at CodeDeveloper's discretion per AGENTS.md §14), new exception types `NotATempAccountError`/`EmailAlreadyInUseError` (mirrors `RegistrationConsentRequiredError`/`RegistrationIneligibleError`'s existing pattern of one exception type per distinct 409 `error` value), and `request_upgrade()` method. |
| `src/locales/ru.py`, `src/locales/en.py` | MODIFIED — new `upgrade.*` keys; `help.upgrade` loses "(coming soon)"/"(скоро)" suffix. |
| `src/handlers/help.py` | No code change expected (already references `help.upgrade` key) — verify at CodeDeveloper time; only the locale string changes. |
| `src/main.py` | MODIFIED — `/upgrade` added to `BOT_COMMANDS`; `upgrade` router imported and included (before `fallback`, after the other command routers, matching existing ordering convention). |
| `tests/test_upgrade_handler.py` | NEW — TestDesigner's output. |
| `tests/test_api_client_upgrade.py` | NEW — TestDesigner's output. |
| `tests/test_main_wiring.py` | MODIFIED — extend `BOT_COMMANDS`/router-registration assertions to include `upgrade`. |

No new keyboard file needed — `/upgrade`'s FSM has no inline-keyboard step
(plain text prompt/reply), unlike `/interests`/`/events`/`/me`. Confirmed
against FR-BOT-002's Notes: FSM is used "for multi-step flows like /start
... and /upgrade (email collection)" — text-based collection, no button UI
implied or required by any AC.

### Workers

None.

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| `/v1/internal/telegram/upgrade-temp` | POST | None — already shipped by FR-AUTH-006, this PR only adds a caller. | No |

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| `apps/bot` (`ApiClient.request_upgrade`) | `apps/api` `TelegramInternalController.upgradeTemp` | HTTP, `x-internal-auth` shared secret (existing `INTERNAL_API_TOKEN` convention, no new credential) |

No new cross-module NestJS service calls — the API side is unmodified.

## Risk Flags

### Security Review Required

Yes, standard review (no BLOCKER expected):
- Confirm the bot does not log the collected email in plaintext at any log
  level above what other PII-adjacent fields already get (mirrors the
  existing convention — `telegram_id` is logged, raw email should not be,
  per general log-hygiene practice; no email field has ever crossed a log
  line in this bot before, so this is a new surface to check specifically).
- Confirm the client-side email-format regex is not used as a security
  control substitute (it isn't — the API's Zod `emailField` remains
  authoritative; this is purely a UX nicety avoiding a wasted round trip).
- Confirm FSM state does not persist the raw email longer than needed —
  `FSMContext` should be cleared after the API call regardless of outcome
  (success or any error), not left dangling.
- Confirm no secret/token value the bot already holds
  (`INTERNAL_API_TOKEN`) is exposed in any new log line this PR adds.

### Architecture Rule Risks

None identified. No module-boundary violation, no cross-schema query (bot
has no direct DB access at all — thin-bot guarantee, `test_thin_bot_guarantee.py`
already enforces this and needs no new exception), no new external
dependency.

## Test Scope

### Unit (pytest, `apps/bot/tests/`)

- `test_upgrade_handler.py`:
  - `/upgrade` on a full-account (`is_temp=False`) user → "already a
    member" message, FSM state never entered, API not called.
  - `/upgrade` on a temp-account user with unresolved identity guard
    (`user_context is None` / `is_known=False`) → standard
    `event.unavailable` guard message, matching every other handler's
    convention.
  - `/upgrade` on a temp-account user → prompts for email, sets FSM state
    to `awaiting_email`.
  - Email-collection step, invalid format → re-prompt, state unchanged,
    API not called.
  - Email-collection step, valid format → API called with
    `(telegram_id, email)`; state cleared afterward regardless of outcome.
  - Success (`200 {ok:true}`) → success message (mentions checking email,
    ~29-min validity wording, no "15 min" wording).
  - `404 telegram_user_not_found` → distinct message.
  - `409 not_a_temp_account` → distinct message (defensive path — the
    client-side `is_temp` guard should normally prevent reaching here, but
    the handler must still map it correctly for the race-condition case).
  - `409 email_already_in_use` → distinct message referencing "try a
    different email or sign in with that email" without overclaiming
    FR-AUTH-005 as a built, clickable feature.
  - API-unavailable (network error/5xx) → standard retry message, matches
    every other handler's `*.unavailable` convention.
- `test_api_client_upgrade.py`: `request_upgrade()` — one test per mapped
  status code (200/404/409-not-temp/409-email-in-use/other-non-2xx),
  mirroring `test_api_client_register.py`'s existing structure exactly.
- `test_main_wiring.py`: extend existing assertions — `upgrade` in
  `BOT_COMMANDS` command names, `upgrade` router present in
  `dispatcher.sub_routers`.
- `test_help_handler.py`: extend/verify — `/help` output no longer
  contains "(coming soon)"/"(скоро)" for the upgrade line (mirrors PR
  2-4's own precedent test pattern, if one exists per-command; add if not).

### Integration (Testcontainers)

Not newly required — this PR adds no new API-side code (Step 3/DB skipped,
no new NestJS endpoint). The existing FR-AUTH-006 integration/e2e coverage
for `upgrade-temp` already exists and is unmodified. Live verification of
the bot-side integration specifically (bot's HTTP client → real local API)
is performed by the Orchestrator directly at Step 13, per the task brief's
explicit scoping (bot-side integration only, not re-proving the whole
mechanism FR-AUTH-006 already live-verified with 10 round trips).

### E2E (Playwright)

None — bot flows are not Playwright-driven in this repo (aiogram/Telegram,
not a browser surface). Bot-side "E2E" equivalent is the pytest handler
tests above plus the Step-13 live HTTP verification.

## Gate Result

gate_result:
  status: passed
  summary: "Bot-only change, no DB migration, no API modification — pure new caller of an already-shipped, already-contract-verified endpoint. Standard security review scope, no architecture risk."
  findings:
    - "DB Changes Required: no — upgrade_intents table already exists from FR-AUTH-006. Step 3 (DBMigrationAuthor) skipped, proceeding directly to Step 4 (CodeDeveloper)."
    - "No new keyboard file needed — /upgrade's FSM is text-only (email prompt/reply), no inline buttons implied by any AC."
    - "Security review should specifically check: no plaintext email logging, FSM state cleared post-call, client-side regex not treated as a security boundary."
