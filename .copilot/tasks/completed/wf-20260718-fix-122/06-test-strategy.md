# Step 6 — Test Strategy: ISS-USR-REG-001

> Output for: `.copilot/tasks/active/wf-20260718-fix-122/06-test-strategy.md`
> Agent: TestStrategist
> Workflow: wf-20260718-fix-122 (issue-resolution)

---

## Requirement

**ISS-USR-REG-001** — Implement AI-Qadam-branded self-registration:
`POST /v1/auth/register`, a public, rate-limited endpoint that provisions a
full member account via Authentik (create user → set password → assign
`aiqadam-member` group), links/creates the Directus member row and writes
the submitted `country`, and — per the security-review retry pass — emails
the real Authentik recovery link via `InteractionsService` instead of
returning it in the HTTP response, so the endpoint always redirects the
browser to the literal `/v1/auth/login` regardless of outcome (success,
duplicate email, or honeypot trap).

This is an `issue-resolution` workflow. Per `.copilot/workflows/issue-resolution.md`
Step 6, the plan must include at least one regression test that (1) would
have failed before the fix and (2) passes after. Before this PR,
`POST /v1/auth/register` did not exist (404 for any request) — so any test
that exercises the endpoint's core behavior technically satisfies this. The
strategy frames the **happy-path test** explicitly as this workflow's
regression test, because it additionally pins the specific security-fixed
behavior (the `recoveryUrl` in the response is always the literal
`/v1/auth/login`, never the real Authentik URL) that a naive re-introduction
of this feature could easily regress.

---

## Rubric Score

| Criterion | Applies | Points | Reasoning |
|---|---|---|---|
| Touches tenant-scoped data | No | 0 | `country` is a Directus `directus_users` field write, not a `platform.*` tenant-scoped table (confirmed by 02-impact-analysis.md: "Tenant scoping: N/A at this layer"). |
| New API endpoint | Yes | +2 | `POST /v1/auth/register` is new, public-facing, and security-relevant (creates real, non-temporary accounts with password/credential handling) — comparable in sensitivity to `/v1/auth/telegram/exchange`. |
| Business rule with edge cases (capacity, waitlist, dates) | No | 0 | No capacity/waitlist/date logic in this flow. |
| Cross-module service call | Yes | +1 | `RegistrationService` calls into `AuthentikClient` (admin-invites module), `DirectusUsersBridgeService`/`DirectusClient` (directus module), and `InteractionsService` (interactions module) — three distinct cross-module dependencies. |
| New database query | No | 0 | Confirmed by 02-impact-analysis.md and by reading `registration.service.ts` in full: zero direct Postgres/Drizzle access. All persistence-adjacent effects go through `AuthentikClient` (external HTTP API) and `DirectusClient`/`DirectusUsersBridgeService` (external HTTP API to Directus), neither of which is a local DB query. |
| Pure function / utility | N/A | 0 | Not applicable — this is a stateful service, not a pure utility, though it contains one small pure-ish private helper (`deriveUsername`). |
| UI-only change (no logic) | No | 0 | N/A — this scoring pass covers `RegistrationService`; the frontend `SignUpForm.tsx`/`sign-up.astro` pair is a separate, already-existing-pattern surface (mirrors `LeadCaptureForm.tsx`) not re-scored here. |

**Total: 3 points.**

By the rubric's literal thresholds (`≥4` → Integration/Testcontainers,
`≥6` → E2E), a score of 3 would normally read "Unit tests sufficient."
However, the task brief for this workflow directs an explicit precedent
check rather than a mechanical rubric read, because the rubric's
"+2 new API endpoint" and "+1 cross-module service call" criteria were
written with the *typical* case in mind — a cross-module call that reaches
a **local Postgres table** through another module's service. Here, every
cross-module call this endpoint makes terminates in an **external HTTP
API** (Authentik's admin API, Directus's REST API), not local Postgres.
Testcontainers integration tests in this codebase (`test/setup-pg.ts`,
wired into the default `vitest.config.ts`) provision a real **Postgres**
container — there is no Testcontainers-managed Authentik or Directus in
this repo. A Testcontainers-tier test cannot exercise `RegistrationService`
any more faithfully than a well-constructed mocked-unit test can, because
the thing that would need to be "real" for an integration tier to add
value (Postgres) is precisely the one dependency `RegistrationService`
does not have.

