# 06 — Test Strategy: FR-AUTH-006

Agent: TestStrategist
Workflow: wf-20260801-feat-181
Branch: feature/FR-AUTH-006-temp-account-upgrade

## Requirement

**FEAT-AUTH-6** — Temporary account upgrade (Telegram-only → full member). A
Telegram-only member (`attributes.is_temporary=true` in Authentik, no
`platform.users`/`directus_users` row yet) supplies a real email via
`POST /v1/internal/telegram/upgrade-temp`. `UpgradeService.requestUpgrade()`
re-checks the email is free, PATCHes it onto the Authentik user immediately
(Finding #0: `sendMagicLinkEmail` always targets the on-file email, so it
must be correct before the send, not after verification), mints an
`upgrade_intents` row, and triggers Authentik's magic-link send.
`AuthController.callback()` calls `UpgradeService.resolvePendingUpgrade(email)`
(side-effect-free) before `UsersService.upsertByAuthentikSubject()`, and — only
if a pending upgrade was resolved — calls `UpgradeService.commitUpgrade()`
(the `is_temporary=false` flip + intent consumption) *after* that write
succeeds. 8 ACs (`01-requirement-validation.md`). Correlation is by
`authentikUserPk`, not by threading a token through `next` — the originally
sketched token-round-trip mechanism was found undeliverable (Authentik's
magic-link email accepts no caller-supplied state) and was replaced during
CodeDeveloper's pass; `upgrade_intents.tokenHash` is populated but vestigial
for correlation. **Documentation note, not a test target:**
`upgrade-intent.schema.ts`'s own header comment (lines 9-16) still describes
the superseded token-round-trip-through-`next` mechanism — this is stale
relative to the shipped pk-correlation design and should be corrected by
DocWriter later in this workflow; flagging here so TestDesigner doesn't
mistake the schema file's comment for authoritative behavior to test against.

## Rubric Score

| Criterion | Points | Applies? | Why |
|---|---|---|---|
| Touches tenant-scoped data | +2 | No (+0) | `upgrade_intents` confirmed not tenant-scoped by both ImpactAnalyzer and CodeDeveloper — no `country_code`, matches `platform.users`' own absence of the column. A Telegram user's country isn't resolved until after upgrade. |
| New API endpoint | +2 | Yes (+2) | `POST /v1/internal/telegram/upgrade-temp`, new route on `TelegramInternalController`. |
| Business rule with genuine edge cases | +2 | Yes (+2) | Temp-vs-full account state machine, email collision (both at request time and the callback-time downstream unique-constraint race), intent TTL expiry, already-consumed intent, degraded magic-link-not-configured path. |
| Cross-module service call | +1 | Yes (+1) | `UpgradeService` → `AuthentikClient` (admin-invites module); `AuthController.callback()` → `UpgradeService` → (indirectly gates) `UsersService.upsertByAuthentikSubject` / `DirectusUsersBridgeService.ensureLinked`. |
| New database query | +1 | Yes (+1) | New `upgrade_intents` table: insert (`requestUpgrade`), indexed select (`resolvePendingUpgrade`), update (`commitUpgrade`). |
| Pure function / utility | 0 | — | — |
| UI-only change | 0 | — | — |

**Total: 6.**

- **≥ 4 → Integration tests (Testcontainers) required.** Clearly met (6 ≥ 4) — this is not a close call. The whole point of MAJOR-2 is that the highest-value assertions in this FR (the `callback()` ordering invariant, the `upgrade_intents` CRUD, the collision race) only make sense as integration-level tests against a real Postgres; a unit test mocking the DB can prove the code *calls* the right Drizzle methods but cannot prove the `users_email_unique` constraint actually fires and actually propagates the way `commitUpgrade`'s reachability argument depends on.
- **≥ 6 → E2E (Playwright) required by the rubric's raw arithmetic — but see "E2E decision" below for why I am not requiring a new Playwright spec file.** The score lands exactly at the E2E threshold, so I want to be explicit that this isn't being waved off by rounding — see the dedicated section below for the reasoning and the alternative I'm requiring instead.

