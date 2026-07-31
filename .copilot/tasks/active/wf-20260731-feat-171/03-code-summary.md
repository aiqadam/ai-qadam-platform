# Code Summary — FEAT-BOT-1, API-side (`POST /v1/internal/telegram/lookup`)

workflow: wf-20260731-feat-171
agent: CodeDeveloper
scope of this invocation: **API-side only** (`apps/api`) — bot-side scaffold
in `apps/bot/` is handled by a separate CodeDeveloper invocation.

---

## Requirement Implemented

New internal-only endpoint `POST /v1/internal/telegram/lookup` on
`apps/api`, guarded by the existing `InternalAuthGuard`, resolving a raw
`telegramId` to `{ directusUserId: string | null, isTemp: boolean, country:
string | null }`. Implements AC-1 through AC-5 from
`01-requirement-validation.md`:

- **AC-1**: linked, non-temp Authentik user with a matched Directus row →
  `200` with real `directusUserId`, `isTemp: false`, real `country`.
- **AC-2**: temp-only Authentik user (`attributes.is_temporary === true`) →
  `200` with `isTemp: true`; `directusUserId`/`country` resolve from
  Directus if a row happens to exist for that synthetic email (it normally
  won't yet, so both come back `null` for the common temp-user case — see
  Key Design Decisions for why `directusUserId` is `null` here rather than
  a synthetic/pending id).
- **AC-3**: no Authentik user at all → `404` with structured body
  `{ error: 'telegram_user_not_found' }` (this repo's established
  convention, not a literal RFC 7807 object — see Key Design Decisions).
- **AC-4**: missing/incorrect `x-internal-auth` → `401`, via the reused
  `InternalAuthGuard` (not reimplemented) applied at
  `TelegramInternalController` class level, which now also covers the new
  route.
- **AC-5**: read-path idempotency — `lookupUser` and its private helper
  call only `AuthentikClient.getUserByTelegramId` (GET) and
  `DirectusClient.get()` (GET); self-verified via `grep` for
  `.create(`/`.patch(`/`.post(` inside `telegram-auth.service.ts` — zero
  matches in the new code path. `upsertTempUser` is untouched.

## Files Changed

| File | Change Type | Description |
|---|---|---|
| `apps/api/src/modules/auth/telegram-auth.service.ts` | Modified | Added `lookupUserBodySchema` Zod schema, `LookupUserResult` + `DirectusUserLookupRow` interfaces, injected `DirectusClient` into the constructor, added `lookupUser(telegramId)` public method and `findDirectusUserByEmail(email)` private read-only helper. |
| `apps/api/src/modules/auth/auth.controller.ts` | Modified | Added `@Post('lookup')` route (`lookup` method) on the existing `TelegramInternalController` class (already `@UseGuards(InternalAuthGuard)` at class level), alongside `upsert-temp-user`. Imported `lookupUserBodySchema` and `LookupUserResult` type. |

No other files changed. No module-import changes to `auth.module.ts` were
needed — `DirectusModule` (which exports `DirectusClient`) was already
imported at `AuthModule` level, confirmed by reading the file before
assuming so per the task instructions; only the new constructor injection
on `TelegramAuthService` was required.

## Key Design Decisions

1. **`DirectusClient` injected directly, not `DirectusUsersBridgeService`.**
   The impact analysis named both as candidates. `DirectusUsersBridgeService`'s
   only email-keyed method usable without a pre-existing `platform.users`
   row (`ensureLinkedByEmail` → `findOrCreate`) **creates** a Directus user
   on miss — a write, which AC-5 explicitly forbids on this path. A
   Telegram temp user (created via `upsertTempUser`) has no `platform.users`
   row at all (that row is only created on OIDC sign-in via
   `AuthController.callback`), so the bridge's row-keyed methods don't apply
   either. Instead, `lookupUser` calls a new private
   `findDirectusUserByEmail` that does a plain `DirectusClient.get('/users?
   filter[email][_eq]=...&fields=id,country&limit=1')` — the same low-level
   read primitive `DirectusUsersBridgeService.findOrCreate` and
   `TelegramPreferencesService.findMember` already use, just the read-only
   half, with no create fallback.
