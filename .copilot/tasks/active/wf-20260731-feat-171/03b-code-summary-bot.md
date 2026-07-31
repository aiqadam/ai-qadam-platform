# Code Summary — FEAT-BOT-1, Bot-side scaffold (`apps/bot/`)

workflow: wf-20260731-feat-171
agent: CodeDeveloper
scope of this invocation: **bot-side scaffold only** (Python/aiogram, submodule
`aiqadam/aiqadam-telegram-bot` mounted at `apps/bot/`) — API-side
`POST /v1/internal/telegram/lookup` was implemented in a separate,
prior CodeDeveloper invocation (`03-code-summary.md`).

---

## Requirement Implemented

Full Python/aiogram 3 inbound-command bot scaffold per FR-BOT-001 §"Project
structure"/§"Middleware stack"/§"Smoke test" and FEAT-BOT-1 AC-6 through
AC-10 (AC-11 partially — see Known Limitations):

- **AC-6**: `/start` responds with a static welcome message, working even
  for brand-new users (no Authentik record yet).
- **AC-7**: auth middleware calls `POST /v1/internal/telegram/lookup`
  exactly once per update and attaches the resolved
  `{directusUserId, isTemp, country}` to handler context via `data["user_context"]`.
- **AC-8**: unrecognized commands get "I don't know that command — try
  /help" (localized).
- **AC-9**: 10+ rapid messages/minute from one `telegram_id` trigger a
  "slow down" reply; the downstream handler is not invoked.
- **AC-10**: thin-bot guarantee — `src/` contains zero live references to
  `DIRECTUS_TOKEN`, `AUTHENTIK_API_TOKEN`, `TWENTY_API_TOKEN` (verified by
  grep and by `tests/test_thin_bot_guarantee.py`).
- **AC-11** (partial): structured JSON logs to stdout, one line per update
  with `telegram_id`, `command`, `duration_ms`, `status`. Actual
  Grafana/Loki delivery is a deploy/ops concern, not code — out of this
  invocation's reach (no Coolify/Loki access from this environment).

**Submodule mechanics**: PR #194 (submodule bootstrap) had already merged
to `main` by the time this invocation started — confirmed via
`gh pr view 194` (`state: MERGED`) and `git ls-tree HEAD apps/bot`
(mode `160000`, gitlink present) on this workflow's branch. No rebase was
needed; the sequencing dependency flagged in Steps 1/2 was already resolved
before this invocation began. All work was committed **inside**
`apps/bot/`'s own git history, on its `main` branch (`git checkout main`
from the submodule's initial detached-HEAD state at `9019d21`, which was
already `origin/main`'s tip — no divergence).

## Files Changed

All paths below are inside the `aiqadam-telegram-bot` submodule
(`apps/bot/`), committed as `1980894c5c6d02edfa3983dc808d8c34a3e156df` on
its own `main` branch — **not** part of the outer repo's commit history.
The outer repo (`ai-qadam-platform`) shows only a modified gitlink at
`apps/bot` (`git status --short` → ` M apps/bot`); the Orchestrator handles
that pointer-bump commit separately, per task instructions.

