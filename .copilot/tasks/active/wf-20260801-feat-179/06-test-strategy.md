# 06 — Test Strategy: FR-AUTH-004 (Magic-link authentication)

## Requirement

**FEAT-AUTH-4** (`FR-AUTH-004`). A user (Telegram-only temp account OR any
existing member) requests a one-time email sign-in link from
`apps/web-next`'s `/auth/sign-in` page (real markup added; new sibling page
`/auth/sign-in-magic-link` hosts the form). `POST /v1/auth/magic-link`
triggers `MagicLinkService.requestMagicLink()`, which looks up-or-creates an
Authentik user by email and calls the new
`AuthentikClient.sendMagicLinkEmail(userPk, emailStageUuid)`
(`POST /api/v3/core/users/{id}/recovery_email/?email_stage=<uuid>`, 204).
Authentik emails the link natively (no URL ever passes through our
process). Clicking the link, within 15 minutes and only once, completes the
OIDC flow through the existing `AuthController.callback()` funnel, issuing
the standard `aiqadam-refresh` session and landing at `/me`. Scope boundary
(binding, per `01-requirement-validation.md`): this workflow does **not**
implement FR-AUTH-006's `is_temporary` flip, points backfill, CRM sync, or
the bot `/upgrade` internal endpoint — only a comment-only extension seam in
`callback()`.

