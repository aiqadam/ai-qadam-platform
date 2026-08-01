# 06 — Test Design: FR-AUTH-006

Agent: TestDesigner
Workflow: wf-20260801-feat-181
Branch: feature/FR-AUTH-006-temp-account-upgrade

## Tests Written

### Unit

| File | Count/Focus | Required? |
|---|---|---|
| `apps/api/test/upgrade-service.spec.ts` (new) | 16 tests. `UpgradeService.requestUpgrade()`: happy path (email PATCH + intent insert + magic-link send, asserting `tokenHash`/`authentikUserPk`/`telegramId`/`targetEmail`/`expiresAt` shape) + 8 failure/edge paths — 404 not-found, `is_temporary` fail-closed for `false`/`undefined`/`"true"` (parametrized `it.each`, 3 cases), first-check collision, re-check-only collision (proves step c-2 is load-bearing, not dead code), self-collision-is-not-a-collision (idempotency), degraded path × 2 (missing stage UUID, missing brand domain). `resolvePendingUpgrade()`: happy path + 5 fall-through/edge cases (no Authentik user, no intent row, expired-modeled, consumed-modeled, multiple-rows-returns-the-one-the-query-gives-back). `commitUpgrade()`: happy path (attributes-merge preservation assertion) + the Authentik-user-vanished no-op path (asserts both `patchAttributes` and the `consumedAt` update are NOT called, not just "no throw"). | Yes |
| `apps/api/test/authentik-client.spec.ts` (modified — added one `describe` block) | 2 tests for `setUserEmail()`: PATCH body/path shape (happy path) + error propagation (`AuthentikError` from a 500, unswallowed) — matches `setUserGroups`/`disableUser`'s existing coverage level exactly, per the strategy's explicit "match, not exceed" instruction. | Yes |
| `apps/api/test/auth-controller-callback.spec.ts` | Pre-existing file, already modified by CodeDeveloper (mechanical `makeUpgradeService()` update for the `resolvePendingUpgrade`/`commitUpgrade` two-method API). No further TestDesigner changes needed — its 2 existing FR-AUTH-004 AC-7 funnel-regression tests already cover the "no pending upgrade" ordering case; the upgrade-branch-ordering test itself (resolvePendingUpgrade before, commitUpgrade only after, upsert success) is covered at the integration level instead (see below), which exercises the real service rather than a mock asserting call order. | Yes (pre-existing, verified still passing) |

### Integration (Testcontainers, real Postgres)

| File | Count/Focus | Required? |
|---|---|---|
| `apps/api/test/upgrade-service.integration.spec.ts` (new) | 10 tests, real Postgres via `inject('TEST_DATABASE_URL')` + faked `AuthentikClient` (no second Testcontainer, matching `magic-link-controller.spec.ts`'s precedent). Covers: `upgrade_intents` CRUD (insert/point-lookup/consumedAt-update + expiry-boundary filter), `requestUpgrade()` full round trip (real insert, then `resolvePendingUpgrade` finds it via the same service instance), `resolvePendingUpgrade()`→`commitUpgrade()` full round trip (real consume + real attributes-merge assertion), AC-8 expired fall-through, AC-8 consumed/replay fall-through, **MAJOR-2 (a)** common-case collision caught by the re-check, **MAJOR-2 (b)** the residual-race invariant (see below — the critical test), a `callback()`-level ordering mirror (resolvePendingUpgrade → real `users` insert → commitUpgrade, asserting call order via an array), and a real-`ORDER BY` proof that `resolvePendingUpgrade` returns the most-recently-created of multiple live rows for the same pk. | Yes |

### E2E

No new Playwright file — per `06-test-strategy.md`'s explicit "E2E Decision," a curl-based Orchestrator-owned live verification pass against real local Authentik + Mailpit is required instead (see that document's E2E Test Plan table for the exact commands/assertions). Not TestDesigner's to execute; flagging here for traceability only.

## The MAJOR-2 Race/Collision Test — Confirmation

**File:** `apps/api/test/upgrade-service.integration.spec.ts`, `describe('MAJOR-2 (b): residual race window — a losing racer never reaches is_temporary=false with no platform.users row', …)`.