**Confirmed by direct precedent, not assumption:** `AdminInvitesService`
(`apps/api/src/modules/admin-invites/admin-invites.service.ts`) has the
*exact same shape* — constructor-injected `DirectusClient`, `AuthentikClient`,
`DirectusUsersBridgeService`, and (there) `AuditEventsService`, zero direct
Drizzle/Postgres access, an Authentik create+setPassword+setUserGroups
sequence, and Directus row writes. Its test file,
`apps/api/test/admin-invites-service.spec.ts`, fully mocks all four
dependencies via `vi.fn()` typed fake objects (`FakeDirectus`,
`FakeAuthentik`, `FakeBridge`, `FakeAudit`) and is **not** in the
Testcontainers-backed default suite's dependency graph for DB access —
it runs as a standard `*.spec.ts` unit spec (matched by
`vitest.config.ts`'s `include: ['test/**/*.spec.ts', ...]`, which does spin
up the global Postgres container via `globalSetup`, but `AdminInvitesService`
itself never touches `db`/Drizzle, so the container is present but unused
by this particular spec — same situation `RegistrationService` will be in).
There is a **separate, narrower** `vitest.unit.config.ts` (explicit
whitelist: `test/leads-service.spec.ts`, `test/auth-logout-doc-coverage.spec.ts`)
used for specs that must run *without even a placeholder Postgres
container* for CI-speed reasons — that tier is orthogonal to this decision
and not required here (`registration-service.spec.ts` can run fine under
the default `vitest.config.ts`, same as `admin-invites-service.spec.ts`
already does).

This repo also has a genuinely distinct **integration** naming convention
(`*.integration.spec.ts`, e.g. `members-onboarding.integration.spec.ts`,
`checkin.integration.spec.ts`) — confirmed by reading both: they exercise
real Drizzle queries against the Testcontainers Postgres instance via
`inject('TEST_DATABASE_URL')`. `RegistrationService` has no Drizzle queries
to integration-test this way. **Conclusion: the mocked-unit tier is both
the required AND the sufficient testing tier for `RegistrationService`,
matching the `AdminInvitesService` precedent exactly.** No `*.integration.spec.ts`
file is planned or needed.

---

## Required Test Levels

- [x] **Unit** (mocked `AuthentikClient` / `DirectusUsersBridgeService` /
      `DirectusClient` / `InteractionsService`, `vi.fn()`-based, mirroring
      `admin-invites-service.spec.ts`) — required and sufficient.
- [ ] **Integration (Testcontainers)** — not required. `RegistrationService`
      has no direct Postgres/Drizzle access (confirmed by code read); the
      only stateful dependencies are external HTTP APIs (Authentik,
      Directus), neither of which is Testcontainers-managed in this repo.
      A Testcontainers Postgres container would sit unused by this spec,
      exactly as it does for `admin-invites-service.spec.ts` today.
- [ ] **E2E (Playwright)** — deferred, not required for this PR. A full
      sign-up→signed-in-session E2E flow needs a live local Authentik
      instance (per `AGENTS.md` §6.1 / `.claude/CLAUDE.md`'s infra
      pre-flight obligation, deferring this silently would be a workflow
      violation — but 02-impact-analysis.md already flagged this as a
      TestStrategist decision, not a mandate). Given the rubric score (3,
      below the `≥6` E2E threshold even before the external-API discount
      above) and that the security-critical properties (non-leaking
      response shape, orphan handling, weak-password rejection) are fully
      exercisable and more precisely assertable at the unit tier (E2E can
      only observe the final redirect, not the internal call sequence to
      Authentik/Directus/Interactions), E2E is explicitly deferred to a
      follow-up issue rather than shipped in this PR. **Deferral recorded
      as a named follow-up**: `ISS-USR-REG-001` resolution notes should
      reference a future E2E smoke test (candidate location:
      `apps/e2e/src/auth/sign-up.spec.ts`, sibling to
      `lead-form-within-fold.spec.ts`) once a QA-stack Authentik instance
      is reliably available to Playwright runs — this is consistent with
      how `docs/04-development/architecture/architecture.md` and this
      workflow's own artifacts describe QA infra maturity, and is not a
      silent gap: it is being named here per the deferral-tracking
      obligation.

---

## Unit Test Plan