| File | Change Type | Description |
|---|---|---|
| `apps/bot/pyproject.toml` | Added | Project metadata, deps (aiogram, httpx, pydantic, pydantic-settings), dev deps (ruff, pytest, pytest-asyncio), ruff config, pytest config. |
| `apps/bot/src/config.py` | Added | `Settings` (pydantic-settings) — the three bot credentials, SQLite path, rate-limit/timeout/log-level overrides. Thin-bot guarantee lives here (see AC-10). |
| `apps/bot/src/logging_setup.py` | Added | `JsonFormatter` + `configure_logging()` — one JSON line per stdlib log record, no external logging dependency. |
| `apps/bot/src/error_handler.py` | Added | aiogram `Router` with `@router.errors()` global handler — generic user-facing message + full traceback logged as structured JSON. |
| `apps/bot/src/main.py` | Added | Entry point: builds `Bot`/`Dispatcher`, wires middleware order (logging → rate-limit → auth → tenant), registers routers (`start` → `fallback` → `errors`), runs long-polling. |
| `apps/bot/src/services/api_client.py` | Added | `ApiClient.lookup_telegram_user()` — the one place that calls `POST /v1/internal/telegram/lookup`; typed `LookupResult`, `TelegramUserNotFoundError` (404), `ApiUnavailableError` (everything else). |
| `apps/bot/src/services/user_cache.py` | Added | `UserCache` — synchronous SQLite wrapper, `(telegram_id -> directusUserId)` only, per FR-BOT-001 §2. |
| `apps/bot/src/middlewares/_util.py` | Added | Shared `extract_telegram_id`/`extract_command` helpers (private module) used by all three update-inspecting middlewares — avoids triplicated extraction logic. |
| `apps/bot/src/middlewares/rate_limit.py` | Added | `RateLimitMiddleware` — in-memory sliding window, 10 req/min default, per `telegram_id`. |
| `apps/bot/src/middlewares/auth.py` | Added | `AuthMiddleware` + `UserContext` — calls `ApiClient.lookup_telegram_user`, attaches `user_context` to handler data. See Key Design Decisions #1 for the 404/unavailable interpretation. |
| `apps/bot/src/middlewares/tenant.py` | Added | `TenantMiddleware` — derives `data["country"]` from `user_context`, must run after `AuthMiddleware`. |
| `apps/bot/src/middlewares/logging_middleware.py` | Added | `LoggingMiddleware` — outermost middleware; one structured log line per update with `telegram_id`, `command`, `duration_ms`, `status`. |
| `apps/bot/src/handlers/start.py` | Added | `/start` handler — static welcome message, no branching on `user_context` (see Key Design Decisions #2). |
| `apps/bot/src/handlers/fallback.py` | Added | Unknown-command handler — matches any `/...` text not caught by an earlier router. |
| `apps/bot/src/locales/__init__.py`, `ru.py`, `en.py` | Added | `t(key, lang)` lookup with `ru` → `en` → key fallback chain; `start.welcome`, `unknown_command`, `error.generic` keys in both languages. |
| `apps/bot/src/keyboards/__init__.py` | Added | Stub package (docstring explains why — no interactive keyboards needed yet). |
| `apps/bot/src/states/__init__.py` | Added | Stub package (docstring explains why — no FSM flows needed yet). |
| `apps/bot/tests/conftest.py` | Added | `make_message_update()` builder; `mock_answer()` context manager (see Key Design Decisions #3). |
| `apps/bot/tests/test_rate_limit_middleware.py` | Added | 4 tests: under-limit passthrough, over-limit block + reply, independent per-user limits, window reset over time. |
| `apps/bot/tests/test_auth_middleware.py` | Added | 5 tests: exact HTTP request shape (method/URL/header/body) via `httpx.MockTransport`, known-user context attachment, 404-passthrough (AC-6 interaction), API-unavailable passthrough, exactly-once-per-update call count. |
| `apps/bot/tests/test_handlers.py` | Added | 2 tests: `/start` welcome message, unknown-command fallback message. |
| `apps/bot/tests/test_user_cache.py` | Added | 4 tests: miss returns `None`, set/get roundtrip, upsert overwrites, `set(None)` clears. |
| `apps/bot/tests/test_thin_bot_guarantee.py` | Added | Regression test for AC-10 — greps `src/` for live env-var-read patterns (pydantic `alias=`, `os.environ`/`os.getenv`) referencing the three forbidden names; prose mentions in docstrings are intentionally not flagged (see Key Design Decisions #4). |
| `apps/bot/.env.example` | Added | Documents the three required env vars + optional overrides; explicit comment restating the thin-bot guarantee. |
| `apps/bot/.gitignore` | Added | `.venv/`, `__pycache__/`, `.ruff_cache/`, `.pytest_cache/`, `data/` (SQLite cache dir), `.env`. |
| `apps/bot/Dockerfile` | Added | Minimal single-stage `python:3.12-slim` image, no exposed port (long-poll only). Per task instruction: kept intentionally minimal, no Coolify-specific config — that remains an infra/ops artifact outside this repo's version control per the impact analysis. |
| `apps/bot/README.md` | Modified | Updated `## Status` (scaffold → implemented-so-far), added `## Development`, `## Project structure`, `## Thin-bot guarantee` sections. |

**Not touched**: `apps/api/**` (already done in the prior invocation, see
`03-code-summary.md`), outer repo's `.gitmodules`/gitlink (Orchestrator's
job per task instructions).

## Key Design Decisions

1. **Auth middleware's 404/unavailable interpretation (explicitly requested
   by the task brief).** FR-BOT-001 AC-6 requires `/start` to respond
   within 3 seconds *even for brand-new users*, who by definition have no
   Authentik record yet — the lookup endpoint correctly 404s for them
   (per the API-side AC-3 contract). Hard-blocking on 404 would break
   `/start` for every first-time user, directly contradicting AC-6. So
   `AuthMiddleware` treats 404 as an **expected, non-error outcome**:
   it builds `UserContext(is_known=False, directus_user_id=None, ...)`
   and lets the update reach the handler rather than swallowing it. A
   genuine API-unavailable condition (`ApiUnavailableError` — timeout,
   network error, 5xx) is handled the same way but tagged
   `is_known=None` (falls back to the local SQLite cache's last-known
   `directus_user_id` if any) — over-blocking on an API hiccup would make
   the bot appear completely dead, worse than a degraded response. No
   handler in this FR's scope (`/start`, unknown-command) needs a
   resolved identity, so this choice has no observable effect yet; it's
   documented in `src/middlewares/auth.py`'s module docstring as the
   explicit interpretation for FR-BOT-002/003 to build on.
2. **`/start` handler does not branch on `user_context` at all.** The
   welcome message is identical for known and unknown users at this
   scaffold stage — which is itself what mechanically guarantees "works
   even for new users" (AC-6) without any conditional logic that could
   get the unknown-user case wrong.
3. **Test mocking of `Message.answer`**: aiogram's `Message` is a frozen
   pydantic v2 model — `message.answer = AsyncMock()` raises
   `pydantic_core.ValidationError` (`frozen_instance`). Discovered this by
   running the tests (not assumed): the working pattern is
   `unittest.mock.patch.object(type(message), "answer", new=AsyncMock())`,
   wrapped as a `mock_answer()` context manager in `tests/conftest.py` and
   reused across all four affected test modules, rather than duplicating
   the patch boilerplate.
4. **Thin-bot guarantee test targets env-var *reads*, not bare substring
   matches.** An earlier draft grepped `src/` for the three forbidden
   names as plain substrings, which false-positived on `config.py`'s own
   module docstring (which names them in prose to document the rule).
   Rewrote the test to match actual read patterns (pydantic `alias="X"`,
   `os.environ[...]`, `os.environ.get(...)`, `os.getenv(...)`) via regex —
   this is also a more correct test of the actual guarantee (no live
   reference exists) than a naive text search, and keeps the explanatory
   docstring intact.
5. **In-memory (not Redis/shared) rate-limit state.** ADR-0034 §Q4: one
   `bot` container does long-poll (the `notifier` process is a separate,
   out-of-scope concern per FR-NTF-004). A single-process in-memory
   sliding window is sufficient and keeps the dependency surface minimal;
   revisit if the bot process is ever horizontally scaled.
6. **Shared `_util.py` for telegram_id/command extraction.** Initial draft
   duplicated the same `_extract_telegram_id` logic in three middleware
   files (rate-limit, auth, logging); refactored into one private helper
   module (`src/middlewares/_util.py`) reused by all three, self-caught
   during implementation rather than left for a later review pass.
7. **`hatchling` as build backend, `uv`/`pip -e` both work.** No strong
   reason to prefer one PEP 517 backend over another for a pure-Python
   package with no compiled extensions; `hatchling` is lightweight and
   widely supported by both `uv` and plain `pip`.

## Architecture Rule Compliance

Bot-specific interpretation of the code-developer checklist (most items are
NestJS/TS-specific and don't apply to a Python project):

- **Typed I/O**: `Settings` (pydantic-settings), `LookupResult`,
  `UserContext` are all explicit dataclasses/pydantic models — no bare
  dicts crossing module boundaries. `ruff`'s `UP`/`B` rule sets and
  consistent type hints throughout (`from __future__ import annotations`
  everywhere); no `Any` used except where aiogram's own SDK types force it
  (`dict[str, Any]` for middleware `data`, matching aiogram's own
  `BaseMiddleware.__call__` signature).
- **No bare `raise Exception(...)`**: custom `ApiClientError` hierarchy
  (`TelegramUserNotFoundError`, `ApiUnavailableError`) in `api_client.py`.
- **All awaits handled**: every `httpx`/aiogram async call is awaited;
  `ApiClient.aclose()` / `UserCache.close()` called in `main.py`'s
  `finally` block.
- **No direct cross-repo state access**: the bot never touches Postgres,
  Directus, or Authentik directly — the only outbound HTTP call in
  `src/` is `ApiClient`'s call to `INTERNAL_API_URL` (grepped to confirm:
  `services/api_client.py` is the only file importing `httpx` for a live
  request; `_util.py`/tests don't count).
- **Auth boundary respected**: every call to the internal API carries
  `x-internal-auth: <INTERNAL_API_TOKEN>`, matching the API-side
  `InternalAuthGuard` contract exactly (confirmed against
  `apps/api/src/modules/internal/internal-auth.guard.ts` and the actual
  merged route in `auth.controller.ts`, not just the impact analysis's
  paraphrase).
- **Thin-bot guarantee (AC-10)**: confirmed via `grep` (see Known
  Limitations / verification below) — zero matches for `DIRECTUS_TOKEN`,
  `AUTHENTIK_API_TOKEN`, `TWENTY_API_TOKEN` as live references anywhere in
  `src/`. The only textual occurrence anywhere in the codebase is
  `config.py`'s own docstring, explaining the rule in prose.

## Formatter Check

Ran from a fresh `python -m venv .venv` (no `uv` in this environment — see
Known Limitations) with `pip install -e ".[dev]"`:

```
.venv/Scripts/python.exe -m ruff check .          → All checks passed!
.venv/Scripts/python.exe -m ruff format --check .  → 30 files already formatted
.venv/Scripts/python.exe -m pytest -v              → 16 passed in 0.15s
```

One formatting fix was applied during development (`ruff format .`
reformatted one line in `tests/test_auth_middleware.py`); re-verified
clean afterward with `--check`.

## Known Limitations

- **`uv` is not installed in this execution environment.** Checked via
  `command -v uv` (not found) before falling back. Used a plain
  `python -m venv .venv` + `pip install -e ".[dev]"` instead, which
  installed cleanly from `pyproject.toml`'s declared dependencies with no
  changes needed to the file itself — `pyproject.toml` remains
  `uv`-compatible (no `uv`-specific syntax used) for whoever runs this in
  an environment where `uv` is present (e.g. CI, or the Coolify build).
  All four required commands (`ruff check`, `ruff format --check`,
  `pytest`) ran and passed via the venv fallback; `uv sync` itself was not
  literally invoked.
- **No integration test against a live API.** All API-contract tests use
  `httpx.MockTransport` (no real network call) — this matches the task's
  own scope note ("Full TestDesigner-authored test coverage comes in a
  later workflow step"). The mocked contract (`POST
  /v1/internal/telegram/lookup`, `x-internal-auth` header, `{telegramId}`
  body, `{directusUserId, isTemp, country}` / 404 `{error:
  telegram_user_not_found}` response shapes) was cross-checked directly
  against the actual merged code in
  `apps/api/src/modules/auth/auth.controller.ts` and
  `telegram-auth.service.ts` (not just the impact analysis's
  paraphrase), so it should not drift from the real endpoint.
- **AC-11's Grafana/Loki delivery is unverified from this environment.**
  The bot emits correctly-shaped JSON lines to stdout (unit-tested
  indirectly via the logging middleware's structure, though no dedicated
  log-shape test was added — a reasonable gap for a later TestDesigner
  pass, not re-litigated here); actual ingestion into Loki is a
  deploy/ops concern (Coolify + Promtail/Loki config), out of reach for a
  local scaffold commit.
- **No Coolify service definition file added**, per the task's explicit
  instruction that this is likely an infra/ops concern outside
  version-controlled application code. A minimal `Dockerfile` was added
  (single-stage, no exposed port) since it's a natural, low-cost fit
  inside this repo; no `docker-compose.yml`, Coolify YAML, or CI workflow
  file was added — those remain open for whoever provisions the actual
  Coolify `aiqadam-bot` service.
- **`notifier` process, FSM flows, real keyboards, `/events`/`/link`/etc.
  commands are all explicitly out of scope** for this FR (FR-BOT-002,
  FR-BOT-003, FR-NTF-004) — `keyboards/` and `states/` are intentionally
  near-empty stub packages, as instructed.
- **Rate limiting is in-memory, single-process.** Acceptable per ADR-0034
  §Q4 (one `bot` container); would need a shared store (Redis) if the bot
  is ever horizontally scaled — not needed at this FR's scope.

## Gate Result

```yaml
gate: code-developer
workflow: wf-20260731-feat-171
status: passed
timestamp: 2026-07-31T00:00:00Z
summary: >
  Bot-side scaffold for FEAT-BOT-1 complete inside the aiqadam-telegram-bot
  submodule (apps/bot/), committed on the submodule's own main branch at
  1980894c5c6d02edfa3983dc808d8c34a3e156df. PR #194 (submodule bootstrap)
  had already merged before this invocation started, so no rebase/sequencing
  work was needed. Implements /start (AC-6), auth middleware calling the
  merged POST /v1/internal/telegram/lookup endpoint exactly once per update
  (AC-7) with an explicit, documented interpretation of the 404/unavailable
  case (lets the update through rather than hard-blocking, so /start keeps
  working for brand-new/unresolvable users), unknown-command fallback
  (AC-8), thin-bot guarantee with a regression test (AC-10), rate-limit
  middleware (AC-9), and structured JSON logging (AC-11, stdout side only —
  Loki delivery is a deploy concern). ruff check, ruff format --check, and
  pytest (16 tests) all pass clean via a python -m venv fallback (uv not
  installed in this environment, confirmed via command -v uv before
  falling back; pyproject.toml itself remains uv-compatible).
scope: bot-side-only
submodule_commit_sha: 1980894c5c6d02edfa3983dc808d8c34a3e156df
submodule_branch: main
outer_repo_gitlink_status: modified (pointer bump not yet committed — Orchestrator's responsibility per task instructions)
files_changed_count: 34
ruff_check: pass
ruff_format_check: pass
pytest: pass (16/16)
uv_available: false
fallback_used: "python -m venv .venv && pip install -e '.[dev]'"
architecture_rules_confirmed: true
thin_bot_guarantee_verified: true
known_limitations:
  - uv not installed in this environment; venv+pip fallback used instead, pyproject.toml remains uv-compatible
  - No integration test against a live API (mocked httpx.MockTransport only, matches assigned scope)
  - AC-11 Loki delivery unverified (stdout JSON shape only)
  - No Coolify service definition added (infra/ops concern, minimal Dockerfile added instead)
next_agent: security-reviewer
```