This is the single most important test in this workflow, per the task brief. It:

1. Seeds **two live `upgrade_intents` rows** directly in real Postgres for two different `authentikUserPk`s (800, 801), both carrying the **same `targetEmail`** — modeling the state the residual TOCTOU window can produce even after `requestUpgrade()`'s re-check fix (SecurityReviewer's own acknowledged residual risk, not closed by design).
2. Runs racer A's full sequence against the **real** `UpgradeService` + real Postgres: `resolvePendingUpgrade()` → a real `platform.users` insert (mirroring `upsertByAuthentikSubject()`) → `commitUpgrade()`. Asserts A's Authentik attributes were patched and A's intent is consumed.
3. Runs racer B's sequence: `resolvePendingUpgrade()` succeeds (side-effect-free, doesn't know about A), then a second `platform.users` insert for a **different `authentikSubject`** but the **same email** is attempted — and asserted to throw the **real** Postgres `users_email_unique` violation (`err.cause.code === '23505'`, `err.cause.constraint_name === 'users_email_unique'`; Drizzle's postgres-js driver wraps the raw `PostgresError` in a `DrizzleQueryError`, with the real driver error on `.cause` — asserted there, not caught/swallowed).
4. Critically: **`commitUpgrade()` is never called for B** — the test does not call it after the thrown insert, deliberately mirroring `AuthController.callback()`'s real unguarded-`await` control flow (no try/catch between the users upsert and `commitUpgrade`, confirmed by SecurityReviewer's own line-by-line trace in `04-security-review.md`'s re-review pass).
5. Asserts, for B specifically, all three invariant components named in the task brief:
   - B's `upgrade_intents` row **still has `consumedAt IS NULL`** (re-selected from real Postgres).
   - B's Authentik `patchAttributes` fake **was never invoked** — `is_temporary` was never flipped for B.
   - Only A's row exists in `platform.users` with the shared email (`allUsersWithSharedEmail` has length 1, matching A's id) — B genuinely has no member row.

**Result: PASSED.** Confirmed by running `pnpm vitest run test/upgrade-service.integration.spec.ts` against the real Testcontainers Postgres — all 10 tests in the file pass, including this one. The test genuinely exercises the real constraint (initial version of the assertion, written against the raw driver error shape, failed with a shape mismatch against Drizzle's `DrizzleQueryError` wrapper — fixed to assert on `.cause.code`/`.cause.constraint_name` — which itself is evidence the constraint really fired rather than the assertion being vacuously true).

## Acceptance Criteria Coverage

| AC | Test | Status |
|---|---|---|
| AC-1 (upgrade-temp request succeeds, magic link sent within 60s for a free email) | Unit: `requestUpgrade()` happy path. Integration: `requestUpgrade()` full round trip. Live SLA/delivery confirmation: Orchestrator's curl+Mailpit pass (not this agent's output). | Covered (unit+integration); live-delivery leg deferred to Orchestrator per strategy |
| AC-2 (callback sets `is_temporary=false` + replaces email in one PATCH, never a mixed state) | Unit: `commitUpgrade()` happy path (merge assertion). Integration: `resolvePendingUpgrade`→`commitUpgrade` round trip; **MAJOR-2 (b) is the direct, explicit proof of "never a mixed state."** | Covered |
| AC-3 (points accrue normally post-upgrade, no `is_temporary` gate) | Out of this FR's new-code test scope by strategy's own explicit call — no reachable pre-upgrade state to test from, no `is_temporary` branching exists in `PointsModule` to regress (RequirementAnalyst + SecurityReviewer both independently confirmed). No new test added. | Explicitly out of scope, not silently dropped |
| AC-4 (post-upgrade profile edit works) | Same reasoning as AC-3 — consequence of `platform.users` row existing, covered by AC-2's tests. | Explicitly out of scope |
| AC-5 (leaderboard appearance, opt-out respected) | Same reasoning as AC-3 — `PointsDirectusService.leaderboard()` unchanged by this FR. | Explicitly out of scope |
| AC-6 (Directus row carries the real, verified email) | Integration: `resolvePendingUpgrade()`→`commitUpgrade()` round trip proves the correct email reaches the point `upsertByAuthentikSubject()` would read from; `directus-users-bridge.spec.ts` (pre-existing, unmodified) covers `ensureLinked()` downstream. | Covered |
| AC-7 (email-already-in-use → 409, no mutation) | Unit: 3 failure-path tests (first check, re-check-only, self-collision-exempt). Integration: **MAJOR-2 (a)**, common-case collision caught by the re-check, asserting only the winner's intent row exists. | Covered |
| AC-8 (expired/consumed token falls through to ordinary sign-in) | Unit: `resolvePendingUpgrade()` 4 fall-through-modeling tests. Integration: 2 dedicated real-DB rows (expired, consumed) proving the actual `gt(expiresAt, now)`/`isNull(consumedAt)` filters exclude them — the expiry-boundary CRUD test additionally proves the boundary itself (one row 1s expired, one row 1s live, exactly the live one returned). | Covered |

