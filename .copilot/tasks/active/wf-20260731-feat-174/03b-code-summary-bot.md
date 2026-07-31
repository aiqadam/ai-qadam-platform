# Code Summary — FEAT-BOT-2 PR 1/6, bot side (`apps/bot/`)

workflow: wf-20260731-feat-174
agent: CodeDeveloper (performed directly by Orchestrator)
scope of this invocation: **bot-side only** (Python/aiogram, submodule
`aiqadam/aiqadam-telegram-bot` mounted at `apps/bot/`) — API-side is
`03-code-summary.md`.

---

## Requirement Implemented

`/help`, `/events`, `/event <N>` per FR-BOT-002's functional-scope table,
scoped to the read-only slice per the invoking task.

**Submodule mechanics**: all work committed directly on the submodule's
own `main` branch (matching FR-BOT-001's exact precedent — see
`.copilot/tasks/completed/wf-20260731-feat-171/03b-code-summary-bot.md`).
Committed as `90900fea68beddfaf91aa188f330572e7fd52306` and pushed to
`aiqadam/aiqadam-telegram-bot@main`. The outer repo's gitlink bump is a
separate follow-up commit (Orchestrator's responsibility, done in
`08-doc-update.md`'s companion commit).

## Files Changed (all inside `apps/bot/`, submodule commit `90900fe`)

| File | Change |
|---|---|
| `src/handlers/help.py` (new) | `/help` — lists all 10 FR-BOT-002 commands, in FR order; unimplemented ones' locale strings carry a "coming soon" suffix. |
| `src/handlers/events.py` (new) | `/events` — fetches + renders a paginated list; `handle_events_page_callback` handles the Next/Previous inline buttons. Exports `format_event_date` (reused by `event_detail.py`) and `render_events_page`. |
| `src/handlers/event_detail.py` (new) | `/event <id>` — fetches + renders full detail with a Register/"I'm going" keyboard; `handle_register_placeholder` is the deliberate no-op callback (see Key Design Decisions #3). |
| `src/keyboards/events.py` (new) | `events_page_keyboard()` (Next/Previous row, `None` when only one page) and `event_detail_keyboard()` (Register/"I'm going" single button). First real keyboards in the bot — `keyboards/__init__.py`'s stub docstring said these would land alongside FR-BOT-002. |
| `src/keyboards/__init__.py` | Docstring updated (no longer purely a stub). |
| `src/locales/ru.py`, `en.py` | +34 new string keys (`help.*`, `events.*`, `event.*`) for the three new handlers, in both languages. |
| `src/services/api_client.py` | Added `EventListItem`/`EventListResult`/`EventDetail` dataclasses, `EventNotFoundError`, and `list_events()`/`get_event_detail()` methods — same `httpx` + `x-internal-auth` header pattern as the existing `lookup_telegram_user()`. |
| `src/main.py` | Registers the three new routers (`help`, `events`, `event_detail`) before `fallback`; injects `api_client` into `dispatcher["api_client"]` (aiogram workflow-data, matched into handlers by parameter name); extends `set_my_commands` to `/start`, `/events`, `/help` (NOT `/event` — see Key Design Decisions #2). |
| `tests/conftest.py` | Added `mock_edit_text`, `mock_callback_answer` context managers and `make_callback_query()` builder — same rationale as the existing `mock_answer`/`make_message_update` (aiogram's `Message`/`CallbackQuery` are frozen pydantic models). |
| `tests/test_api_client_events.py`, `test_help_handler.py`, `test_events_handler.py`, `test_event_detail_handler.py`, `test_keyboards_events.py`, `test_main_wiring.py` (all new) | 37 new tests. |

## Key Design Decisions

1. **`/help` lists all 10 commands, not just the 3 implemented** (explicit
   choice per task instruction to document rather than silently pick).
   Unimplemented commands' locale strings end in "(coming soon)" /
   "(скоро)" so `/help`'s output is honest about current state while still
   showing the full intended surface — a member reading `/help` sees where
   the bot is headed rather than being told a command doesn't exist and
   then having it silently appear later with no announcement. If a user
   runs an unimplemented command anyway, the existing `fallback.py`
   unknown-command handler answers exactly as today; no new handling
   needed.

2. **`/event` deliberately excluded from `set_my_commands`.** BotFather's
   command-menu convention has no way to express a required argument —
   registering `/event` there would show it in Telegram's UI without any
   way to supply `<id>`. `/event <id>` is matched by
   `handlers/event_detail.py`'s `Command("event")` filter +
   `CommandObject.args`, the same mechanism a BotFather-registered command
   uses under the hood; the only difference is whether it appears in the
   client's command-menu UI. This is the same reasoning FR-BOT-002's
   remaining PRs will need for `/register <N>` and `/cancel <N>`.
   Confirmed this matches the only existing precedent in the codebase:
   `/start` (the sole FR-BOT-001 command) takes no arguments and was
   already registered, so there was no prior example of an
   argument-taking command to contradict this reasoning.

3. **Register/"I'm going" button is a deliberate, documented placeholder.**
   `handle_register_placeholder` answers the callback with a "coming
   soon" alert (`show_alert=True`) rather than doing nothing or crashing.
   Actual registration ships in PR 2 of this FR's 6-PR sequence
   (`/register`). This is called out in both `event_detail.py`'s module
   docstring and here, per the task's explicit instruction not to ship a
   dead button silently.

4. **`/event <N>`'s `<N>` is the event's real UUID, not a short sequence
   number.** `events.id` is a genuine Directus UUID (see
   `03-code-summary.md`'s Validation section) — there is no separate
   short-number field in the schema, and adding one is out of scope for a
   read-only slice. `/events`' own list output prints each event's id
   under its entry (`events.item` locale string: `"{title} — {date}
   (записано: {count})\n/event {id}"`) so users have something to copy
   rather than needing to already know the id. Documented in
   `event_detail.py`'s module docstring as a note-worthy limitation for
   anyone expecting `<N>` to mean "a small integer."

5. **`api_client` injected via `dispatcher["api_client"]` (aiogram
   workflow data), not a new middleware.** FR-BOT-001 already threads
   `user_context`/`country` through middleware because those are
   *per-update, resolved* values. `api_client` is a long-lived singleton
   with no per-update state, so the simpler aiogram idiom (workflow data,
   injected into any handler that declares an `api_client` parameter by
   name) was used instead of over-engineering a middleware for a constant.

6. **`country=None` (unresolved user) shows a friendly unavailable
   message rather than crashing or guessing a default tenant.** This is a
   new error case beyond FR-BOT-002's documented four (API unavailable /
   user not found / event not found / already registered) — worth calling
   out explicitly since `/events`/`/event` are intentionally
   anonymous-browse-safe (no `/start`-first requirement, matching
   `TelegramEventsService`'s own posture on the web side), so "country
   unknown" is a real reachable state, not a should-never-happen case.

## Formatter Check

```
.venv/Scripts/python.exe -m ruff check .          → All checks passed!
.venv/Scripts/python.exe -m ruff format --check .  → 43 files already formatted
.venv/Scripts/python.exe -m pytest -v              → 66 passed in 0.62s (29 pre-existing + 37 new)
```

## Known Limitations

- **No integration test against a live API** — all HTTP-contract tests
  use `httpx.MockTransport` (matches FR-BOT-001's own established
  convention for this module; see `03-code-summary.md`'s Known
  Limitations for the API-side mirror of this same point). The mocked
  request/response shapes were cross-checked directly against the actual
  new API code (`telegram-auth.service.ts`'s wire shapes), not just the
  impact analysis's paraphrase.
- **`format_event_date` has no locale-aware formatting** — always renders
  `DD.MM.YYYY HH:MM` regardless of `lang`. Acceptable for this PR (both
  ru/en audiences read that format fine; it's not ambiguous like
  MM/DD/YYYY would be) but a future PR could localize further if ever
  needed.
- **`lang` is hardcoded to `"ru"` in all three new handlers** rather than
  reading a per-user locale preference — FR-BOT-001 has no locale
  preference storage yet (`UserContext` carries no `locale` field), and
  FR-BOT-002's Notes only require "English strings available via
  locales/en.json for users with locale=en" as a capability (the
  `t(key, lang)` function already supports this), not that this PR wire
  up per-user selection. Deferred to whichever future PR adds locale
  preference to `UserContext`/`/start`'s flow — not attempted here since
  it's a `/start`-FSM-refinement-class change, explicitly out of scope
  per the task brief.

## Gate Result

```yaml
gate: code-developer
workflow: wf-20260731-feat-174
status: passed
timestamp: 2026-08-01T00:45:00Z
summary: >
  Bot-side FEAT-BOT-2 PR 1/6 complete inside the aiqadam-telegram-bot
  submodule, committed on the submodule's own main branch at
  90900fea68beddfaf91aa188f330572e7fd52306 and pushed to
  aiqadam/aiqadam-telegram-bot@main. Implements /help (all 10 commands,
  unimplemented ones marked "coming soon"), /events (paginated, Next/
  Previous inline buttons, offset-based), and /event <id> (full detail +
  Register/"I'm going" placeholder button that shows a documented
  "coming soon" alert rather than a dead no-op). /event deliberately
  excluded from set_my_commands since it takes a required argument.
  ruff check, ruff format --check, and pytest (66/66: 29 pre-existing +
  37 new) all pass clean.
scope: bot-side-only
submodule_commit_sha: 90900fea68beddfaf91aa188f330572e7fd52306
submodule_branch: main
outer_repo_gitlink_status: modified (pointer bump not yet committed — Orchestrator's responsibility, done alongside 08-doc-update.md)
files_changed_count: 16
ruff_check: pass
ruff_format_check: pass
pytest: pass (66/66)
architecture_rules_confirmed: true
next_agent: security-reviewer
```
