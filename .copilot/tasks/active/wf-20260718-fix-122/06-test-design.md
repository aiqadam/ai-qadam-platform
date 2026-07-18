# Step 7 — Test Design: ISS-USR-REG-001

> Output for: `.copilot/tasks/active/wf-20260718-fix-122/06-test-design.md`
> Agent: TestDesigner
> Workflow: wf-20260718-fix-122 (issue-resolution)

---

## Tests Written

### Unit

| File | Count / Focus | Required? |
|---|---|---|
| `apps/api/test/registration-service.spec.ts` | 8 tests across 6 `describe` blocks: (1) happy path — full provisioning sequence + fixed `recoveryUrl` literal (the mandatory issue-resolution regression test, also guards SecurityReviewer's MAJOR-1 fix); (2) duplicate email — non-leak, byte-identical result, zero account-creation side effects; (3) orphaned-account rollback — `disableUser` called, `BadRequestException('registration_failed')` thrown, no further side effects; (4) orphaned-account rollback when `disableUser` itself also fails — still throws the correct generic error, warning logged; (5) Directus link failure is non-fatal — registration still resolves successfully with no patch/email; (6) email dispatch failure is non-fatal — registration still resolves successfully; (7)+(8) `deriveUsername` exercised black-box via `register()` for a mixed-case/plus-tag email and a symbols-only degenerate email, asserted against a `[a-z0-9.]+` pattern rather than mocking `crypto.randomBytes` (no precedent in this codebase for mocking `node:crypto`; pattern-based assertion matches `admin-invites-service.spec.ts`'s own token-charset-assertion style). | Yes |

### Integration

None written. Per `06-test-strategy.md`'s rubric analysis, `RegistrationService` has zero direct Postgres/Drizzle access — every cross-module call terminates in an external HTTP API (Authentik, Directus), none of which is Testcontainers-managed in this repo. This exactly matches the established `AdminInvitesService`/`admin-invites-service.spec.ts` precedent (fully mocked, no Testcontainers). No integration tier applies.

### E2E

None written. Deferred per `06-test-strategy.md` — candidate location `apps/e2e/src/auth/sign-up.spec.ts`, blocked on a live QA-stack Authentik instance being reliably reachable by Playwright. Named as a follow-up, not silently dropped.

---

## Test Run Result (actual, not claimed)

Ran three separate verification passes:

1. **Target spec only, default config** (the config this spec actually
   belongs in, matching `admin-invites-service.spec.ts`'s precedent —
   confirmed that file is likewise absent from `vitest.unit.config.ts`'s
   whitelist and runs under the default `vitest.config.ts`):
   ```
   cd apps/api && npx vitest run test/registration-service.spec.ts --config vitest.config.ts
   ```
   **Result: Test Files 1 passed (1) / Tests 8 passed (8).**

2. **Sanity-checked the task brief's suggested `vitest.unit.config.ts`
   route** (per the brief's instruction to check first rather than
   assume): ran the same file against `vitest.unit.config.ts` **without**
   adding it to that config's whitelist array.
   ```
   cd apps/api && npx vitest run test/registration-service.spec.ts --config vitest.unit.config.ts
   ```
   **Result: "No test files found, exiting with code 1"** — confirms
   `vitest.unit.config.ts` is an explicit, narrow whitelist
   (`test/leads-service.spec.ts`, `test/auth-logout-doc-coverage.spec.ts`
   only) unrelated to this spec's tier, exactly as `06-test-strategy.md`
   concluded. **Deliberately did NOT add `registration-service.spec.ts` to
   that whitelist** — doing so would deviate from the established
   convention, since the direct precedent this spec mirrors
   (`admin-invites-service.spec.ts`) is not in that whitelist either and
   runs correctly under the default `vitest.config.ts` (verified in run 1
   above). Adding an unnecessary entry to a config explicitly documented
   as "Minimal vitest config for running pure unit tests that do NOT need
   Postgres/Redis... Used by ISS-UAT-013-9 regression run" would be
   scope-creep against a config owned by a different, unrelated past
   workflow.

