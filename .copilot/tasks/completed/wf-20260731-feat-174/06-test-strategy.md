# Test Strategy — wf-20260731-feat-174 (FEAT-BOT-2 PR 1/6)

workflow: wf-20260731-feat-174
agent: TestStrategist (performed directly by Orchestrator)

---

## Rubric

Following the scoring convention used by `wf-20260731-feat-171` (FR-BOT-001):

- New endpoints (+2 each): `GET events`, `GET events/:id` → **+4**
- New Directus query logic, not reused from elsewhere (+1): **+1**
- Cross-module surface consumed by a separate submodule/process (bot) (+1): **+1**
- New UI-equivalent surface (inline keyboards, 3 new handlers) (+1): **+1**

**Total: 7.** Integration-shaped tests (mocked-collaborator, full
request/response path through Zod + guard metadata + service) required on
both sides. Live Testcontainers/Postgres integration is N/A — this module
has no Drizzle table, same as `lookup`/`upsert-temp-user`'s existing test
posture (mocked `DirectusClient`, not a live Directus instance). E2E
(Playwright) not required — no web-facing surface changed.

## Scope

**In scope for this PR's tests**: `/help`, `/events`, `/event <N>` and
their two backing API routes.

**Explicitly not tested** (out of scope for this PR, no code exists to
test): `/register`, `/cancel`, `/me`, `/leaderboard`, `/interests`,
`/upgrade`.

## AC Mapping

FR-BOT-002's own acceptance-criteria list is written for the FULL 10-command
FR, not this PR's slice — most of its listed ACs (`/register 5 registers...`,
`/cancel 5 cancels...`, `/me correctly shows...`, `/leaderboard shows top
10...`, `/upgrade starts...`, temp-user leaderboard exclusion) are about
commands this PR does not implement, so they are N/A here (not deferred —
genuinely not applicable until their own PR). The one FR-level AC that
does apply to this slice:

| FR-BOT-002 AC | Applies to this PR? | Test coverage |
|---|---|---|
| "`/events` returns the correct list of upcoming events for the user's country" | Yes | `telegram-events-internal.spec.ts` (API: country scoping, pagination, empty-result); `test_events_handler.py` (bot: rendering, pagination keyboard, unavailable-message fallback) |
| "All commands respond within 3 seconds under normal conditions" | Partially — no live-latency test exists for ANY bot command yet, including the already-shipped `/start` (FR-BOT-001's own AC-6 3-second requirement was deferred to a post-deploy UAT placeholder, not unit-tested — see `wf-20260731-feat-171`'s workspace-state.md Queued-follow-up-workflows entry). This PR follows the same precedent: not independently re-litigated here, same deferral already on record for the whole bot surface. | N/A (pre-existing deferral, not this PR's gap) |

This PR's own de facto ACs (from the invoking task's Scope section, more
specific than the FR's document-level list):

| PR-level AC | Test coverage |
|---|---|
| `GET /v1/internal/telegram/events` — paginated, country-scoped | `telegram-events-internal.spec.ts`: 4 service tests + 5 controller tests |
| `GET /v1/internal/telegram/events/:id` — full detail incl. `isRegistered` | `telegram-events-internal.spec.ts`: 6 service tests + 4 controller tests |
| Both routes `InternalAuthGuard`-protected | Guard-metadata assertions in both controller describe blocks |
| Both routes Zod-validated | Malformed-input tests (missing country, invalid country, limit>50, non-UUID id) in both |
| `/help` lists all 10 commands, unimplemented marked | `test_help_handler.py`: 2 tests |
| `/events` paginated 5/page, Next/Previous buttons | `test_events_handler.py`: 8 tests (empty, ≤5 no-keyboard, >5 keyboard, unavailable, country=None, callback next-page, callback malformed-offset) + `test_keyboards_events.py`: 6 keyboard-shape tests |
| `/event <N>` full detail + Register/"I'm going" button | `test_event_detail_handler.py`: 7 tests (usage message, register button, going button, no-directusUserId path, not-found, unavailable, placeholder callback) |
| Register button is a documented placeholder, not silently dead | `test_register_placeholder_shows_coming_soon_alert_without_crashing` |
| BotFather registration excludes `/event` | `test_main_wiring.py`: 3 tests |
| Error states: API unavailable (retry message), event not found | Covered per-handler in `test_events_handler.py` / `test_event_detail_handler.py` |

## Gate Result

```yaml
gate: test-strategist
workflow: wf-20260731-feat-174
status: passed
timestamp: 2026-08-01T01:10:00Z
summary: >
  Rubric score 7 (2 new endpoints x2, new query logic +1, cross-process
  bot consumer +1, new keyboard/UI-equivalent surface +1). Integration-
  shaped (mocked-collaborator) tests required both sides; no live
  Testcontainers/Postgres (module has no Drizzle table, matches
  lookup/upsert-temp-user precedent); no E2E (no web surface changed).
  Only 1 of FR-BOT-002's document-level ACs applies to this PR's slice
  (/events country-scoped listing) - the rest are N/A until their own
  PRs. PR-level ACs (from the invoking task) fully mapped to concrete
  test files on both sides.
next_agent: test-designer
```
