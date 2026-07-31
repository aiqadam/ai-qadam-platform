# Test Design — wf-20260731-feat-174 (FEAT-BOT-2 PR 1/6)

workflow: wf-20260731-feat-174
agent: TestDesigner (performed directly by Orchestrator — tests were
written alongside the implementation in `03-code-summary.md`/
`03b-code-summary-bot.md`, per that step's own note; this artifact
documents the resulting design and closes any gaps found on review).

---

## Test files (already written, see code summaries for line-level detail)

**API side** (`apps/api/test/telegram-events-internal.spec.ts`, new — 20
tests):
- `TelegramAuthService.listUpcomingEvents` (4 tests): shape mapping,
  country scoping, offset/limit passthrough, empty-result handling.
- `TelegramAuthService.getEventDetail` (6 tests): no-directusUserId path,
  registered=true path, registered=false path, 404 body shape, guard
  filter presence.
- `TelegramInternalController.listEvents` (5 tests): happy path,
  defaults, missing-country 400, invalid-country 400, limit>50 400.
- `TelegramInternalController.getEventDetail` (4 tests): happy path,
  omitted-query-param path, non-UUID-id 400, 404 propagation.
- Guard-metadata checks (1 per controller describe block, 2 total,
  counted above): confirms `InternalAuthGuard` is still class-level.

**Bot side** (6 new files — 37 tests):
- `test_api_client_events.py` (9): request-shape assertions for both
  `list_events`/`get_event_detail`, empty-result, 5xx→`ApiUnavailableError`,
  network-error→`ApiUnavailableError`, 404→`EventNotFoundError`,
  directusUserId param presence/absence.
- `test_help_handler.py` (2): all-10-commands-present, unimplemented
  commands marked.
- `test_events_handler.py` (9, includes 2 pure-function `format_event_date`
  tests): empty state, ≤5-no-keyboard, >5-keyboard, API-unavailable,
  country=None, pagination-callback-next-page, pagination-callback-malformed-offset.
- `test_event_detail_handler.py` (7): usage message (no arg), register
  button, going button, no-user-context path, not-found, unavailable,
  placeholder-callback alert.
- `test_keyboards_events.py` (8): pure keyboard-shape assertions
  (single-page→None, first/middle/last-page button sets, callback-data
  offset math including the never-negative clamp, register/going labels).
- `test_main_wiring.py` (3): BOT_COMMANDS excludes `/event`, BOT_COMMANDS
  content, `build_dispatcher` router registration + workflow-data
  injection.

## Gap review (TestDesigner pass, post-hoc)

Reviewed the above against `06-test-strategy.md`'s AC mapping table for
anything asserted as covered but actually missing, or any FR-BOT-002
Notes item without a corresponding test:

- **Notes item "State machine (aiogram FSM) is used only for
  multi-step flows"** — N/A to this PR (no FSM introduced; `/help`,
  `/events`, `/event` are all single-shot). No gap.
- **Notes item "bot registers commands with BotFather via
  set_my_commands on startup"** — covered by `test_main_wiring.py`
  (content + exclusion of `/event`). One residual gap identified: no test
  asserts `run()` actually *calls* `bot.set_my_commands(...)` at startup
  (only that `BOT_COMMANDS` has the right content and `build_dispatcher`
  wires routers correctly) — `run()` itself constructs a live `Bot`
  object and isn't unit-testable without a much heavier mock of
  aiogram's `Bot` class. Judged acceptable: this is the same class of
  gap FR-BOT-001 already accepted for its own `bot.delete_webhook()` call
  in the same function (no existing test covers that either), so this
  PR is not introducing a new gap class, just extending an
  already-accepted one. Documented rather than silently left.
- **`x-internal-auth` header value correctness on the two new bot→API
  calls** — covered (`test_api_client_events.py`'s two "sends expected
  request shape" tests assert the header value explicitly, mirroring
  `test_auth_middleware.py`'s existing pattern for `lookup`).
- **All 3 handlers' registration order relative to `fallback`** — not
  directly unit-tested (would require simulating an actual dispatch, which
  `test_main_wiring.py`'s router-set check doesn't do), but structurally
  guaranteed by `main.py`'s explicit `include_router` call order + code
  comment, same level of rigor as FR-BOT-001's own `/start`-before-`fallback`
  ordering (also not independently order-tested). Consistent with existing
  precedent, not a new gap.

No BLOCKER/MAJOR gap found. Two residual MINOR gaps noted above are both
"extends an already-accepted pre-existing gap class," not new risk this
PR introduces — judged acceptable per TestDesigner's own authority
(AGENTS.md §14) rather than spending a retry cycle closing something
FR-BOT-001 itself left open at the same rigor level.

## Execution results

See `07-test-results.md` for the actual run output (typecheck, biome,
ruff, and both `pytest`/`vitest` suites).

## Gate Result

```yaml
gate: test-designer
workflow: wf-20260731-feat-174
status: passed
timestamp: 2026-08-01T01:20:00Z
summary: >
  57 new tests across both repos (20 API + 37 bot) map cleanly to
  06-test-strategy.md's AC table. Gap review found two MINOR residual
  gaps (set_my_commands call-site itself untested; handler registration
  order not independently order-tested) - both are extensions of gap
  classes FR-BOT-001 already accepted at the same rigor level for /start,
  not new risk introduced by this PR. No BLOCKER/MAJOR gap.
next_agent: test-runner
```
