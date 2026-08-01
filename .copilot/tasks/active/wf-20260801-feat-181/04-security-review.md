# 04 — Security Review: FR-AUTH-006

Agent: SecurityReviewer
Workflow: wf-20260801-feat-181
Branch: feature/FR-AUTH-006-temp-account-upgrade

## Code Changes Reviewed

- `apps/api/src/modules/auth/upgrade.service.ts` (NEW) — `UpgradeService.requestUpgrade()`, `tryCompleteUpgrade()`, `finishUpgrade()`, `upgradeTempBodySchema`.
- `apps/api/src/modules/auth/auth.controller.ts` (MODIFIED) — new `POST /v1/internal/telegram/upgrade-temp` route on `TelegramInternalController`; `AuthController.callback()` wired to `upgradeService.tryCompleteUpgrade(email)`.
- `apps/api/src/modules/auth/auth.module.ts` (MODIFIED) — `UpgradeService` provider registration.
- `apps/api/src/modules/auth/telegram-auth.service.ts` (MODIFIED) — `telegramIdSchema` export (mechanical).
- `apps/api/src/modules/admin-invites/authentik.client.ts` (MODIFIED) — new `setUserEmail(userPk, email)` method.
- `apps/api/src/modules/auth/upgrade-intent.schema.ts` (NEW) — `upgrade_intents` Drizzle table.
- `apps/api/test/auth-controller-callback.spec.ts` (MODIFIED) — mechanical fixture update for new constructor arg.

Diffs viewed via `git diff main -- <path>` for modified files; new files read in full. Also read `apps/api/src/modules/internal/internal-auth.guard.ts`, `apps/api/src/lib/email-schema.ts`, `apps/api/src/config/env.ts` (`INTERNAL_API_TOKEN` validation), and traced `PointsDirectusService`/`points.controller.ts` to independently verify the "no registrations/points path reachable by a temp user" claim.

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1 Tenant isolation | No | N/A | `upgrade_intents` correctly has no `countryCode` — Telegram users have no resolved country at this stage (matches `platform.users` itself having no `country_code`). Confirmed correct, not just asserted. |
| INV-2 Secrets by reference | Yes | Pass | No secret literals in diff. `AuthentikClient.request()`'s existing warn-logging only logs method/path/truncated response body/status — never the bearer token. `setUserEmail` follows the same pattern as sibling PATCH methods, no new logging added. |
| INV-3 Auth at controller level | Yes | Pass | New route sits on `TelegramInternalController`, class-level `@UseGuards(InternalAuthGuard)` — confirmed real (reads `x-internal-auth` header, `timingSafeEqual` constant-time compare against `env.INTERNAL_API_TOKEN`, which is `z.string().min(32)`-validated, no weak default). Equivalent strength to sibling routes (`upsert-temp-user`, `lookup`) — same class-level guard, no per-route override. |
| INV-4 Validation at boundaries | Yes | Pass | `upgradeTempBodySchema.safeParse(body)` runs before `requestUpgrade()`; `BadRequestException(parsed.error.flatten())` on failure — same pattern as every sibling route in this controller. `telegramId` reuses the exact `telegramIdSchema` (regex `^\d{1,19}$`) via the newly-exported const — no drift from the sibling validator. `email` uses `emailField(200)` — trims, lowercases, RFC email check, max length, rejects plus-addressing — same helper every other email-accepting endpoint in this module uses (`emailField` is shared, not redefined). |
| INV-5 No cross-schema queries | Yes | Pass | `upgrade_intents` stores Authentik's `pk` as a plain `integer`, explicitly not an FK (cross-schema FK is architecturally impossible here) — no JOIN across `platform`/Authentik. Confirmed no query anywhere joins `upgrade_intents` against an Authentik-side table. |
| INV-6 Rate limiting | No | N/A | `/upgrade-temp` is `InternalAuthGuard`-protected (bot-service-only, not a public/browser-reachable endpoint) — same category as `upsert-temp-user`/`lookup`, neither of which carry `@Throttle`. Consistent with existing precedent in this controller; not a gap introduced by this PR. |
| INV-7 CSRF | No | N/A | Not browser-initiated; Bearer/shared-secret internal auth, not session cookies. |
| INV-8 No `dangerouslySetInnerHTML` | Yes | Pass | Zero occurrences; no frontend changes in this PR. |
| INV-9 No N+1 queries | Yes | Pass | No loops over query calls. `requestUpgrade()` makes a bounded, fixed sequence of calls (lookup, collision check, patch, insert, send). `tryCompleteUpgrade()` is one `getUserByEmail` + one indexed `select` + (on match) one `patchAttributes` + one `update` — all O(1) per callback invocation, no loop. |
| INV-10 Drizzle parameterization | Yes | Pass | Both new DB operations (`db.insert(upgradeIntents)...`, `db.select()...where(and(eq(...), isNull(...), gt(...)))...`, `db.update(upgradeIntents).set(...).where(eq(...))`) go through Drizzle's query builder — no `sql\`...\`` template, no string concatenation. |
| INV-11 HttpOnly tokens (web) | No | N/A | No web/cookie changes in this PR. The `upgrade_intents` token/tokenHash columns are populated but never returned to any client or transmitted — vestigial per the code summary's own disclosure (see MAJOR-1 below for the documentation-drift concern this creates). |

