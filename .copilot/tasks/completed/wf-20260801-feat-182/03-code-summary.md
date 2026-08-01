# 03 — Code Summary: FR-BOT-002 PR 6/6 (`/upgrade`)

## Requirement Implemented

`/upgrade` bot command: lets a temp-account Telegram user upgrade to a full
member account via email verification, calling the already-shipped
`POST /v1/internal/telegram/upgrade-temp` (FR-AUTH-006). Final PR in the
FR-BOT-002 6-PR sequence — all 10 commands are now implemented.

## Files Changed

All changes are in the `apps/bot` git submodule (own commit sequence, per
this FR's existing 5-PR precedent), except the last two rows.

| File | Change Type | Description |
|---|---|---|
| `apps/bot/src/states/upgrade.py` | NEW | `UpgradeStates(StatesGroup)`, one state `awaiting_email` — first real content in the `states/` package. |
| `apps/bot/src/handlers/upgrade.py` | NEW | `/upgrade` command entry (is_temp short-circuit, no wasted API call for full accounts) + FSM message handler for email collection, client-side format validation, API call, and 4-way outcome rendering. |
| `apps/bot/src/services/api_client.py` | MODIFIED | Added `UPGRADE_TEMP_PATH`, `NotATempAccountError`, `EmailAlreadyInUseError`, and `request_upgrade()` — reuses `TelegramUserNotFoundError` for the 404 case (same semantic as `lookup_telegram_user`'s existing 404 mapping). |
| `apps/bot/src/locales/ru.py` | MODIFIED | New `upgrade.*` keys (7 strings); `help.upgrade` loses "(скоро)" suffix. |
| `apps/bot/src/locales/en.py` | MODIFIED | New `upgrade.*` keys (7 strings); `help.upgrade` loses "(coming soon)" suffix. |
| `apps/bot/src/main.py` | MODIFIED | `/upgrade` added to `BOT_COMMANDS` (no argument — email is collected via FSM reply, not a command arg); `upgrade` router imported and included before `fallback`. |
| `apps/bot/tests/test_upgrade_handler.py` | NEW | 17 tests: guards, is_temp short-circuit, FSM prompt/transition, invalid-format re-prompt, all 4 outcome messages, API-unavailable path (both 500 and network-error), state-cleared-on-every-path assertions. |
| `apps/bot/tests/test_api_client_upgrade.py` | NEW | 7 tests: request shape, success, 404, both 409 variants, 500, network error. |
| `apps/bot/tests/test_main_wiring.py` | MODIFIED | Extended `BOT_COMMANDS`/router-registration assertions to include `upgrade`. |
| `apps/bot/tests/test_help_handler.py` | MODIFIED | Removed the now-stale "still unimplemented" test for `/upgrade`; added `test_help_no_longer_marks_upgrade_as_coming_soon`, which also asserts the FULL `/help` output no longer contains any "coming soon"/"скоро" marker anywhere — all 10 commands are implemented now. |
| `apps/bot/tests/conftest.py` | MODIFIED | Added `make_fsm_context()` — builds a real `FSMContext` backed by a fresh `MemoryStorage`, used by the new FSM tests (first FSM usage in this bot, no prior test helper existed). |
| `docs/03-requirements/FR-BOT-002.md` | MODIFIED (outer repo) | PR 6/6 marked shipped in Implementation progress; frontmatter `status: Planned` → `Implemented` (all 10 commands now done); ACs re-checked. |
| `docs/03-requirements/requirements-registry.md` | MODIFIED (outer repo) | `FR-BOT-002` Status column → `Shipped`. |

No changes needed to `apps/bot/src/handlers/help.py` — it already referenced
the `help.upgrade` locale key; only the string content changed.

No changes to `apps/api/` — the `POST /v1/internal/telegram/upgrade-temp`
endpoint (FR-AUTH-006) was read-only-verified against this PR's contract
needs and required no adjustment.

## Key Design Decisions

1. **`is_temp` short-circuit avoids a wasted API call for full accounts.**
   `user_context.is_temp` is already resolved by `AuthMiddleware` on every
   update. A full-account user running `/upgrade` gets
   `upgrade.already_full_account` immediately — no API call, no FSM entry.
   The API's own `not_a_temp_account` 409 is kept as a defensive fallback
   for the race where the account is upgraded between this client-side
   check and the API call landing (handled identically — same message).
2. **FSM state is always cleared after the API call**, on every outcome
   path (success or any of the 4 error types), never left dangling. A user
   who wants to retry after an error simply runs `/upgrade` again — no
   partial/resumable state, consistent with every other command's
   stateless design.
3. **First real FSM usage in this bot.** `states/__init__.py` was a stub
   reserving the package for exactly this. `Dispatcher()` already defaults
   to aiogram 3's `MemoryStorage` (no explicit `storage=` argument was ever
   set) — sufficient for this single-process long-polling deployment
   (ADR-0034), no additional wiring needed.
4. **Client-side email-format regex is a UX nicety, not a security
   boundary.** `_EMAIL_RE` in `handlers/upgrade.py` rejects obviously
   malformed input before a wasted round trip. The API's own Zod
   `emailField` validation on `upgrade-temp` (confirmed in
   `upgrade-intent.schema.ts`/`upgrade.service.ts`) remains authoritative.
5. **`404 telegram_user_not_found` reuses the existing
   `TelegramUserNotFoundError`** rather than adding a new exception type —
   same semantic (`lookup_telegram_user`'s own 404 case), avoiding a
   duplicate type for an identical meaning.
6. **`email_already_in_use` messaging does not reference Telegram-account
   linking.** FR-AUTH-005 is `status: Planned`, unbuilt — the message
   instead offers "use a different email, or sign in on the web with that
   email" (a real, working option today via FR-AUTH-004's magic-link
   sign-in), matching FR-AUTH-006's own AC-7 wording constraint.
7. **TTL wording: "about 30 minutes," not FR-AUTH-004's stale "15 min."**
   Matches `upgrade.service.ts`'s real `UPGRADE_INTENT_TTL_MS = 30 * 60 *
   1000` comment ("~29 min observed for FR-AUTH-004"). Regression-tested
   (`test_upgrade_email_reply_sends_expected_payload_and_shows_success_message`
   asserts "15" is absent from the success message).
8. **No new keyboard file.** `/upgrade`'s FSM is text-only (prompt/reply),
   no inline buttons — confirmed against every AC; none implies a
   multi-choice UI for this flow.
9. **`request_upgrade()` returns `None` on success**, not a dataclass — the
   API always returns `{ok: true}` with no other payload to model; "did
   not raise" is the success signal, same posture the caller (handler)
   already treats it as.

## Architecture Rule Compliance

- Module boundaries: bot-only change, no cross-module NestJS call added
  (API side untouched).
- Tenant scoping: N/A — `/upgrade` operates on the caller's own Authentik
  identity via `telegram_id`, no cross-tenant data access.
- Zod at boundaries: N/A for this PR (API side unmodified); the existing
  `upgradeTempBodySchema` on the API side is unchanged and already
  Zod-validates `{telegramId, email}`.
- No cross-schema queries: bot has no direct DB access at all (thin-bot
  guarantee) — confirmed `test_thin_bot_guarantee.py` still passes
  unmodified, no new forbidden-credential-env-read introduced.
- No `any`/untyped Python: all new functions have full type hints,
  `from __future__ import annotations` used consistently with the rest of
  the codebase.
- Auth at controller level: N/A (API unmodified) — `InternalAuthGuard`
  already protects the endpoint this PR calls.

## Formatter Check

- `ruff format --check src/ tests/` — clean (61 files, 0 reformats needed
  after the one-time auto-format applied during development).
- `ruff check src/ tests/` — clean, no findings.
- No `mypy` configured in this project (not present in `pyproject.toml` or
  the venv) — `CodeDeveloper.md`'s "uv run mypy" step is aspirational
  boilerplate not applicable here; ruff + pytest are this project's actual
  gates, both clean.

## Known Limitations

- No live end-to-end verification performed at this step (Step 4 is
  code-only) — the Orchestrator performs real bot-simulated HTTP
  verification against the live local API at Step 8/13 per the task
  brief's explicit scoping (bot-side integration specifically, since
  FR-AUTH-006 already live-verified the underlying mechanism with 10 real
  round trips).
- The client-side email regex is intentionally simple (not RFC
  5322-complete) — documented as a UX nicety, not a validation boundary,
  in both the module docstring and this summary.

## Gate Result

gate_result:
  status: passed
  summary: "Bot-only implementation complete: new FSM state, new handler, new ApiClient method, updated locales/help/main.py wiring. ruff format + check clean, 165/165 pytest passing (19 new tests, 0 regressions)."
  findings:
    - "First real FSM usage in this bot — states/upgrade.py establishes the pattern FR-BOT-002's Notes committed to."
    - "No apps/api/ changes needed — the already-shipped upgrade-temp endpoint's contract matched the task brief exactly, confirmed by direct code read."
    - "is_temp short-circuit avoids a wasted API call for full-account users, following /me's existing precedent for reading the same middleware-attached field."
