# Security Review — wf-20260731-feat-174 (FEAT-BOT-2 PR 1/6)

workflow: wf-20260731-feat-174
agent: SecurityReviewer (performed directly by Orchestrator)
scope: `apps/api/src/modules/auth/{auth.controller.ts,telegram-auth.service.ts}`,
new test file `apps/api/test/telegram-events-internal.spec.ts`, and the
bot-side submodule commit `90900fe` (`apps/bot/`).

---

## Invariant checklist (AGENTS.md §5 + security.md)

| Invariant | Verdict | Notes |
|---|---|---|
| Auth enforced at controller level | **PASS** | Both new routes (`GET events`, `GET events/:id`) inherit `TelegramInternalController`'s class-level `@UseGuards(InternalAuthGuard)` — same guard, same trust boundary as the existing `lookup`/`upsert-temp-user` routes. No new controller class introduced (which would risk a misplaced/unguarded route — the exact risk flag FR-BOT-001's own security review named for its sibling `lookup` route). Verified structurally by `telegram-events-internal.spec.ts`'s `Reflect.getMetadata('__guards__', ...)` assertions, not just visual inspection. |
| Input validation at every boundary | **PASS** | `listTelegramEventsQuerySchema` (country enum + bounded offset/limit), `eventDetailParamsSchema` (`id`: uuid), `eventDetailQuerySchema` (`directusUserId`: optional uuid) — all Zod, all rejected with `BadRequestException(parsed.error.flatten())` on failure, matching the file's existing convention exactly. |
| No string-concatenated SQL / injection surface | **PASS** | No SQL at all in this module — all queries go through `DirectusClient.get()` (a `fetch` wrapper), with every dynamic value passed through `encodeURIComponent`. Directus's own REST filter query-string format is the only "query language" touched, and it takes URL-encoded values, not interpolated SQL. |
| Output encoding | **PASS** | JSON responses only (NestJS's default serializer); no HTML rendering in this module. |
| No secrets logged | **PASS** | Neither new method logs anything (no `Logger` calls added) — the two new Directus queries either succeed or let a `DirectusError` propagate (this module's existing behavior for any Directus failure that isn't itself Zod/guard-related; unlike `TelegramEventsService`'s enrichment fetches, these are not "degrade gracefully" paths since a failed primary list/detail fetch has no sensible fallback). No new secret material is introduced or handled at all — same `INTERNAL_API_TOKEN`/`x-internal-auth` shared secret as every sibling route in this controller. |
| Tenant isolation | **PASS** | `listUpcomingEvents` filters by `country` (required, enum-validated) — no cross-tenant leakage. `getEventDetail` intentionally does NOT filter by country (matches `TelegramEventsService.getEventDetail`'s own posture — a specific event id is either published+public or it isn't; there's no cross-tenant listing risk for a single-record detail fetch, same reasoning the existing service already established). |
| No enumeration/IDOR risk beyond what's already accepted | **PASS** | `GET events/:id` accepts any syntactically-valid UUID and 404s uniformly for "doesn't exist" / "not published" / "not public" (`{error:'event_not_found'}`) — does not leak *which* of those three is true, matching `TelegramEventsService.getEventDetail`'s explicit "don't leak existence by status" comment. `directusUserId` query param only ever produces a same-shape boolean (`isRegistered`) scoped to that one caller — no way to enumerate other users' registration status without already knowing both a valid event id and a target `directusUserId`, and even then the response reveals nothing beyond "is this person registered for this specific public event," which is not sensitive (matches the existing `is_registered` annotation pattern on the ADR-0034 web surface, which is exposed to anonymous browsers already). |
| Rate limiting on public endpoints | **N/A** | Not a public endpoint — `InternalAuthGuard`-protected, same as every other `v1/internal/*` route in this codebase (none of which carry `@Throttle`; the shared-secret guard is the access control, not a public rate limit). Matches existing precedent (`lookup`, `upsert-temp-user`, `InternalController`'s routes) exactly — this PR introduces no new posture. |
| CSRF | **N/A** | Server-to-server call (bot → API), not browser-originated; no cookies involved. |
| Bot thin-client guarantee (FR-BOT-001 AC-10, still binding) | **PASS** | Bot-side diff (`apps/bot/`) re-checked: `api_client.py`'s two new methods only add HTTP calls to `INTERNAL_API_URL` (the one already-allowed outbound target) via the existing `ApiClient` — no new reference to `DIRECTUS_TOKEN`, `AUTHENTIK_API_TOKEN`, or `TWENTY_API_TOKEN` anywhere in the new/changed bot files. `test_thin_bot_guarantee.py` (pre-existing regression test, re-ran clean) still passes with zero changes needed — confirms no new violation was introduced. |
| Zero new dependencies | **PASS** | No new package added on either side (checked `apps/api/package.json` / `apps/bot/pyproject.toml` diffs — neither touched). |

## Findings

**0 BLOCKER, 0 MAJOR, 0 MINOR.**

## Notes on the one deliberately-accepted design tradeoff

`countRegistrations` is called once per list item in `listUpcomingEvents`
(N+1-shaped Directus calls, bounded by `limit` ≤ 50, in practice ≤ 5 per
the bot's own page size). This is a **performance** characteristic, not a
security one — no additional trust boundary, no additional input
surface, no additional data exposure per call (each call returns only a
same-tenant-scoped registration count already computed elsewhere in this
exact codebase via the identical `filter[status][_neq]=cancelled`
aggregate pattern). Flagged in `03-code-summary.md`'s Known Limitations
as a possible follow-up, not a security gate item.

## Bot-side placeholder button (Register/"I'm going")

Reviewed `handle_register_placeholder` in `event_detail.py` — it performs
no state mutation, calls no API endpoint, and only shows a static,
non-user-controlled alert string. No injection surface (the alert text is
a locale-catalog constant, not built from any request data). Confirmed
safe as a true no-op.

## Gate Result

```yaml
gate: security-reviewer
workflow: wf-20260731-feat-174
status: passed
timestamp: 2026-08-01T01:00:00Z
summary: >
  0 BLOCKER, 0 MAJOR, 0 MINOR findings. Both new routes inherit the
  existing InternalAuthGuard class-level guard (verified structurally via
  Reflect.getMetadata, not just visual inspection) - no new trust boundary
  introduced. All new input Zod-validated at the controller boundary. No
  SQL/injection surface (Directus REST over encodeURIComponent-escaped
  query strings only). No enumeration/IDOR risk beyond what
  TelegramEventsService's own established getEventDetail posture already
  accepts (uniform 404, no existence-by-status leak). Bot-side
  thin-client guarantee re-verified clean (test_thin_bot_guarantee.py
  passes unchanged - no new forbidden credential reference introduced).
  Zero new dependencies either side.
next_agent: test-strategist
```
