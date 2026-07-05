# Step 6 — Test Strategy

**Workflow:** wf-20260702-fix-049
**Issue:** ISS-UAT-013-10
**Date:** 2026-07-02

## Bug, in one sentence

The seed script `scripts/uat-seed.sh` creates all `operator_invites`
rows with `role_groups:[]`, but the BP-UAT-013 Step 005 Playwright
spec asserts `getByText(/aiqadam-staff/i)` is visible — which only
works when the seeded row carries `aiqadam-staff`.

## Test plan

The minimal honest test for this fix is:

1. **A unit-style test that would have failed before the fix and
   passes after.** This is the regression test the orchestrator's
   Step 6 explicitly requires.

2. **No additional tests at other levels** are warranted because:

   - **Unit (api-side):** The api-side validation
     (`admin-invites.controller.ts` line 44–45) already rejects invalid
     `role_groups` values via the `ALLOWED_ROLE_GROUPS` enum. There is
     no unit test gap here — existing tests in
     `apps/api/test/admin-invites-service.spec.ts` already cover
     `role_groups=['aiqadam-staff']` (lines 50, 106, 124, 178).
   - **Integration (api + Directus + Authentik):** The role group is
     applied to the operator's Authentik account at accept time. The
     api-side `consumeInvite()` logic is already covered by
     `apps/api/test/admin-invites-onboarding.spec.ts` (line 50 passes
     `role_groups: ['aiqadam-staff']`). No new integration test is
     needed for THIS fix.
   - **E2E (Playwright BP-UAT-013):** The full live Step 005 test IS
     the spec assertion that motivated this fix. It currently requires
     the full local stack (apps/api + apps/web + mailpit + Directus +
     Authentik + Postgres). Running it is the gold-standard verification
     but is **deferred to a separate UATRunner workflow** (out of scope
     for this fix workflow; see Honesty disclosure below).
   - **bats (scripts/tests/uat-seed.bats):** This is the right level
     for this fix because the change is in `uat-seed.sh`, which is a
     bash script. The existing bats suite already covers mock-mode
     execution and structural invariants.

## The one regression test

### AC-5 (new): valid-invite row carries `role_groups=['aiqadam-staff']`; other three rows carry `[]`

- **Where:** `scripts/tests/uat-seed.bats`
- **How:** Runs `scripts/uat-seed.sh` in mock mode
  (`UAT_SEED_DIRECTUS_MOCK=1`) and greps the four stdout lines
  beginning with `operator_invite uat-onbo`.
- **Assertion:**
  - Exactly **1** line contains `role_groups=["aiqadam-staff"]`
    (the valid-invite row).
  - Exactly **3** lines contain `role_groups=[]`
    (used, expired, no-user).
- **Would have failed before this PR:** Yes — before this PR, all four
  rows emitted `role_groups=[]`, so the `valid` count would have been
  0 (assertion fails).
- **Passes after this PR:** Yes — verified by `bash scripts/run-bats.sh
  scripts/tests/uat-seed.bats` (9/9 pass).
- **Hermetic:** Yes — no Docker, no Directus, no Authentik. Pure mock.

## Why bats, not vitest/jest

- The change is in a bash script.
- bats regression tests for `uat-seed.sh` already exist (8 tests
  covering AC-1, AC-2, AC-3, AC-4). Adding AC-5 keeps the test layer
  consistent.
- The test runs in <2 seconds; no build step required.

## Honesty disclosure

The full live BP-UAT-013 Step 005 verification (against the actual
api+web+mailpit+Directus+Authentik stack) is the **gold-standard**
end-to-end test for this fix but requires:

1. A running Docker stack (per `.claude/CLAUDE.md` and
   `scripts/uat-env-setup.sh`).
2. A fresh `pnpm uat:seed` run.
3. The existing Playwright spec
   (`apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts`) at Step 005.

That verification is **out of scope** for this fix workflow per
AGENTS.md §6.1 (live infra not required by the issue's own ACs) and
will be executed by the next UATRunner run for BP-UAT-013, which is
expected to be the verification step of a follow-up workflow that
re-runs all UAT scripts against the freshly seeded stack.

The bats AC-5 test is the **fully reproducible, hermetic, end-to-end
verification** of the seed-script change this PR makes. It satisfies
AGENTS.md §9 ("If a test you wrote doesn't actually test what it
claims, say so") — AC-5 directly tests the fix's contract.

## Gate result

```yaml
gate_result:
  status: passed
  summary: "Single bats regression test (AC-5) is the right level. Hermetic, fast, would-have-failed-before, passes-after. Live BP-UAT-013 re-run deferred to follow-up UATRunner workflow."
  findings:
    - "AC-5 bats test added in scripts/tests/uat-seed.bats"
    - "Test would have failed before this PR (valid count = 0)"
    - "Test passes after this PR (verified: 9/9 bats green)"
    - "Live UAT re-run out of scope; deferred per AGENTS.md §6.1"
```