| Target | Happy Path | Failure Paths |
|---|---|---|
| `RegistrationService.register()` — genuine new email | Creates Authentik user with derived username; sets submitted password; resolves + assigns `aiqadam-member` group; links/creates Directus row; patches `country`; mints recovery link; dispatches welcome email via `InteractionsService` with `consentBasis: 'operational_contract'` / `allowedChannels: ['email']` and the recovery URL embedded in the email text; resolves to `{ recoveryUrl: '/v1/auth/login' }` (the fixed, non-leaking literal, NOT the real Authentik URL). | — |
| `RegistrationService.register()` — duplicate email | — | `getUserByEmail` returns an existing user → `createUser` never called → resolves to the byte-identical `{ recoveryUrl: '/v1/auth/login' }` as the happy path (non-leak regression test). |
| `RegistrationService.register()` — orphaned-account rollback | — | `createUser` succeeds, `setPassword` throws → `disableUser` called with the correct pk; `BadRequestException('registration_failed')` thrown; `setUserGroups` / `ensureLinkedByEmail` / `interactions.dispatch` never called (no partial side effects beyond orphan+disable). |
| `RegistrationService.register()` — orphaned-account rollback, `disableUser` itself also fails | — | `setPassword` throws AND `disableUser` throws → still throws `BadRequestException('registration_failed')` (secondary failure does not mask/replace the primary error or crash the request); a `warn`-level log occurs. |
| `RegistrationService.register()` — Directus link failure is non-fatal | Registration still succeeds end-to-end in Authentik. | `ensureLinkedByEmail` resolves `null` → `directus.patch` never called, `interactions.dispatch` never called (no recipient) → method still resolves to `{ recoveryUrl: '/v1/auth/login' }` (must not fail over a best-effort post-Authentik-success step). |
| `RegistrationService.register()` — email dispatch failure is non-fatal | Registration still succeeds end-to-end. | `interactions.dispatch` rejects → method still resolves successfully (best-effort, `.catch()`-wrapped per the source). |
| `RegistrationService.deriveUsername()` (private, exercised black-box via `register()`) | Various email shapes (`Weird.Email+Tag@Example.com`, a symbols-only local-part) produce a `username` passed to `createUser` that is lowercase, matches `[a-z0-9.]+`, and is non-empty even in the degenerate case. | — (no failure path; `deriveUsername` cannot throw — worst case it falls back to `'user'`). |

**Mocking approach for `randomBytes`:** `admin-invites-service.spec.ts`'s own
`usernameFromEmail` tests do **not** mock `node:crypto` at all — that
function has no randomness. `RegistrationService.deriveUsername()` differs
by appending a `randomBytes(3).toString('hex')` suffix specifically for
self-registration's public-traffic collision concern (documented in the
service's own comment). No existing spec file in this repo mocks
`node:crypto`'s `randomBytes` for a similar purpose (confirmed: no
`vi.mock('node:crypto'` anywhere in `apps/api/test/`). Per this repo's
established practice of asserting **patterns instead of exact values**
whenever non-determinism is involved (e.g. `admin-invites-service.spec.ts`'s
own token-length/charset assertions: `expect(token).toMatch(/^[A-Za-z0-9_-]+$/)`),
the test plan asserts the `username` argument against a regex
(`/^[a-z0-9.]+$/` plus a `.startsWith(<expected-base>)` check where
applicable) rather than mocking `crypto`. This is simpler, avoids a new
mocking pattern with no precedent in this codebase, and still fully pins
the derivation contract (lowercase, restricted charset, non-empty,
correct base for the degenerate/empty-local-part case).

---

## Integration Test Plan

Not applicable — see "Required Test Levels" above. `RegistrationService`
has no direct database access; there is no Testcontainers-backed
integration tier this endpoint's business logic can meaningfully occupy
that the mocked-unit tier does not already cover equally well or better
(finer-grained call-sequence assertions on Authentik/Directus/Interactions
calls, which a real Postgres container would not add fidelity to).

| Scenario | Infrastructure | Key Assertions |
|---|---|---|
| N/A | N/A | N/A |

---

## E2E Test Plan

Deferred to a follow-up issue (see "Required Test Levels" above for the
named deferral and candidate location). Not shipped in this PR.

| User Flow | Entry Point | Exit Assertion |
|---|---|---|
| (deferred) Sign up → verify redirect → (out of band) receive welcome email → follow recovery link → land signed-in | `/auth/sign-up` | Deferred — candidate: `apps/e2e/src/auth/sign-up.spec.ts`, requires a live QA-stack Authentik instance reachable by Playwright. |

