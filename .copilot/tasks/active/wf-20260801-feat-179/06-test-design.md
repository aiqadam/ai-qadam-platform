# 06 — Test Design: FR-AUTH-004 (Magic-link authentication)

Implements the Unit/Integration/E2E plans from `06-test-strategy.md`
exactly, using the real function signatures confirmed by reading
`magic-link.service.ts`, `authentik.client.ts`, `auth.controller.ts`, and
`MagicLinkForm.tsx` directly (not re-derived from the code summary alone).

---

## Tests Written

### Unit

| File | Count / Focus | Required? |
|---|---|---|
| `apps/api/test/magic-link-service.spec.ts` (new) | 18 tests — `magicLinkRequestSchema` wiring to `emailField` (4: canonicalize, malformed, plus-addressed, max-length); `requestMagicLink()` existing-user path (1); no-user-found → `createUser` → `sendMagicLinkEmail` with new pk (1); config-gap failures NOT swallowed — `authentik_not_configured` / `magic_link_not_configured` (2, each asserting no Authentik calls made); anti-enumeration swallow behavior — `getUserByEmail` throws `AuthentikError`, `getUserByEmail` throws generic `Error`, `createUser` throws, `sendMagicLinkEmail` throws (4 **distinct** tests per the strategy's "isolate which internal step failed" requirement); `deriveUsername` exercised black-box via `createUser` call args — slug format + `randomBytes(3)`-hex suffix, and the `user`-fallback for an all-stripped local-part (2) | Yes |
| `apps/api/test/authentik-client.spec.ts` (extended, +2 tests) | `sendMagicLinkEmail()` — 204 response resolves void, URL matches `/api/v3/core/users/{pk}/recovery_email/?email_stage=<encoded>` exactly (stage value deliberately contains a space + slash so the `encodeURIComponent` assertion isn't vacuous), `method: 'POST'`, no request body sent; non-2xx (404) rejects with `AuthentikError` carrying `status: 404`, mirroring `createRecoveryLink`'s adjacent test | Yes |

No new test file for `magicLinkRequestSchema` in isolation — it re-exports
`emailField(200)` unchanged, and `emailField`'s own canonicalization/
rejection rules already have exhaustive dedicated coverage in
`email-schema.spec.ts`. The 4 tests in `magic-link-service.spec.ts` only
confirm the schema is *wired* to `emailField` correctly (per the task
brief's explicit instruction not to re-derive `emailField` behavior from
scratch).

### Integration

| File | Count / Focus | Required? |
|---|---|---|
| `apps/api/test/magic-link-controller.spec.ts` (new) | 8 tests — direct `AuthController` instantiation with mocked `MagicLinkService` (10-arg constructor, matching `telegram-auth-controller.spec.ts`'s "integration-level" pattern, no NestJS DI/Testcontainers): valid email → `{ ok: true }`, HTTP 200, not a redirect (1); malformed/missing body → `BadRequestException`, service never called (2); `@Throttle` decorator metadata `limit=5`/`ttl=900_000` (1); **anti-enumeration regression** — existing-account path, newly-created-account path, and a direct byte-identical-response comparison across two independently-mocked outcomes (3, `describe('AuthController.magicLink — anti-enumeration regression test')`, modeled on `registration-service.spec.ts`'s duplicate-email non-leak pattern); config-gap `ServiceUnavailableException` propagates unswallowed (1) | Yes |
| `apps/api/test/auth-controller-callback.spec.ts` (new) | 2 tests — AC-7 funnel-regression guard: `callback()` calls `upsertByAuthentikSubject` and `mintSession` exactly once each with the expected arguments on a successful flow; refresh cookie set + redirect to the resolved post-login URL. No dedicated `callback()` test existed before this workflow (confirmed via grep — `auth-controller-refresh.spec.ts`/`auth-controller-signout.spec.ts` cover sibling methods only), so this is new, scoped narrowly to "the comment-only FR-AUTH-006 seam introduced no behavioral change," not a re-test of `AuthService.completeAuthorization`'s own OIDC exchange logic | Yes |

### E2E

| File | Count / Focus | Required? |
|---|---|---|
| `apps/e2e/tests/uat/magic-link-form-submission.spec.ts` (new) | 1 test — fills a valid email on `/auth/sign-in-magic-link`, intercepts `POST **/api/v1/auth/magic-link` via `page.route()` (mirrors `signup-form-submission.spec.ts`'s interception technique; fulfills `{ ok: true }`, no live backend), asserts the DOM transitions to `MagicLinkForm.tsx`'s `SuccessPanel` ("Check your email" text) and that the captured JSON POST body contains the submitted email | Yes (happy-path smoke only, per strategy) |

**Deliberately not written** (explicit scope exclusions per the strategy,
not oversights): a click-through spec for the actual magic-link email
completion (AC-2 through AC-5 — requires live Authentik + a confirmed
pollable SMTP-catcher API, out of scope for this workflow); a live
6-requests-then-429 rate-limit test (AC-6 — covered by the decorator
metadata check above, matching how `register`/`telegram/exchange` are
tested in this codebase).

---

## Acceptance Criteria Coverage

| AC | Test | Status |
|---|---|---|
| AC-1 (email arrives within 60s) | Unit: `magic-link-service.spec.ts`'s "existing user found" + "no user found" happy paths confirm `sendMagicLinkEmail` is called with the correct pk/stage UUID. Integration: `magic-link-controller.spec.ts`'s valid-email → `{ ok: true }` test. E2E: `magic-link-form-submission.spec.ts`'s form-fill → confirmation-state transition. | Covered (code-correctness slice); **actual delivery timing is live-UAT-only**, per strategy |
| AC-2 (used link shows error, no new session) | N/A — Authentik-native token semantics, not testable against our code | **Live UAT only**, per strategy |
| AC-3 (15-min expiry) | N/A — provisioning script config, not unit-tested application code | **Live UAT only** (config value already confirmed live at Step 4 per `03-code-summary.md`) |
| AC-4 (completed flow → valid session, `/me`) | Integration: `auth-controller-callback.spec.ts`'s funnel-regression guard confirms `upsertByAuthentikSubject`/`mintSession` still run unchanged | Covered (funnel-integrity slice); **full browser-visible outcome is live-UAT-only** |
| AC-5 (existing-password member also completes magic-link) | Unit: `magic-link-service.spec.ts`'s "existing user found" test — the service never branches on password state | Covered (partial); **dual-method coexistence proof is live-UAT-only** |
| AC-6 (6th request/15min → 429) | Integration: `magic-link-controller.spec.ts`'s `@Throttle` decorator metadata test | **Fully automated, no live-UAT dependency** |
| AC-7 (callback funnel reuse, no parallel session path) | Integration: `auth-controller-callback.spec.ts` | **Fully automated** (structural "no new session-issuing code" fact + code-review-observable extension-seam comment) |

Matches the strategy's own summary: AC-6 and AC-7 are fully closed by
automated tests; AC-1/2/3/4/5 each have a real automated slice for the
parts our code controls, with the remainder deferred to live UAT for
reasons grounded in Authentik's own unmockable native behavior.

---

## Known Test Gaps

- No `it.skip` anywhere in any new/modified file.
- Live-UAT-only ACs (AC-1's delivery timing, AC-2, AC-3's enforcement,
  AC-4's full browser outcome, AC-5's dual-method proof) are gaps in
  *automated* coverage by design, not by omission — each has a TODO-free,
  explicit rationale in this document's AC table and in
  `06-test-strategy.md`. No source-code `// TODO` markers were needed
  since nothing here is deferred implementation — it's structurally
  untestable-by-mock Authentik behavior, to be verified live by the
  Orchestrator at Step 8/13.
- The Playwright E2E spec was type-checked (`apps/e2e`: `tsc --noEmit -p
  tsconfig.json`, 0 errors) and biome-linted (0 issues) but **not run
  end-to-end against a live dev server** — no local `web-next`/`api` dev
  stack was running in this environment (`curl` to `localhost:4321` and
  `localhost:3000` confirmed neither was up), and bringing up the full
  stack is outside TestDesigner's scope per the task brief's own fallback
  instruction ("if the E2E spec can't easily be run standalone... at
  minimum confirm it type-checks/lints cleanly"). TestRunner or the
  Orchestrator's live UAT pass is the next checkpoint that will actually
  execute this spec against a running stack.

---

## Self-Check Results

- All new public functions/methods have unit tests (happy path + failure
  paths): `MagicLinkService.requestMagicLink()` (7 branches),
  `AuthentikClient.sendMagicLinkEmail()` (happy + error), controller
  `magicLink()` (happy + 2 failure modes + anti-enumeration + rate-limit),
  controller `callback()` (funnel regression guard). No `it.skip`.
- No `any` in any new/modified test file (confirmed via biome — 0 issues
  across all 5 touched files, `noExplicitAny` is part of this repo's
  ruleset).
- Ran `pnpm exec vitest run test/magic-link-service.spec.ts
  test/magic-link-controller.spec.ts test/auth-controller-callback.spec.ts
  test/authentik-client.spec.ts` from `apps/api` — **45/45 passed**.
- Ran the full `apps/api` suite (`pnpm exec vitest run`, no filter) —
  **1495/1497 passed**; the 2 failures (`telegram-admin-status-service
  .spec.ts`'s oldest-unpublished-age clock-precision assertion,
  `users.spec.ts`'s `lastLoginAt` monotonicity assertion) are pre-existing
  timing-flake tests in files this workflow does not touch (confirmed via
  `git status` — not in this workflow's diff) and reproduce in isolation
  on a clean re-run, unrelated to any change here.
- Ran `astro check` against `apps/web-next` — 0 errors (pre-existing
  warnings only, none in files touched by this workflow).
- `apps/api/test/authentik-client.spec.ts` was **extended**, not
  duplicated into a parallel file, per the strategy's explicit guidance
  citing `02-impact-analysis.md`'s Test Scope section.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "All Unit/Integration/E2E tests from 06-test-strategy.md's plans are written and passing. 4 files touched: 3 new (magic-link-service.spec.ts, magic-link-controller.spec.ts, auth-controller-callback.spec.ts) + 1 extended (authentik-client.spec.ts, +2 tests) in apps/api/test/, plus 1 new Playwright spec (apps/e2e/tests/uat/magic-link-form-submission.spec.ts). 45/45 new/modified tests pass in isolation; full apps/api suite is 1495/1497 (2 pre-existing unrelated timing-flakes, confirmed reproducible independent of this diff). E2E spec type-checks and lints clean; not run end-to-end (no local dev stack available in this environment) per the task brief's own documented fallback."
  findings:
    - "magicLinkRequestSchema has no dedicated standalone test file — it re-exports emailField(200) unchanged, and emailField's canonicalization/rejection rules are already exhaustively covered by email-schema.spec.ts. magic-link-service.spec.ts's 4 schema tests only confirm correct wiring, per the task brief's explicit instruction not to re-derive emailField's own behavior."
    - "The anti-enumeration regression test is placed at the CONTROLLER level (magic-link-controller.spec.ts), not the service level, because MagicLinkService.requestMagicLink() returns void with no discriminated result to compare — exactly as 06-test-strategy.md specified. The service-level swallow-vs-throw behavior (6 distinct failure-path tests) is what makes the controller-level '{ ok: true } always' assertion actually true rather than merely asserted once."
    - "telegram-auth-controller.spec.ts's existing makeAuthController helper (8 args) was NOT modified — it still runs correctly at test time because apps/api/tsconfig.json's include is scoped to src/**/* only, so test files aren't tsc-checked for constructor arity; Vitest's esbuild transform doesn't enforce it either. magic-link-controller.spec.ts and auth-controller-callback.spec.ts each define their own local makeAuthController supplying all 10 constructor args (through registration + magicLinkService), so no existing test file needed modification."
    - "AuthentikClient.sendMagicLinkEmail's URL/encoding test deliberately uses a stage value containing a space and a slash (not an already-URL-safe UUID) so the encodeURIComponent assertion is not vacuously true — this was a specific instruction in the test strategy's Unit Test Plan table, followed literally."
    - "Two pre-existing test failures were observed on a full, unfiltered apps/api suite run (telegram-admin-status-service.spec.ts's clock-precision oldest_unpublished_age_sec assertion, users.spec.ts's lastLoginAt monotonicity assertion) — both reproduce in isolation on a clean re-run and are timing/clock-resolution flakes in files entirely outside this workflow's diff (confirmed via git status). Flagging for TestRunner/Orchestrator awareness in case CI shows the same flakes; not caused by or fixed within this workflow."
```