Authoritative AC list is the draft AC-1..AC-7 from `01-requirement-validation.md`
(narrower than the raw FR file — see that document's Completeness Issues
#1/#2 for why).

---

## Rubric Score

| Criterion | Applies? | Points |
|---|---|---|
| Touches tenant-scoped data | No — magic-link identity resolution is global/user-scoped (Authentik user records carry no `country_code`; confirmed in `02-impact-analysis.md`'s Cross-Module Calls section) | 0 |
| New API endpoint | Yes — `POST /v1/auth/magic-link` is net-new | +2 |
| Business rule with edge cases | Yes — anti-enumeration correctness (`{ ok: true }` for every outcome), the config-gap-vs-per-request-failure error-swallowing split in `MagicLinkService.requestMagicLink()` (throws 503 only for missing config, swallows everything else), and rate limiting are all genuine edge-case business logic, not incidental plumbing | +2 |
| Cross-module service call | No — `MagicLinkService` → `AuthentikClient` stays inside `AuthModule` via the already-imported `AuthentikModule`; no boundary crossed (confirmed in `02-impact-analysis.md`'s Cross-Module Calls table) | 0 |
| New database query | No — confirmed no DB changes required at all (Step 2's "DB Changes Required: NO" finding); `upsertByAuthentikSubject()` in the callback path is pre-existing, unmodified code, not a new query introduced by this workflow | 0 |
| Pure function / utility | N/A (schema validation is covered under "new endpoint") | — |
| UI-only change | No — this is not UI-only; it has a real API surface | — |

**Total: 4.**

**Justification for not scoring higher:** I deliberately did NOT award the
cross-module-service-call point. `MagicLinkService` calling `AuthentikClient`
is a same-module dependency-injection call (both live under `AuthModule`'s
umbrella, `AuthentikModule` already imported) — the rubric's "cross-module"
criterion is about crossing an *architectural* module boundary (e.g. Auth
calling into Events or Registrations), which does not happen here. I also
did not double-count "new API endpoint" and "business rule with edge cases"
as the same thing — the endpoint itself is a thin controller method; the
edge-case scoring is specifically for the anti-enumeration/error-swallowing
logic living in the service, which is a distinct piece of business logic
graded on its own merits (this mirrors how `register`'s honeypot/duplicate
collapse was treated as a first-class edge case, not folded into "it's an
endpoint").

Score of 4 sits exactly at the Integration threshold (`≥ 4`) and just under
the E2E threshold (`≥ 6`). This matches the codebase's own established
practice for this exact class of endpoint: `register` and `telegram/exchange`
(both new public auth endpoints with anti-enumeration/error-swallowing edge
cases) are covered by controller-level "integration-style" tests
(`telegram-auth-controller.spec.ts`, `registration-service.spec.ts`) but do
**not** have a dedicated Playwright click-through spec for their own
enumeration guarantees — only a happy-path form-submission spec
(`signup-form-submission.spec.ts`) plus live BP-UAT verification. Magic-link
follows the identical pattern; see E2E Test Plan below for why a
happy-path-only Playwright smoke spec is included despite the score sitting
under 6, and why it deliberately does not attempt the full click-through.

**Important scoping note on "Integration tests required (Testcontainers)":**
this codebase's actual convention for auth-module endpoints of this shape is
**not** a real-Postgres-spinning Testcontainers test — it's what the
existing test files themselves label "integration-level": direct controller
instantiation with fully-mocked service/client dependencies, verified
against `checkin.integration.spec.ts`'s own doc comment ("without requiring
NestJS DI or Testcontainers") and `telegram-auth-controller.spec.ts`'s
identical pattern for `telegramExchange`. This FR has **zero DB reads or
writes** in its own new code (confirmed: Step 2's "DB Changes Required: NO";
`MagicLinkService` only calls `AuthentikClient`, which is a REST wrapper, not
a DB client) — so there is no Postgres/Redis state for Testcontainers to
provide that a mock doesn't already cover equally faithfully. Spinning a real
Postgres container for this endpoint would test infrastructure this endpoint
never touches. **Recommendation: satisfy the rubric's "Integration tests
required" with controller+service-level tests using mocked
`AuthentikClient`/`MagicLinkService`, matching `telegram-auth-controller.spec.ts`
and `checkin.integration.spec.ts`'s established precedent, not a new
Testcontainers harness.** This is a judgment call informed by the codebase's
own consistent practice, not a deviation from AGENTS.md §3 (which reserves
Testcontainers for tests that need Postgres/Redis — this one doesn't).

---

## Required Test Levels

- [x] Unit
- [x] Integration (mocked-dependency controller/service tests — see scoping note above; no Testcontainers harness needed, none of this workflow's new code touches Postgres/Redis)
- [x] E2E (Playwright, happy-path form-submission-to-confirmation only — see justification above and E2E Test Plan)

---

## Unit Test Plan

| Target | Happy Path | Failure Paths |
|---|---|---|
| `magicLinkRequestSchema` (`apps/api/src/modules/auth/magic-link.service.ts`) | Valid, plain lowercase email parses; email with mixed case + surrounding whitespace is trimmed/lowercased (per `emailField`'s existing canonicalization — mirror `email-schema.spec.ts`'s existing assertions, do not re-derive `emailField` behavior from scratch since it already has its own dedicated unit tests) | Malformed email fails `safeParse`; plus-addressed email (`user+tag@domain.com`) is rejected (matches `emailField`'s existing anti-abuse rule); email exceeding the 200-char max length is rejected |
| `MagicLinkService.requestMagicLink()` (`apps/api/src/modules/auth/magic-link.service.ts`) | Existing user found by `getUserByEmail` → `createUser` is NOT called → `sendMagicLinkEmail(user.pk, emailStageUuid)` called with that user's `pk` | (1) No user found → `createMagicLinkUser` runs (derives username, calls `createUser`) → `sendMagicLinkEmail` called with the newly-created pk. (2) `AUTHENTIK_ADMIN_TOKEN` not configured (`authentik.isConfigured()` false) → throws `ServiceUnavailableException('authentik_not_configured')`, no Authentik calls made. (3) `AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID` unset → throws `ServiceUnavailableException('magic_link_not_configured')`, no Authentik calls made. (4) `getUserByEmail` throws (`AuthentikError` or generic `Error`) → swallowed, logged via `Logger.warn`, method resolves normally (`undefined`), does NOT rethrow. (5) `createUser` throws mid-request → same swallow-and-resolve behavior. (6) `sendMagicLinkEmail` throws → same swallow-and-resolve behavior. Each of (4)-(6) is a **distinct** test, not one combined test — this is exactly the "isolate which internal step failed" discipline `registration-service.spec.ts`'s orphaned-account-rollback tests already apply, and it is the concrete mechanism that makes the anti-enumeration guarantee (Integration Test Plan, below) actually true rather than merely asserted at one call site. |
| `MagicLinkService.deriveUsername()` (private — test indirectly via `createMagicLinkUser`'s effect on `createUser`'s call args, same technique `registration-service.spec.ts` uses for `RegistrationService.deriveUsername`) | Local-part slugified to `[a-z0-9.]`, lowercase, with a `randomBytes(3)`-hex suffix appended (assert format via regex, not exact value) | Local-part with no valid characters (e.g. `+++@domain.com` — though this specific case is already rejected upstream by `emailField`'s plus-addressing rule, so use a different all-symbol local-part that survives Zod, e.g. a unicode-heavy one if `emailField` allows it) falls back to base `user` before the suffix is appended |
| `AuthentikClient.sendMagicLinkEmail()` (`apps/api/src/modules/admin-invites/authentik.client.ts`) — new file additions to `apps/api/test/authentik-client.spec.ts`, extending the existing file rather than creating a parallel one, per `02-impact-analysis.md`'s Test Scope guidance | Mocked `fetch` returns 204 empty response (use the file's existing `emptyResponse(status)` helper, same as `setPassword`'s test) → method resolves `void`; assert the constructed URL matches `/api/v3/core/users/{pk}/recovery_email/?email_stage=<uuid>` **exactly**, including `encodeURIComponent` applied to the UUID (use a UUID or test value containing a character `encodeURIComponent` would actually transform, e.g. one with a stray `/` or space injected deliberately in the test fixture, so the assertion is not vacuously true for an already-URL-safe UUID) and confirm `method: 'POST'` | Mocked `fetch` returns a non-2xx (e.g. 404) → rejects with `AuthentikError` carrying `status: 404`, mirroring the existing `createRecoveryLink` "throws AuthentikError on a non-2xx response" test immediately below it in the same file |

---

## Integration Test Plan

*(Mocked-dependency controller/service tests — see the scoping note under
Rubric Score for why this satisfies the rubric's "Integration tests
required" without a Testcontainers harness. Pattern: direct `AuthController`
instantiation with a mocked `MagicLinkService`, mirroring
`telegram-auth-controller.spec.ts`'s exact structure — `makeAuthController`
helper extended with a `magicLinkService` param, since the real constructor
now takes 10 args including it.)*

| Scenario | Infrastructure | Key Assertions |
|---|---|---|
| `POST /v1/auth/magic-link` — valid email, service succeeds | Mocked `MagicLinkService.requestMagicLink` (resolves `undefined`) | Controller calls `requestMagicLink` with the parsed/canonicalized email; returns `{ ok: true }`; `HttpCode` is `200` (not the `302`/`FOUND` pattern `register`/`telegram/exchange` use — this is the one endpoint in the controller that must NOT redirect, per `02-impact-analysis.md`'s explicit finding) |
| `POST /v1/auth/magic-link` — malformed body (missing/invalid `email`) | No service call | `BadRequestException` thrown; `magicLinkService.requestMagicLink` never called (mirrors `telegramExchange`'s Zod-failure test at line 130 of `telegram-auth-controller.spec.ts`) |
| **Critical regression test — anti-enumeration invariant.** `POST /v1/auth/magic-link` response is byte-identical regardless of what `MagicLinkService.requestMagicLink` does internally | Three sub-cases against the mocked service, run as three separate `it()` blocks (not one parametrized test, to keep failure output legible — matches `registration-service.spec.ts`'s style of one `describe` per outcome): (a) service resolves normally (existing-account email path), (b) service resolves normally (newly-created-account email path — service-level distinction is invisible to the controller, so this is really the same controller-level case as (a), included for documentation/traceability back to AC), (c) service **throws** `ServiceUnavailableException` is explicitly the ONE exception the controller does NOT swallow (see next row) — separated out so this row stays scoped to the true "identical for every per-request outcome" cases | All of (a)/(b) resolve to the exact same `{ ok: true }`, HTTP 200, with no distinguishing header, timing artifact in the assertion, or body field. This is the automated regression guard `01-requirement-validation.md`'s task brief calls for, directly modeled on `registration-service.spec.ts`'s `describe('register — duplicate email (non-leak regression test)')` (lines 164-184) — same "assert byte-identical result across divergent internal paths" technique, applied here at the controller level since `MagicLinkService.requestMagicLink()` itself has a `void` return type and no discriminated result to compare (the non-leak property is entirely encoded in "the promise resolves without throwing," which the unit-test-level swallow assertions in the Unit Test Plan above already lock in one layer down — this integration test locks in the controller's `{ ok: true }` wrapping on top of that) |
| Controller-level: `ServiceUnavailableException` (config-gap case) propagates, is NOT swallowed into `{ ok: true }` | Mocked service rejects with `ServiceUnavailableException('magic_link_not_configured')` | Controller call rejects with `ServiceUnavailableException` (503) — this is the one deliberate exception to "always 200," and it must remain observable in this test file precisely because it's easy for a future refactor to accidentally wrap it into the generic swallow, silently hiding a deployment misconfiguration. Mirrors `telegramExchange`'s "propagates ServiceUnavailableException from the service unchanged" test at line 155. |
| Rate-limit decorator metadata check | None — pure reflection, no HTTP call | `Reflect.getMetadata('THROTTLER:LIMITdefault', AuthController.prototype.magicLink)` is `5`; `Reflect.getMetadata('THROTTLER:TTLdefault', AuthController.prototype.magicLink)` is `900_000`. **This is the exact existing pattern this codebase uses to cover AC-6's rate-limit requirement** — see `telegram-auth-controller.spec.ts` lines 168-188 ("verifies @Throttle decorator metadata is present on telegramExchange with limit=5 and ttl=900_000"). The codebase does NOT fire 6 live requests against a running `ThrottlerGuard`/Redis to prove 429 behavior for this controller — `ThrottlerGuard`'s own enforcement is `@nestjs/throttler`'s tested responsibility, not re-tested per-endpoint; `observe-throttler-guard.spec.ts` is where actual 429-throwing behavior is unit-tested, generically, against the guard class itself, not per-decorated-route. TestDesigner should follow this same division of responsibility rather than inventing a new Testcontainers+Redis harness only for this one endpoint. |
| `AuthController.callback()` — no regression to the existing funnel (AC-7 guard) | Mocked `AuthService`/`UsersService` | A minimal smoke assertion (if not already covered by an existing `callback()` test elsewhere — grep confirmed no dedicated `auth-controller-callback.spec.ts` exists yet in `apps/api/test/`) that `callback()` still calls `upsertByAuthentikSubject` and `mintSession` exactly once each on a successful flow, unchanged by this workflow's comment-only edit. If an existing test already exercises `callback()` end-to-end (check before adding — `auth-controller-refresh.spec.ts`/`auth-controller-signout.spec.ts` cover sibling methods but may not cover `callback()` itself), this can be a **new, small, dedicated test** rather than folding into an unrelated file; scope it narrowly to "the comment-only seam introduced no behavioral change," not a full re-test of the OIDC exchange (that's `AuthService.completeAuthorization`'s own test territory, out of this workflow's diff). |

---

## E2E Test Plan

| User Flow | Entry Point | Exit Assertion |
|---|---|---|
| Fill email on the magic-link form, see the confirmation state (happy path only) | `apps/web-next` page `/auth/sign-in-magic-link` | `page.route('**/api/v1/auth/magic-link', ...)` intercepts the POST (deterministic, no live backend/rate-limit/Authentik dependency — mirrors `signup-form-submission.spec.ts`'s interception technique exactly) and fulfills `{ ok: true }`; assert the DOM transitions to the "Check your email" confirmation panel (`MailCheck` icon + "Check your email" text per `MagicLinkForm.tsx`'s `SuccessPanel`), and that the captured POST body contains the submitted email. This is the Playwright-automatable slice `02-impact-analysis.md`'s own Test Scope section scopes this workflow to. |

**Deliberately NOT in this Playwright spec (explicit scope exclusion, not an oversight):**

- The actual link-click-to-session-completion path (AC-2, AC-3, AC-4, AC-5)
  is **not** Playwright-automatable in this workflow. `02-impact-analysis.md`'s
  Test Scope section confirms this explicitly: without a confirmed,
  pollable SMTP-catcher REST API in the local stack (Mailpit/MailHog — not
  yet confirmed vs. Listmonk, per that document's own flagged open
  question), Playwright has no way to retrieve the real emailed link and
  click it. **This test level is instead covered by the Orchestrator's own
  live UAT verification at Step 8/13** (AGENTS.md §6.1 "no deferred
  tests" — the live pass is the actual coverage mechanism for these ACs,
  not a placeholder for later automation). TestDesigner should not attempt
  to build a click-through Playwright spec for this workflow; doing so
  would either be flaky (racing a real email) or require infrastructure
  (SMTP-catcher API wiring) that is explicitly out of scope here per the
  impact analysis.
- Rate-limit 429 behavior (AC-6) is not Playwright-tested — covered by the
  Integration Test Plan's decorator-metadata check above, consistent with
  how `telegram/exchange`/`register`'s own rate limits are tested in this
  codebase (no existing Playwright spec fires 6 requests against either of
  those endpoints either).

---

## Acceptance Criteria → Test Mapping

| AC | Test Level | Test Description |
|---|---|---|
| AC-1 (email arrives within 60s after submitting on `/auth/sign-in`) | Unit + Integration for the *code-correctness* half; **live UAT verification only** for the *email actually arrives within 60s* half | Unit: `MagicLinkService.requestMagicLink()` happy path confirms `sendMagicLinkEmail` is called with the correct `pk`/`emailStageUuid` when a valid email is submitted. Integration: controller returns `{ ok: true }` for a valid email. Playwright: form-fill → confirmation-state transition (proves the UI correctly triggers the request). **The 60-second delivery-time guarantee itself is Authentik's own native Email-stage send timing plus the local SMTP relay — not something our code controls or can unit/integration-test; only live-UAT (Orchestrator, Step 8/13, per `02-impact-analysis.md`'s own E2E/Live UAT section item 1-2) can observe actual email arrival.** |
| AC-2 (clicking a used link a second time shows an error, no new session) | **Live UAT verification only** | Single-use token consumption is Authentik's own native Email-stage token semantics (`03-code-summary.md` Known Limitations #2 confirms this explicitly: "AC-2 ... [is an] Authentik-native behavior this workflow *configures* ... but does not itself unit-test"). Our code neither implements nor can mock this — it's server-side Authentik state. Covered by `02-impact-analysis.md`'s Live UAT item 5 ("click the same link a second time"). |
| AC-3 (link expires after 15 minutes unused) | Unit test on **our own configuration**, live UAT for **Authentik's enforcement of it** | `scripts/provision-authentik-magic-link-flow.sh` sets `token_expiry: 15` — this is a provisioning script, not application code TestDesigner unit-tests per the standard test pyramid (`standards.md` §IV explicitly excludes "infrastructure scripts" from coverage targets). The 15-value was confirmed live via `curl` at Step 4 (`03-code-summary.md` Key Design Decision #5) — that live verification already stands as the check for "did we configure the right number"; TestDesigner does not need to re-derive this. Authentik's actual enforcement of the 15-minute TTL is out of our code's testable surface entirely (same reasoning as AC-2), and is flagged in `02-impact-analysis.md`'s own Live UAT section as possibly deferred to a documented follow-up if 15 real minutes is impractical to wait out live during Step 8/13 — that deferral decision belongs to the Orchestrator at that step, not to this test strategy. |
| AC-4 (completed flow → valid `aiqadam-refresh` session, lands at `/me`, correct profile — general/non-temp case only) | Integration (regression guard for the *funnel*) + **live UAT for the full flow** | Integration: the `callback()` smoke assertion in the Integration Test Plan above confirms the comment-only edit introduced no behavioral change to `upsertByAuthentikSubject`/`mintSession` — i.e., magic-link sign-in still converges on the SAME code path as every other auth mechanism (this is really AC-7's guarantee, cross-referenced here since AC-4 depends on it holding). The actual browser-visible outcome (cookie set, `/me` shows correct profile) requires a live Authentik flow completion and is covered by `02-impact-analysis.md`'s Live UAT items 3-4. |
| AC-5 (member with existing password also completes magic-link successfully; both methods coexist) | Unit (partial) + **live UAT (full)** | Unit: `MagicLinkService.requestMagicLink()`'s "existing user found" path already covers the code-level guarantee that having a password set has no special-casing — the service only ever branches on "user found via `getUserByEmail`" vs. "not found," never inspects password state, so no password-set/unset distinction exists in the code to test beyond that one happy-path unit test. The actual dual-method-coexistence proof (sign in with password AND magic-link on the same account, in sequence, both succeed) needs a live account and is covered by `02-impact-analysis.md`'s Live UAT item 7. |
| AC-6 (6th request from same IP in 15 min → 429) | Integration | `Reflect.getMetadata` decorator-presence check on `AuthController.prototype.magicLink` (`limit: 5`, `ttl: 900_000`), matching this codebase's existing convention for the sibling `telegramExchange`/`register` endpoints (see Integration Test Plan above) — the actual 429-throwing mechanics are `ThrottlerGuard`'s own tested responsibility (`observe-throttler-guard.spec.ts`), not re-verified per endpoint. **Fully automated, no live-UAT dependency** — this AC does not need live verification since the decorator check is a deterministic, complete proxy for "rate limiting is wired correctly," consistent with how AC-6's sibling requirement is already tested for `register`/`telegram/exchange` today. |
| AC-7 (callback funnel reuse, no parallel session-issuance path; FR-AUTH-006 extension seam present) | Integration + static/manual confirmation | Integration: the `callback()` smoke assertion (Integration Test Plan) confirms no behavioral change was introduced. The "no parallel path exists" half of this AC is structurally true by construction — this workflow adds zero new session-issuing code (confirmed by `03-code-summary.md`'s Files Changed table: only a comment was added to `callback()`) — and the "extension seam is present and marked" half is a code-review-observable fact (the comment block at `auth.controller.ts:212-219`), not something a unit/integration test meaningfully asserts beyond "the file compiles and the comment is human-readable." No live-UAT dependency for this AC. |

**Summary:** 2 of 7 ACs (AC-6, AC-7) are fully covered by automated tests
with no live-UAT dependency. The remaining 5 (AC-1, AC-2, AC-3, AC-4, AC-5)
each have a real, non-trivial automated slice (unit and/or integration
and/or Playwright covering the parts of the AC our own code controls) but
also have a live-UAT-only component for the parts that depend on
Authentik's own native, unmockable flow-execution behavior — this split is
not a gap in this test strategy; it is the correct and only way to test
those ACs, confirmed independently by both `02-impact-analysis.md`'s Test
Scope section and `03-code-summary.md`'s Known Limitations #2, and is
consistent with AGENTS.md §6.1's "live UAT verification" track for
infrastructure this codebase's test suite cannot substitute a mock for.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "FR-AUTH-004 scores 4 on the Test Tier Decision Rubric (new public endpoint +2, business-rule edge cases +2; no tenant-scoped data, no cross-module call, no new DB query) — Integration tests required, E2E required only at happy-path smoke level. All 7 draft ACs from 01-requirement-validation.md are mapped to at least one test or explicitly to live-UAT-only with a stated reason grounded in Authentik's own native, unmockable flow-execution semantics. The critical anti-enumeration regression test is modeled directly on registration-service.spec.ts's existing 'duplicate email (non-leak regression test)' pattern, applied at the controller level since MagicLinkService.requestMagicLink() has a void return with no discriminated result to compare at the service level."
  findings:
    - "Scoping decision: 'Integration tests required (Testcontainers)' is satisfied by mocked-dependency controller/service tests (the pattern telegram-auth-controller.spec.ts and checkin.integration.spec.ts already call 'integration-level' in their own doc comments), not a new Testcontainers/Postgres harness — this workflow's new code makes zero DB reads or writes (confirmed by 02-impact-analysis.md's 'DB Changes Required: NO' finding), so there is no Postgres/Redis state Testcontainers would provide that a mock doesn't already cover. This is consistent with AGENTS.md §3 (Testcontainers is for tests that need Postgres/Redis) and with this codebase's own established practice for the sibling register/telegram-exchange endpoints, neither of which has a Testcontainers-based test for their own auth-controller logic."
    - "Rate-limit testing (AC-6) follows this codebase's existing, established convention exactly: a Reflect.getMetadata decorator-presence check on the controller method (mirroring telegram-auth-controller.spec.ts lines 168-188), NOT a live 6-requests-then-expect-429 test. The task brief's framing ('mirror whatever existing test pattern covers this for register/telegram/exchange') was followed to the letter once the actual existing pattern was located — it is decorator reflection, not request-flooding."
    - "The anti-enumeration regression test (Integration Test Plan) is placed at the CONTROLLER level, not the service level, because MagicLinkService.requestMagicLink() returns void with no discriminated 'found vs created vs failed' result for a test to compare — the non-leak property only becomes observable at the HTTP-response boundary. The service-level swallow-vs-throw behavior (config-gap 503 is the one deliberate exception) is separately locked in by the Unit Test Plan's six distinct MagicLinkService failure-path tests, which together are what make the controller-level 'always { ok: true }' assertion actually true rather than merely asserted once at one call site."
    - "Found and used as the direct precedent throughout: registration-service.spec.ts's 'register — duplicate email (non-leak regression test)' describe block (lines 164-184) for the enumeration-regression pattern, and telegram-auth-controller.spec.ts's full describe('AuthController.telegramExchange ...') block (including its Throttle-metadata test at lines 168-188) for the controller-integration-test shape. Both are cited by file and line in this document's Unit/Integration Test Plan tables so TestDesigner can open them directly rather than re-deriving the pattern."
    - "AC-1/2/3/4/5 each split into an automated-code-correctness slice (mapped to a real test) plus a live-UAT-only slice (Authentik's native flow-execution semantics — token single-use, 15-min TTL enforcement, actual session/cookie issuance, actual email delivery timing) that cannot be unit/integration/Playwright-tested against this codebase's own test doubles. This split is independently confirmed by both 02-impact-analysis.md's Test Scope section and 03-code-summary.md's Known Limitations #2 — not a gap introduced by this strategy. AC-6 and AC-7 are the only two ACs fully closed by automated tests alone."
    - "E2E/Playwright scope is deliberately limited to the happy-path form-submission-to-confirmation-state flow (mirroring signup-form-submission.spec.ts's page.route() interception technique) — the link-click-to-session-completion path is explicitly NOT asked of TestDesigner in this workflow; it is covered by the Orchestrator's own live UAT verification at Step 8/13, consistent with 02-impact-analysis.md's own findings about the local SMTP-catcher's unconfirmed pollable-API status."
```
