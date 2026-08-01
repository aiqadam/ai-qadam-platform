# 08 — Test Execution Results (ISS-ADM-010-1)

**Workflow:** wf-20260801-fix-190
**Issue:** GitHub #164 → `ISS-ADM-010-1`
**Step:** 8 of `issue-resolution`
**Date:** 2026-08-01
**Author:** TestRunner

---

## Test execution

### Vitest unit-test run

**Command:**
```bash
cd apps/api && pnpm exec vitest run test/admin-bootstrap.service.spec.ts
```

**Result (final tail of output):**
```
 RUN  v4.1.10 C:/Users/tvolo/dev/ai-dala/aiqadam/apps/api

[Nest] 42228  - 01.08.2026, 20:40:37   DEBUG [AdminBootstrapService] admin-bootstrap: skipped — aiqadam-super-admin already has >=1 member
[Nest] 42228  - 01.08.2026, 20:40:37   DEBUG [AdminBootstrapService] admin-bootstrap: skipped — aiqadam-super-admin already has >=1 member
[Nest] 42228  - 01.08.2026, 20:40:37     LOG [AdminBootstrapService] admin-bootstrap: seeded platform-admin user email=admin@aiqadam.org pk=777 group=aiqadam-super-admin
[Nest] 42228  - 01.08.2026, 20:40:37     LOG [AdminBootstrapService] admin-bootstrap: seeded platform-admin user email=admin@aiqadam.org pk=777 group=aiqadam-super-admin
[Nest] 42228  - 01.08.2026, 20:40:37     LOG [AdminBootstrapService] admin-bootstrap: seeded platform-admin user email=admin@aiqadam.org pk=555 group=aiqadam-super-admin

 Test Files  1 passed (1)
      Tests  15 passed (15)
   Start at  20:40:07
   Duration  30.12s
```

**Summary:** 1 test file, 15 tests, all passing. Duration 30.12s
(Testcontainers cold-pull on first Vitest run of this session).
Pre-PR test count was 13; post-PR is 15 (+1 regression test, +1
assertion rewrite to add a NEW behavior assertion pattern but no
net count change there).

### TypeScript diagnostics

`get_errors` (Pylance) on the three changed files (admin-bootstrap.service.ts,
authentik.client.ts, admin-bootstrap.service.spec.ts): **zero errors**.

### No regression observed

- All 12 pre-existing tests (degraded-mode, idempotency, missing-group,
  rethrow-on-no-existing-recovered) continue to pass unchanged.
- The 2 rewritten assertions (in "creates, passwords, groups, and
  patches..." and "recovers via getUserByEmail()..." tests) verify the
  new mechanism — both pass.
- The 1 new regression test ("does not patch the deprecated
  forced-password-change attribute") passes — proves the misleading
  attribute call was removed, not just papered over.

---

## Live BP-UAT-020 (deferred to Step 13)

**Status:** scheduled for **Step 13** of this workflow, per
`protocol.md`'s Business-Process Linkage section.

**Why deferred (not in this step):** the live Authentik verification
requires the merged code to be running on `local` against the real
docker-compose Authentik container. That happens post-merge (Step 12.5)
and as part of the same workflow's BP-UAT-020 re-run (Step 13).
Running it pre-merge would test against the wrong code (the
in-progress branch, not the merged result).

**Expected behavior change:** Step 002 of `BP-UAT-020.session.spec.ts`
flips from `verdict: 'MISMATCH'` (the issue's discovery site) to
`verdict: 'MATCH'`. This is AC-4 of the issue's acceptance criteria.

---

## Gate Result

```yaml
gate_result:
  status: passed
  attempt: 1
  summary: "All 15 unit tests pass (incl. new regression test); TypeScript clean; live BP-UAT-020 deferred to Step 13 (post-merge re-run per protocol.md Business-Process Linkage)."
  output_file: .copilot/tasks/active/wf-20260801-fix-190/08-test-results.md
```
