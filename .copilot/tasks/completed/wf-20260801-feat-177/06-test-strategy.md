# Step 6/7: Test Strategy + Design — FR-BOT-002 PR 4/6 (`/leaderboard`)

Tests were authored alongside implementation at Step 4 (matching PR 1-3's
own established sequencing for this FR sequence). This file documents the
strategy retroactively against the ACs drafted at Step 1, confirming
coverage is complete before Step 8 execution.

## Strategy

Three layers, matching PR 2/3's precedent exactly:

1. **API service-level unit tests** (mocked `PointsDirectusService` +
   `DirectusUsersBridgeService`) — the business logic (isCaller
   resolution, PII narrowing, degrade-on-unresolvable-identity) lives
   entirely in `TelegramAuthService.getLeaderboard()`, so this is where
   the meaningful assertions belong. No Testcontainers/integration layer
   needed — unlike `points-directus.spec.ts` (which tests the real
   Directus-facing query shape), this PR adds no new Directus query,
   only a new consumer of an existing one.
2. **API controller-level unit tests** (mocked `TelegramAuthService`) —
   Zod validation boundary + guard presence, matching every sibling
   controller spec's convention.
3. **Bot-level unit tests** (mocked `httpx.MockTransport` for the API
   client; pure-function tests for `render_leaderboard`) — request shape,
   response parsing, guard cases (unresolved identity/country), and the
   render/highlight logic.

## AC → Test Mapping

| AC (from `01-requirement-validation.md`) | Test(s) |
|---|---|
| AC-1: top 10, sorted, country-scoped | `telegram-bot-leaderboard-service.spec.ts`: `'calls leaderboard() with the country and a limit of 10'`; `test_leaderboard_handler.py`: `test_leaderboard_renders_all_rows_in_order_with_rank_numbers` |
| AC-2: caller's own row highlighted when present | `telegram-bot-leaderboard-service.spec.ts`: `'marks isCaller=true only on the entry matching...'`; `test_leaderboard_handler.py`: `test_leaderboard_highlights_caller_row_when_present` |
| AC-3: no highlight / no extra rank line when caller absent from top 10 | `telegram-bot-leaderboard-service.spec.ts`: `'marks every entry isCaller=false when the caller does not appear...'`; `test_leaderboard_handler.py`: `test_render_leaderboard_no_highlight_when_caller_absent` |
| AC-4: temp user never appears | Not independently unit-testable bot/API-service-side (no filtering code exists to exercise — exclusion is structural, in `leaderboard()`'s pre-existing query). Covered by `points-directus.spec.ts`'s existing `'silently drops aggregate rows for users not yet linked'` (adjacent case) plus **live verification at Step 8** (seed a temp user + a full user, confirm only the full user appears) — the concrete proof this AC actually needs. |
| AC-5: API-unavailable retry message | `test_leaderboard_handler.py`: `test_leaderboard_shows_unavailable_message_on_api_error`; `test_api_client_leaderboard.py`: `test_get_leaderboard_raises_unavailable_on_500`, `test_get_leaderboard_raises_unavailable_on_network_error` |
| AC-6: empty-country-leaderboard state | `test_leaderboard_handler.py`: `test_leaderboard_shows_empty_state_when_no_entries`; `telegram-bot-leaderboard-service.spec.ts`: `'returns an empty entries list when leaderboard() has nothing...'` |
| AC-7: <3s response | No new timing infra (matches PR 1-3's own precedent — no dedicated latency test exists for any sibling command either). Verified qualitatively during live verification at Step 8 (wall-clock observation of the curl round-trip). |

## Additional coverage beyond the AC list (found necessary during design)

- Guard cases: unresolved user context / unresolved country (mirrors
  `me.py`'s identical guard structure) — `test_leaderboard_handler.py`.
- Request-shape fidelity (`test_get_leaderboard_sends_expected_request_shape`)
  and response-field defaulting (`test_get_leaderboard_defaults_is_caller_false_when_field_missing`).
- PII narrowing at the API boundary (`'never includes email or handle...'`)
  — required by Step 5's security review, not originally in the AC list,
  but a direct consequence of INV-2-adjacent PII-exposure risk flagged at
  Step 2.
- `displayName` null-fallback chain (`'falls back to handle, then a
  generic label...'`) — defensive coding, not AC-driven, matching
  `me.py`'s own `_status_badge` fallback precedent.
- Parallel-fetch ordering (`'fetches the leaderboard and resolves the
  caller identity in parallel'`) — matches `getMeSummary`'s own
  equivalent test, confirming `Promise.all` (not sequential awaits) is
  actually used, not just claimed in a comment.
- `/help` no-longer-coming-soon regression (`test_help_no_longer_marks_leaderboard_as_coming_soon`)
  and `BOT_COMMANDS`/router-registration set updates — required because
  PR 1's `/help` handler pre-emptively listed all 10 commands with a
  "coming soon" marker; this PR must flip that marker, matching the
  exact pattern PR 2/PR 3 each established for their own commands.

## Gate Result

gate_result:
  status: passed
  summary: "All 7 draft ACs have direct test coverage or an explicit, justified live-verification plan (AC-4 exclusion, AC-7 timing) matching PR 1-3's own precedent for AC classes that don't reduce to a unit assertion."
  findings:
    - "AC-4 (temp-user exclusion) is deliberately NOT a bot/API unit test target — there is no filtering code to exercise; Step 8's live verification is the correct proof mechanism, consistent with this workflow's own task brief."
    - "PII-narrowing test was added beyond the original AC draft, directly in response to Step 5's security review — the strategy adapted to a finding raised mid-workflow, not blindly frozen at Step 1."
