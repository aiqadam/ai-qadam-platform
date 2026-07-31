# Impact Analysis — wf-20260731-feat-174

workflow: wf-20260731-feat-174
agent: ImpactAnalyzer (performed directly by Orchestrator — architectural
question already substantially resolved by codebase inspection during
dispatch; formalizing into the standard artifact).

---

## DB Changes Required: No

Both new endpoints are read-only, Directus-backed. No Drizzle schema
changes, no migration. Step 3 (DBMigrationAuthor) is skipped.

## Module placement

**New routes land in `apps/api/src/modules/auth/auth.controller.ts`**,
inside the existing `TelegramInternalController` (`@Controller('v1/internal/telegram')`,
`@UseGuards(InternalAuthGuard)`) — the exact controller that already hosts
`lookup` and `upsert-temp-user`. Two new methods: `GET events` and
`GET events/:id`.

**New service methods land in `TelegramAuthService`** (same file's sibling
service) — or, if that mixes concerns awkwardly (auth vs. events), a small
new sibling service in the same module. Decision made during code
development; see below for the reuse-vs-duplicate call this hinges on.

## Reuse vs. duplicate: `TelegramEventsService` — DUPLICATE, with reasoning

The task brief flagged this as the one non-obvious judgement call. Findings:

1. **`apps/api/src/modules/telegram/telegram-events.service.ts`** already
   implements almost exactly what's needed: `listOpenEvents(filters)` and
   `getEventDetail(slugOrId, tgUserId?, locale?)`, both Directus-backed,
   tenant-filtered, paginated (`limit`/offset via query params on the
   caller side), locale-aware, and already support annotating results
   with "is this caller registered" via an optional `tgUserId: bigint`
   param.

2. **`TelegramModule` does NOT export `TelegramEventsService`.** Checked
   `apps/api/src/modules/telegram/telegram.module.ts` line 115:
   `exports: [TelegramService, TgConfigService, OutboxPublisher, DB]` —
   `TelegramEventsService` is a provider, not exported. Injecting it into
   a controller/service living in `AuthModule` would require adding it to
   `TelegramModule`'s exports AND importing `TelegramModule` into
   `AuthModule`.