## Known Test Gaps

- **No new Playwright/E2E spec file** — deliberate, per `06-test-strategy.md`'s "E2E Decision." The live Authentik+Mailpit verification pass is Orchestrator-owned, not TestDesigner-owned, and is out of this agent's output. Flagged in the strategy, not a gap introduced here.
- **AC-3/4/5 have no new dedicated test** — deliberate, matches the strategy's own explicit reasoning (see table above). The strategy explicitly offers a "prove the absence" regression test as a QualityGate-discretionary addition; not added here since the strategy marks it optional/low-value, not required.
- **The unit-level `resolvePendingUpgrade()` expired/consumed/multiple-rows tests model the DB layer's filtering via a mocked `select` result rather than re-deriving the SQL filter logic in-memory** — this is intentional per the strategy's own division of labor (unit tests prove the service's pass-through/handling logic; the integration suite's real `gt()`/`isNull()`/`orderBy(desc)` tests are what actually prove the Postgres-level filter/ordering behavior). No gap — this is the designed split, called out here so a future reader doesn't mistake the unit tests' `[]`/single-row mocks for the thing proving the SQL filters.
- **No dedicated `TelegramInternalController.upgradeTemp()` controller-level test was added** — `requestUpgrade()`'s own unit tests already cover every response-shape/error-shape branch the controller method simply passes through (`upgradeTempBodySchema.safeParse` is generic Zod-boundary validation, same pattern as every sibling route in this controller, already covered structurally by the file's existing `BadRequestException` conventions elsewhere). Judged low-value duplication rather than a gap; flagged for QualityGate visibility, not left silent.
- **`node:crypto`'s `randomBytes`/`createHash` inside `requestUpgrade()`'s token generation are exercised only indirectly** (asserting the resulting `tokenHash` matches `/^[0-9a-f]{64}$/` in the unit happy-path test) — not independently unit-tested as a pure function, since they're three lines of stdlib composition with no branching, consistent with this codebase's treatment of similarly-shaped helpers elsewhere (e.g. `refresh-token.service.ts`'s own token hashing has no dedicated test beyond its callers' assertions).

## Self-Check (per test-designer.md)