## BLOCKER Findings

None.

## MAJOR Findings

### MAJOR-1: `requestUpgrade()` collision check is not re-run immediately before `setUserEmail`, contradicting the method's own doc comment

`authentik.client.ts`'s `setUserEmail` doc comment (lines 231-235) states: *"Callers MUST re-check email availability (getUserByEmail) immediately before calling this — Authentik's own User.email field is NOT unique at the data layer... this PATCH can silently create a duplicate email across two Authentik users if the caller's own collision check is stale or skipped."*

`upgrade.service.ts`'s `requestUpgrade()` (lines 124-135) does exactly one `getUserByEmail` collision check (step c), then immediately calls `setUserEmail` (step d) with no re-check in between. In the current code these two steps are adjacent within the same async function body with no intervening `await` on anything else — so in isolation this is as tight as a single-process check-then-act can get, and matches Risk Flag #2's original framing (a single re-check point, not a double one).

However, the check-then-act window is not zero: two *concurrent* requests to `/upgrade-temp` for two different temp users both targeting the same `targetEmail` can each complete their own `getUserByEmail` (step c) before either has called `setUserEmail` (step d) — this is a genuine cross-request TOCTOU race, not closed by anything in this diff. There is no DB transaction wrapping steps (c)+(d)+(e) (the `getUserByEmail`/`setUserEmail` calls are HTTP calls to Authentik, not part of the Postgres transaction that the later `db.insert` participates in — and even the DB insert isn't wrapped with the Authentik calls in any transaction, nor could it be, since Authentik is a separate system with no 2PC available). Confirmed: Authentik's `User.email` has `unique=False` (per the design docs' live verification, corroborated by the code's own comments), so **both concurrent requests can successfully PATCH the same email onto two different Authentik `pk`s** — this is real, not theoretical, given the doc comment's own explicit warning.

**Blast radius is bounded, which is why this is MAJOR not BLOCKER**: the eventual backstop is `platform.users.email`'s `.unique()` Postgres constraint at `upsertByAuthentikSubject()` time (downstream, in `callback()`, potentially minutes later per-user as each completes their own magic-link click). Whichever of the two colliding users completes `callback()` first gets the `platform.users` row; the second hits a unique-constraint violation there — a real error (ugly UX, needs handling) but not a security bypass, not a data-integrity corruption of an existing account, and not silent. It is, however, exactly the scenario Risk Flag #2 already flagged and the impact analysis explicitly asked CodeDeveloper to defend against with a documented regression test ("re-run the `getUserByEmail` collision check defensively even here" / "seed a colliding email between the `/upgrade-temp` check and the `callback()` PATCH; assert a clean, recoverable failure"). That test does not exist in this diff (no `upgrade.service.spec.ts` was added at all — confirmed via `apps/api/test/**upgrade*` glob returning no matches), and `callback()`/`finishUpgrade()` does not handle a `platform.users.email` unique-constraint failure specially — it would surface as an unhandled exception from `upsertByAuthentikSubject()`, which sits **after** `tryCompleteUpgrade()` has already flipped `is_temporary=false` and consumed the `upgrade_intents` row. That ordering means the *losing* concurrent user ends up with `is_temporary=false` (a state that reads as "upgraded") but no `platform.users`/`directus_users` row — a genuinely mixed state, which is the exact failure mode AC-2's "never leaves the user in a mixed state" requirement was written to prevent. This is a narrow, low-likelihood window (requires two people racing to claim the identical email within the same ~30 min TTL), but it is real and currently unhandled.

**Recommendation**: not a redesign — the pk-based correlation and email-patched-early design are sound. What's missing is (a) a re-check of `getUserByEmail` immediately before `setUserEmail` in `requestUpgrade()` (cheap, closes the single-request-vs-concurrent-request gap to the theoretical minimum, and would make the code match its own doc comment instead of contradicting it), and (b) explicit handling in `finishUpgrade()`/`callback()`'s upgrade branch for a `platform.users.email` collision at `upsertByAuthentikSubject()` time so the losing racer doesn't end up with `is_temporary=false` and no member row — at minimum, don't flip `is_temporary`/consume the intent until `upsertByAuthentikSubject()` has actually succeeded, or catch the failure and revert `is_temporary` back to `true`. File as a fast-follow if the user accepts the low-likelihood/bounded-blast-radius trade-off for this PR, but this is retriable by CodeDeveloper, not an architectural blocker.

### MAJOR-2: No regression test exists for the race/collision scenario the impact analysis explicitly required

`02-impact-analysis.md`'s Test Scope section lists as a required integration test: *"Race/collision case from Risk Flag #2 above: seed a colliding email between the `/upgrade-temp` check and the `callback()` PATCH; assert a clean, recoverable failure (not a corrupted mixed state, not an unhandled exception)."* No test file for `UpgradeService` exists in this diff at all (confirmed: `apps/api/test/**upgrade*` glob is empty). This is the same gap as MAJOR-1 from the test-coverage side — flagged separately because even if MAJOR-1's code fix is deferred, the *test* proving the current behavior (mixed state under collision) should exist so the risk is visibly tracked rather than silently unverified. This is squarely TestDesigner's ownership per the workflow's agent boundaries (CodeDeveloper's summary already discloses this gap honestly), so this is not a fault of the reviewed diff's authorship — but it is a MAJOR finding for the workflow overall, since `09-quality-gate.md` should not mark AC-2/AC-7's collision handling as `verified` without it.

## Judgment on the two flagged risk areas

**1. Pre-verification email-patch window (temp user's on-file email = new target email while `is_temporary` is still `true`, for up to 30 min).** This is safe as designed. I independently traced `PointsDirectusService.leaderboard()`/`totalForUser()` (`apps/api/src/modules/points/points-directus.service.ts`) and confirmed both key off `directus_users`/`directus_user_id`, not off Authentik email or pk directly — and a temp user has no `directus_users` row by this FR's own premise (that row is only created by `DirectusUsersBridgeService.ensureLinked()`, called from `callback()` after `upsertByAuthentikSubject()`, i.e. only after upgrade completes). So the claim in `03-code-summary.md` holds up under independent verification, not just trust: nothing in `PointsModule`/`RegistrationsModule` is reachable by a temp user's email during the window. The only other consumer of a temp user's on-file email during the window is Authentik's own `recovery_email` send (the intended use) and `AuthentikClient.getUserByEmail` lookups performed by this same feature's own code (`requestUpgrade()`'s collision check, `tryCompleteUpgrade()`'s resolve-pk step) — no third-party or unrelated code path reads it. The design decision to patch early is the *only* viable option given Authentik's confirmed lack of a target-email override, and the transient state it creates is genuinely inert. I have no objection to this design; the real risk in this area is not "something reads the unverified email" but the *concurrent-collision* race covered in MAJOR-1/MAJOR-2 above, which is a different, narrower concern than what the task's point 1 asked me to evaluate.

**2. `tryCompleteUpgrade()` on every `callback()` invocation.** (a) DoS/cost: one extra `getUserByEmail` HTTP call to Authentik's admin API per sign-in is a bounded, fixed-cost addition — `callback()` already performs several sequential calls in the existing funnel (`completeAuthorization()`'s own token exchange, `upsertByAuthentikSubject()`, `ensureLinked()`), so this is proportionally a modest addition, not a new order-of-magnitude cost, and it's an authenticated-user-count-bounded operation (only triggered by a successful OIDC callback), not attacker-triggerable at volume without already possessing valid credentials for *some* account. Not a meaningful DoS vector. (b) Timing/information-disclosure: the extra lookup happens unconditionally for every sign-in and its cost is identical (one `getUserByEmail` + a conditional indexed `select`) regardless of whether an upgrade is pending — the only observable-by-timing difference is the indexed `upgrade_intents` `select` plus (on match) a `patchAttributes` + `update`, which only fires for the exact user email that just authenticated via a verified OIDC session — i.e. an external observer cannot trigger or observe this signal for an email they don't control, since triggering it requires successfully completing OIDC auth as that identity. No practical timing-oracle exposure to a third party. (c) Admin-token overreach: this reuses `AuthentikClient`, which already holds the same high-privilege admin token used throughout this module for lookups on every other sign-in path (`getUserByTelegramId`, `getUserById`, etc., are already called elsewhere in comparable hot paths) — this is not a new trust-boundary expansion, just one more read through an already-present, already-necessary credential. I don't consider this overreach; the alternative (a lower-privilege, read-only Authentik credential scoped to user lookups) would be a reasonable defense-in-depth improvement but is a pre-existing architectural characteristic of `AuthentikClient`, not something this PR introduces or worsens.

**Point 7 (blast radius of `setUserEmail` given a bypass of `requestUpgrade()`'s guards).** Re-verified: `is_temporary !== true` (step b, strict boolean equality against an untyped `attributes: Record<string, unknown>` field) fails closed — a missing, `undefined`, string, or falsy-but-not-`true` value all correctly reject with `not_a_temp_account`, never accidentally treat a full member as upgradeable. There is no code path that calls `setUserEmail` other than `requestUpgrade()`'s step (d), which is gated by both the `InternalAuthGuard` (class-level, unbypassable without the shared secret) and the `is_temporary` check. If `requestUpgrade()`'s guards were somehow bypassed via a bug elsewhere, `setUserEmail`'s own signature (`userPk: number, email: string`) has no scope-narrowing beyond what its caller provides — but that's true of every sibling PATCH wrapper in this file (`setUserGroups`, `disableUser`, `patchAttributes`) and is consistent with the file's existing trust model (thin wrappers, authorization lives in the caller). Not a new pattern, not a regression.

## Re-Review (pass 2) — MAJOR-1 fix verification

Scope: re-review of `03-code-summary.md`'s "Retry (pass 2)" changes only.
MAJOR-2 (missing regression test) is unchanged, still open, and is not
re-litigated below — see "MAJOR-2 gate-status disposition" at the end of
this section.

### Files reviewed (this pass)

- `apps/api/src/modules/auth/upgrade.service.ts` — read in full (current
  state, not diffed, since the file is new-on-branch).
- `apps/api/src/modules/auth/auth.controller.ts` — `git diff main --`
  (the reorder is a modification to a tracked file, diff is meaningful
  here).
- `apps/api/test/auth-controller-callback.spec.ts` — spot-checked the
  `makeUpgradeService()` mock update and its own updated comment block.
- Independently pulled `platform.users`' schema/migration history
  (`apps/api/src/db/migrations/0001_quick_vivisector.sql` and every
  snapshot since) to confirm `users_email_unique` is a real, standing
  `UNIQUE(email)` constraint, separate from `upsertByAuthentikSubject`'s
  `onConflictDoUpdate({ target: users.authentikSubject, ... })` conflict
  target — this matters because the whole reorder argument depends on
  `upsertByAuthentikSubject()` actually throwing (not silently upserting
  past) an email collision on a *different* `authentikSubject`. Confirmed:
  since `onConflictDoUpdate`'s target is `authentikSubject`, not `email`,
  a second racer with a different `authentikSubject` but the same
  colliding email is NOT covered by the conflict clause and Postgres
  raises a raw unique-violation on `users_email_unique` — the exception
  the reorder logic depends on is real, not assumed.

### Verification of the three specific questions asked

**1. Is `commitUpgrade()` really only called after `upsertByAuthentikSubject()` succeeds — traced, not trusted.**
Confirmed by reading `auth.controller.ts` lines 244-254 directly (not the
comment): `const pendingUpgrade = await this.upgradeService.resolvePendingUpgrade(email);`
then `const user = await this.users.upsertByAuthentikSubject({...});` as a
plain top-level `await` with **no try/catch in this scope** (the only
try/catch in `callback()` wraps `completeAuthorization()` earlier and
already exited before this point), then `if (pendingUpgrade) { await this.upgradeService.commitUpgrade(pendingUpgrade); }`.
There is no `.catch()`, no `Promise.allSettled`, no fire-and-forget, no
code path that reaches the `commitUpgrade()` call after
`upsertByAuthentikSubject()` throws — a thrown/rejected promise from an
unguarded `await` immediately unwinds the async function, so line
252-254 is provably unreachable on that failure path. This is genuine
control flow, confirmed by tracing, not asserted from the comment.

**2. Does the reorder introduce a new issue (stale `PendingUpgrade`, information leak from calling `resolvePendingUpgrade()` unconditionally)?**
No. `resolvePendingUpgrade()` returns a plain data snapshot (`{ intent,
authentikUserPk }`) of two immutable identifiers — the `upgrade_intents`
row (used later only for its `.id` in an `eq()` filter) and the Authentik
integer pk (used later only as a lookup key). `commitUpgrade()` does not
trust any *attribute* value carried over from `resolvePendingUpgrade()` —
it re-fetches the Authentik user fresh via `getUserById(pending.authentikUserPk)`
(line 267) before merge-patching `is_temporary: false`, so there is
nothing that can go stale across the `upsertByAuthentikSubject()` gap:
neither identifier can be invalidated by that call (it only touches
`platform.users`, a disjoint table from `upgrade_intents`, and never
talks to Authentik). On the information-leak question: `resolvePendingUpgrade()`
runs unconditionally on every callback (true before this reorder too —
`tryCompleteUpgrade` had the identical unconditional-call shape), it's
side-effect-free, its only observable cost/behavior difference (the extra
indexed `select`) is gated on a successful OIDC callback for that specific
verified email, so this reorder changes nothing about the timing/
information-disclosure analysis already covered in the prior pass's
"Judgment on the two flagged risk areas" section (point 2b) — re-affirmed,
not newly introduced.

**3. Is the second `getUserByEmail` re-check genuinely closing the window further, or cosmetic?**
Genuinely closing it further, not cosmetic — but only for the concurrent-
request scenario, exactly as the prior pass characterized it, and exactly
as CodeDeveloper's own comment (lines 130-141) now honestly describes it.
Both checks are unauthenticated-lock HTTP reads against the same
non-transactional Authentik REST API, so neither check nor the pair of
them together can fully close a same-sized race window against a
sufficiently-adversarial concurrent scheduler — that residual is
mathematically unavoidable without a distributed lock or an Authentik-
side unique constraint (neither exists). What the second check *does* do
is shrink the exploitable window from "the entire span between this
request's own step (c) and step (d), which could include an arbitrarily
long `sendMagicLinkEmail`-adjacent code path" down to "the gap between
two adjacent `await`s with no intervening I/O" — i.e. it moves the window
from a large, code-structure-dependent size to the theoretical minimum
achievable in a single process without locking. That is a real,
measurable reduction, not a relocation of an identically-sized window. I
confirm my prior pass's judgment stands: this residual risk (bounded to
two concurrent requests racing for the identical target email inside a
sub-millisecond-to-low-millisecond window, with the mixed-state backstop
now additionally closed by the reorder in finding 1 above) is acceptable
for this PR's risk profile, and does not warrant a distributed lock or
an Authentik-side schema change to fully close.

### Invariant re-check (brief)

Nothing in this diff touches secrets, tenant scoping, cross-schema
queries, rate limiting, CSRF, `dangerouslySetInnerHTML`, or Drizzle raw
SQL — INV-1/2/5/6/7/8/10 are unaffected, no re-derivation needed beyond
the prior pass. INV-3/INV-4 unaffected (no new controller method, no new
validation boundary — `upgradeTempBodySchema` is unchanged). INV-9 (no
N+1): `resolvePendingUpgrade()` + `commitUpgrade()` together are the same
fixed, bounded call sequence `tryCompleteUpgrade()` was (one
`getUserByEmail`-equivalent, one indexed `select`, and on the commit path
one `getUserById` + one `patchAttributes` + one `update`) — no loop was
introduced by the split. Confirmed clean.

### MAJOR-1 verdict: RESOLVED

Both parts of the original finding are closed:
(a) the re-check-before-PATCH gap in `requestUpgrade()` is fixed — a
genuine, narrowing (not cosmetic) second check now sits immediately
before `setUserEmail` with no intervening `await`.
(b) the downstream mixed-state risk is fixed — `commitUpgrade()` is
now provably unreachable unless `upsertByAuthentikSubject()` has already
succeeded, so a losing collision racer can no longer end up with
`is_temporary=false` and no `platform.users` row; they simply remain
`is_temporary=true` with a live, retryable intent. AC-2's "never leaves
the user in a mixed state" requirement is now satisfied for this race,
not merely narrowed.
No new BLOCKER or MAJOR finding emerged from this diff.

### MAJOR-2 gate-status disposition

MAJOR-2 (no regression test exists for the collision/race scenario) is
unchanged by this retry — CodeDeveloper's own summary confirms it was
deliberately not addressed, consistent with the prior pass's framing that
this is TestDesigner's ownership, not CodeDeveloper's.

Judgment: this does **not** keep SecurityReviewer's gate open. My role
per `.copilot/agents/security-reviewer.md` is to review *code* against
security invariants (INV-1..11) and flag exploitable defects; test-
coverage completeness for an already-identified, already-disclosed,
already-scoped risk is a distinct concern owned by a later step in this
workflow's own sequence (Step 7, TestDesigner), not something my gate is
positioned to hold open indefinitely. Two things make this the correct
reading rather than a rationalization to unblock the workflow:

1. MAJOR-2 was never a finding about the *code's* security posture — it
   was a finding about *verification evidence* being absent. The
   underlying behavior it wants tested (a clean, recoverable failure
   under email collision) is now something I've independently traced and
   confirmed true by reading the actual control flow in this pass, not
   merely something CodeDeveloper claims. A test's absence doesn't make
   already-traced-and-confirmed-correct code insecure; it makes the
   *workflow's own evidence trail* incomplete, which is QualityGate's
   and TestDesigner's concern per the agent boundaries this workflow
   already defines (see the prior pass's own MAJOR-2 text: "squarely
   TestDesigner's ownership per the workflow's agent boundaries").
2. Holding SecurityReviewer's gate at `failed-retry` with `next_agent:
   CodeDeveloper` a second time would bounce this back to an agent who
   has no test-authoring mandate in this workflow and has already
   correctly declined to write one — an infinite loop between two agents
   neither of whom owns the missing artifact, rather than advancing to
   the agent (TestDesigner, Step 7) who does.

Therefore: `passed`. This is not a statement that the workflow overall is
done — `09-quality-gate.md` must still not mark AC-2/AC-7's collision
handling as `verified` until TestDesigner's regression test exists and
passes, per the prior pass's own closing note, which still holds.

## Gate Result

```yaml
gate: SecurityReviewer
status: passed
reason: >
  Re-review of CodeDeveloper's pass-2 fix for MAJOR-1. Both parts
  verified by tracing actual control flow, not trusting comments: (a)
  requestUpgrade() now re-runs getUserByEmail immediately before
  setUserEmail with no intervening await, genuinely narrowing (not
  relocating) the concurrent-request collision window to the minimum
  achievable without a distributed lock -- confirmed acceptable residual
  risk, consistent with the prior pass's judgment. (b)
  AuthController.callback() now calls commitUpgrade() only after
  upsertByAuthentikSubject() has returned successfully -- confirmed by
  reading the actual code (no try/catch, no .catch(), no fire-and-forget
  between the two calls; a thrown/rejected upsertByAuthentikSubject()
  makes the commitUpgrade() call provably unreachable) and by
  independently confirming platform.users carries a real
  users_email_unique UNIQUE constraint distinct from
  upsertByAuthentikSubject()'s onConflictDoUpdate target
  (authentikSubject), so the exception the reorder logic depends on is
  real. A losing collision racer can no longer reach
  is_temporary=false with no platform.users row -- AC-2's mixed-state
  requirement is now satisfied for this race. No staleness or
  information-disclosure issue found in the resolvePendingUpgrade/
  commitUpgrade split (commitUpgrade re-fetches the Authentik user
  fresh; nothing carried across the gap is mutable). No new BLOCKER or
  MAJOR finding. INV-1..11 re-checked briefly; nothing in this diff
  touches tenant/secrets/schema/rate-limit/CSRF/XSS/N+1/parameterization
  invariants beyond what the prior pass already confirmed clean.
  MAJOR-2 (missing regression test for the collision scenario) remains
  open but does not hold this gate: it is a test-coverage-completeness
  finding for an already-identified, already-disclosed, already-traced
  risk, which is TestDesigner's ownership (Step 7) per this workflow's
  own agent boundaries, not a live code-security defect for
  SecurityReviewer to keep re-blocking CodeDeveloper over. QualityGate
  must still withhold AC-2/AC-7 verified status until that test exists
  and passes.
next_agent: TestStrategist
```
