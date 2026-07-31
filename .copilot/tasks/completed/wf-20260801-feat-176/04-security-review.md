# Step 5 — Security Review

## Scope

`GET /v1/internal/telegram/me` (new), `PointsDirectusService.totalForUser`
(new), `TelegramAuthService.getMeSummary` (new), `AuthModule`'s new
`PointsModule` import, bot's `/me` handler + Cancel-button callback.

## Checklist (AGENTS.md §5)

- **Authentication enforced at controller level** — Pass. `me()` lives on
  `TelegramInternalController`, which carries the class-level
  `@UseGuards(InternalAuthGuard)` (unchanged, not re-declared per-route,
  matching every sibling route). Verified live: a request without
  `x-internal-auth` returned 401.
- **Never log secrets** — Pass. No new `Logger` usage in this diff at all;
  `totalForUser`/`getMeSummary` have no logging, matching
  `leaderboard()`'s/`registerViaTelegram()`'s own no-logging convention
  for read paths.
- **Validate all input at boundaries** — Pass. `telegramMeQuerySchema`
  Zod-parses the query (`directusUserId: z.string().uuid()`,
  `country: countrySchema`) before touching the service layer. Verified
  live: malformed UUID -> 400 with a structured Zod error body.
- **Parameterized queries only** — Pass. `totalForUser` builds its
  Directus query via `URLSearchParams` (same pattern `leaderboard()`
  already uses), no string-concatenated filter values. `getMeSummary`
  makes zero raw SQL calls — it delegates entirely to
  `RegistrationsDirectusService.listMine()` (pre-existing, PR 2's reuse
  target) and the new `totalForUser` above.
- **Tenant isolation** — Pass, delegated + reinforced. `country` flows
  into both `listMine({ userId, countryCode })` (existing tenant
  enforcement, unchanged by this PR) and the new
  `totalForUser(directusUserId, countryCode)`'s own
  `filter[country][_eq]` clause — a caller cannot read another tenant's
  points total by supplying a mismatched country, since the filter
  narrows to the intersection of `user` AND `country`, not `user` alone.
  Same "client-asserted country" posture PR 1/PR 2 already established
  and accepted for this controller family (see PR 2's own security
  review) — not a new pattern.
- **Least-privilege aggregation** — Pass. `totalForUser` is a pure read
  (`GET` with `aggregate[sum]`), no write path, matching
  `leaderboard()`'s own read-only posture. `getMeSummary` performs zero
  writes.
- **No PII over-fetch** — Pass. `getMeSummary`'s response shape
  (`TelegramMeResult`) mirrors `MineResponse`'s existing per-registration
  projection (`registrations.controller.ts`) minus `checkinCode`/
  `checkedInAt` (dropped, not needed for a read+cancel dashboard) — no
  new fields beyond what the web `/registrations/mine` endpoint already
  returns to an authenticated member for their own data.
- **Rate limiting on public endpoints** — N/A. Internal
  (`InternalAuthGuard`-only) route, not public, consistent with every
  other route on this controller.
- **CSRF protection on state-changing operations from browser** — N/A.
  `GET /v1/internal/telegram/me` is read-only and not browser-reachable;
  the Cancel-button callback in the bot reuses the existing
  `DELETE /v1/internal/telegram/register` (already reviewed in PR 2's
  own security pass — no new state-changing surface introduced here).
- **No `any`, no unchecked casts** — Pass. `tsc --noEmit` clean; no new
  `as` casts in the diff beyond the pre-existing test-file convention
  (`as unknown as X` for mock typing).

## Module-wiring change (PointsModule import) — architectural, not a security finding

Unlike PR 2's `RegistrationsModule` edge, this new `PointsModule` import
into `AuthModule` needs no `forwardRef` — confirmed by reading
`points.module.ts` (imports only `DirectusModule`) and by a live
`pnpm --filter api dev` boot trace showing `Nest application successfully
started` with `GET /v1/internal/telegram/me` mapped, no
`UnknownDependenciesException`. No authorization/authentication boundary
is touched by this edge.

## Bot-side: Cancel button reuses existing, already-reviewed logic

`handlers/me.py`'s `handle_me_cancel_callback` calls
`api_client.cancel_registration` — the exact same client method
`handlers/cancel.py`'s `/cancel <N>` command already calls, reviewed in
PR 2. No new HTTP call shape, no new error-mapping logic; only a new
Telegram-side trigger (inline button vs. slash command).

## Gate Result

gate_result:
  status: passed
  summary: "No BLOCKER or MAJOR findings. New internal route correctly guarded, Zod-validated, tenant-scoped by user+country intersection; new PointsModule wiring confirmed cycle-free live; bot-side Cancel button reuses PR 2's already-reviewed cancellation path with no new logic."
  findings: []
