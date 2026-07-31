# Step 5 — Security Review

## Scope

`POST /v1/internal/telegram/register`, `DELETE /v1/internal/telegram/register`
(new), `DirectusUsersBridgeService.resolveUserIdFromDirectusId` (new),
`TelegramAuthService.registerViaTelegram`/`cancelViaTelegram` (new), bot
handlers calling these routes.

## Checklist (AGENTS.md §5)

- **Authentication enforced at controller level** — Pass. Both new routes
  live on `TelegramInternalController`, which carries the class-level
  `@UseGuards(InternalAuthGuard)` (unchanged from PR 1; not re-declared
  per-route, matching every sibling route's convention). Verified live:
  a request without `x-internal-auth` returned 401.
- **Never log secrets** — Pass. No token/secret values appear in any new
  log statement; the only new `Logger` usage in this diff is
  `DirectusUsersBridgeService`'s existing pattern (none added by this PR
  to that file's logging — the new method has no logging at all, matching
  `resolveDirectusId`'s own no-logging convention for a simple lookup).
- **Validate all input at boundaries** — Pass. Both routes Zod-parse the
  body (`telegramRegisterBodySchema`/`telegramCancelBodySchema`) before
  touching the service layer; `directusUserId`/`eventId` are `.uuid()`,
  `country` is the shared `countrySchema` enum (same enum PR 1's
  `listTelegramEventsQuerySchema` already uses) — no free-text country
  injection possible.
- **Parameterized queries only** — Pass. The new reverse-lookup
  (`resolveUserIdFromDirectusId`) uses Drizzle's `eq()` builder, same as
  every other query in that file — no raw SQL.
- **Tenant isolation** — Pass, delegated. `country` is passed through to
  `RegistrationsDirectusService.register()`/`.cancel()`, which already
  enforces tenant scoping via `assertEventInTenant` (event's `country`
  must match the caller's `countryCode`) — this PR does not weaken or
  bypass that check; it is the same enforcement path the browser-facing
  `RegistrationsController` already goes through. One point worth flagging
  explicitly: the bot supplies `country` as a client-asserted value in the
  request body (from `TenantMiddleware`'s resolved `user_context.country`)
  rather than the API re-deriving it server-side from the resolved
  identity. This mirrors PR 1's own `listUpcomingEvents`/`country` query
  param precedent (also client-asserted) — not a new pattern this PR
  introduces, but noted since it's the second endpoint family to do so.
  Impact is bounded: even a manipulated `country` value can only cause
  `assertEventInTenant` to reject with `RegistrationNotFoundError`
  (mismatched country -> "not found"), not leak cross-tenant data, since
  the event's real `country` field is what's actually compared.
- **Rate limiting on public endpoints** — N/A. These are internal
  (`InternalAuthGuard`-only) routes, not public; no `ThrottlerGuard`
  needed, consistent with every other route on this controller.
- **CSRF protection on state-changing operations from browser** — N/A.
  Not browser-reachable; internal service-to-service only, shared-secret
  header, no cookies/session involved.
- **Least-privilege reverse lookup** — Pass. The new
  `resolveUserIdFromDirectusId` is read-only (a `SELECT ... LIMIT 1`), no
  write path, no upsert-on-miss — a miss correctly surfaces as 404
  `telegram_user_not_found` rather than silently creating a row.
- **No `any`, no unchecked casts** — Pass. `tsc --noEmit` clean; no new
  `as` casts in the diff beyond the pre-existing test-file convention
  (`as unknown as X` for mock typing, matching every other spec in this
  suite).

## Module-cycle change (forwardRef) — architectural, not a security finding

The `forwardRef()` additions (`auth.module.ts`, `registrations.module.ts`,
`eula.module.ts`, `badges.module.ts`) change Nest's DI resolution order,
not any authorization/authentication boundary — `AuthGuard`,
`InternalAuthGuard`, and `AuthentikModule`-derived checks are unaffected;
confirmed live (the app boots, all guards still map to their existing
routes per the boot log's `RouterExplorer` output, and the 401 test above
passed). Flagged here for visibility only, not as a finding.

## DELETE-with-body

Noted in `02-impact-analysis.md` Risk Flag #2 — safe in this
internal-only context (both ends are code we control, no browser/proxy in
the path). No security implication; a REST-purity style note, not a
finding.

## ISS-BOT-REG-001 fix (403/404 mapping)

The fix widens which Directus error statuses map to
`RegistrationNotFoundError` — this is strictly a better information-hiding
posture (previously a 500 leaked a raw Directus error body/stack context
to the client in some configurations; now both cases return the same
generic `{error: event_not_found}` shape), not a weakening. No new
disclosure surface introduced.

## Gate Result

gate_result:
  status: passed
  summary: "No BLOCKER or MAJOR findings. New internal routes correctly guarded, Zod-validated, tenant-scoped via existing enforcement; one architectural note (client-asserted country, consistent with PR 1 precedent) documented, not a finding."
  findings: []