2. **`country` field, not `country_preference`.** Confirmed directly (not
   just trusted from the impact analysis) via `registration.service.ts`
   line 251-253's comment and `telegram-preferences.service.ts` line 178's
   actual Directus `?fields=` query — both use bare `country`.
3. **New minimal Zod schema (`lookupUserBodySchema`), not reuse of
   `upsertTempUserBodySchema`.** `upsertTempUserBodySchema` requires
   `firstName` (and optional `username`), fields the lookup endpoint's
   request doesn't have. Per the task instruction to reuse
   `telegramIdSchema` if a matching shape already exists — none did (no
   existing schema is exactly `{ telegramId }` alone) — so
   `lookupUserBodySchema = z.object({ telegramId: telegramIdSchema })` was
   added following the exact same declaration pattern/placement as
   `upsertTempUserBodySchema` immediately above it.
4. **404 error body**: `{ error: 'telegram_user_not_found' }` via
   `NotFoundException`, matching the dominant, most-recent convention in
   this codebase (`modules/telegram/*`'s `{ error: 'member_not_found' }`,
   `{ error: 'telegram_not_configured' }`, etc.) rather than a literal
   inline RFC 7807 object. Confirmed there is no global `ExceptionFilter`
   in `apps/api/src` that wraps `NotFoundException` bodies into the
   `type`/`title`/`status`/`detail`/`instance` shape shown in
   `standards.md`'s Part VII — every existing 404 in this codebase passes a
   plain reason object/string as the Nest exception body, so this endpoint
   follows the code's actual, consistent convention rather than the doc's
   illustrative example, matching how every sibling endpoint in this module
   already behaves.
5. **AC-2's open question (exact `directusUserId` value for the temp-user
   case), resolved as `null`, not a synthetic/pending id.** The lookup does
   real Directus resolution by email; a brand-new temp user's synthetic
   Authentik email (`tg<id>@telegram.local`) will not have a matching
   Directus row until/unless something else creates one, so the honest,
   non-fabricated answer is `null` — consistent with "this is a read, it
   does not invent identifiers." If a Directus row *does* already exist for
   that email (e.g. the member registered fully before ever hitting
   `/start` again with a stale local bot cache), the real id is returned
   even though `isTemp` is true, which is correct: `isTemp` reflects the
   Authentik user's own `is_temporary` attribute, independent of whether a
   Directus mirror happens to exist.
6. **`isTemp` derived from `authentikUser.attributes.is_temporary === true`**
   — a strict boolean check against `Record<string, unknown>` (Authentik
   attributes are untyped JSON), so any non-`true` value (including
   `undefined` for full accounts, which never set this attribute) resolves
   to `isTemp: false`.
7. **Did not touch `upsertTempUser`'s hardcoded-`null` `directusUserId`
   stub**, per explicit out-of-scope instruction — confirmed by diff review
   that method's body is byte-for-byte unchanged.

## Architecture Rule Compliance

- **Module boundaries**: no new NestJS module; new route added to the
  existing `TelegramInternalController` in `modules/auth`, matching the
  impact analysis's explicit placement decision (URL-prefix cohesion with
  `upsert-temp-user`, both under `v1/internal/telegram/*`). No direct
  cross-module entity/repository import — `DirectusClient` is a provider
  exported by `DirectusModule`, consumed via constructor DI only.
- **Tenant scoping**: not applicable — this is a global lookup by
  `telegramId`, not a tenant-scoped query (per task instructions), and the
  impact analysis's Security Review flag on this point is intentionally
  left for SecurityReviewer's sign-off, not decided here.
