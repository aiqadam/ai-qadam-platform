# 07 — Test Design (ISS-ADM-010-1)

**Workflow:** wf-20260801-fix-190
**Issue:** GitHub #164 → `ISS-ADM-010-1`
**Step:** 7 of `issue-resolution`
**Date:** 2026-08-01
**Author:** TestDesigner

---

## Test designs produced (already authored by CodeDeveloper, verified by TestStrategist)

### Test 1 (assertion rewrite): "creates, passwords, groups, and patches the seeded admin exactly once with expected args"

**File:** `apps/api/test/admin-bootstrap.service.spec.ts`

**Setup:** default `beforeEach` — `authentik.resolveGroupNames()` resolves to a zero-member group; `mockEnv.ADMIN_BOOTSTRAP_DEFAULT_PASSWORD = TEST_PASSWORD`; `ADMIN_BOOTSTRAP_EMAIL = 'admin@aiqadam.org'`.

**Action:** `await svc.onModuleInit()`.

**Assertions (post-fix shape):**
1. `authentik.createUser` called once with `{ email: 'admin@aiqadam.org', username: 'admin', name: 'AI Qadam Platform Admin' }`.
2. `authentik.setPassword` called once with `(SEEDED_USER_PK, TEST_PASSWORD)`.
3. `authentik.setUserGroups` called once with `(SEEDED_USER_PK, [GROUP_PK])`.
4. **`authentik.setForcePasswordChangeNextLogin` called once with `(SEEDED_USER_PK, true)`** — this replaces the prior assertion on `authentik.patchAttributes` with `ak_login_password_change_required`.
5. Logger emits the success line matching `admin@aiqadam\.org.*777.*aiqadam-super-admin`.

**Regression coverage:** the test name once described "patches the seeded admin" — preserved to keep the diff scope minimal, but the assertion now points to the new mechanism. Anyone reading this test in the future will see the new mechanism, not the deprecated one.

### Test 2 (new): "does not patch the deprecated forced-password-change attribute"

**File:** `apps/api/test/admin-bootstrap.service.spec.ts`

**Setup:** override `authentik.createUser.mockResolvedValue` to return a user with pre-existing attributes (`{ recovery_email: 'preexisting@example.org' }`), ensuring the test would catch a regression even on the path where the new code spreads existing attributes.

**Action:** `await svc.onModuleInit()`.

**Assertion:** `authentik.patchAttributes` was NOT called with `(SEEDED_USER_PK, expect.objectContaining({ ak_login_password_change_required: expect.anything() }))`.

**Why this test exists (AGENTS.md §9 honesty discipline):** The original
implementation shipped with the misleading attribute-set call. A
well-meaning future contributor might "restore" it while refactoring,
thinking the comment block above the constant is authoritative. This
test fails immediately if that happens, surfacing the regression
during code review rather than during the next BP-UAT-020 run.

### Test 3 (assertion rewrite): duplicate-email recovery

**File:** `apps/api/test/admin-bootstrap.service.spec.ts`, "recovers via getUserByEmail() on a 4xx createUser() rejection and continues without re-calling setPassword()"

**Setup:** `createUser` rejected with `AuthentikError(400, '...', '{"email":["already taken"]}')`; `getUserByEmail` resolves to `{ pk: 555, attributes: { recovery_email: undefined } }`.

**Action:** `await svc.onModuleInit()`.

**Assertions (post-fix shape):**
1. `getUserByEmail` called with `'admin@aiqadam.org'`.
2. `setPassword` NOT called (the recovered user already exists).
3. `setUserGroups` called with `(555, [GROUP_PK])`.
4. **`setForcePasswordChangeNextLogin` called with `(555, true)`** — proves the protection is applied to the recovered user too. Replaces the prior assertion on `patchAttributes`.
5. Logger warns matching `/recovering by email lookup/`.

### Test 4 (existing — unchanged): all other existing tests

The 12 remaining tests (degraded-mode, idempotency, missing-group,
rethrow-on-no-existing) are behavior-preserving and need no
assertion-level edits; their `patchAttributes` assertions simply
continue to pass because `setForcePasswordChangeNextLogin` is a new
call, not a deletion.

---

## Test count: 15 (was 13, +2)

| Test | Pre-PR | Post-PR |
|---|---|---|
| "skips when AuthentikClient is not configured" | unchanged | unchanged |
| "skips when ADMIN_BOOTSTRAP_DEFAULT_PASSWORD is unset" | unchanged | unchanged |
| "is a total no-op when aiqadam-super-admin has >=1 member" | unchanged | unchanged |
| "treats a resolved group with exactly 1 member as already bootstrapped (>=1 boundary)" | unchanged | unchanged |
| "treats an empty resolveGroupNames() result as zero members and proceeds to bootstrap" | unchanged | unchanged |
| "creates, passwords, groups, and patches the seeded admin exactly once with expected args" | asserted patchAttributes | **asserts setForcePasswordChangeNextLogin** |
| **`does not patch the deprecated forced-password-change attribute`** | n/a | **NEW** |
| "throws when the aiqadam-super-admin group cannot be resolved at assignment time" | unchanged | unchanged |
| "throws when the resolved group has no pk" | unchanged | unchanged |
| "recovers via getUserByEmail() on a 4xx createUser() rejection and continues without re-calling setPassword()" | asserted patchAttributes | **asserts setForcePasswordChangeNextLogin** |
| "rethrows the original 4xx error when no existing user is found to recover" | unchanged | unchanged |
| ... (4 more tests, unchanged) | unchanged | unchanged |

---

## Live BP-UAT-020 (Step 13, post-merge)

**File:** `apps/e2e/tests/uat/BP-UAT-020.session.spec.ts` — **no edit**.

**Run:** Re-execute the existing Playwright session against `local`
Authentik. Step 002 will fill the seeded credentials, submit, and watch
for one of two outcomes:

- **Pre-fix outcome (regression):** the flow executor returns
  `{"component": "xak-flow-redirect", "to": "/application/o/authorize/..."}`
  directly — Verdict `MISMATCH`.
- **Post-fix outcome (expected):** the flow executor returns a
  password-change stage component instead — Verdict `MATCH`.

The existing test takes **input-language-agnostic** selectors
(`button[type="submit"], input[type="submit"]` rather than
language-text regex), per `ISS-ADM-010-1.md`'s honesty disclosure about
the earlier false-positive session.

---

## Gate Result

```yaml
gate_result:
  status: passed
  attempt: 1
  summary: "Two existing assertions rewritten to assert setForcePasswordChangeNextLogin; one new regression test added (must-not-call-patchAttributes-with-deprecated-key); 12 unchanged tests preserved. Live BP-UAT-020 re-verification scheduled for Step 13."
  output_file: .copilot/tasks/active/wf-20260801-fix-190/07-test-design.md
```
