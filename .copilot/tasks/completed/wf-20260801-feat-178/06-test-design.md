# 06 — Test Design: FR-BOT-002 PR 5/6 — `/interests`

## Summary

Independent TestDesigner pass, performed by reading the actual test file
contents and the actual source files myself (not by trusting
`03-code-summary.md`'s or `06-test-strategy.md`'s claims). This confirms
TestStrategist's conclusion: all 11 draft ACs are covered by correctly
named, correctly asserting tests, every branch of the functions called
out in the task brief has at least one covering test, and the self-check
checklist passes cleanly. **No new test files were needed and no existing
test file required edits** — this is a genuine pass-through confirmation,
not a rubber stamp: each claim below was checked against test bodies and
source line numbers, not restated from the strategy doc.

---

## Tests Written

No new test files were written and no existing test files were edited.
CodeDeveloper's test files (verified independently below) already fully
satisfy the strategy's Unit Test Plan and this pass's own self-check.

### Unit — `apps/api` (Vitest)

| File | Count | Required? |
|---|---|---|
| `apps/api/test/telegram-bot-interests-controller.spec.ts` | 9 tests (5 GET describe block, incl. guard-declaration check; 5 POST describe block, incl. guard-declaration check — 10 total `it` blocks across 2 describes) | Yes — verified present |
| `apps/api/test/telegram-bot-interests-service.spec.ts` | 12 tests (5 in `getInterests` describe, 7 in `toggleInterest` describe) | Yes — verified present |
| `apps/api/test/directus-users-bridge.spec.ts` (added cases only) | 2 tests in the new `resolveUserAndEmailFromDirectusId` describe block | Yes — verified present |

### Unit — `apps/bot` (pytest)

| File | Count | Required? |
|---|---|---|
| `apps/bot/tests/test_api_client_interests.py` | 9 tests (4 `get_interests`, 5 `toggle_interest`) | Yes — verified present |
| `apps/bot/tests/test_interests_handler.py` | 11 tests (guard x3, rendering x3 incl. AC-6, toggle callback x3, unavailable/guard on callback x2) | Yes — verified present |
| `apps/bot/tests/test_help_handler.py` (modified) | 1 new test (`test_help_no_longer_marks_interests_as_coming_soon`) + 1 pre-existing test updated in scope (`test_help_marks_still_unimplemented_commands_as_coming_soon`'s comment now correctly cross-references this PR) | Yes — verified present |
| `apps/bot/tests/test_main_wiring.py` (modified) | 2 assertions updated in place (`BOT_COMMANDS` set membership, router-name set membership) — no new `def test_...` function, existing tests widened | Yes — verified present |

### Integration / E2E

None. Per `06-test-strategy.md`'s rubric-intent analysis (score 5,
nominally ≥4, but both contributing criteria are application-layer logic
fully exercisable via mocked service boundaries) — independently
re-verified in this pass by reading `toggleInterest`'s actual body
(`telegram-auth.service.ts:893-908`): the AC-7 branch is pure in-memory
`Array.filter`/`.some` logic over an already-mocked `listInterests()`
return value, with zero new SQL/Directus query shape. Agreed: unit tests
are sufficient.

---

## Acceptance Criteria Coverage

