# 01 — Requirement Validation: FR-BOT-002 PR 6/6 (`/upgrade`)

## Raw Input

Implement PR 6 of 6 (final) in the FR-BOT-002 ("Bot member commands") sequence:
the `/upgrade` bot command — lets a temp (Telegram-only) account upgrade to a
full member account via email verification, calling the already-shipped
FR-AUTH-006 API (`POST /v1/internal/telegram/upgrade-temp`). This is the last
unshipped command in FR-BOT-002's 10-command functional scope; all 9 others
(PR 1/6 through PR 5/6) are merged.

## Analysis

### Completeness Issues Found

None. FR-BOT-002.md's functional-scope table already specifies `/upgrade`'s
behavior ("Prompts for email to start the temp-account upgrade flow
(FR-AUTH-006). Sends a magic-link.") and its Notes section already commits to
the implementation mechanism ("State machine (aiogram FSM) is used only for
multi-step flows like `/start` ... and `/upgrade` (email collection)."). The
one remaining unchecked AC ("`/upgrade` starts the email verification flow
and sends the magic-link email") is directly testable against the real,
already-shipped `POST /v1/internal/telegram/upgrade-temp` endpoint.

### Conflicts with Existing Features

None. This is the final slice of an existing, already-registered FR
(`FR-BOT-002`, `requirements-registry.md` status `In Progress`). No new
requirement identifier is needed.

### Architectural Feasibility

Confirmed by reading the actual shipped code (not assumed from the task
brief) before writing this validation:

- `apps/api/src/modules/auth/auth.controller.ts` (`TelegramInternalController`,
  lines 595-641): `POST /v1/internal/telegram/upgrade-temp`,
  `InternalAuthGuard`-protected, `Zod`-validated via `upgradeTempBodySchema`
  (`{ telegramId, email }`). Delegates to `UpgradeService.requestUpgrade()`.
- `apps/api/src/modules/auth/upgrade.service.ts` (`requestUpgrade`, lines
  110-192): confirms the exact response contract —
  - `200 { ok: true }` on success (magic-link sent).
  - `404 NotFoundException({ error: 'telegram_user_not_found' })` — no
    Authentik user for this `telegramId`.
  - `409 ConflictException({ error: 'not_a_temp_account' })` — caller is
    already a full member.
  - `409 ConflictException({ error: 'email_already_in_use' })` — target
    email collides with a different Authentik user.
- This is exactly the contract the task brief described — no discrepancy
  found, no bot-callable adjustment needed to the already-shipped endpoint.
- TTL wording: `upgrade.service.ts` line 90 —
  `UPGRADE_INTENT_TTL_MS = 30 * 60 * 1000; // 30 min ... (~29 min observed
  for FR-AUTH-004)`. FR-BOT-002's own Notes/functional-scope table does not
  hardcode a TTL figure, but the task brief's instruction to use "~29
  minutes" (not FR-AUTH-004's stale "15 min" AC wording) is confirmed
  correct against the real code comment.
- FSM: `apps/bot/src/states/__init__.py` is still a stub ("No multi-step
  flows are needed yet ... ahead of FR-BOT-002/003"). No `StatesGroup` has
  been defined or used anywhere in the bot codebase yet — this PR is the
  first real FSM usage. `Dispatcher()` in `main.py` is constructed with no
  explicit `storage=` argument, so aiogram 3's default `MemoryStorage` is
  already in effect; no additional wiring is required for a single-process
  long-polling bot (confirmed against `ADR-0034`'s long-polling-only
  architecture — no multi-worker/multi-process deployment that would need a
  shared Redis-backed FSM storage).
- Precedent for the email-collection pattern within this bot: none exists
  yet (no prior FSM-based flow shipped), so this PR establishes the first
  one, following aiogram 3's standard `StatesGroup` + `state=<State>` filter
  + `FSMContext` idiom.
- `is_temp` is already available on `UserContext` (attached by
  `AuthMiddleware` on every update, confirmed in `middlewares/auth.py`) —
  the bot can short-circuit "already a full account" client-side without an
  extra API round trip, exactly as `/me` (PR 3/6) already does for its own
  temp/full branching. The API's own `not_a_temp_account` 409 remains a
  defensive fallback (e.g. a race where the account was upgraded between
  the client-side check and the API call), not the primary signal.
- No email-validation helper exists anywhere in `apps/bot/src` today
  (confirmed by search) — this PR adds the first one, a small regex-based
  format check (client-side only; the authoritative validation is Zod's
  `emailField` on the API side, already exercised by `upgradeTempBodySchema`
  — the bot's own check exists purely to avoid a wasted round trip for an
  obviously-malformed input, not as a security boundary).

No architectural violation: reuses the existing `InternalAuthGuard` +
internal-API convention, no new DB migration, no new Directus surface, no
cross-schema access.

### Completeness assessment (5 criteria)

1. **Specific** — yes: exact endpoint, exact request/response shapes, exact
   FSM shape (single state: awaiting email).
2. **Testable** — yes: the unchecked AC is directly verifiable end-to-end
   against the real local API.
3. **Non-conflicting** — yes, confirmed above.
4. **Scoped to one module layer** — yes: bot-side only (`apps/bot`); the
   API surface is complete and untouched (verify-only read, per the task
   brief).
5. **Referenced** — yes: `FR-BOT-002.md`, `FR-AUTH-006.md`, `FR-AUTH-004.md`.

## Formalized Requirement

`FR-BOT-002` PR 6/6: Add `/upgrade` command to the Telegram bot.

- New aiogram `StatesGroup` (`UpgradeStates`, single state
  `awaiting_email`) in `apps/bot/src/states/upgrade.py` (states package's
  first real content).
- New handler `apps/bot/src/handlers/upgrade.py`:
  - `/upgrade` command entry point. Short-circuits with a "already a full
    member" message if `user_context.is_temp` is `False` (no API call in
    that case — matches the task brief's explicit steer and the `/me`
    precedent for reading `is_temp` from middleware context directly).
    Guards on unresolved identity the same way every other command does
    (`event.unavailable` fallback).
  - Otherwise prompts for email, sets FSM state to `awaiting_email`.
  - A message handler scoped to `UpgradeStates.awaiting_email`: validates
    email format client-side (new small regex helper); on invalid format,
    re-prompts without leaving the state; on valid format, calls
    `ApiClient.request_upgrade(telegram_id, email)`, clears the FSM state
    regardless of outcome, and renders one of 4 distinct messages (success /
    `telegram_user_not_found` / `not_a_temp_account` / `email_already_in_use`
    / API-unavailable-retry).
- New `ApiClient.request_upgrade()` method + `UpgradeResult`/error-type
  additions in `apps/bot/src/services/api_client.py`, following the
  existing method-per-endpoint convention exactly (see
  `toggle_interest`/`register_for_event` for the nearest shape — POST with
  a JSON body, mapped status codes to typed exceptions).
- New locale strings (`upgrade.*`) in `locales/ru.py` + `locales/en.py`.
- `/help`'s `help.upgrade` locale string loses its "(coming soon)"/"(скоро)"
  suffix, matching PR 2-4's precedent for their own commands.
- `main.py`: `/upgrade` added to `BOT_COMMANDS` (takes no argument, same
  category as `/me`/`/leaderboard`/`/interests`), new `upgrade` router
  included before `fallback`.
- Outer repo: submodule pointer bump to the new `apps/bot` commit, plus the
  FR-BOT-002.md Implementation-progress update marking PR 6/6 shipped and
  flipping FR-BOT-002 to terminal status (all 10 commands now implemented).

## Acceptance Criteria (draft)

- **AC-1 (existing, unchecked in FR-BOT-002.md):** `/upgrade` starts the
  email verification flow and sends the magic-link email. Given a temp-user
  session, when `/upgrade` is run and a syntactically valid, available email
  is supplied, then the bot calls `POST /v1/internal/telegram/upgrade-temp`
  and renders a success message referencing the magic link.
- **AC-2 (new, this PR):** A full-account user running `/upgrade` receives a
  friendly "already a full member" message and no API call is made (verified
  by a test asserting the mock transport is never invoked for this case).
- **AC-3 (new, this PR):** An invalid-format email re-prompts the user
  without leaving the `awaiting_email` state (verified by a state-transition
  test) and without calling the API.
- **AC-4 (new, this PR):** `telegram_user_not_found` (404) renders a
  distinct message from `not_a_temp_account`/`email_already_in_use` (both
  409, distinguished by response body `error` field).
- **AC-5 (new, this PR):** `email_already_in_use` renders messaging that
  instructs the user to try a different email or sign in with that email
  (soft/generic reference only — FR-AUTH-005 does not exist as a clickable
  feature yet, so the copy must not overclaim it).
- **AC-6 (new, this PR):** API-unavailable (network error / 5xx) renders the
  bot's standard retry message, matching the existing convention every other
  handler already uses.
- **AC-7 (new, this PR):** `/help`'s output includes `/upgrade` without a
  "(coming soon)" suffix, and `BOT_COMMANDS` includes `/upgrade`.

## Gate Result

gate_result:
  status: passed
  summary: "FR-BOT-002 PR 6/6 (/upgrade) is specific, testable, non-conflicting, and architecturally feasible against the already-shipped FR-AUTH-006 API; no new FEAT-ID needed."
  findings:
    - "Confirmed API contract (POST /v1/internal/telegram/upgrade-temp, {telegramId, email} -> 200 {ok:true} / 404 telegram_user_not_found / 409 not_a_temp_account / 409 email_already_in_use) directly against upgrade.service.ts and auth.controller.ts — matches the task brief exactly, no discrepancy."
    - "apps/bot/src/states/__init__.py is still a stub — this PR is the bot's first real aiogram FSM usage. Dispatcher() already defaults to MemoryStorage, sufficient for this single-process long-polling deployment (ADR-0034)."
    - "No existing email-validation helper in apps/bot/src — this PR adds the first one, client-side format check only, not a security boundary (Zod's emailField on the API side is authoritative)."
    - "is_temp already available on UserContext via AuthMiddleware — /upgrade can short-circuit full-account users client-side without an API call, per /me's existing precedent."
