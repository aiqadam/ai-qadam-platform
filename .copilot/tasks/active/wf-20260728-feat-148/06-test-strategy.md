# TestStrategist — Test Strategy for FR-ADM-010

**Workflow:** wf-20260728-feat-148
**Agent:** TestStrategist
**Input:** `01-requirement-validation.md` (passed), `02-impact-analysis.md`
(passed), `03-code-summary.md` (passed), `04-security-review.md` (passed,
zero findings), `docs/04-development/standards.md` §IV

---

## Requirement

**FEAT-ADM-010** — Platform admin bootstrap (no manual scripts). On every
API boot, `AdminBootstrapService` (`OnModuleInit`) checks
`aiqadam-super-admin` Authentik group membership via
`AuthentikClient.resolveGroupNames()`. If the group has zero members, it
creates exactly one seeded admin user (`ADMIN_BOOTSTRAP_EMAIL` /
`ADMIN_BOOTSTRAP_DEFAULT_PASSWORD`) directly in Authentik, assigns it to
`aiqadam-super-admin`, and attempts to force a password change on next
login via `patchAttributes()`. Idempotent once ≥1 super-admin exists. No
Postgres writes — the seeded identity lives only in Authentik (ADR-0021
§1). Public surface under test: `onModuleInit()`; private methods
`hasSuperAdminMember()`, `seedAdmin()`, `createOrRecoverSeedUser()` are
exercised indirectly through `onModuleInit()`'s branches, per standard
practice for testing a class's public behavior rather than reaching into
private methods directly.

---

## Rubric Score