---

## Acceptance Criteria → Test Mapping

The issue file (`ISS-USR-REG-001.md`) has no explicit `AC-n` list (issue
predates formal AC numbering — scope was clarified via GitHub comment
instead). The following are the issue's three binding scope decisions plus
the security properties SecurityReviewer verified in `04-security-review.md`,
treated as this workflow's acceptance criteria.

| AC | Test Level | Test Description |
|---|---|---|
| AC-1: "Chapter" = country — registration writes the submitted country to the existing Directus `country` field, no new entity | Unit | Happy-path test asserts `directus.patch('/users/<id>', { country: input.country })` is called with the submitted country value. |
| AC-2: "Subscribed user" = full member — creates a real member account via Authentik, assigned to `aiqadam-member` | Unit | Happy-path test asserts `resolveGroupNames(['aiqadam-member'])` is called and `setUserGroups` is called with the resolved group pks. |
| AC-3: Custom AI-Qadam-branded UI, not a bare Authentik redirect (backend-observable half: the endpoint provisions the account itself rather than delegating to Authentik's hosted form) | Unit | Happy-path test asserts `createUser` + `setPassword` are both called with the submitted email/password — i.e. the account is provisioned by this endpoint directly, not merely redirected to Authentik's generic sign-up. (Frontend half — the actual branded page — is covered by existing `astro build`/typecheck per 03-code-summary.md; no new frontend test is in scope per the task brief, which is backend-service-focused.) |
| AC-4 (security, SecurityReviewer MAJOR-1): honeypot / duplicate-email / genuine-success all produce a byte-identical `Location`/response shape — no email-enumeration oracle | Unit | Duplicate-email test asserts the resolved value is byte-identical (`{ recoveryUrl: '/v1/auth/login' }`) to the happy-path result — this **is** the non-leak regression test named in Step 6's constraint. (Honeypot itself is a controller-level short-circuit before `RegistrationService` is invoked at all, per 03-code-summary.md Design Decision #1 — out of this service-level spec's direct scope, already covered by the controller mirroring `leads.controller.ts`'s pattern; not re-tested here since `RegistrationService.register()` is never called on that path.) |
| AC-5 (security, orphaned-account handling): `createUser` succeeds + `setPassword` fails → orphan is disabled, structured log emitted, caller gets a generic failure, no partial side effects | Unit | Orphaned-account rollback test + the "disableUser also fails" variant. |
| AC-6 (security, weak-password rejection): public endpoint enforces more than length-only (`passwordField()` in `apps/api/src/lib/password-schema.ts`) | Out of `RegistrationService`'s scope | `passwordField()`/`isWeakPassword()` live in `apps/api/src/lib/password-schema.ts`, consumed at the Zod-schema boundary in `auth.controller.ts`, **before** `RegistrationService` is ever invoked — `RegistrationService` itself has no password-strength logic to test (it receives an already-validated `password: string`). This AC is structurally a controller/schema-boundary concern, not a `RegistrationService` unit-test concern; `password-schema.ts`'s pure predicates (`isAllOneCharacter`, `isCommonPassword`, `isWeakPassword`) are directly unit-testable in isolation but were not written with tests in this pass per the task brief's explicit file/scope (`registration-service.spec.ts` only). **Flagged as a known gap below**, not silently dropped. |
| AC-7 (security, rate limiting): `ThrottlerGuard` + `@Throttle({ default: { limit: 5, ttl: 900_000 } })` on the controller | Out of `RegistrationService`'s scope | Rate limiting is a controller-decorator concern (`auth.controller.ts`), not something `RegistrationService.register()` itself implements or can meaningfully unit-test — `RegistrationService` has no knowledge of request volume/IP. Verified by SecurityReviewer via direct code read (INV-6, `04-security-review.md`); not re-verified here since it is not this spec file's target class. **Flagged as a known gap below** — a controller-level throttle-guard test is a candidate for a future `auth.controller.spec.ts` addition, not in scope for this workflow's task brief. |
| **Regression test (issue-resolution Step 6 mandatory constraint)** | Unit | The happy-path test doubles as this workflow's required regression test: before this PR, `POST /v1/auth/register` did not exist (any request 404'd) — so this test, exercising `RegistrationService.register()`'s full successful provisioning sequence AND asserting the resolved value is the fixed literal `{ recoveryUrl: '/v1/auth/login' }` (not the real Authentik URL, which was the original MAJOR-1 vulnerability this same code path had before the security retry pass), is explicitly the test that (1) would have failed/not-existed before the fix and (2) passes after. |