3. **That import would recreate a documented circular-dependency
   incident.** `telegram.module.ts` lines 40-61 contain an explicit,
   detailed comment about exactly this class of problem:
   `AuthModule → InteractionsModule → TelegramModule → AuthModule` was a
   real cycle (PR #187, reverted via #202) that `TelegramModule` now avoids
   by wrapping its own `AuthModule` import in `forwardRef()`. Adding
   `AuthModule → TelegramModule` (to consume `TelegramEventsService`)
   creates the mirror-image cycle: `AuthModule → TelegramModule →
   forwardRef(AuthModule)`. `forwardRef` can technically resolve this at
   runtime, but doing it FROM `AuthModule`'s side — the side that already
   caused a revert once — trades a small amount of code reuse for
   reintroducing a fragile, previously-reverted dependency shape, in a
   module (`auth`) that many other modules already depend on.

4. **The semantics also genuinely diverge slightly.** The existing
   `listOpenEvents`/`getEventDetail` are keyed by `tgUserId: bigint`
   (raw Telegram numeric ID) for the registration-annotation lookup,
   because that surface serves the OLD ADR-0034 bearer-token Telegram
   channel (notifier/admin cabinet), which naturally has the raw
   `telegram_id` on hand. The NEW internal/telegram surface this PR adds
   is keyed by **`directusUserId`** (per the task brief and per
   `TelegramAuthService.lookupUser`'s existing `LookupUserResult` shape,
   which is what the bot's `AuthMiddleware` already resolves and caches).
   Reusing the old service as-is would mean either (a) the bot doing an
   extra hop to turn `directusUserId` back into a `tgUserId` just to call
   a `tgUserId`-keyed method, which the bot doesn't need to do at all
   today (its `UserContext` never carries the raw numeric ID past the
   auth middleware boundary in the new internal-telegram path), or (b)
   overloading the existing service with a second, directusUserId-keyed
   parameter, which is a public-API change to a service consumed by the
   ADR-0034 web-facing surface (`apps/web` admin cabinet, `/v1/telegram/events`)
   for an unrelated caller (the new bot-facing internal API) — risk of a
   regression on a live, already-shipped surface for no code-reuse payoff
   proportional to the risk.

**Decision:** write minimal, purpose-built Directus query logic in the new
`auth` module context (either as new methods on `TelegramAuthService` or a
small new co-located service), duplicating the small, stable subset of
`listOpenEvents`/`getEventDetail`'s query-building logic (filter strings,
pagination, the published/public/future-dated guard) rather than reusing
the class. This is the documented "real architectural reason" the task
brief allowed for: avoiding a circular module dependency that has already
caused one revert in this exact module pair, not merely a preference. The
duplicated logic is small (~40-60 lines: a filter-string builder + two
Directus GET calls) and low-churn (published-event query shape is stable);
the risk of doubled maintenance is judged lower than the risk of
resurrecting `AuthModule ↔ TelegramModule` circularity.

## New Zod schemas (auth module, alongside `lookupUserBodySchema` etc.)

- `listTelegramEventsQuerySchema` — `country` (existing `z.enum(['uz','kz','tj','xx'])`
  precedent from `auth.controller.ts`'s `registerSchema`), `offset` (non-negative
  int, default 0), `limit` (1-50, default matches `TelegramEventsService`'s
  `DEFAULT_LIMIT`/`MAX_LIMIT` = 50 convention, though the bot only ever
  requests 5 at a time per FR-BOT-002's Notes).
- `eventDetailQuerySchema` — `directusUserId` (optional string, UUID-shaped;
  used only to compute `isRegistered`).

## Files expected to change (API side)

| File | Change |
|---|---|
| `apps/api/src/modules/auth/auth.controller.ts` | Add `GET events` / `GET events/:id` to `TelegramInternalController`; add the two Zod query schemas. |
| `apps/api/src/modules/auth/telegram-auth.service.ts` OR a new small sibling service | Add `listUpcomingEvents(country, offset, limit)` and `getEventDetail(eventId, directusUserId?)` — minimal duplicated Directus query logic per the decision above. |
| `apps/api/test/telegram-auth-controller.spec.ts` / a new `*-events*.spec.ts` | New tests for both routes. |

## Files expected to change (bot side, `apps/bot/` submodule)

| File | Change |
|---|---|
| `apps/bot/src/services/api_client.py` | Add `list_events()` / `get_event_detail()` methods calling the two new routes. |
| `apps/bot/src/handlers/help.py` (new) | `/help` handler. |
| `apps/bot/src/handlers/events.py` (new) | `/events` handler + pagination callback. |
| `apps/bot/src/handlers/event_detail.py` (new) | `/event <N>` handler + placeholder Register/I'm-going callback. |
| `apps/bot/src/keyboards/events.py` (new, replacing the stub `keyboards/__init__.py` note) | Pagination + Register inline keyboards. |
| `apps/bot/src/locales/ru.py`, `en.py` | New string keys for the three new handlers. |
| `apps/bot/src/main.py` | Register the three new routers; extend `set_my_commands` (Command-with-args note below). |
| `apps/bot/tests/test_*.py` | New/extended test files. |

## Security considerations flagged for SecurityReviewer

- Both new routes are `InternalAuthGuard`-protected — same trust boundary
  as the existing `lookup`/`upsert-temp-user` routes; no new trust
  boundary introduced.
- `directusUserId` passed as a query param on `GET events/:id` is used
  ONLY to compute a boolean `isRegistered` flag scoped to that one caller
  — same shape as the existing `tgUserId` optional-annotation pattern in
  `TelegramEventsService`. No enumeration risk beyond what
  `InternalAuthGuard` already gates (only the bot process holds the
  shared secret).
- No new PII surfaced beyond what `TelegramEventsService`'s existing
  `EventSummary`/`EventDetail` shapes already expose publicly on the web
  (title, date, venue, description, capacity, registration count) — this
  is the same anonymous-browse-safe data class.

## Gate Result

```yaml
gate: impact-analyzer
workflow: wf-20260731-feat-174
status: passed
timestamp: 2026-07-31T00:15:00Z
summary: >
  DB Changes Required: No. New routes land in the existing
  TelegramInternalController (auth.controller.ts), reusing
  InternalAuthGuard. Reuse-vs-duplicate decision: DUPLICATE minimal
  Directus query logic rather than importing TelegramEventsService,
  because TelegramModule does not export it and consuming it from
  AuthModule would recreate a documented, previously-reverted circular
  dependency (PR #187/#202: AuthModule -> InteractionsModule ->
  TelegramModule -> AuthModule). Semantics also diverge (tgUserId-keyed
  vs. directusUserId-keyed). No new trust boundary; same InternalAuthGuard
  posture as sibling routes.
next_agent: code-developer
