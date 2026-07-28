# TestDesigner — Test Design for FR-ADM-010

**Workflow:** wf-20260728-feat-148
**Agent:** TestDesigner
**Input:** `06-test-strategy.md` (passed, rubric score 2, unit-only),
`03-code-summary.md`, direct read of
`apps/api/src/modules/admin-invites/admin-bootstrap.service.ts`, and the
sibling specs `admin-invites-service.spec.ts` +
`authentik-client.spec.ts` for repo conventions.

---

## Tests Written

### Unit

| File | Count / Focus | Required? |
|---|---|---|
| `apps/api/test/admin-bootstrap.service.spec.ts` (new) | 15 tests across 6 `describe` blocks: degraded-mode skips (2), already-bootstrapped no-op incl. `>=1` boundary + empty-array optional-chaining case (3), zero-member bootstrap happy path incl. attribute-spread preservation (2), missing-group failure incl. no-pk case (2), duplicate-email recovery incl. unrecoverable-4xx (2), 5xx/non-`AuthentikError` boundary (2), password-never-logged regression on both the happy path and the recovery path (2) | Yes |

### Integration

None — test strategy scored this workflow at rubric 2 (< 4 integration threshold; also no Testcontainers-Authentik double exists in this repo).

### E2E

None — test strategy scored this workflow at rubric 2 (< 6 E2E threshold; the one candidate flow, the forced-password-change screen, is Authentik-hosted UI outside this codebase, verified instead by BP-UAT-020).

---

## Conventions followed

