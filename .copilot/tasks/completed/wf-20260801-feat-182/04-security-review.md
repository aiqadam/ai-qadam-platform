# 04 — Security Review: FR-BOT-002 PR 6/6 (`/upgrade`)

## Code Changes Reviewed

- `apps/bot/src/states/upgrade.py` (new)
- `apps/bot/src/handlers/upgrade.py` (new)
- `apps/bot/src/services/api_client.py` (modified — `request_upgrade()`, new exception types, `UPGRADE_TEMP_PATH`)
- `apps/bot/src/locales/ru.py`, `apps/bot/src/locales/en.py` (modified — new strings only)
- `apps/bot/src/main.py` (modified — router registration, `BOT_COMMANDS`)
- `apps/bot/tests/test_upgrade_handler.py`, `apps/bot/tests/test_api_client_upgrade.py` (new)
- `apps/bot/tests/conftest.py` (modified — `make_fsm_context()` helper)
- `apps/api/`: read-only. No files in `apps/api/src/modules/auth/` were
  modified by this PR — confirmed `git diff` against this branch touches
  no API-side file.

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1 Tenant isolation | No | N/A | `/upgrade` operates on the caller's own Authentik identity via `telegram_id`; no tenant-scoped table query anywhere in the bot (bot has no DB access at all). |
| INV-2 Secrets by reference | Yes | Pass | Diff has no hardcoded `password`/`secret`/`apiKey`/`token` literal. `INTERNAL_API_TOKEN` is read from `self._token` (existing `ApiClient` field, unchanged pattern every other method already uses) and sent only as the `x-internal-auth` header value — never logged, never interpolated into a message string. Confirmed by grep: zero `logger.`/`logging.` calls anywhere in the new `upgrade.py`/`api_client.py` additions — the collected email is never logged either (specifically flagged as a risk to check in `02-impact-analysis.md`; confirmed clean). |
| INV-3 Auth at controller level | N/A (bot-side only) | N/A | The API controller this PR calls (`TelegramInternalController.upgradeTemp`) already has `@UseGuards(InternalAuthGuard)`, unmodified by this PR. |
| INV-4 Validation at boundaries | Yes | Pass | Client-side format check (`_EMAIL_RE`) is explicitly documented (module docstring + code summary) as a UX nicety, not the validation boundary — the API's own `upgradeTempBodySchema` (Zod, unmodified) is the authoritative check. This is the correct posture: the bot never trusts its own regex as a security control, and a client-side check bypass (e.g. a future code path that skips it) cannot produce an unvalidated request reaching the API, since the API still validates independently. |
| INV-5 No cross-schema queries | Yes | Pass | Bot has zero direct DB access (thin-bot guarantee) — confirmed `test_thin_bot_guarantee.py` still passes unmodified against the new files; no new forbidden-credential-env read introduced (`DIRECTUS_TOKEN`/`AUTHENTIK_API_TOKEN`/`TWENTY_API_TOKEN` — none referenced). |
| INV-6 Rate limiting | N/A (bot-side only) | N/A | `RateLimitMiddleware` already applies to every inbound Telegram update (including `/upgrade`), unmodified by this PR — no new public HTTP endpoint was added; the bot is the caller, not a new server surface. |
| INV-7 CSRF | N/A | N/A | No browser-initiated state-changing request — Telegram bot surface only. |
| INV-8 `dangerouslySetInnerHTML` | N/A | N/A | Python/aiogram, not React. |
| INV-9 No N+1 queries | N/A | N/A | Single API call per email submission, no loop, no batching concern. |
| INV-10 Drizzle parameterization | N/A | N/A | No Drizzle/SQL touched by this PR (bot-only). |
| INV-11 HttpOnly tokens (web) | N/A | N/A | No web/cookie/token-storage surface touched. |

## Additional checks (beyond the standard 11, per 02-impact-analysis.md's specific risk flags)

- **FSM state does not outlive the request.** `state.clear()` is called on
  every exit path from `handle_upgrade_email_reply` — success, all 4 error
  branches, and the unresolved-identity guard — confirmed by direct code
  read and by the test suite's explicit
  `assert await state.get_state() is None` assertion after every branch
  (`test_upgrade_handler.py`). No path leaves a collected email sitting in
  FSM storage indefinitely.
- **`MemoryStorage` is process-local, not persisted to disk** (aiogram's
  own doc comment on the class: "all data is lost when the bot restarts").
  This means a collected-but-not-yet-submitted email exists only in
  process memory for the duration of the FSM state, never written to any
  file, log, or the bot's own SQLite cache (`UserCache` — confirmed
  `request_upgrade`/the handler never calls into `user_cache.py`).
- **Anti-enumeration posture preserved.** The API's `requestUpgrade()`
  (unmodified) already returns a uniform `200 {ok:true}` on the "no
  collision" path and only differentiates via the 404/409 status codes for
  genuinely different caller states (not found / not temp / email in use)
  — the bot renders 4 distinct messages, but none of them leaks anything
  the API itself doesn't already choose to disclose (e.g.
  `email_already_in_use` is the API's own deliberate AC-7 design, not a
  new bot-side information leak).

## BLOCKER Findings

None.

## MAJOR Findings

None.

## Gate Result

gate_result:
  status: passed
  summary: "No BLOCKER or MAJOR findings. Bot-only change with no new tenant/DB/auth surface; INTERNAL_API_TOKEN and collected email are never logged; client-side email regex correctly treated as UX-only, not a validation boundary; FSM state is cleared on every exit path (test-enforced)."
  findings:
    - "Confirmed zero logger/logging calls touch the collected email or INTERNAL_API_TOKEN anywhere in the new code."
    - "FSM state-clearing on every path is both code-reviewed and test-enforced (test_upgrade_handler.py asserts get_state() is None after every branch)."
    - "No apps/api/ files modified — the already-shipped upgrade-temp endpoint's own security posture (InternalAuthGuard, Zod validation, anti-enumeration-consistent 200) is untouched and out of this review's scope to re-verify beyond confirming no bot-side regression."