Applying the Test Tier Decision Rubric from `.copilot/agents/test-strategist.md`
to the actual diff (not the impact analysis's prose summary — scored
independently against the rubric's criteria one at a time):

| Criterion | Points | Justification |
|---|---|---|
| Touches tenant-scoped data | **+0** | Independently confirmed (and cross-checked against SecurityReviewer's INV-1 finding): zero Drizzle imports, zero `db.`/`sql\`` usage, zero `countryCode` references in `admin-bootstrap.service.ts`. All data access is via `AuthentikClient`'s REST calls to Authentik's own API — a system with no tenant-scoped Postgres table. |
| New API endpoint | **+0** | Confirmed: `admin-invites.module.ts`'s `controllers` array is unchanged. `AdminBootstrapService` was added only to `providers`. No `@Controller`/`@Post`/`@Get` decorator anywhere in the new file. Zero new HTTP surface — `OnModuleInit` runs at boot, not per-request. |
| Business rule with edge cases (capacity, waitlist, dates) | **+2** | The idempotency/partial-failure recovery logic *is* a real business rule with a real edge case, matching the rubric's intent even though the example list (capacity/waitlist/dates) is domain-specific to events. The rule: "bootstrap exactly once, keyed on group-membership count rather than email existence, and recover cleanly from a createUser()-succeeded/setUserGroups()-failed partial state." This has genuine branching complexity (`hasSuperAdminMember()` true/false × `createUser()` success/4xx-recoverable/4xx-unrecoverable/5xx) that is exactly the shape of edge case this criterion exists to catch. Scoring it in. |
| Cross-module service call | **+0** (justified below, not +1) | `AdminBootstrapService` calls `AuthentikClient`, but `AuthentikClient` is not a *different module* being reached into — it's an existing provider already exported by `AuthentikModule` and already imported into `AdminInvitesModule`, and `AdminBootstrapService` itself lives inside `admin-invites`, the same module that already owned this dependency before this PR (per `AdminInvitesService`'s pre-existing constructor injection of the identical `AuthentikClient`). No new module-to-module edge was added — confirmed against the impact analysis's Cross-Module Calls table, which states explicitly "No new cross-module dependency edges." The rubric's cross-module criterion is aimed at catching *new* inter-module coupling that could hide integration bugs; this PR adds a new *consumer* of an already-present, already-tested dependency inside the same module boundary, not a new *edge*. Scoring 0, not 1 — if this were the first caller of `AuthentikClient` from a new module, +1 would apply. |
| New database query | **+0** | No DB access at all (see tenant-scoped-data row above — same evidence applies). |
| Pure function / utility | 0 (n/a, not the dominant shape) | The service is stateful (calls an external API, branches on live responses) — not a pure-function change, so this row doesn't apply as a 0-override; the +2 above stands. |
| UI-only change (no logic) | 0 (n/a) | Not a UI change. |

**Total score: 2.**

### Threshold check

- Score ≥ 4 → Integration tests (Testcontainers) required: **2 < 4, not triggered.**
- Score ≥ 6 → E2E test (Playwright) required: **2 < 6, not triggered.**
- Score < 4 → Unit tests sufficient: **2 < 4, this branch applies.**

**Verification against the impact analysis's conclusion:** the impact
analysis (`02-impact-analysis.md`, Test Scope section) independently
concluded "unit-only," reasoning from infrastructure availability (no
Testcontainers-Authentik double exists in this repo) rather than from
this rubric. Applying the rubric mechanically from the actual diff
produces the same unit-only conclusion, but for a **stronger and
independent** reason: even if a Testcontainers-Authentik double existed,
the score would still land at 2 — below the integration threshold — so
the correct tier is unit-only on the merits of the change's shape, not
merely because live-Authentik test infrastructure happens to be
unavailable. The two lines of reasoning agree; neither depends on the
other, which is a useful cross-check. (Note: even under a maximally
generous reading — scoring the cross-module call at +1 instead of +0 —
the total would be 3, still short of the integration threshold. The
tier conclusion is robust to that one judgment call either way.)

---

## Required Test Levels

- [x] **Unit** — required (rubric score 2; this is where all coverage for this workflow lives)
- [ ] **Integration (Testcontainers)** — not required (score < 4; also no Postgres/Drizzle access exists to test against)
- [ ] **E2E (Playwright)** — not required (score < 6; no new HTTP/UI surface; the one true end-to-end concern — forced-password-change screen — is Authentik-hosted UI outside this codebase's control, verified by BP-UAT-020 instead)

---

## Unit Test Plan

Target file: `apps/api/test/admin-bootstrap.service.spec.ts` (new). Follows
the `admin-invites-service.spec.ts` pattern exactly: a `FakeAuthentik`
object typed against `AuthentikClient`'s public surface, built with
`vi.fn()` per method, injected via `new AdminBootstrapService(authentik as
unknown as AuthentikClient)`. Extends the existing fake shape with
`getUserByEmail` (already present in the `admin-invites-service.spec.ts`
fake's sibling `authentik-client.spec.ts`) and `resolveGroupNames`
returning objects shaped `{ pk, name, is_superuser, users: number[] }`,
matching `authentik.client.ts`'s real return type.

Because `onModuleInit()` is the only public method, "one `describe` block
per function/class" (standards.md §Unit test rules) is interpreted as one
top-level `describe('AdminBootstrapService', ...)` with nested `describe`
blocks per *behavioral branch* of `onModuleInit()` — the natural unit of
test organization here, since the private methods have no independent
public entry point per standards.md's own guidance to test the public
interface, not internals (mirrors the Integration Tests rule "test the
public interface of a module, not internals," applied here at the
class level).

| Target | Happy Path | Failure Paths |
|---|---|---|
| `onModuleInit()` — degraded mode: `AuthentikClient` unconfigured | — | `authentik.isConfigured` returns `false` → `logger.warn` called with the config-missing message, `hasSuperAdminMember`/`createUser`/`setPassword`/`setUserGroups`/`patchAttributes` never called, method resolves without throwing (boot is not blocked). |
| `onModuleInit()` — degraded mode: `ADMIN_BOOTSTRAP_DEFAULT_PASSWORD` unset | — | `env.ADMIN_BOOTSTRAP_DEFAULT_PASSWORD` is `undefined` (test stubs `env` via `vi.mock`/module-level override, matching how other specs handle `env` — confirm exact mechanism against `apps/api/test` setup for `env` mocking; if no existing precedent, inject via a settable test double or `vi.spyOn` on the `env` module object) → `logger.warn` called with the password-missing message, no Authentik mutating call made, resolves without throwing. |
| `onModuleInit()` — already bootstrapped (AC-2) | `resolveGroupNames(['aiqadam-super-admin'])` resolves to `[{ ..., users: [123] }]` (≥1 member) → `hasSuperAdminMember()` returns `true`, `onModuleInit()` returns early. Assert `createUser`, `setPassword`, `setUserGroups`, `patchAttributes` are **all** `not.toHaveBeenCalled()` — the no-op must be total, not partial. | — (this branch has no failure mode of its own; a `resolveGroupNames()` rejection here is covered by the "unexpected error propagation" row below, since the same call site is shared with the zero-member happy path) |
| `onModuleInit()` — zero-member bootstrap (AC-1) | `resolveGroupNames()` resolves to `[{ pk: 'grp-1', users: [] }]` → `createUser()` resolves with a seeded user object → `setPassword()` called with that user's `pk` and the configured password → second `resolveGroupNames()` call (inside `seedAdmin()`) resolves the group pk → `setUserGroups(user.pk, [groupPk])` called once → `patchAttributes(user.pk, { ...attributes, ak_login_password_change_required: true })` called once, preserving any pre-existing attributes on the user object (spread is asserted, not just presence of the new key) → `logger.log` called once with email/pk/group (not password). Assert `createUser`, `setPassword`, `setUserGroups`, `patchAttributes` each called **exactly once**, with the expected fixed email/password/group arguments. | Covered by dedicated rows below (missing group; createUser 4xx recoverable/unrecoverable; unexpected 5xx). |
| `hasSuperAdminMember()` (via `onModuleInit()`'s branch selection) | `group.users.length ?? 0 >= 1` boundary: test `users: []` (0 → false/bootstrap runs) and `users: [1]` (1 → true/no-op) as the two sides of the `>=1` boundary. | `resolveGroupNames()` returns an empty array (`groups[0]` is `undefined`) → `group?.users.length ?? 0` evaluates to `0` → treated as zero-member (bootstrap runs). This exercises the `noUncheckedIndexedAccess`-driven optional-chaining path explicitly, not just the common case. |
| `seedAdmin()` — missing `aiqadam-super-admin` group at assignment time | — | First `resolveGroupNames()` call (in `hasSuperAdminMember()`) returns zero members so bootstrap proceeds, but the *second* `resolveGroupNames()` call (inside `seedAdmin()`, post-`createOrRecoverSeedUser()`) resolves to `[]` or a group with no `pk` → `seedAdmin()` throws `Error` matching `/Authentik group not found/`, `setUserGroups`/`patchAttributes` never called. Asserts the "throw loudly rather than leave the seeded user group-less and mark bootstrap attempted" contract from the code comment. |
| `createOrRecoverSeedUser()` — duplicate-email recovery (partial-failure edge, RequirementAnalyst's suggested AC-6) | `createUser()` rejects with `new AuthentikError(400, '/api/v3/core/users/', '{"email":["already taken"]}')` → `getUserByEmail(email)` resolves with an existing user → recovery succeeds, `seedAdmin()` continues to `setUserGroups`/`patchAttributes` on the **recovered** user's `pk` (not a newly-created one) → `logger.warn` called noting the recovery, `setPassword` is **not** re-called on the recovered path (matches the code: `setPassword` only happens inside the `createUser()` success branch, not the recovery branch — worth pinning explicitly since re-setting the password on a recovered user is a deliberate omission, not an oversight, per re-reading `createOrRecoverSeedUser()` lines 131–151). | `createUser()` rejects with a 4xx AND `getUserByEmail()` resolves `null` (no existing user found — truly unexpected state) → `logger.error` called, original `AuthentikError` rethrown (not swallowed), `onModuleInit()` overall rejects. |
| `createOrRecoverSeedUser()` — unexpected non-4xx error | `createUser()` rejects with `new AuthentikError(500, ...)` (or a plain 5xx-shaped error) → `logger.error` called with the failure message, error rethrown as-is (not wrapped/swallowed), `getUserByEmail()` is **not** called (the 4xx-only recovery branch must not trigger on 5xx) — asserts the `err.status >= 400 && err.status < 500` boundary precisely, including a case at exactly 500 to pin the boundary. |
| **Regression: password never logged (AC-3 first half)** | N/A — this is a failure-path/negative-assertion test by nature | Spy on `Logger.prototype.log`/`.warn`/`.error`/`.debug` (pattern already established in `registration-service.spec.ts`: `vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)` — extend to all four levels used by this service) for the full zero-member-bootstrap run (including the duplicate-email-recovery branch, since that path has its own log calls). After the run, assert **none** of the captured call arguments (across all four spies, all calls) contain the literal password string used in the test fixture (e.g. `expect(allLoggedStrings.some(s => s.includes(testPassword))).toBe(false)`), and additionally assert none of the calls contain the literal string `ADMIN_BOOTSTRAP_DEFAULT_PASSWORD` value key-name-adjacent leakage (defense in depth beyond SecurityReviewer's static line-by-line audit — this converts that manual finding into an enforced regression test, per the task brief's explicit ask). |

**Notes on test infrastructure specifics:**

- `env.ADMIN_BOOTSTRAP_EMAIL` / `env.ADMIN_BOOTSTRAP_DEFAULT_PASSWORD` are
  read directly from the imported `env` singleton inside
  `admin-bootstrap.service.ts` (`import { env } from '../../config/env'`),
  not injected via constructor — TestDesigner must confirm the actual
  mechanism this codebase uses to override `env` values in tests (check
  for an existing `vi.mock('../src/config/env', ...)` precedent elsewhere
  in `apps/api/test/` before inventing a new approach; if none exists,
  this is worth a short note back to TestDesigner rather than silently
  picking an approach, since `env` is a module-level singleton and the
  degraded-mode tests specifically depend on controlling its value).
- All fake-Authentik async methods should default to
  `mockResolvedValue(...)` in a shared `beforeEach`, with individual tests
  overriding via `mockResolvedValueOnce`/`mockRejectedValueOnce`, matching
  `admin-invites-service.spec.ts`'s established setup shape exactly.

---

## Integration Test Plan

**Not required — score 2 < 4.** No table entries. Rationale (restated
from the rubric section for completeness, not duplicated reasoning): zero
Postgres/Drizzle access exists in this flow to integration-test against,
and no Testcontainers-Authentik double exists in this repository (Authentik
is not the kind of service with a lightweight Testcontainers module the
way Postgres/Redis are — it normally runs via the full
`infrastructure/docker-compose.yml` stack). Even setting infrastructure
availability aside, the rubric score does not cross the integration
threshold on the merits of the change's shape alone (see Rubric Score
section above, including the robustness check under the maximally
generous cross-module scoring).

| Scenario | Infrastructure | Key Assertions |
|---|---|---|
| *(none — not in scope)* | — | — |

---

## E2E Test Plan

**Not required — score 2 < 6.** No table entries. The one flow that would
be the natural candidate for an E2E test — AC-3's forced-password-change
screen — is explicitly out of reach for a Playwright test against this
codebase's own markup: it is Authentik-hosted UI intercepting the OIDC
handshake before the browser reaches any `apps/web`/`apps/web-next` page,
so a Playwright spec would need to assert against Authentik's own login
flow templates, which this codebase does not control and does not ship.
That live verification is `BP-UAT-020`'s job (a business-process UAT
script run against the real `docker compose` Authentik instance), not
this workflow's automated Playwright suite.

| User Flow | Entry Point | Exit Assertion |
|---|---|---|
| *(none — not in scope; see BP-UAT-020 for the live-Authentik verification of this flow)* | — | — |

---

## Acceptance Criteria → Test Mapping

| AC | Test Level | Test Description |
|---|---|---|
| **AC-1** — zero super-admins → exactly one admin created, assigned to `aiqadam-super-admin`, password-change requirement set | Unit | "zero-member bootstrap" row above: `createUser` + `setPassword` + `setUserGroups` + `patchAttributes(...,{ak_login_password_change_required: true})` each called exactly once with expected args, from a `resolveGroupNames()` zero-members starting state. **Caveat carried from CodeDeveloper's Known Limitation 1 and SecurityReviewer's accepted-risk note:** this test proves the code *attempts* the correct sequence of Authentik API calls with the correct payload shape — it does **not** and cannot prove the `ak_login_password_change_required` attribute actually forces Authentik's password-change screen, since that requires a live Authentik instance. That empirical verification is BP-UAT-020's job, named explicitly in the code comment on `FORCE_PASSWORD_CHANGE_ATTRIBUTE`. This unit test is necessary but not sufficient for full AC-1 confidence — flagging so QualityGate doesn't read "AC-1: covered" as "AC-1: empirically verified end-to-end." |
| **AC-2** — ≥1 existing super-admin → bootstrap job is a total no-op on redeploy | Unit | "already bootstrapped" row above: `resolveGroupNames()` returns `users: [123]`, assert all four mutating Authentik methods (`createUser`, `setPassword`, `setUserGroups`, `patchAttributes`) are `not.toHaveBeenCalled()`. Fully unit-testable and fully proven by this test — no live-infra caveat needed here, unlike AC-1, since "no-op" is a property of this codebase's own logic, not of Authentik's downstream behavior. |
| **AC-3 (half 1 of 2)** — "the platform process never receives or logs the old or new password value at any point" | Unit | The dedicated "Regression: password never logged" row above — mocks `Logger.prototype.*`, runs the zero-member-bootstrap path (including the duplicate-email-recovery sub-path, which has its own log calls), asserts no captured log argument contains the test password value. This upgrades SecurityReviewer's manual line-by-line audit (04-security-review.md, "Additional independent check") into an enforced, regression-proof automated assertion — exactly the value-add the task brief called for. Fully unit-testable; this half of AC-3 is genuinely provable in this codebase without live infra, since it's a property of what this process does with a string it holds, not of Authentik's behavior. |
| **AC-3 (half 2 of 2)** — "a password-change screen is forced before any other page is reachable" | **Not unit-testable — mapped to BP-UAT-020** | This is live Authentik UI/OIDC-flow behavior entirely outside this codebase's control and outside any test double this repo has. No unit test can assert that Authentik's hosted login flow actually interjects a password-change prompt — the unit test above only proves this codebase *asked* Authentik to do so via the (unverified) `ak_login_password_change_required` attribute. Per the task brief's explicit instruction, **not** inventing a unit test that can't really prove this half — BP-UAT-020 (`docs/02-business-processes/uat/BP-UAT-020.md`, currently Draft/"not runnable today," expected to become runnable once this FR ships) is the actual verification point, run against the real `docker compose` Authentik service. |
| **AC-4** — post-forced-change, account functions as normal super-admin with no special-casing | **Not meaningfully unit-testable — noted, no test invented** | Confirmed by reading `admin-bootstrap.service.ts` in full and independently re-confirming SecurityReviewer's INV-3 finding: there is no code path anywhere in this service (or in `super-admin.guard.ts`, which imports the now-shared `SUPER_ADMIN_GROUP` constant but has no other change) that special-cases the bootstrapped account after creation. `SuperAdminGuard` authorizes the seeded account through the exact same `AuthentikClient.getUserByEmail` + group-membership check as any other super-admin — this is the *absence* of a code path, not a code path with observable behavior a unit test could assert against. Writing a test here would either (a) duplicate `super-admin.guard.ts`'s own existing test coverage for "any super-admin is authorized," which is not specific to this FR and already exists independently of this change, or (b) assert a negative ("no special-casing exists") by grepping the source, which is not a meaningful runtime test. Not inventing a test that doesn't test anything real, per the task brief's explicit instruction. AC-4's own text acknowledges this is "verifiable once FR-ADM-011's screens exist, or in the interim via any existing super-admin-gated route" — i.e., it is itself framed as a manual/live-environment verification, not an automated-suite concern for this workflow. |
| **AC-5** — seeded email/password documented identically in `.env.example` and `auth-architecture.md` | **Not a code test — satisfied by doc changes already made, no test needed** | Confirmed directly: `apps/api/.env.example` documents `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_DEFAULT_PASSWORD` with a comment block matching the `AUTHENTIK_ADMIN_TOKEN` convention (blank secret value, no real password committed); `docs/04-development/architecture/auth-architecture.md` §9.5 documents the same two variable names/format. This is a documentation-consistency fact, not program behavior — there is no function whose correctness this would test. (If future drift between the two docs becomes a recurring problem, a lightweight doc-lint script comparing variable names mentioned in both files would be the appropriate tool, not a unit test of `AdminBootstrapService` — not proposing that here as it's outside this AC's ask and outside this workflow's scope.) |

**Summary:** 3 of 5 ACs (AC-1 partial/AC-2/AC-3-half-1) are unit-testable
and covered by the Unit Test Plan above. AC-3's other half is correctly
routed to BP-UAT-020, not a unit test. AC-4 has no testable code path to
target (noted, not invented). AC-5 is a doc fact, already satisfied,
not a code test. No AC is left unaddressed — every AC has either a test
or an explicit, reasoned note explaining why a test is not the right tool
for it.

---

## Gate Result

```yaml
gate_result:
  agent: test-strategist
  workflow_id: wf-20260728-feat-148
  status: passed
  summary: >
    Applied the Test Tier Decision Rubric directly to the diff (not
    merely trusting the impact analysis's unit-only conclusion) and
    independently arrived at the same tier: score 2 (tenant-scoped data
    +0, new API endpoint +0, business-rule-with-edge-case +2 for the
    idempotency/partial-failure recovery logic, cross-module service call
    +0 with explicit justification that AuthentikClient is an
    already-owned same-module dependency not a new inter-module edge,
    new database query +0) — below both the integration threshold (>=4)
    and the E2E threshold (>=6), confirming unit-only is correctly
    scoped on the rubric's own merits, independent of and in agreement
    with the impact analysis's infrastructure-availability reasoning.
    Verified the conclusion is robust even under the more generous +1
    cross-module scoring (total 3, still short of the integration
    threshold). Full unit test plan written against
    apps/api/test/admin-bootstrap.service.spec.ts (new), covering both
    degraded-mode skip paths, the already-bootstrapped no-op, the
    zero-member bootstrap happy path, the missing-group failure, the
    duplicate-email recovery edge case (RequirementAnalyst's suggested
    AC-6), the 4xx-vs-5xx error-handling boundary, and a dedicated
    password-never-logged regression test that upgrades SecurityReviewer's
    manual log audit into an enforced assertion. All 5 FR-ADM-010 ACs
    mapped: AC-1 (unit, with an explicit caveat that live
    forced-password-change behavior is unverifiable in a unit test and
    remains BP-UAT-020's job), AC-2 (unit, fully provable), AC-3 split
    into two halves per the task brief (never-logs-password half is
    unit-tested; forces-password-screen half is correctly routed to
    BP-UAT-020, not force-fit into a unit test that can't prove it),
    AC-4 (noted as having no testable code path — no special-casing
    exists to test — rather than inventing a hollow test), AC-5 (doc
    fact, already satisfied, not a code test). No ambiguous AC blocked
    mapping.
  rubric_score: 2
  rubric_breakdown:
    tenant_scoped_data: 0
    new_api_endpoint: 0
    business_rule_with_edge_case: 2
    cross_module_service_call: 0
    new_database_query: 0
  required_test_levels:
    unit: true
    integration_testcontainers: false
    e2e_playwright: false
  unit_test_target_file: "apps/api/test/admin-bootstrap.service.spec.ts"
  ac_coverage:
    - ac: "AC-1"
      test_level: unit
      fully_proven_by_automated_suite: false
      note: "Attempts-correct-sequence proven; live forced-password-change behavior is BP-UAT-020's job."
    - ac: "AC-2"
      test_level: unit
      fully_proven_by_automated_suite: true
    - ac: "AC-3 (never logs password)"
      test_level: unit
      fully_proven_by_automated_suite: true
    - ac: "AC-3 (forces password-change screen)"
      test_level: uat
      fully_proven_by_automated_suite: false
      note: "Routed to BP-UAT-020 — Authentik-hosted UI, no unit-testable code path in this codebase."
    - ac: "AC-4"
      test_level: none
      note: "No special-casing code path exists to test; noted rather than inventing a hollow test."
    - ac: "AC-5"
      test_level: none
      note: "Doc-consistency fact, already satisfied by code-development step's doc changes; not program behavior."
  next_agent: test-designer
```