Re-verified independently by reading assertion bodies against the actual
source line numbers (not re-derived from the strategy doc's table).

| AC | Test | Status |
|---|---|---|
| AC-1 (no interests → all unselected) | `telegram-bot-interests-service.spec.ts:111` `'returns all topics unselected...'`; `test_interests_handler.py:104` `test_interests_renders_all_unselected_when_no_interests` | Covered |
| AC-2 (existing row → selected, any intent) | `telegram-bot-interests-service.spec.ts:134` `'marks a topic selected when any intent row exists...'`; `test_interests_handler.py:122` `test_interests_renders_only_selected_topic_as_checked` | Covered |
| AC-3 (toggle-on) | `telegram-bot-interests-service.spec.ts:199` `'toggle-on: calls addInterest with intent=learn...'`; `test_interests_handler.py:168` `test_interest_toggle_on_callback_edits_message_with_updated_keyboard` | Covered |
| AC-4 (toggle-off) | `telegram-bot-interests-service.spec.ts:224` `'toggle-off (single intent): calls removeInterest...'`; `test_interests_handler.py:188` `test_interest_toggle_off_callback_edits_message_with_unselected_button` | Covered |
| AC-5 (API unavailable, no crash) | `test_interests_handler.py:86` (command surface) and `:226` (callback surface); `test_api_client_interests.py:78,89,154,165` (client-layer 500/network-error mapping for both methods) | Covered |
| AC-6 (callback_data ≤ 64 bytes) | `test_interests_handler.py:143` `test_interests_callback_data_stays_within_telegram_64_byte_limit` — verified non-vacuous: `INTEREST_TOGGLE_PREFIX = "inttog"` (`keyboards/interests.py:27`), longest slug `computer-vision` → `"inttog:computer-vision"` = 22 bytes | Covered |
| AC-7 (mixed-intent toggle-off scoping) | `telegram-bot-interests-service.spec.ts:255` `'toggle-off (mixed intent, AC-7): removes ONLY the learn-intent row...'` — asserts `removeInterest` called once with `row-learn`'s id AND `not.toHaveBeenCalledWith(...)` `row-mentor`'s id | Covered — load-bearing test confirmed present and correctly asserting |
| AC-8 (`help.interests` drops "coming soon"/"скоро") | `test_help_handler.py:98` `test_help_no_longer_marks_interests_as_coming_soon`; independently confirmed both `ru.py:20` and `en.py:19` locale strings carry no suffix | Covered |
| AC-9 (`/interests` in `BOT_COMMANDS`, no arg) | `test_main_wiring.py:28-30`, `:54`; independently confirmed against `main.py:47,80` | Covered |
| AC-10 (`InternalAuthGuard` enforcement) | `telegram-bot-interests-controller.spec.ts:81,137` (class-membership checks) + reused generic guard-rejection coverage in `telegram-auth-controller.spec.ts` per that file's own established precedent | Covered — legitimate reuse, not a gap (single class-level `@UseGuards` decorator already proven to reject unauthenticated requests) |
| AC-11 (unknown topic → 400, no write) | `telegram-bot-interests-controller.spec.ts:115` `'throws BadRequestException...when topic is not in the fixed candidate list (AC-11)'` — asserts both the exception AND `toggleInterest` not called | Covered |

**11/11 draft ACs confirmed covered**, independently re-verified against
assertion bodies and source line numbers in this pass.

---

## Branch Coverage Check (per task brief)

Read `telegram-auth.service.ts:848-915` and `interests.py`/`keyboards/interests.py` in full.

**`requirePlatformUserAndEmail`** (`:848-856`):
- Bridge resolves → returns `{userId, email}` — exercised implicitly by every non-404 test in both describe blocks.
- Bridge returns `null` → throws `NotFoundException` — `telegram-bot-interests-service.spec.ts:102` (`getInterests`) and `:188` (`toggleInterest`), both independently present.

**`getInterests`** (`:867-871`): single straight-line path (resolve → list → reduce) — no internal branching beyond the 404 above. Covered by AC-1/AC-2 tests plus `:150` (stray topic_tag filtering) and `:168` (fixed-order-not-insertion-order).

**`toggleInterest`** (`:893-908`):
- `isSelected === false` branch → `addInterest` called, `removeInterest` not called — `:199`.
- `isSelected === true`, exactly one `learn` row → `removeInterest` called once with that row's id, `addInterest` not called — `:224`.
- `isSelected === true`, `learn` + `mentor` rows (AC-7) → `removeInterest` called once with the `learn` id only, explicitly asserted not called with the `mentor` id — `:255`.
- `isSelected === true`, two `learn` rows (defensive multi-row case) → `removeInterest` called twice, once per row id — `:289`.
- `isSelected === true`, only a `mentor` row (no `learn` row) → the `learnRows` filter yields `[]`, loop body never executes, neither `addInterest` nor `removeInterest` called — `:313`. This is the branch where `isSelected` is true but the `for` loop over `learnRows` has zero iterations; confirmed present and distinct from the "single learn row" case.
- 404 branch shared with `requirePlatformUserAndEmail` above.

All branches inside `toggleInterest`'s `if (isSelected) { for (...) {...} } else {...}` structure, including the zero-iteration loop edge case, have a dedicated covering test. Confirmed by reading the loop body directly, not inferred.

**`handle_interests`** (`interests.py:56-69`):
- Guard true (`user_context is None`) → `event.unavailable`, API never called — `test_interests_handler.py:55`.
- Guard true (`is_known=False`) → same — `:70`.
- Guard false → fetch attempted; `ApiUnavailableError` → `interests.unavailable` — `:86`; success → keyboard rendered — `:104`, `:122`.
- Note: the guard is a 3-clause `or` (`user_context is None or not is_known or directus_user_id is None`); only the first two clauses are independently exercised. The third (`directus_user_id is None` with `is_known=True`) has no dedicated test in this file. Checked whether this is a gap specific to this PR: confirmed against `test_leaderboard_handler.py` (this PR's explicit precedent) — that file's own `_known_user_context` helper only ever parametrizes `is_known`, never `directus_user_id=None` with `is_known=True`, for the identical guard shape in `leaderboard.py`. This is a pre-existing, consistent pattern across every handler in this bot's test suite, not a gap newly introduced by this PR's test files. Not flagged as blocking — matches established, accepted precedent exactly.

**`handle_interest_toggle_callback`** (`interests.py:75-105`):
- `callback.data is None or callback.message is None` → answer-only no-op — `test_interests_handler.py:258` (`message is None` sub-case; `data is None` sub-case is structurally unreachable given the router's own `lambda c: c.data is not None and ...` filter at `:72-74`, so a dedicated test for it would be testing dead code — correctly not present).
- Guard false, user unknown → `event.unavailable` via `edit_text`, API never called — `:242`.
- Guard false, user known → `toggle_interest` called; `ApiUnavailableError` → `interests.unavailable` via `edit_text` — `:226`; success → `edit_text` with updated keyboard (toggle-on `:168`, toggle-off `:188`) and correct POST body topic — `:206`.
- `callback.answer()` called in every reachable branch — asserted via `cb_answer.assert_awaited_once()` in the guard, error, and success tests.

All reachable branches confirmed covered.

---

## Self-Check Checklist

- [x] All new public functions have unit tests (happy path + at least one failure path) — confirmed for `getInterests`, `toggleInterest`, `requirePlatformUserAndEmail` (private, exercised via both public callers), `resolveUserAndEmailFromDirectusId`, `ApiClient.get_interests`/`toggle_interest`, `handle_interests`, `handle_interest_toggle_callback`, `interests_keyboard` (exercised via handler tests).
- [x] No `it.skip`/`test.skip`/`describe.skip` anywhere — grepped all 7 files, zero matches.
- [x] No `pytest.mark.skip`/`xfail` anywhere — grepped `test_interests_handler.py` and `test_api_client_interests.py`, zero matches (and none in the modified portions of the other two bot files).
- [x] No `any` in TypeScript test code — grepped all 3 `apps/api` test files for `: any` / `as any`, zero matches. (Test files use `as unknown as <ConcreteType>` for mock casting, the established pattern in this codebase, not `any`.)
- [x] AAA pattern followed / test names describe behavior — every test read follows Arrange (mock/fixture setup) → Act (call under test) → Assert (expectation), with descriptive `it('...')`/`def test_...` names stating the behavior under test, consistent across both languages.
- [x] Integration tests use Testcontainers, never mock DB — N/A, no integration tests required for this PR per the strategy's rubric-intent analysis (re-verified independently above); the one modified integration-style file (`directus-users-bridge.spec.ts`) correctly continues using the existing Testcontainers Postgres setup (`inject('TEST_DATABASE_URL')`) for its 2 new cases, faking only the external Directus REST client — matches every other describe block in that file.
- [x] Coverage target (80% line / 70% branch / 100% error-path in business logic) — met by manual read-through; see Branch Coverage Check above. Every branch in the four functions named in the task brief has at least one covering test, including the previously-unstated "mentor-only, zero-iteration loop" edge case in `toggleInterest`.

---

## Known Test Gaps

None requiring action. Two observations, both non-blocking and already
flagged for awareness by `06-test-strategy.md`'s own Gap Analysis section
(re-confirmed independently, not just restated):

1. **`INTEREST_TOPICS` (API) / `INTERESTS_TOPIC_ORDER` (bot) duplication
   has no cross-repo consistency test.** Both independently hardcode the
   same 7 slugs in the same order. No CI check catches drift between them.
   This is the same accepted tradeoff already present for
   `TelegramEventTopicsService.KNOWN_EVENT_TOPICS` since PR 1 — no new
   cross-repo test mechanism exists in this codebase to extend, and
   building one for a 7-entry static list would be disproportionate. Not
   assigned as TestDesigner work.

2. **`handle_interests`/`handle_interest_toggle_callback`'s guard clause
   3rd condition (`directus_user_id is None` with `is_known=True`) has no
   dedicated test.** Confirmed this is not a gap unique to this PR — the
   identical pattern exists in `test_leaderboard_handler.py` (this PR's
   own explicit precedent) for the identical guard shape in
   `leaderboard.py`. Consistent, pre-existing convention across the whole
   bot test suite. Not assigned as TestDesigner work; flagged for
   awareness only, exactly as this pass's independent check requires.

No structurally missing coverage was found. No `CodeDeveloper` follow-up
is required.

---

## Gate Result

```yaml
gate: test-designer
status: passed
reasoning: >
  Independent verification pass, not a pass-through restatement: read all
  7 test files in full (or the modified portions, for the two shared
  files) and the actual source (telegram-auth.service.ts:848-915,
  interests.py, keyboards/interests.py, main.py, both locale files)
  directly, cross-checking assertion bodies against source line numbers
  rather than trusting 03-code-summary.md's or 06-test-strategy.md's
  claims. All 11 draft ACs confirmed covered by correctly-named,
  correctly-asserting tests. Every branch of toggleInterest (isSelected
  true/false, single-learn-row, mixed-intent AC-7 load-bearing case,
  defensive multi-learn-row case, and the previously-unstated
  mentor-only/zero-iteration-loop edge case), getInterests, and
  requirePlatformUserAndEmail (404 branch, exercised from both public
  callers) has a dedicated covering test — confirmed by reading the
  toggleInterest method body directly. Same result for
  handle_interests/handle_interest_toggle_callback on the bot side,
  including the callback.message-is-None no-op branch and the
  structurally-unreachable callback.data-is-None branch (correctly not
  tested, since the router's own lambda filter makes it dead code).
  Self-check checklist passes cleanly: no it.skip/pytest.mark.skip
  anywhere in any of the 7 files, no `any`/`as any` in TypeScript test
  code, AAA pattern and descriptive test names throughout, Testcontainers
  correctly used (not mocked) for the one modified integration-style
  bridge spec file.
  No new test files were needed and no existing test file required
  edits — CodeDeveloper's original test suite already fully satisfies
  this independent pass's checklist.
blocking_issues: []
needs_clarification: []
notes: >
  Two non-blocking observations carried forward from 06-test-strategy.md's
  own Gap Analysis, both independently re-confirmed rather than merely
  restated: (1) INTEREST_TOPICS/INTERESTS_TOPIC_ORDER cross-repo
  duplication has no sync test, precedented by the existing
  KNOWN_EVENT_TOPICS tradeoff since PR 1; (2) the guard clause's
  directus_user_id-is-None sub-branch has no dedicated test in either
  handler, but this matches the exact, consistent, pre-existing
  convention in test_leaderboard_handler.py (this PR's own stated
  precedent) for the identical guard shape — not a gap this PR's tests
  introduced. Neither is assigned as required follow-up work.
```