3. **Full API suite, default config** (regression check):
   ```
   cd apps/api && npx vitest run --config vitest.config.ts
   ```
   **Result: Test Files 99 passed (99) / Tests 1275 passed (1275)** — up
   from the code summary's last recorded baseline of 98 files / 1267
   tests, i.e. exactly +1 file / +8 tests, zero regressions, zero
   failures elsewhere.

4. **Lint + typecheck on the new file:**
   ```
   cd apps/api && npx biome check test/registration-service.spec.ts
   ```
   → `Checked 1 file in 4ms. No fixes applied.`
   ```
   cd apps/api && npx tsc --noEmit -p tsconfig.json
   ```
   → clean, no output (no errors).

---

## Acceptance Criteria Coverage

| AC | Test | Status |
|---|---|---|
| AC-1: country written to Directus `country` field | `register — happy path` — asserts `directus.patch('/users/directus-uuid-of-new-member', { country: 'kz' })` | Covered |
| AC-2: full member account, `aiqadam-member` group assigned | `register — happy path` — asserts `resolveGroupNames(['aiqadam-member'])` and `setUserGroups(pk, ['pk-aiqadam-member-0'])` | Covered |
| AC-3: endpoint provisions the account itself (not a bare Authentik redirect) | `register — happy path` — asserts `createUser` + `setPassword` both called with submitted email/password | Covered |
| AC-4 (security MAJOR-1): non-leaking response shape across all outcomes | `register — duplicate email (non-leak regression test)` — asserts byte-identical `{ recoveryUrl: '/v1/auth/login' }` result and zero `createUser` calls; `register — happy path` independently pins the same literal for the success branch | Covered (honeypot branch itself is a controller-level short-circuit before `RegistrationService.register()` is ever invoked — out of this spec's reachable surface by construction, consistent with `06-test-strategy.md`'s scoping) |
| AC-5 (security): orphaned-account handling — disable + generic error + no partial side effects | `register — orphaned-account rollback` (both tests) | Covered |
| AC-6 (security): weak-password rejection | Not covered by this spec — lives in `apps/api/src/lib/password-schema.ts`, consumed at the Zod boundary in `auth.controller.ts` before `RegistrationService` is ever invoked; `RegistrationService` receives an already-validated password with no strength logic of its own to test | Known gap (see below) |
| AC-7 (security): rate limiting | Not covered by this spec — `ThrottlerGuard`/`@Throttle` are controller decorators, not something `RegistrationService` implements or can observe | Known gap (see below) |
| **Regression test (issue-resolution Step 6 mandatory)** | `register — happy path` — before this PR `POST /v1/auth/register` (and `RegistrationService` itself) did not exist; this test exercises the full provisioning sequence AND explicitly pins the fixed non-leaking `recoveryUrl` literal that the original vulnerable version of this same code path did not return (it returned the real Authentik URL instead) | Covered — see the `describe` block's own doc comment in the spec file for the explicit framing |

---

## Known Test Gaps

Both gaps below were already identified and explicitly named in
`06-test-strategy.md`; neither blocks this step's gate since the task
brief scoped this pass to `registration-service.spec.ts` specifically.

1. **`apps/api/src/lib/password-schema.ts`** (`isAllOneCharacter`,
   `isCommonPassword`, `isWeakPassword`, `passwordField`) has no dedicated
   spec file. No `// TODO` was added to the source file itself (out of
   scope for this pass — the source file already carries its own header
   comment documenting the admin-invites scoping decision). Recommended
   follow-up: `apps/api/test/password-schema.spec.ts`, mirroring the
   existing `apps/api/test/email-schema.spec.ts`'s structure (confirmed
   that sibling file already exists as the direct pattern to copy).
