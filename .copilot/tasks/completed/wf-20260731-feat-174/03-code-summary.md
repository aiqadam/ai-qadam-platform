# Code Summary — FEAT-BOT-2 PR 1/6, API side (`apps/api/`)

workflow: wf-20260731-feat-174
agent: CodeDeveloper (performed directly by Orchestrator)
scope of this invocation: **API-side only** — two new
`InternalAuthGuard`-protected routes on `TelegramInternalController`. Bot
side is `03b-code-summary-bot.md`.

---

## Requirement Implemented

FR-BOT-002's read-only slice: `GET /v1/internal/telegram/events` (list,
offset-based pagination) and `GET /v1/internal/telegram/events/:id`
(detail, including `isRegistered`).

## Files Changed

| File | Change |
|---|---|
| `apps/api/src/modules/auth/telegram-auth.service.ts` | Added `listTelegramEventsQuerySchema`, `eventDetailParamsSchema`, `eventDetailQuerySchema` (Zod) + result types (`TelegramEventListItem`, `TelegramEventListResult`, `TelegramEventDetailResult`) + `listUpcomingEvents()` / `getEventDetail()` methods + 4 private Directus-query helpers (`findPublishedEvent`, `countUpcomingEvents`, `countRegistrations`, `isUserRegistered`) + a module-level `eventGuardFilter()`/`parseDirectusCount()` pair. |
| `apps/api/src/modules/auth/auth.controller.ts` | Added `Param` import; added `GET events` and `GET events/:id` methods to `TelegramInternalController`, both Zod-validated at the boundary, both under the existing class-level `@UseGuards(InternalAuthGuard)`. |
| `apps/api/test/telegram-events-internal.spec.ts` (new) | 20 tests: service-level (`listUpcomingEvents`, `getEventDetail` against a mocked `DirectusClient`) + controller-level (`TelegramInternalController.listEvents`/`getEventDetail`, matching `telegram-auth-controller.spec.ts`'s direct-instantiation convention). |
| `apps/api/test/telegram-auth-controller.spec.ts` | Extended the shared `makeTelegramAuthService()` mock builder with `listUpcomingEvents`/`getEventDetail` stubs so existing tests that spread it keep typing clean. |

## Key Design Decision: reuse vs. duplicate `TelegramEventsService`

**Duplicated**, not reused. Full reasoning already recorded in
`02-impact-analysis.md` — summary: `TelegramModule` does not export
`TelegramEventsService`, and importing `TelegramModule` into `AuthModule`
to reach it would recreate a documented, previously-reverted circular
dependency (`telegram.module.ts` lines 40-61: PR #187, reverted via #202,
`AuthModule → InteractionsModule → TelegramModule → AuthModule`; the new
edge would be `AuthModule → TelegramModule → forwardRef(AuthModule)` from
the opposite, more central-module side). The two services also diverge in
identity key (`tgUserId: bigint` on the old ADR-0034 web/notifier surface
vs. `directusUserId: string` on this new bot-facing internal surface,
which is what the bot's `AuthMiddleware` already resolves). The duplicated
logic is small (~120 lines across 2 public + 4 private methods) and
low-churn (published-event query shape is stable, shared by both services
independently).

## Wire shapes

`GET /v1/internal/telegram/events?country=uz&offset=0&limit=5` →
```json
{ "items": [{ "id": "...", "title": "...", "startsAt": "...", "registrationCount": 3 }], "offset": 0, "limit": 5, "total": 12 }
```

`GET /v1/internal/telegram/events/:id?directusUserId=<uuid>` →
```json
{ "id": "...", "title": "...", "startsAt": "...", "venue": "...", "description": "...", "capacity": 50, "registrationCount": 10, "isRegistered": true }
```
404 body `{ "error": "event_not_found" }` when no published+public event
matches `:id` (same convention as `lookup`'s
`{ error: "telegram_user_not_found" }`).

`isRegistered` is returned by the detail endpoint now (query param
`directusUserId`, optional) — per the task's explicit instruction, so PR 2
(`/register`) does not need to touch this endpoint again.

## Validation

- `country`: `z.enum(['uz','kz','tj','xx'])` — same enum as
  `auth.controller.ts`'s existing `registerSchema`.
- `offset`: `z.coerce.number().int().min(0).default(0)`.
- `limit`: `z.coerce.number().int().min(1).max(50).default(5)` — default 5
  matches FR-BOT-002 Notes ("Paginated if > 5 events"); cap 50 matches
  `TelegramEventsService`'s own `MAX_LIMIT`.
- `:id` — `z.string().uuid()`. `events.id` is a genuine Directus UUID (see
  `TelegramEventsService.findPublishedEventBySlugOrId`'s own uuid-shape
  guard comment) — FR-BOT-002's `/event <N>` notation is informal
  shorthand, not a literal short integer; there is no separate sequence
  number in the schema. The bot's `/events` list renders each item's real
  id so users have something to copy (see `03b-code-summary-bot.md`).
- `directusUserId` (detail query param): `z.string().uuid().optional()`.

## Architecture Rule Compliance

- **Input validation (AGENTS.md §1 rule 5)**: both routes Zod-parse at the
  controller boundary; `BadRequestException` with `.flatten()` on failure,
  matching `lookup`/`upsertTempUser`'s exact pattern.
- **No magic numbers**: `DEFAULT_EVENTS_LIMIT`/`MAX_EVENTS_LIMIT` named
  constants.
- **Functions fit on one screen**: `listUpcomingEvents`/`getEventDetail`
  are each under 25 lines; supporting query-building logic split into
  small single-purpose private helpers.
- **No `any`**: all Directus responses typed via narrow row interfaces
  (`TelegramEventRow`, `TelegramEventDetailRow`).
- **Auth boundary**: both routes inherit the class-level
  `@UseGuards(InternalAuthGuard)` — no new trust boundary, verified by the
  new tests' `Reflect.getMetadata('__guards__', ...)` assertions (same
  pattern as the existing `lookup`/`upsertTempUser` guard tests).

## Formatter / Typecheck

```
pnpm exec tsc --noEmit -p apps/api    → clean
pnpm exec biome check <changed files> → clean, no fixes needed
```

## Known Limitations

- `countRegistrations` is called once per list item inside
  `listUpcomingEvents` (N+1-shaped, N ≤ `limit` ≤ 50, so worst case 50
  extra Directus aggregate calls per page). `TelegramEventsService`'s own
  `listOpenEvents` avoids this via one batched
  `fetchRegistrationsByTgUser` call, but that batched query is
  `tgUserId`-annotation-shaped (an "is this specific caller registered"
  map), not a per-event count. A batched *count-per-event* Directus
  aggregate query is possible but adds real complexity (Directus doesn't
  have a native "group by event, count" single-call idiom over this
  schema without a raw aggregate-per-group construction) — deferred as a
  performance follow-up if bot usage/event volume ever makes 5-per-page N+1
  calls a real latency problem; not attempted here since FR-BOT-002 caps
  the bot's own requested page size at 5 (not 50) so worst case is a
  small handful of extra calls, not 50.
- No dedicated integration test against a live Postgres/Directus
  instance — all tests use a mocked `DirectusClient` (matching
  `telegram-auth-service.spec.ts`'s own established convention for this
  module; this module doesn't touch Drizzle/Postgres directly at all, only
  Directus over HTTP).

## Gate Result

```yaml
gate: code-developer
workflow: wf-20260731-feat-174
status: passed
timestamp: 2026-08-01T00:30:00Z
summary: >
  API-side FEAT-BOT-2 PR 1/6 complete: GET /v1/internal/telegram/events
  and GET /v1/internal/telegram/events/:id, both InternalAuthGuard +
  Zod-at-boundary, added to the existing TelegramInternalController.
  Deliberately duplicates a small subset of TelegramEventsService's query
  logic rather than importing it, to avoid recreating a documented,
  previously-reverted AuthModule<->TelegramModule circular dependency.
  isRegistered included in the detail response now so PR 2 (/register)
  doesn't need to revisit this endpoint. tsc --noEmit and biome check both
  clean; 20 new tests + full apps/api suite (1394/1395, 1 pre-existing
  unrelated flake at users.spec.ts:65, already queued as
  wf-20260704-fix-096-pre-existing-api-test-flakes item 1) all pass.
files_changed_count: 4
typecheck: pass
biome_check: pass
architecture_rules_confirmed: true
next_agent: security-reviewer
```