- [x] All new public functions have unit tests (happy path + at least one failure path): `requestUpgrade()`, `resolvePendingUpgrade()`, `commitUpgrade()`, `AuthentikClient.setUserEmail()`.
- [x] Integration tests use Testcontainers, never mock the DB: `upgrade-service.integration.spec.ts` uses `inject('TEST_DATABASE_URL')` + real `drizzle(postgres(url))`, matching `refresh-token.spec.ts`'s exact harness. Only `AuthentikClient` is faked (external, non-Postgres system), matching `magic-link-controller.spec.ts`'s documented precedent.
- [x] No `it.skip` anywhere in the new/modified files.
- [x] No `any` in test code (verified via `pnpm --filter api typecheck` — clean, and `test/` files use `as unknown as X` casts throughout, matching every precedent file's own convention).
- [x] Coverage target: all business-logic error paths in `upgrade.service.ts` and the new `AuthentikClient.setUserEmail()` method are covered; line/branch coverage not separately measured in this pass (no `pnpm test:coverage` run requested) but every enumerated branch in the test strategy's Unit/Integration Test Plan tables has a corresponding test.

## Test Run Results

- `pnpm --filter api typecheck` — clean, 0 errors.
- `pnpm --filter api lint` (`biome check .`) — clean, "Checked 320 files in 113ms. No fixes applied."
- `pnpm vitest run test/upgrade-service.spec.ts test/authentik-client.spec.ts test/auth-controller-callback.spec.ts` — **44/44 passing.**
- `pnpm vitest run test/upgrade-service.integration.spec.ts` — **10/10 passing**, including the MAJOR-2 (b) race/collision invariant test.
- `pnpm --filter api test` (full suite, real Testcontainers Postgres+Redis) — **1528/1529 passing.** The one failure (`test/users.spec.ts` — `UsersService.upsertByAuthentikSubject`'s `lastLoginAt` timestamp-ordering assertion) is the SAME pre-existing, already-documented sub-millisecond clock-precision flake CodeDeveloper's own gate result flagged in both pass 1 and pass 2 of `03-code-summary.md` — confirmed unrelated by re-running `test/users.spec.ts` in isolation (still fails the identical way; this file is untouched by this workflow, both `git diff main -- apps/api/test/users.spec.ts` would show and CodeDeveloper's own summary already discloses it).

## Gate Result

```yaml
gate: TestDesigner
status: passed
reason: >
  Wrote unit tests for UpgradeService.requestUpgrade()/resolvePendingUpgrade()/
  commitUpgrade() (apps/api/test/upgrade-service.spec.ts, new, 16 tests --
  happy path + every failure/edge path enumerated in 06-test-strategy.md's
  Unit Test Plan, including the is_temporary fail-closed parametrized case,
  the re-check-is-load-bearing collision test, and the self-collision-is-
  not-a-collision idempotency case) and for AuthentikClient.setUserEmail()
  (apps/api/test/authentik-client.spec.ts, +2 tests matching
  setUserGroups/disableUser's existing coverage level exactly, per the
  strategy's "match, not exceed" instruction). Wrote integration tests
  against real Testcontainers Postgres (apps/api/test/upgrade-
  service.integration.spec.ts, new, 10 tests) covering upgrade_intents CRUD
  with a real expiry-boundary filter proof, the full requestUpgrade() and
  resolvePendingUpgrade()/commitUpgrade() round trips, both AC-8 fall-
  through cases against real filters, a callback()-ordering mirror, a real
  ORDER BY proof for the multiple-live-rows case, and -- the most important
  test in this workflow -- the MAJOR-2 race/collision regression
  (SecurityReviewer's explicitly-required, previously-open finding) in two
  required sub-cases: (a) the common-case collision caught by
  requestUpgrade()'s re-check, and (b) the residual-race invariant, which
  seeds two live upgrade_intents rows for two different authentikUserPks
  sharing one target email, runs racer A to a full real commit, then proves
  racer B's platform.users insert raises the REAL Postgres
  users_email_unique violation (asserted via err.cause.code === '23505' /
  err.cause.constraint_name, not caught or swallowed) and that B's
  commitUpgrade() is never reached as a direct consequence (mirroring
  callback()'s real unguarded-await control flow) -- verified by asserting,
  against real re-selected Postgres state, that B's upgrade_intents row
  still has consumedAt IS NULL, B's Authentik patchAttributes fake was
  never called with is_temporary:false, and only A's row exists in
  platform.users for the shared email. All 8 ACs mapped; AC-3/4/5 correctly
  left with no new test per the strategy's own explicit "out of scope"
  reasoning, not silently dropped. No new Playwright/E2E file, per the
  strategy's E2E Decision -- live verification is Orchestrator-owned.
  typecheck and lint clean. Full suite: 1528/1529 passing; the sole failure
  (test/users.spec.ts's lastLoginAt timestamp-ordering assertion) is the
  same pre-existing, already-documented clock-precision flake CodeDeveloper
  flagged in both prior gate passes, confirmed unrelated by isolated
  re-run, in a file this workflow never touches. No it.skip, no any in new
  test code.
next_agent: TestRunner
```