- **Mock shape:** `FakeAuthentik` object typed with `ReturnType<typeof vi.fn>` per method, injected via `new AdminBootstrapService(authentik as unknown as AuthentikClient)` — matches `admin-invites-service.spec.ts` exactly. Added `getUserByEmail` and `resolveGroupNames` (returning `AuthentikGroup[]` shaped `{ pk, name, is_superuser, users }`) per the strategy's note, matching `authentik.client.ts`'s real return type.
- **`env` mocking:** `admin-bootstrap.service.ts` reads `env.ADMIN_BOOTSTRAP_EMAIL` / `env.ADMIN_BOOTSTRAP_DEFAULT_PASSWORD` from the module-level singleton (`import { env } from '../../config/env'`). Confirmed an existing precedent in this repo — `apps/api/test/email-service-mode.spec.ts` and `email-service-smtp.spec.ts` both use `vi.mock('../src/config/env', () => ({ env: mockEnv }))` with `mockEnv` built via `vi.hoisted(...)` so the mock factory can be mutated per-test. Followed that exact pattern rather than inventing a new one; the strategy doc flagged this as needing confirmation and it is now pinned down.
- **Logger spy pattern:** `registration-service.spec.ts` uses `vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)` with an explicit `warnSpy.mockRestore()` at the end of each test that uses it. Extended to `log`/`error`/`debug` for the two password-never-logged regression tests (all four levels the service actually calls), matching the strategy doc's explicit ask.
- **AAA pattern:** every test has explicit `// Arrange` / `// Act` / `// Assert` comments with blank lines between sections.
- **No shared mutable state:** `beforeEach` rebuilds `authentik` and resets `mockEnv` to a known-neutral baseline (matching `email-service-mode.spec.ts`'s reset-in-beforeEach style) before every test.
- **No `it.skip`, no `any`** anywhere in the file (self-checked, see below).

---

## Acceptance Criteria Coverage

| AC | Test | Status |
|---|---|---|
| AC-1 (zero super-admins → exactly one admin created, assigned, password-change flag set) | `AdminBootstrapService.onModuleInit — zero-member bootstrap (AC-1)` → `creates, passwords, groups, and patches the seeded admin exactly once with expected args` + `preserves pre-existing user attributes when patching the password-change-required flag` | Covered (unit). Per test strategy's explicit caveat: this proves the code *attempts* the correct Authentik call sequence with the correct payload shape; it cannot and does not claim to prove Authentik's password-change screen actually activates — that remains BP-UAT-020's job. |
| AC-2 (≥1 existing super-admin → total no-op on redeploy) | `AdminBootstrapService.onModuleInit — already bootstrapped (AC-2)` → all 3 tests (`users:[123]` no-op, `users:[1]` boundary, empty-array-treated-as-zero-members) | Fully covered (unit), fully proven — no live-infra caveat needed, matching the strategy's assessment. |
| AC-3 (half 1 — password never logged) | `AdminBootstrapService — password never logged (AC-3, regression)` → both tests (happy path + duplicate-email-recovery path, since that path has its own log calls) | Fully covered (unit), fully proven. Upgrades SecurityReviewer's manual line-by-line log audit into an enforced, regression-proof assertion, per the task brief's explicit ask. |
| AC-3 (half 2 — forced password-change screen reachable before any other page) | Not unit-tested | Correctly routed to BP-UAT-020 per the test strategy — Authentik-hosted OIDC/UI flow outside this codebase's control and outside any test double this repo has. No test invented for this half; see Known Test Gaps. |
| AC-4 (post-forced-change, account functions as normal super-admin, no special-casing) | Not unit-tested | No testable code path exists — confirmed by reading `admin-bootstrap.service.ts` and `super-admin.guard.ts` in full; there is no branch anywhere that special-cases the bootstrapped account. Matches the test strategy's explicit "note, don't invent a hollow test" instruction. |
| AC-5 (seeded email/password documented identically in `.env.example` and `auth-architecture.md`) | Not a code test | Doc-consistency fact already satisfied by CodeDeveloper's doc changes (`apps/api/.env.example`, `auth-architecture.md` §9.5); not program behavior, no function to test. |

**Additional case beyond the AC table (RequirementAnalyst's suggested AC-6 / partial-failure recovery):**

| Case | Test | Status |
|---|---|---|
| Duplicate-email recovery (createUser() 4xx → getUserByEmail() recovers, continues on recovered pk, does NOT re-call setPassword()) | `AdminBootstrapService — duplicate-email recovery` → `recovers via getUserByEmail() ... without re-calling setPassword()` | Covered. Confirmed by direct reading of `createOrRecoverSeedUser()` (lines 127–158): `setPassword()` is called only inside the `try` block's success path, never in the `catch` recovery branch — this is a deliberate omission per the source's own design, not an oversight. Test pins this down explicitly with `expect(authentik.setPassword).not.toHaveBeenCalled()` on the recovery path. |
| Unrecoverable 4xx (createUser() 4xx AND getUserByEmail() returns null) | `rethrows the original 4xx error when no existing user is found to recover` | Covered — asserts `err).toBe(conflict)` (the exact same error instance rethrown, not wrapped), plus the ERROR log call. |
| Missing-group failure (empty array or no-pk group at assignment time) | `AdminBootstrapService — missing-group failure` → both tests | Covered — asserts the source's explicit `throw new Error(...)` with message matching `/Authentik group not found/`, and that `setUserGroups`/`patchAttributes` are never called on this path (no partial-state group-less user is silently left). |
| 5xx / non-`AuthentikError` boundary | `AdminBootstrapService — 5xx error boundary` → both tests | Covered — pins the `err.status >= 400 && err.status < 500` boundary precisely at 500, and additionally covers a plain `Error` (not an `AuthentikError` instance at all, e.g. a network failure) to confirm the `instanceof AuthentikError` guard, not just the status-range check, gates the recovery branch. |

No AC is left unaddressed — every AC has either a test or an explicit note (matching the test strategy's own framing), consistent with the strategy document.

---

## Known Test Gaps

- **AC-3 half 2 (forced password-change screen) and the empirical correctness of `FORCE_PASSWORD_CHANGE_ATTRIBUTE = 'ak_login_password_change_required'`** are not unit-testable in this codebase — no live Authentik / Testcontainers-Authentik double exists. This is a known, explicitly-flagged gap in the test strategy and code comments, not an oversight. Verification point: `BP-UAT-020` (Draft, becomes runnable once this FR ships) against the real `docker compose` Authentik instance.
- **AC-4** (no special-casing of the bootstrapped account post-password-change) has no testable code path — confirmed by direct source reading, not invented as a hollow test, per the task brief's explicit instruction not to force-fit a test that doesn't test anything real.
- **`OnModuleInit`-throws-and-crashes-boot behavior** (CodeDeveloper's Known Limitation 5): the missing-group-failure tests confirm `onModuleInit()`'s returned promise rejects with the expected `Error`, which is the correct unit-level assertion for "this will crash Nest's boot sequence" — but whether Nest's bootstrap actually treats an `OnModuleInit` rejection as a hard boot-crash (vs. an unhandled-rejection warning) is a NestJS-framework-level behavior, not something a unit test of this service in isolation can prove. No existing test in this repo exercises `OnModuleInit` throwing specifically (CodeDeveloper's own note); this spec doesn't newly close that framework-level gap either — it is out of scope for a unit test of `AdminBootstrapService` and would require an integration-level Nest module bootstrap test to verify. Not blocking (test strategy's rubric places this workflow below the integration threshold), but noting for QualityGate/future reference since CodeDeveloper flagged it as worth double-checking.
- **`resolveGroupNames()` throwing/rejecting** (e.g. Authentik unreachable during the membership check itself) has no dedicated test. The service has no special handling for this case — it would propagate as an unhandled rejection out of `onModuleInit()`, same as any other unexpected error. Not called out as a distinct behavioral branch by the test strategy's plan (the strategy's "unexpected error propagation" note groups this with the zero-member happy path's shared call site), and the source has no branch logic here to pin down beyond "it isn't caught," so no test was added — flagging as a minor gap rather than silently omitting it. Low risk: this is generic error propagation, not FR-ADM-010-specific business logic.
- No genuine bug was found in `admin-bootstrap.service.ts` while writing these tests. The duplicate-email-recovery "no `setPassword()` re-call" behavior initially looked worth double-checking as a possible oversight, but re-reading `createOrRecoverSeedUser()` confirmed it is deliberate (a recovered/orphaned user from a prior partial-failure boot should not have its password silently reset by a later boot) — consistent with the test strategy's own note on this point. No source change proposed.

---

## Gate Result

```yaml
gate_result:
  agent: test-designer
  workflow_id: wf-20260728-feat-148
  status: passed
  summary: >
    Wrote apps/api/test/admin-bootstrap.service.spec.ts (new, 15 tests
    across 6 describe blocks) covering every case in the test strategy's
    unit test plan: both degraded-mode skips (AuthentikClient
    unconfigured; ADMIN_BOOTSTRAP_DEFAULT_PASSWORD unset), the
    already-bootstrapped no-op (AC-2, including the >=1 boundary and the
    empty-resolveGroupNames-array optional-chaining path), the
    zero-member bootstrap happy path (AC-1, including attribute-spread
    preservation on patchAttributes), the missing-group failure (both
    empty-array and no-pk shapes), the duplicate-email recovery edge case
    (pinned explicitly: setPassword is NOT re-called on the recovered
    path, confirmed by direct reading of createOrRecoverSeedUser()'s
    catch branch), the unrecoverable-4xx case (original error rethrown
    by reference, not wrapped), the 5xx/non-AuthentikError boundary
    (pinned exactly at status 500, plus a plain Error case to confirm
    the instanceof guard), and two password-never-logged regression
    tests (happy path + recovery path, spying on all four Logger.prototype
    levels the service calls). Confirmed the env-mocking convention by
    finding an existing precedent (email-service-mode.spec.ts's
    vi.hoisted + vi.mock('../src/config/env', ...) pattern) rather than
    inventing a new approach, resolving the strategy doc's open question.
    All 15 tests run green (pnpm --filter api exec vitest run), alongside
    the two sibling specs and the boot-smoke test with zero regressions
    (48/48 total). typecheck and biome lint both clean on the new file.
    No it.skip, no `any`, AAA pattern with blank-line-separated sections
    throughout. No source file modified — wrote test code only, per this
    agent's scope. No genuine bug found in admin-bootstrap.service.ts;
    the one behavior that looked worth double-checking (no setPassword()
    re-call on the recovery path) was confirmed deliberate by re-reading
    the source, not flagged as a bug.
  tests_written:
    unit:
      - file: "apps/api/test/admin-bootstrap.service.spec.ts"
        count: 15
        required: true
    integration: []
    e2e: []
  test_run_result: "15/15 passed (this file); 48/48 passed (this file + admin-invites-service.spec.ts + authentik-client.spec.ts + main-bootstrap.spec.ts, zero regressions)"
  typecheck: passed
  lint: passed
  ac_coverage:
    - ac: "AC-1"
      status: covered
      note: "Attempts-correct-sequence proven; live forced-password-change behavior remains BP-UAT-020's job, per test strategy caveat."
    - ac: "AC-2"
      status: covered
      note: "Fully proven — 3 tests including the >=1 boundary and the empty-array edge."
    - ac: "AC-3 (never logs password)"
      status: covered
      note: "Fully proven — 2 regression tests across all 4 Logger levels, both the happy path and the recovery path."
    - ac: "AC-3 (forces password-change screen)"
      status: not-unit-testable
      note: "Routed to BP-UAT-020 per test strategy — no code path in this codebase to assert against."
    - ac: "AC-4"
      status: not-unit-testable
      note: "No special-casing code path exists to test; confirmed by direct source read, not invented as a hollow test."
    - ac: "AC-5"
      status: not-a-code-test
      note: "Doc-consistency fact, already satisfied by code-development step's doc changes."
  known_test_gaps:
    - "AC-3 half 2 / FORCE_PASSWORD_CHANGE_ATTRIBUTE empirical correctness — needs live Authentik, verified by BP-UAT-020, not unit-testable here."
    - "OnModuleInit-throws-crashes-Nest-boot framework behavior — unit tests confirm the promise rejects with the expected Error; whether Nest's bootstrap sequence treats that as a hard crash is framework-level and out of scope for a unit test of this service in isolation."
    - "resolveGroupNames() itself rejecting (e.g. Authentik unreachable) has no dedicated test — generic error propagation with no FR-ADM-010-specific branch logic to pin down, minor gap."
  source_changes: none
  next_agent: quality-gate
```