2. **Rate-limiting wiring** (`ThrottlerGuard` + `@Throttle` on
   `auth.controller.ts`'s `register()` handler) has no dedicated test.
   Recommended follow-up: extend `apps/api/test/observe-throttler-guard.spec.ts`
   (already exists, generic) or add a `register()`-specific case to a new
   `auth-controller-register.spec.ts` mirroring the existing
   `auth-controller-refresh.spec.ts` / `auth-controller-signout.spec.ts`
   controller-spec pattern.
3. **E2E sign-up flow** — deferred, candidate `apps/e2e/src/auth/sign-up.spec.ts`,
   blocked on live QA Authentik availability to Playwright.
4. **Frontend `SignUpForm.tsx`'s `validate()`** — no dedicated spec yet;
   out of scope for this backend-service-focused task brief.
   `LeadCaptureForm.test.ts` is the pattern to mirror in a future pass.

No `it.skip` was used anywhere in `registration-service.spec.ts`. No `any`
was introduced (all mock objects are explicitly typed `Fake*` interfaces
with `ReturnType<typeof vi.fn()>` members, matching
`admin-invites-service.spec.ts`'s exact convention; the two places a cast
was needed — passing `Fake*` objects into constructor parameters expecting
the real client types, and reading `.mock.calls[0]?.[0]` — use
`as unknown as <RealType>` / a narrow inline object-shape cast, the same
pattern `admin-invites-service.spec.ts` itself uses throughout).

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Wrote apps/api/test/registration-service.spec.ts (8 tests, 6 describe blocks) covering RegistrationService's full behavior surface per 06-test-strategy.md's unit test plan: happy path (also the mandatory issue-resolution regression test and the direct guard for SecurityReviewer's MAJOR-1 Location-header fix), duplicate-email non-leak, orphaned-account rollback (including the disableUser-also-fails variant), Directus-link-failure-is-non-fatal, email-dispatch-failure-is-non-fatal, and deriveUsername's username-shape contract exercised black-box through two email-shape variants. Mirrors admin-invites-service.spec.ts's exact typed-vi.fn()-mock structure. Verified vitest.unit.config.ts is an unrelated narrow whitelist (confirmed empirically: the spec produces 'No test files found' against it without a whitelist edit) and deliberately did NOT add an entry there, since the direct precedent (admin-invites-service.spec.ts) isn't in that whitelist either and the spec runs correctly under the default vitest.config.ts — matching established convention rather than the task brief's tentative suggestion. Actual run results (not claimed): target spec alone 1 file/8 tests passed; full apps/api suite 99 files/1275 tests passed (up from the pre-existing 98/1267 baseline by exactly +1 file/+8 tests, zero regressions); biome check clean; tsc --noEmit clean. Two known, previously-flagged gaps (password-schema.ts predicates, throttler-guard wiring) remain out of scope for this pass per the task brief and are documented with concrete follow-up file recommendations, not silently dropped."
  findings:
    - "Regression test explicitly framed: register() did not exist before this PR (any request 404'd), and the happy-path test additionally pins the specific security-fixed behavior (recoveryUrl is always the '/v1/auth/login' literal, never the real Authentik URL) that a naive re-implementation could regress."
    - "Confirmed empirically, not assumed, that vitest.unit.config.ts's include array is an explicit whitelist unrelated to this spec's tier — ran the spec against it before making any config changes and got 'No test files found'; left the whitelist untouched to match admin-invites-service.spec.ts's own precedent of running under the default Testcontainers-backed vitest.config.ts despite needing no Postgres access itself."
    - "randomBytes-involving deriveUsername tested via regex-pattern assertion on the createUser username argument, not by mocking node:crypto — confirmed no existing spec file in this repo mocks node:crypto, and admin-invites-service.spec.ts's own precedent for non-deterministic output (token generation) is pattern/length assertion, not exact-value mocking."
    - "Full apps/api suite re-run after adding the new spec: 99 files / 1275 tests, all passing, exactly +1 file/+8 tests over the pre-existing 98/1267 baseline recorded in 03-code-summary.md — zero regressions introduced."
  known_limitations:
    - "password-schema.ts (weak-password predicates) has no dedicated spec — recommended follow-up: apps/api/test/password-schema.spec.ts mirroring email-schema.spec.ts."
    - "Rate-limiting (ThrottlerGuard/@Throttle on register()) has no dedicated test — recommended follow-up: extend observe-throttler-guard.spec.ts or add auth-controller-register.spec.ts mirroring auth-controller-refresh.spec.ts."
    - "E2E sign-up flow deferred to apps/e2e/src/auth/sign-up.spec.ts pending live QA Authentik availability."
    - "SignUpForm.tsx's validate() has no dedicated frontend spec yet — out of scope for this backend-focused pass."
```