---

## Known Test Gaps (carried into 06-test-design.md)

1. `apps/api/src/lib/password-schema.ts`'s pure predicates
   (`isAllOneCharacter`, `isCommonPassword`, `isWeakPassword`,
   `passwordField`) have no dedicated spec file yet. Not in scope for this
   workflow's task brief (`registration-service.spec.ts` only), but flagged
   as a real coverage gap for AC-6 — recommend a follow-up
   `test/password-schema.spec.ts` mirroring `test/email-schema.spec.ts`'s
   existing structure (confirmed `email-schema.spec.ts` already exists as
   the direct sibling pattern).
2. `ThrottlerGuard` + `@Throttle` wiring on `auth.controller.ts`'s
   `register()` handler (AC-7) has no dedicated test. `observe-throttler-guard.spec.ts`
   already exists in this repo as a generic throttler-guard test — a
   follow-up could add a registration-specific case there, or a new
   `auth-controller-register.spec.ts` mirroring `auth-controller-refresh.spec.ts`/
   `auth-controller-signout.spec.ts`'s existing controller-spec pattern.
3. E2E sign-up flow deferred — see "Required Test Levels" above.
4. Frontend `SignUpForm.tsx`'s `validate()` pure function (extracted
   specifically for testability per 03-code-summary.md) has no dedicated
   spec yet — out of scope for this backend-service-focused task brief;
   `LeadCaptureForm.test.ts` is the direct pattern to mirror in a future pass.

None of these gaps block this workflow's Step 6/7 gate: the task brief
scoped this pass to `RegistrationService` specifically, and the mandatory
issue-resolution regression-test constraint is satisfied by the unit plan
above.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "RegistrationService scores 3 on the raw rubric (new API endpoint +2, cross-module service call +1), below the mechanical 4-point Testcontainers threshold — but the more important finding is a precedent-based one: every cross-module call this service makes terminates in an external HTTP API (Authentik, Directus, Interactions-via-Directus), not local Postgres, and RegistrationService has zero direct Drizzle/DB access (confirmed by code read). This exactly matches AdminInvitesService's shape and its established testing precedent (admin-invites-service.spec.ts: fully mocked AuthentikClient/DirectusClient/DirectusUsersBridgeService/AuditEventsService via vi.fn(), no Testcontainers). Confirmed no separate Testcontainers-only integration config exists for this class of test (vitest.config.ts's single Postgres-backed globalSetup covers the whole default suite; vitest.unit.config.ts is an unrelated, narrower CI-speed whitelist; the *.integration.spec.ts naming convention is reserved for specs with real Drizzle queries, which RegistrationService has none of). Conclusion: mocked-unit tier is both required and sufficient. E2E explicitly deferred with a named follow-up location (apps/e2e/src/auth/sign-up.spec.ts) pending live QA Authentik availability, not silently dropped. All 7 identified ACs (3 scope decisions + 4 security properties) mapped to specific planned tests; 2 security ACs (weak-password rejection, rate limiting) are structurally outside RegistrationService's own responsibility (controller/schema-boundary concerns) and are flagged as named known gaps with concrete follow-up file recommendations rather than silently mapped to a test that wouldn't actually exercise them. The happy-path test is explicitly framed as this workflow's issue-resolution Step 6 mandatory regression test."
  findings:
    - "Rubric score 3/mechanical-4-threshold, but precedent-based reasoning (matching AdminInvitesService's established mocked-unit testing pattern) is the deciding factor, not the raw score alone, since the rubric's 'cross-module service call' criterion assumes a local-DB-reaching call by default and this service's cross-module calls all terminate in external HTTP APIs with no Testcontainers equivalent in this repo."
    - "Confirmed zero direct Postgres/Drizzle access in registration.service.ts by full file read — no integration tier applies."
    - "Regression-test constraint (issue-resolution Step 6) satisfied by the happy-path unit test, which also pins the fixed (non-leaking) recoveryUrl behavior from the security retry pass."
    - "2 known test gaps flagged with concrete follow-up recommendations (password-schema.ts predicates, throttler-guard wiring) rather than silently omitted."
    - "E2E deferred with a named candidate file and blocking dependency (live QA Authentik), consistent with AGENTS.md §6.1's deferral-tracking obligation."
```