- **Zod at boundaries**: `lookupUserBodySchema.safeParse(body)` in the
  controller; `lookupUserBodySchema.shape.telegramId.parse(telegramId)`
  again at the service boundary (belt-and-suspenders, matching
  `upsertTempUser`'s existing pattern exactly).
- **No cross-schema queries**: no Drizzle/Postgres query at all in the new
  code path — pure Authentik HTTP read + Directus HTTP read, no
  `platform.users` table touched.
- **No `any`**: all new types (`LookupUserResult`, `DirectusUserLookupRow`,
  `LookupUserBody`) are explicit interfaces/Zod-inferred types; the only
  untyped surface (`authentikUser.attributes: Record<string, unknown>`) is
  pre-existing on `AuthentikUser` and accessed via a safe `=== true` check,
  not cast.
- **Auth at controller level**: `@UseGuards(InternalAuthGuard)` is already
  applied at the `TelegramInternalController` class level (not
  re-declared per-method), so the new `lookup` route inherits it
  automatically — no risk of a misplaced/missing per-route guard, which the
  impact analysis's Security Review flag #1 specifically called out.
- **Custom typed errors**: `NotFoundException({ error: 'telegram_user_not_found' })`
  — no bare `throw new Error(...)` anywhere in the new code.
- **All promises awaited**: `lookupUser` and `findDirectusUserByEmail` both
  fully `await` their HTTP calls; no fire-and-forget.

## Formatter Check

- `pnpm --filter api lint` (`biome check .`) — clean, no issues, no fixes
  applied.
- `pnpm biome check apps/api/src/modules/auth/telegram-auth.service.ts
  apps/api/src/modules/auth/auth.controller.ts` — explicit targeted check,
  clean, no fixes applied.
- Python/ruff: not applicable to this invocation (API-side only).

## Known Limitations

- **No bot consumer yet in this commit.** The Python/aiogram bot scaffold
  in `apps/bot/` (the AC-6 through AC-11 half of FEAT-BOT-1) is being
  implemented in a **separate CodeDeveloper invocation**, itself blocked on
  PR #194 (submodule bootstrap) per the impact analysis's sequencing note.
  This endpoint currently has zero real callers — it's reachable and
  correct per its own contract, but unexercised end-to-end until the bot
  side lands and is wired to call it.
- **No automated integration test added in this pass.** The impact
  analysis's Test Scope section assigns integration-test authorship
  (Testcontainers + mocked Authentik/Directus HTTP layer, AC-1 through
  AC-5 as black-box HTTP assertions) to the TestDesigner/TestRunner stage
  of this workflow, not CodeDeveloper — no existing `.spec.ts` file for
  `telegram-auth.service.ts` exists yet to extend in-place, and role scope
  here is implementation, not test authorship.
- **No endpoint-side rate limiting added.** The impact analysis's Risk
  Flags §2 explicitly raises this as an open SecurityReviewer question (the
  endpoint currently relies solely on the shared-secret guard, same as its
  sibling `upsert-temp-user`, with no `@Throttle` decorator) — left for
  SecurityReviewer to assess and decide, not preemptively added or
  rejected here.
- **AC-2's `directusUserId` value for the temp-user case** was resolved as
  `null` in the common case (see Key Design Decisions #5) — flagged in case
  TestDesigner's formal AC-2 test wants to confirm this matches their
  expectation before finalizing.

## Gate Result

```yaml
gate: code-developer
workflow: wf-20260731-feat-171
status: passed
timestamp: 2026-07-31T00:00:00Z
summary: >
  API-side implementation of POST /v1/internal/telegram/lookup complete.
  New lookupUser() method on TelegramAuthService (modules/auth), new
  DirectusClient constructor injection (DirectusModule already imported at
  AuthModule level — confirmed by reading auth.module.ts, no import change
  needed), new @Post('lookup') route on the existing
  TelegramInternalController, guarded by the already-applied class-level
  InternalAuthGuard. Read-only by construction: only GET calls
  (AuthentikClient.getUserByTelegramId, DirectusClient.get) appear in the
  new code path — self-verified via grep for .create(/.patch(/.post( with
  zero matches, satisfying AC-5. upsertTempUser's existing null
  directusUserId stub left untouched, out of scope per instructions.
  typecheck, lint (biome check), and build all pass clean with zero
  fixes needed.
scope: api-side-only
files_changed:
  - apps/api/src/modules/auth/telegram-auth.service.ts
  - apps/api/src/modules/auth/auth.controller.ts
typecheck: pass
lint: pass
build: pass
formatter_check: pass
architecture_rules_confirmed: true
known_limitations:
  - No bot-side consumer yet (separate CodeDeveloper invocation, blocked on PR #194)
  - No integration test authored in this pass (TestDesigner/TestRunner stage)
  - No endpoint-side rate limiting added (flagged for SecurityReviewer)
next_agent: security-reviewer
```
