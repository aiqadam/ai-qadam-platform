# 04 — Security Review: FR-BOT-002 PR 5/6 — `/interests`

## Code Changes Reviewed

- `apps/api/src/modules/auth/telegram-auth.service.ts` — `INTEREST_TOPICS` constant, `interestsQuerySchema`/`toggleInterestBodySchema` Zod schemas, `getInterests()`, `toggleInterest()`, `requirePlatformUserAndEmail()`, `toInterestsResult()`
- `apps/api/src/modules/auth/auth.controller.ts` — `TelegramInternalController.interests` (`GET /v1/internal/telegram/interests`), `TelegramInternalController.toggleInterests` (`POST /v1/internal/telegram/interests/toggle`)
- `apps/api/src/modules/directus/directus-users-bridge.service.ts` — `resolveUserAndEmailFromDirectusId`
- `apps/api/src/modules/auth/auth.module.ts` — `forwardRef(() => MeProfileModule)` import
- `apps/api/src/modules/me-profile/me-profile.module.ts` — `forwardRef(() => AuthModule)` on its own `AuthModule` import (unplanned, required fix)
- `apps/api/src/modules/me-profile/me-profile.service.ts` — read only, to verify `listInterests`/`addInterest`/`removeInterest` (unchanged) as the write-path boundary and confirm the `member_interests` filter shape
- `apps/api/src/modules/internal/internal-auth.guard.ts` — read only, to confirm the guard `TelegramInternalController` inherits (timing-safe token comparison, unchanged)
- `apps/api/test/telegram-bot-interests-controller.spec.ts` — new
- `apps/api/test/telegram-bot-interests-service.spec.ts` — new
- `apps/api/test/directus-users-bridge.spec.ts` — modified (not read line-by-line; covered by impact/code-summary description, low risk — additive hit/miss cases on a read-only lookup)
- `apps/bot/src/handlers/interests.py` — new
- `apps/bot/src/keyboards/interests.py` — new
- `apps/bot/src/services/api_client.py` — `INTERESTS_PATH`/`INTERESTS_TOGGLE_PATH`, `InterestsResult`, `get_interests()`, `toggle_interest()` (new methods only; rest of file unchanged)

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1 | Tenant isolation | PASS | `member_interests` has no `country_code` column — confirmed directly by reading `me-profile.service.ts`'s `MemberInterestRow` interface (`id, topic_tag, intent` only) and `listInterests`'s actual filter: `filter: {member: {_eq: directusUserId}}` (line 354), no country/tenant predicate anywhere in `listInterests`/`addInterest`/`removeInterest`. Both new routes correctly omit a `country` param — adding one would have been the actual bug (inventing a filter the underlying data model doesn't support). No `bypassTenant()`-style construct anywhere in this diff. |
| INV-2 | Secrets by reference | PASS | No password/secret/apiKey/token/Bearer literals in any changed file. `InternalAuthGuard` (unchanged) reads `env.INTERNAL_API_TOKEN`, not a literal. Bot's `api_client.py` sends `self._token` via the `x-internal-auth` header (existing pattern, unchanged for the two new methods) — never logged; error messages in both new methods (`get_interests request failed: {exc}`, `toggle_interest request failed: {exc}`) log the httpx exception only, not headers or token. |
| INV-3 | Auth at controller level | PASS | Both new methods (`interests`, `toggleInterests`) are declared on `TelegramInternalController`, which carries class-level `@UseGuards(InternalAuthGuard)` (auth.controller.ts:518-519, unchanged) — no new guard pattern, no method-level override that could weaken it. Confirmed by reading the guard itself (timing-safe token compare, unchanged). |
| INV-4 | Validation at boundaries | PASS | `interestsQuerySchema.safeParse(query)` and `toggleInterestBodySchema.safeParse(body)` both run before any service call, both `throw new BadRequestException` on failure (auth.controller.ts:693-698, 710-715) — same pattern as every existing route on this controller. See dedicated assessment below for the enum-boundary claim specifically. |
| INV-5 | No cross-schema queries | PASS | `TelegramAuthService` → `DirectusUsersBridgeService.resolveUserAndEmailFromDirectusId` (reads only `platform.users` via Drizzle) and → `MeProfileService` → `DirectusClient` (reads/writes only `directus_users`/`member_interests` via Directus HTTP API). No JOIN spans `platform` and `directus` in a single query — the two are separate round trips composed in application code, matching every other bridge consumer in this codebase. |
| INV-6 | Rate limiting | N/A | Both routes are internal, `InternalAuthGuard`-protected, not public — consistent with every other route on `TelegramInternalController` (none carry `@Throttle`; only the two genuinely public routes on `AuthController` — `telegram/exchange`, `register` — do). No new deviation introduced. |
| INV-7 | CSRF protection | N/A | Not browser-initiated; internal service-to-service call authenticated via the internal token header, not a session cookie. Same posture as every other `TelegramInternalController` route. |
| INV-8 | No `dangerouslySetInnerHTML` | PASS | Zero occurrences — no frontend/React changes in this PR at all. |
| INV-9 | No N+1 queries | PASS (bounded, see assessment) | See dedicated assessment below. Not a violation: the loop is bounded by a same-request, already-fetched, small in-memory array (`learnRows`, defensively ≤ a handful of rows in practice, structurally capped at 200 by `listInterests`'s own `limit=200`), not by unbounded user-controlled input. |
| INV-10 | Drizzle parameterization | PASS | `resolveUserAndEmailFromDirectusId` uses Drizzle's query builder (`.select(...).from(users).where(eq(users.directusUserId, directusUserId)).limit(1)`) — no `sql\`...\`` template, no string concatenation into a query. Matches the sibling `resolveUserIdFromDirectusId` exactly. |
| INV-11 | HttpOnly tokens (web) | N/A | No web/browser token handling in this PR — internal bot↔API surface only, authenticated via header token, not cookies. |

## Dedicated assessment 1 — INV-9: toggle-off loop and the extra `getInterests` round trip

**The loop itself is not a real INV-9 concern.** `toggleInterest`'s toggle-off path:

```ts
const learnRows = existing.filter((i) => i.topic_tag === topic && i.intent === 'learn');
for (const row of learnRows) {
  await this.meProfile.removeInterest(userId, email, row.id);
}
```

`learnRows` is filtered from `existing`, which is the result of a single `listInterests` call already made earlier in the same method (`const existing = await this.meProfile.listInterests(userId, email)`) — it is not re-queried per iteration, and its size is bounded three ways: (1) `listInterests`'s own Directus query caps at `limit=200` for the *entire* member's interest set across all topics; (2) the filter narrows that further to rows matching one specific `topic_tag` AND `intent === 'learn'`; (3) `addInterest`'s own dedup-before-insert (`existing.find((i) => i.topic_tag === topicTag && i.intent === intent)`) means the write path structurally prevents more than one `(topic_tag='X', intent='learn')` row from ever being created in the first place. The code's own comment (telegram-auth.service.ts:880-888) is explicit that handling >1 is defensive, not the expected case — confirmed correct: nothing in the addInterest write path can currently produce more than one such row. So the realistic bound is 0 or 1 iterations; the pathological "somehow >1" case is not attacker-reachable (no user input controls how many `learn` rows exist for a given topic — the API is the only writer, and it dedups). This is a small, request-scoped fan-out over already-fetched data, not a query-inside-a-loop-over-unbounded-input pattern — does not warrant a MAJOR/BLOCKER finding.

`removeInterest` itself does its own membership-check query (`GET /items/member_interests?filter={id, member}&limit=1`) before the `DELETE` — that's one extra Directus round trip per removed row, same shape as every other ownership-checked delete in this service (`removeSkill`, `removeEmployment`). At the realistic bound of ≤1 row, this is 1 extra query, not an N+1 pattern in the pejorative sense (no scaling with attacker-controlled N).

**The extra `getInterests()` call at the end (Key Design Decision #2) is safe and reasonable, not just "technically an extra query."** Two points:
1. **Correctness**: recomputing the full `{selected, available}` result by re-deriving it from a fresh `listInterests` read (rather than hand-computing the post-toggle delta in-process) means the response can never drift from the actual Directus state — e.g. if `addInterest`'s dedup silently no-ops, or a concurrent web-side write landed between the toggle-time read and the write, the bot's rendered keyboard still reflects true server state rather than an assumed one. Given this endpoint's whole purpose is rendering a stateful toggle UI, an incorrect assumed-state response is a worse outcome (user taps a button, sees a state that doesn't match reality, taps again, confusion) than one extra ~50-100ms round trip.
2. **No new race/TOCTOU exposure**: the extra call is a second `listInterests` read after the write has already committed — it does not re-open a window for a different requestor to interleave a conflicting write in a way that would produce an incorrect *security* outcome (worst case is a stale/refreshed read reflecting a concurrent legitimate change to the same member's own row, which is expected/benign for a self-service toggle, not a cross-user data leak). This composition is reasonable.

## Dedicated assessment 2 — `topic` enum validation boundary (INV-4 deep check)

Confirmed directly, not from prior-agent claims: `toggleInterestBodySchema = z.object({ directusUserId: z.string().uuid(), topic: z.enum(INTEREST_TOPICS) })` (telegram-auth.service.ts:277-280). `z.enum()` with a fixed 7-element `readonly` tuple genuinely rejects any string not in that exact list — Zod's `enum` validator does an exact membership check, not a prefix/substring/coercion match.

The controller applies this **before** any service call: `toggleInterestBodySchema.safeParse(body)` → `if (!parsed.success) throw new BadRequestException(...)` → only on success does `this.telegramAuth.toggleInterest(parsed.data.directusUserId, parsed.data.topic)` run (auth.controller.ts:710-716). `parsed.data.topic` is typed `InterestTopic` (the literal union), not `string`, at the call site — TypeScript itself would reject passing an unvalidated string here even before runtime. There is no alternate code path into `toggleInterest` that bypasses this controller — it's the sole caller in this diff, and `toggleInterest`'s own signature takes `topic: string` internally but is only ever invoked with the Zod-narrowed value from this one call site.

Traced the write path if a bad value somehow arrived: `toggleInterest` → (topic unselected branch) → `this.meProfile.addInterest(userId, email, topic, 'learn')` → `MeProfileService.addInterest` does `directus.post('/items/member_interests', { member, topic_tag: topicTag, intent })` with **no server-side (Directus-schema) enum constraint on `topic_tag`** — confirmed by reading `me-profile.service.ts` end-to-end: `addInterest` never validates `topicTag` against any whitelist, and the interface comments (line ~28: "member_interests add/remove (topic_tag + intent)") describe it as a free-text column. This confirms the impact analysis's claim that `MeProfileService.addInterest` would happily persist arbitrary free text — which makes the Zod enum at the controller boundary the **only** enforcement point in this call chain, and it is proven to run first, unconditionally, on every request. Also directly confirmed via the new controller spec test (`telegram-bot-interests-controller.spec.ts:115-123`): posting `topic: 'not-a-real-topic'` asserts `BadRequestException` AND `expect(telegramAuth.toggleInterest).not.toHaveBeenCalled()` — proving both the rejection and that the service is never reached, not just that a 400 status is eventually produced by some other layer.

Conclusion: the enum boundary is real, pre-write-path, and test-verified — not merely present in a type annotation or OpenAPI doc.

## Additional notes (non-blocking, informational)

- The bot's callback-data topic value (`callback.data.split(":", 1)[1]` in `handlers/interests.py:90`) is technically attacker-influenced in principle (a modified Telegram client could send arbitrary `callback_data`), but this is exactly the scenario the server-side Zod enum exists to close — the bot performs no independent validation of the extracted topic before calling `toggle_interest()`, correctly relying on the API's boundary check rather than duplicating it. Consistent with this codebase's established trust model (`InternalAuthGuard` + Zod, not defense split across bot and API).
- `resolveUserAndEmailFromDirectusId` projects `id, email` from `platform.users` — no additional PII beyond what `resolveUserIdFromDirectusId` already exposed within the same trust boundary (internal, guard-protected); response shapes returned to the bot (`{selected: string[], available: string[]}`) carry no email/displayName/handle, matching the impact analysis's "no PII exposure change" claim.
- Module-wiring `forwardRef` changes (`auth.module.ts`, `me-profile.module.ts`) are a DI-graph/availability concern, not a security-boundary concern — reviewed for completeness (INV-5 cross-schema angle) but the actual failure mode they fix (`UnknownDependenciesException`/`UndefinedModuleException`) is a startup-time correctness issue, already caught by `main-bootstrap.spec.ts` per the code summary; no auth/validation implication.

## BLOCKER Findings

None.

## MAJOR Findings

None.

## Gate Result

```yaml
gate: security-reviewer
status: passed
summary: >
  All 11 invariants checked; INV-6/7/11 not applicable (internal
  service-to-service surface, no browser/session/public-endpoint
  exposure). INV-1 tenant-isolation exclusion independently verified
  against me-profile.service.ts's actual listInterests filter (member-only,
  no country_code column exists) — the absent `country` param is correct,
  not a gap. INV-4's topic enum boundary independently traced end-to-end:
  z.enum(INTEREST_TOPICS) runs before any service call, is the only
  enforcement point before MeProfileService.addInterest (which has no
  Directus-side enum constraint on topic_tag), and is proven by
  telegram-bot-interests-controller.spec.ts to both 400 AND never invoke
  the service on an out-of-list value. INV-9's toggle-off loop assessed as
  a bounded, request-scoped fan-out (0-1 iterations in realistic cases,
  structurally capped by addInterest's own dedup and listInterests's
  limit=200) rather than an unbounded N+1 against attacker-controlled
  input; the extra getInterests() round trip at the end of toggleInterest
  is a deliberate, reasonable correctness-over-micro-optimization choice
  with no new race/TOCTOU security exposure. No secrets, no cross-schema
  queries, no CSRF/XSS surface, Drizzle parameterization intact, guard
  inherited correctly at the controller level on both new routes.
blocking_issues: []
needs_clarification: []
notes: >
  No BLOCKER or MAJOR findings. Two informational notes recorded (bot-side
  callback-data trust model, module-wiring forwardRef scope) — neither
  actionable, both consistent with established codebase conventions.
```
