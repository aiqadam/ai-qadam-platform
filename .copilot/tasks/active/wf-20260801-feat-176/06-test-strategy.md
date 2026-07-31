# Step 6 — Test Strategy

## Scope

New: `GET /v1/internal/telegram/me` (API), `PointsDirectusService
.totalForUser`, bot `/me` command + Cancel-button callback.

## Strategy

1. **API unit tests** (Vitest, mock Directus/bridge/registrations/points,
   no Testcontainers needed — `getMeSummary` makes zero direct DB calls,
   same posture PR 2's `registerViaTelegram`/`cancelViaTelegram` tests
   established): controller-level Zod validation + delegation, and
   service-level aggregation/guard/parallel-fetch behavior.
2. **`totalForUser` unit tests** (same file/pattern as `leaderboard()`'s
   existing tests, `points-directus.spec.ts`, mock Directus, real
   Testcontainers Postgres inherited from the file's existing setup even
   though `totalForUser` itself makes no Drizzle call — matches the
   file's established per-describe-block pattern): happy path, zero-points
   edge case, null-sum defensive case.
3. **Bot unit tests** (pytest + httpx.MockTransport, matching
   `test_api_client_register.py`/`test_register_command.py`'s exact
   conventions): client-level request shape + response parsing, and
   handler-level guard cases, rendering (empty state, status badges,
   points total, temp-account nudge, link CTA), and the Cancel-button
   callback.
4. **AC-mapped assertion**: FR-BOT-002's undone AC "`/me` correctly shows
   all active registrations with status badges" is directly covered by
   `test_me_renders_registered_and_waitlisted_badges_distinctly` (bot) and
   the `getMeSummary` aggregation tests (API) — both ends of the same
   flow are asserted, not just one side mocked to always succeed.
5. **Negative-space regression test**: `test_render_me_never_mentions_streak`
   exists specifically to catch a future accidental reintroduction of a
   fabricated streak value — this is the test-suite's enforcement of the
   scope-gap decision recorded in `01-requirement-validation.md`.

No Playwright/E2E test is added — `/me` has no web-UI surface; its only
interface is the bot, already covered by pytest, and the API route,
covered by Vitest. Live verification against the real local stack (real
Directus data, real Postgres bridge) already ran in Step 4
(`03-code-summary.md`) and will run again at Step 13 as part of the
BP-UAT-010 re-verification.

## Gate Result

gate_result:
  status: passed
  summary: "Strategy covers both new surfaces (API + bot) at the unit level, matching PR 1/PR 2's exact test conventions, plus a dedicated regression test asserting streak is never rendered. Live-stack verification already performed in Step 4 and repeated at Step 13."
  findings: []