## E2E Decision

**Rubric score is 6, which nominally crosses the "E2E required" line. I am NOT requiring a new Playwright spec file for this workflow. Instead I am requiring an Orchestrator-owned live verification pass (curl-based) at Step 8/13, and documenting why that satisfies the intent behind the rubric's E2E tier better than a Playwright file would.**

Reasoning:

1. **The rubric's E2E tier exists to catch "full user journey through a real browser" defects** — the standards doc (`docs/04-development/standards.md` §IV) scopes E2E to "critical happy paths... login, event registration, check-in," explicitly framed around Page Object Model / browser selectors. This FR has **zero `apps/web` changes** (confirmed by both ImpactAnalyzer and CodeDeveloper) and **zero `apps/bot` changes** (the bot's `/upgrade` command is explicitly out of scope, deferred to FR-BOT-002 PR 6/6). There is no browser UI in this workflow's scope for Playwright to drive, and no bot conversation to script either. A Playwright spec would necessarily be testing either (a) a synthetic browser hitting the internal API directly with `fetch`/`request.post` — which Playwright can do, but which is not meaningfully different from an integration test with an HTTP layer bolted on, or (b) a fabricated UI that doesn't exist, which would be testing scaffolding this FR doesn't ship.
2. **What actually needs live verification is Authentik's real behavior**, not a browser journey: does `sendMagicLinkEmail` really deliver to the just-PATCHed email (Finding #0's core empirical claim, already partially verified by reading Authentik's source but not yet verified by *watching a real email arrive*), does the full magic-link-click → OIDC callback → `is_temporary` flip round-trip actually work against the live local Authentik container end-to-end. This is precisely the kind of check FR-AUTH-004's own workflow did via a live spike (`02b-authentik-spike-findings.md`) and a manual `07-test-results.md` CRITICAL FINDING pass — not a Playwright file — because the thing under test is a third-party identity provider's real HTTP/email behavior, not a rendered page's DOM.
3. **Mailpit (or equivalent local mail capture) + curl is the right tool for this**, matching `AGENTS.md` §6.1's "bring up missing infra, curl-verify" obligation and the precedent this exact FR family already established. This belongs at the **Orchestrator's Step 8 infra pre-flight / Step 13 live-verification pass**, not a new automated spec file that would need to poll a mail-capture API, parse an HTML email body for a link, and click through a headless browser — technically possible, but disproportionate ceremony for an internal, bot-facing API endpoint with no UI, and it would encode Authentik-specific mail-parsing fragility into the permanent Playwright suite for a flow that has no browser-facing surface of its own.
4. **This is a judgment call I'm making explicitly, not a default I'm skipping past**: if a future workflow (FR-BOT-002 PR 6/6) adds the actual bot `/upgrade` command, *that* workflow is where a Playwright-adjacent or bot-simulator E2E test becomes appropriate, once there is a real user-facing entry point to drive. For *this* workflow, requiring a Playwright file would produce a test that exercises the same code path the integration tests below already exercise, with an unnecessary browser process on top and no UI assertions of any value to make.

**Required instead of a Playwright file:** a Live Verification checklist for the Orchestrator (not TestDesigner-authored test code), specified in the E2E Test Plan table below with `Entry Point` = curl commands and `Exit Assertion` = observed real-system state. Orchestrator must run this before the workflow can be marked UAT-verified; it is not optional, it is simply not Playwright.

## Required Test Levels

- [x] Unit
- [x] Integration (Testcontainers)
- [ ] E2E (Playwright) — not required; see "E2E Decision" above. A curl-based live verification pass (Orchestrator-owned) is required instead and is specified in the E2E Test Plan table below for traceability.

## Unit Test Plan

Target file: `apps/api/test/upgrade-service.spec.ts` (new — confirmed absent, this is the file MAJOR-2 partially refers to). Mock `AuthentikClient` (plain object cast, matching `magic-link-controller.spec.ts`'s `as unknown as X` convention) and `Db` (mock Drizzle chain) for pure unit tests — no Testcontainers here; the DB-touching assertions belong in the Integration plan below where a real Postgres proves the constraint behavior the design depends on.

| Target | Happy Path | Failure Paths |
|---|---|---|
| `UpgradeService.requestUpgrade()` | Temp user found, target email free, both collision checks pass, `setUserEmail` PATCH succeeds, intent row inserted (assert `db.insert` called with `tokenHash` (64-hex), `authentikUserPk`, `telegramId`, `targetEmail`, `expiresAt` ≈ now+30min), `sendMagicLinkEmail` called with the patched user's pk → returns `{ ok: true }` | (1) `getUserByTelegramId` → `null` → `NotFoundException({ error: 'telegram_user_not_found' })`, `setUserEmail`/insert/send never called. (2) `attributes.is_temporary !== true` (test `false`, `undefined`, and the string `"true"` as three separate cases — the code's strict `!== true` check must fail closed for all three) → `ConflictException({ error: 'not_a_temp_account' })`. (3) First `getUserByEmail` collision check (step c) finds a different pk → `ConflictException({ error: 'email_already_in_use' })`, `setUserEmail` never called. (4) First check passes but the re-check (step c-2) finds a different pk → same `ConflictException`, proving the re-check is load-bearing and not dead code (mock `getUserByEmail` to return `null` on the first call and a colliding user on the second). (5) Collision check matches the CALLER'S OWN pk (`collision.pk === authentikUser.pk`) → must NOT throw (self-collision is not a real collision; this is an idempotency case worth its own assertion since the code's `collision.pk !== authentikUser.pk` guard is easy to get backwards). (6) `AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID`/`AUTHENTIK_MAGIC_LINK_BRAND_DOMAIN` unset → degraded path: `setUserEmail` and the DB insert still happen, `sendMagicLinkEmail` is NOT called, method still resolves `{ ok: true }` (matches `MagicLinkService`'s own degraded-mode posture per the module doc) — assert via a warn-log spy or by asserting `sendMagicLinkEmail` mock was never invoked. |
| `UpgradeService.resolvePendingUpgrade()` | Live (unexpired, unconsumed) intent row exists for the resolved pk → returns `{ intent, authentikUserPk }` | (1) `getUserByEmail(email)` → `null` (email not found in Authentik at all — defensive/unreachable-in-practice case since `callback()` only calls this with an id_token-verified email, but the method's own null-check exists and must be covered) → returns `null`, no DB query attempted. (2) No `upgrade_intents` row at all for the resolved pk → returns `null` (AC-8's overwhelmingly common "ordinary sign-in" case). (3) A row exists but `expiresAt <= now` (expired) → returns `null` — assert the `gt(expiresAt, now)` filter is what excludes it, not an incidental empty result (seed exactly one expired row and nothing else). (4) A row exists but `consumedAt IS NOT NULL` (already consumed — replay of an old upgrade link) → returns `null`. (5) Multiple live rows exist for the same pk (re-issued `/upgrade-temp` calls before the first expired) → returns the most recently created one (`orderBy(desc(createdAt)).limit(1)`) — assert which row's `id` comes back, not just that *a* row comes back. |
| `UpgradeService.commitUpgrade()` | Valid `PendingUpgrade` → `getUserById` returns the Authentik user, `patchAttributes` called with existing attributes spread + `is_temporary: false` (assert OTHER attributes, e.g. `telegram_id`, are preserved in the merge — this is the exact bug class `patchAttributes`' full-replace semantics invites), `upgrade_intents.consumedAt` updated for that intent's `id` | (1) `getUserById(pk)` → `null` (Authentik user vanished between `resolvePendingUpgrade` and `commitUpgrade` — extremely unlikely but the code has an explicit branch for it) → method resolves without throwing (must not break sign-in), `patchAttributes` and the `consumedAt` update are NOT called — assert both non-calls, not just "no throw." |
| `AuthentikClient.setUserEmail()` | `PATCH /api/v3/core/users/{pk}/` called with exactly `{ email }` as the body, for a given `userPk` | HTTP failure from the underlying `request()` call (e.g. Authentik 500/network error) propagates unchanged (no swallowing) — match whatever `setUserGroups`/`disableUser` do today for the same failure shape (check their existing test coverage, if any, as the precedent to match, not exceed, per the impact analysis' own instruction). |
| `callback()`'s upgrade-branch wiring (may live in `auth-controller-callback.spec.ts`, extending the existing file rather than a new one, since it already mocks `UpgradeService`) | `resolvePendingUpgrade` returns a `PendingUpgrade` → `commitUpgrade` is called exactly once, with that exact object, and — critically — only AFTER `upsertByAuthentikSubject` has resolved (assert call ORDER via a shared array/spy timestamps, not just call counts) | (1) `resolvePendingUpgrade` returns `null` (AC-8 common case) → `commitUpgrade` is NEVER called, `upsertByAuthentikSubject`/`ensureLinked`/`mintSession` all proceed exactly as before this FR (this is the two pre-existing FR-AUTH-004 AC-7 funnel-regression tests already in the file — confirm they still pass unmodified in intent, not just mechanically updated). (2) `upsertByAuthentikSubject` REJECTS (simulate a thrown error) with a non-null `pendingUpgrade` present → `commitUpgrade` is NEVER called (assert zero invocations) and the rejection propagates out of `callback()` unchanged — this is the unit-level half of the MAJOR-2 invariant; see Integration Test Plan for the full-stack version with a REAL Postgres unique-constraint throw. |

## Integration Test Plan (Testcontainers)

Pattern precedent: `apps/api/test/refresh-token.spec.ts` — real Postgres via `inject('TEST_DATABASE_URL')` (from `test/setup-pg.ts`'s global Testcontainers setup), construct the service directly with a real `Db` (`drizzle(postgres(url))`), `beforeEach` truncates the relevant tables. `RefreshTokenService` has no external HTTP collaborator so that file mocks nothing; `UpgradeService` additionally depends on `AuthentikClient`, which talks to a real external system (Authentik) that Testcontainers does not stand up. Per `magic-link-controller.spec.ts`'s own header comment (lines 15-22), this codebase's established precedent for that exact combination — "needs a real DB, but the only non-DB collaborator is `AuthentikClient`" — is to use a REAL Testcontainers Postgres for the DB half and a plain mocked/faked `AuthentikClient` object (`as unknown as AuthentikClient` cast) for the Authentik half, not a second Testcontainer. Follow that precedent exactly: real `db` from `inject('TEST_DATABASE_URL')`, fake `AuthentikClient` built with `vi.fn()` stubs per test.

New file: `apps/api/test/upgrade-service.integration.spec.ts` (or extend `refresh-token.spec.ts`'s sibling pattern under a new file — keep it separate since it's a different module's public surface per standards.md §IV "one file per module's integration surface").

| Scenario | Infrastructure | Key Assertions |
|---|---|---|
| `upgrade_intents` table CRUD | Real Postgres (Testcontainers), no Authentik | Insert via `requestUpgrade()`-shaped raw `db.insert` (or via the service, with a faked `AuthentikClient`) produces a row with the expected columns; point lookup by `tokenHash` returns it; `consumedAt` update via `db.update(...).where(eq(id, ...))` persists and a re-select reflects it; a `select` filtered by `expiresAt > now()` correctly excludes a row seeded with `expiresAt` in the past (boundary case: seed one row expiring 1s ago, one expiring 1s from now, assert exactly the latter is returned). |
| `requestUpgrade()` full round trip against real DB | Real Postgres + faked `AuthentikClient` (`getUserByTelegramId`, `getUserByEmail`, `setUserEmail`, `sendMagicLinkEmail` all `vi.fn()`) | Calling `requestUpgrade()` end-to-end inserts exactly one real row in `upgrade_intents` with the correct `authentikUserPk`/`telegramId`/`targetEmail`/`expiresAt`, and `commitUpgrade`-style downstream reads (`resolvePendingUpgrade`) can find it — i.e. prove the insert-then-later-read path works through the SAME service instance and a real index-backed query, not just that individual Drizzle calls were made (which the unit tests already cover with mocks). |
| `resolvePendingUpgrade()` → `commitUpgrade()` full round trip against real DB | Real Postgres + faked `AuthentikClient` | Seed a live intent row directly via `db.insert`, call `resolvePendingUpgrade(email)` (faked `getUserByEmail` resolves the matching pk) → non-null result; call `commitUpgrade()` on it → re-select the row from real Postgres and assert `consumedAt` is now non-null and `patchAttributes` (faked) was called once with `is_temporary: false` merged into the pre-existing attributes object. |
| AC-8 fall-through: expired intent | Real Postgres + faked `AuthentikClient` | Seed an intent row with `expiresAt` in the past for a given pk. `resolvePendingUpgrade(email)` → `null`. Assert this does NOT throw and does not touch `patchAttributes`/`consumedAt` — the ordinary-sign-in path for this Authentik user must complete exactly as it would with no `upgrade_intents` row at all. |
| AC-8 fall-through: already-consumed intent (replay) | Real Postgres + faked `AuthentikClient` | Seed an intent row with `consumedAt` already set (simulating a user re-clicking an old magic-link email, or re-authenticating after a completed upgrade). `resolvePendingUpgrade(email)` → `null`. Same non-throw/no-mutation assertion as above. |
| **MAJOR-2 — race/collision regression test (SecurityReviewer's explicitly-required, still-open finding). Two sub-cases, both required.** | Real Postgres (for the `platform.users` unique-constraint enforcement — this is the whole point, it must be the REAL constraint, not a mock) + faked `AuthentikClient` | **(a) Common-case collision, caught by the re-check:** simulate two "concurrent" `requestUpgrade()` calls for two different temp users (`telegramId` A and B) both targeting the SAME `targetEmail`. Model concurrency by controlling the faked `getUserByEmail` mock's sequenced return values across the two calls (first caller's step-c and step-c2 both see `null`; by the time the second caller's step-c runs, mock `getUserByEmail` to return the FIRST caller's now-patched Authentik user) — assert the second call throws `ConflictException({ error: 'email_already_in_use' })` and that its `setUserEmail`/DB-insert are never reached. This proves the re-check (step c-2) does its job in the case it's designed to catch. **(b) Residual race window — the exact invariant SecurityReviewer's MAJOR-1 re-review traced but a test must lock in:** construct the state that models BOTH racers' `requestUpgrade()` having already won their own collision checks and already PATCHed Authentik to the same target email (i.e. skip straight to two live `upgrade_intents` rows for two different `authentikUserPk`s both carrying the identical `targetEmail` — this is the state the residual TOCTOU window can produce despite fix (a), per the security review's own acknowledgment that no re-check fully closes a concurrent-scheduler race). Seed BOTH intents in real Postgres. Call `resolvePendingUpgrade()` + attempt the `upsertByAuthentikSubject()`-equivalent write for racer A first against a REAL `platform.users` table (insert a `users` row with the shared target email) — succeeds, call `commitUpgrade()` for A, assert A's intent `consumedAt` is set and A's Authentik attributes were patched. THEN attempt the same for racer B: insert a second `platform.users` row with the SAME email and assert Postgres raises the real `users_email_unique` violation (do NOT catch it silently in the test — assert the specific constraint-violation error surfaces, confirming the exception the whole reorder design depends on is real, matching SecurityReviewer's own pass-2 verification of `users_email_unique` vs. `upsertByAuthentikSubject`'s `onConflictDoUpdate` target being disjoint). Critically assert, for racer B specifically: `commitUpgrade()` was NEVER called (no code path reached it — model this by NOT calling it in the test after the thrown insert, mirroring `callback()`'s real unguarded-await control flow, and asserting B's Authentik `patchAttributes` fake was never invoked as a result), B's `upgrade_intents` row still has `consumedAt IS NULL` (re-select from real Postgres to confirm), and B's simulated Authentik `is_temporary` attribute was never flipped (asserted via the fake never being called with `is_temporary: false` for B's pk). This is the exact invariant named in the task brief: **a losing racer never ends up `is_temporary=false` with no `platform.users` row.** |
| `callback()`-level integration (optional but recommended if time allows; not required to close MAJOR-2 since the service-level test above already proves the invariant) | Real Postgres + faked `AuthentikClient` + faked/partial `AuthController` collaborators (`AuthService.completeAuthorization`, `DirectusUsersBridgeService`, etc., all mocked — this is not a full NestJS bootstrap) | Construct `AuthController` directly (matching `magic-link-controller.spec.ts`'s / `auth-controller-callback.spec.ts`'s existing direct-instantiation convention) with a REAL `UpgradeService` (backed by the Testcontainers `db` + faked `AuthentikClient`) instead of a fully mocked one, and a real-enough `UsersService`/`upsertByAuthentikSubject` path (or the existing mocked one, if wiring a real `UsersService` against Testcontainers is disproportionate — TestDesigner's call). Exercise the full `callback()` method with a seeded live intent row and assert the end-to-end ordering: `commitUpgrade` runs only after the users upsert succeeds. Lower priority than the dedicated service-level MAJOR-2 test above because `04-security-review.md`'s pass-2 already traced this exact control flow by reading the code line-by-line (no try/catch, no `.catch()`, unguarded `await`) — an integration test here is confirmatory, not the sole evidence. |

## E2E Test Plan

No new Playwright spec file (see "E2E Decision" above). Table below specifies the Orchestrator-owned live verification pass instead, for traceability against the rubric's E2E-tier intent.

| User Flow | Entry Point | Exit Assertion |
|---|---|---|
| Full upgrade round trip against live local Authentik + Mailpit (or equivalent local mail capture already used by this stack) | `curl -X POST http://localhost:<api-port>/v1/internal/telegram/upgrade-temp -H "x-internal-auth: $INTERNAL_API_TOKEN" -H "Content-Type: application/json" -d '{"telegramId":"<seeded temp user telegram_id>","email":"<test target email>"}'` against a temp Authentik user seeded via the existing `upsert-temp-user` route or admin bootstrap | (1) Response is `200 { ok: true }`. (2) Query Authentik admin API (or Mailpit's own API/UI) and confirm an email actually arrived at the target address within 60s (AC-1's SLA) — this is the empirical confirmation of Finding #0's `sendMagicLinkEmail`-targets-on-file-email claim that source-reading alone did not fully close. (3) Extract the magic-link URL from the captured email body, `curl -L` (or open in a real/headless browser) that link through to `GET /v1/auth/callback`. (4) Query Authentik admin API for the user's `pk` (found via `getUserByTelegramId` equivalent, or by the now-known email) and confirm `attributes.is_temporary === false` and `email` equals the target address. (5) Query `platform.users`/`directus_users` directly (or via an authenticated `/me` call using the session cookie the callback's `Set-Cookie` response header provides) and confirm a row now exists with the correct email. |
| AC-7 collision path against live Authentik | `curl` the same endpoint twice with two different `telegramId`s and the SAME target `email` | Second call returns `409 { error: 'email_already_in_use' }`; querying Authentik confirms the second temp user's on-file email was NOT changed (still the synthetic `tg<id>@telegram.local`). |
| Degraded config path (optional, lower priority — already covered by the unit test) | Temporarily unset `AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID` in the local dev `.env` (permitted per `.claude/CLAUDE.md`'s dev/test `.env` exception — non-secret config flag, must be restored and the flip stated in chat per that section's disclosure requirement), re-run the first curl | `200 { ok: true }` still returned; Authentik's on-file email IS patched (confirm via admin API); no email arrives in Mailpit. Restore the env var afterward. |

## Acceptance Criteria → Test Mapping

| AC | Test Level | Test Description |
|---|---|---|
| AC-1 (upgrade-temp request succeeds, magic link sent within 60s for a free email) | Unit + Integration + Live Verification | Unit: `requestUpgrade()` happy path (mocked `AuthentikClient`, asserts `sendMagicLinkEmail` called). Integration: `requestUpgrade()` full round trip against real DB (row correctly persisted). Live: curl-based flow row 1, confirming real email delivery within the SLA — this is the ONE part of AC-1 no mocked test can prove. |
| AC-2 (callback sets `is_temporary=false` + replaces email in a single PATCH, never leaves a mixed state) | Unit + Integration | Unit: `commitUpgrade()` happy path (attributes-merge assertion) + `callback()`-wiring ordering test (`commitUpgrade` called only after `upsertByAuthentikSubject` resolves). Integration: `resolvePendingUpgrade`→`commitUpgrade` full round trip against real DB; **the MAJOR-2 race/collision test's sub-case (b) is the direct, explicit proof of the "never a mixed state" clause** — it is the single test in this plan that most precisely targets AC-2's exact wording. |
| AC-3 (points accrue normally post-upgrade, no `is_temporary` gate) | Out of this FR's new-code test scope by design | Per `01-requirement-validation.md`'s own revision, AC-3's testable content collapses to "no code in `PointsModule`/`RegistrationsModule` branches on `is_temporary`" — already independently verified by both RequirementAnalyst (grep) and SecurityReviewer (traced `PointsDirectusService`). No NEW test is needed from this FR's changed files since none of them touch those modules; existing `points-directus.spec.ts`/`registrations-directus.spec.ts` coverage (pre-existing, unmodified by this FR) already covers those services' normal-path behavior with no `is_temporary` special-casing to test FOR (there's nothing to test the ABSENCE of beyond the grep-confirmed absence itself). Noted here to close the AC-to-test mapping honestly rather than inventing a vacuous test against unrelated files. |
| AC-4 (post-upgrade profile edit works) | Out of this FR's new-code test scope, same reasoning as AC-3 | Consequence of `platform.users`/`directus_users` rows existing — covered by AC-2's tests proving those rows get created correctly with the right email; no separate profile-edit-endpoint test is owned by this FR (profile-edit endpoints are pre-existing, unmodified). |
| AC-5 (upgraded member appears on leaderboard, respecting `appear_on_public_leaderboard`) | Out of this FR's new-code test scope, same reasoning as AC-3/AC-4 | `PointsDirectusService.leaderboard()` is unchanged by this FR; existing tests for that method already cover the opt-out behavior. |
| AC-6 (Directus row carries the real email, not the synthetic placeholder — CRM-sync reinterpretation) | Integration | Covered by the `resolvePendingUpgrade()`→`commitUpgrade()` integration test combined with the (pre-existing, unmodified-by-this-FR) `directus-users-bridge.spec.ts` coverage of `ensureLinked()` reading `user.email` off the just-upserted `platform.users` row — this FR's own responsibility is only to ensure the CORRECT (verified) email reaches `upsertByAuthentikSubject()`, which the integration round-trip test asserts directly (seed/assert the email value at each hop). |
| AC-7 (email-already-in-use → 409, no mutation) | Unit + Integration + Live Verification | Unit: `requestUpgrade()` failure paths 3, 4, 5 (initial check, re-check, self-collision-is-not-a-collision). Integration: MAJOR-2 sub-case (a), the common-case collision caught by the re-check. Live: curl-based flow row 2. |
| AC-8 (expired/consumed token falls through to ordinary sign-in, never bricks the link) | Unit + Integration | Unit: `resolvePendingUpgrade()` failure paths 2/3/4 (no row, expired, consumed) + `callback()`-wiring failure path 1 (`resolvePendingUpgrade` returns `null` → `commitUpgrade` never called, existing funnel proceeds). Integration: the two dedicated "AC-8 fall-through" integration rows (expired, consumed) proving the real-DB filter (`gt(expiresAt, now)` / `isNull(consumedAt)`) actually excludes those rows, not just that the code calls the right Drizzle builder methods. |

Note on AC-3/4/5: mapping them to "out of this FR's new-code test scope" is a deliberate, explicit call rather than a silent gap — it mirrors RequirementAnalyst's own AC-3 revision (there is no reachable pre-upgrade state to test FROM) and SecurityReviewer's independent trace (confirmed no `is_temporary` branching exists in those modules to regress). If QualityGate wants a belt-and-suspenders regression test asserting `points-directus.spec.ts`'s existing test suite doesn't filter on `is_temporary` anywhere (a "prove the absence" test), that's a valid but low-value addition TestDesigner can add at its own discretion — not required by this strategy.

## Gate Result

```yaml
gate: TestStrategist
status: passed
reason: >
  Rubric score is 6 (new API endpoint +2, business rule with genuine edge
  cases +2, cross-module service call +1, new DB query +1, tenant-scoped
  +0 confirmed correctly absent) -- both the Integration threshold (>=4)
  and the nominal E2E threshold (>=6) are met. Integration tests
  (Testcontainers) are required and fully planned. E2E is deliberately
  NOT satisfied with a new Playwright spec file: this workflow ships zero
  apps/web and zero apps/bot changes, so there is no real browser journey
  or bot conversation for Playwright to drive -- the rubric's E2E tier
  exists to catch full-user-journey defects through a real UI, and no UI
  exists here. In its place, a curl-based Orchestrator-owned live
  verification pass against real local Authentik + Mailpit is required
  and specified in the E2E Test Plan table, matching this exact FR
  family's own established precedent (FR-AUTH-004's
  02b-authentik-spike-findings.md / 07-test-results.md live-verification
  discipline) -- this satisfies the underlying intent (empirically prove
  Authentik's real behavior, which source-reading alone left partially
  open per Finding #0) better than a Playwright file would, since the
  thing under test is a third-party IdP's live HTTP/email behavior, not
  DOM state. MAJOR-2 (SecurityReviewer's explicitly-required, still-open
  race/collision regression test) is planned as its own dedicated
  Integration Test Plan row with two required sub-cases: (a) the
  common-case collision caught by requestUpgrade()'s re-check, and (b) a
  direct proof of the residual-race invariant the task brief named
  verbatim -- a losing racer's Authentik record must never end up
  is_temporary=false with no platform.users row, verified against a REAL
  Postgres users_email_unique constraint (not mocked), asserting
  commitUpgrade() is never reached for the losing racer and both its
  is_temporary flag and its upgrade_intents.consumedAt stay unmutated.
  All 8 ACs are mapped to at least one test; AC-3/4/5 are explicitly
  mapped to "no new test needed from this FR's changed files" with
  reasoning (mirrors RequirementAnalyst's own AC-3 revision and
  SecurityReviewer's independent trace that no is_temporary branching
  exists in PointsModule/RegistrationsModule to regress), not silently
  dropped. Also flagged as a documentation-debt item (not a test target):
  upgrade-intent.schema.ts's header comment still describes the
  superseded token-round-trip-through-next correlation mechanism, stale
  relative to the shipped authentikUserPk-correlation design -- DocWriter
  should correct it later in this workflow.
next_agent: TestDesigner
```
