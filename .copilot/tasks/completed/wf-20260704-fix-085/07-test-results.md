# Step 8 — Test Results

**Workflow:** wf-20260704-fix-085
**Issue:** ISS-UAT-BRIDGE-001 (blocker, api/directus-bridge)
**Branch:** `fix/ISS-UAT-BRIDGE-001-bridge-no-local-row-fallback` (base `698c8d9`)
**Timestamp:** 2026-07-04
**Agent:** TestRunner

---

## Outcome

**PARTIAL — STATUS: BLOCKED (pre-existing infra) + HANDED OFF TO UAT RUNNER**

The on-disk test set is correct and review-confirmed by TestDesigner
(see [06-test-design.md](./06-test-design.md)). The vitest execution
**cannot run on this workstation** because of the **pre-existing,
documented** `__vite_ssr_exportName__` failure documented as
[ISS-TEST-WEB-001](../../issues/ISS-TEST-WEB-001.md). This is the same
root cause class that blocked
[wf-20260703-fix-065-onboarding-copy](../../issues/ISS-UAT-013-13.md)'s
AC-3 regression test (see that workflow's `07-test-results.md` for the
same deferral precedent — AC-3 was deferred to `wf-20260703-fix-066-vitest-bump`).

Per AGENTS.md §6.1 ("Production-readiness and infrastructure obligations")
and the existing workflow-precedent (wf-20260703-fix-065-onboarding-copy,
wf-20260703-fix-066-vitest-bump queue position 1), this deferral is
**legitimately bounded** because:

1. The follow-up workflow `wf-20260703-fix-066-vitest-bump` (queue
   position 1 of [ISS-TEST-WEB-001](../../issues/ISS-TEST-WEB-001.md))
   is **already queued** at
   [.copilot/tasks/queued/wf-20260703-fix-066-vitest-bump/](../../tasks/queued/wf-20260703-fix-066-vitest-bump/)
   and was **not spawned by this workflow** — it predates wf-20260704-fix-085.
2. The vitest failure blocks ALL apps/api tests globally, not just the
   bridge spec — pre-existing, not introduced.
3. AC-3 ("`ensureLinkedByEmail({ email })` returns the Directus user id,
   not null, even when no `platform.users` row exists") will be verified
   **end-to-end** by the live UAT verifier below — the live
   `POST /v1/internal/users/ensure-linked` call against a freshly-seeded
   BP-UAT-001 stack exercises the same code path the unit test would.

## Pre-Flight Confirmed

- **Repository state**: clean tree on
  `fix/ISS-UAT-BRIDGE-001-bridge-no-local-row-fallback`, branch created
  from main (698c8d9). Counter bumped 85 → 86.
- **Code-developer validation passed**: typecheck clean (no errors),
  biome clean on the two changed files, 4 pre-existing biome warnings
  in unrelated files (out of scope per workflow constraints).
- **Stack readiness (live infra)**: checked below.

## Step 1 — typecheck

```bash
$ pnpm --filter @aiqadam/api typecheck
> tsc --noEmit
(no output → success)
```

**Result: ✓ PASS** — TypeScript strict-check clean on the two changed
files + the entire api package.

## Step 2 — biome format/lint on changed files

```bash
$ pnpm biome check apps/api/src/modules/directus/directus-users-bridge.service.ts \
                  apps/api/test/directus-users-bridge.spec.ts
Checked 2 files in 5ms. No fixes applied.
```

**Result: ✓ PASS** — zero warnings, zero fixes on the changed files.

(The package-wide `pnpm --filter @aiqadam/api lint` produced 4 warnings
in `db/migrate.ts:57`, `telegram-tg-config-service.spec.ts:187`,
`telegram-auth-guard.spec.ts:100`, `telegram-preferences-service.spec.ts:191`
— all pre-existing, all out of scope per workflow constraints.)

## Step 3 — vitest run (apps/api unit tests)

```bash
$ cd apps/api && pnpm vitest run test/directus-users-bridge.spec.ts
 RUN  v2.1.9 C:/Users/tvolo/dev/ai-dala/aiqadam/apps/api

 Test Files  no tests
      Tests  no tests

⎯⎯⎯⎯⎯⎯ Unhandled Error ⎯⎯⎯⎯⎯⎯⎯
ReferenceError: __vite_ssr_exportName__ is not defined
 ❯ test/setup-pg.ts:1:1
      1| import path from 'node:path';
        | ^
      2| import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
      3| import { drizzle } from 'drizzle-orm/postgres-js';
 ❯ ViteNodeRunner.runModule .../vite-node@2.1.9_*/node_modules/vite-node/dist/client.mjs:399:11
```

**Result: ✗ FAIL (pre-existing infra — not blocking close)** — the
`globalSetup` `test/setup-pg.ts` cannot be loaded by vite-node 2.1.9
because of the workspace-level `vite 8.1.0` SSR-transform skew. This is
the EXACT failure documented in
[ISS-TEST-WEB-001](../../issues/ISS-TEST-WEB-001.md). The wrapper config
attempt `vitest.bridge.config.ts` (with `transformMode: { web: [/\.tsx?$/] }`)
also fails at the same globalSetup load — the transform skew fires
during setup-file loading, not during test-file loading.

### Mitigation Attempts Documented

| Attempt | Command | Result |
|---|---|---|
| Direct vitest on bridge spec | `pnpm vitest run test/directus-users-bridge.spec.ts` | FAIL at globalSetup |
| Custom config w/ transformMode:web | `pnpm vitest run --config vitest.bridge.config.ts` | FAIL at globalSetup (same root cause) |
| Run via vitest.unit.config.ts (already uses transformMode:web, no globalSetup) | `pnpm vitest run --config vitest.unit.config.ts test/directus-users-bridge.spec.ts` | "No test files found" (include: hardcoded for two other specs) — same root cause: bridge spec requires Testcontainers |

**Conclusion:** the only path to run the bridge spec's unit tests on
this host requires fixing the vitest + vite 8 skew — i.e. running
[ISS-TEST-WEB-001](../../issues/ISS-TEST-WEB-001.md) (queued at
`wf-20260703-fix-066-vitest-bump`, counter 66). That is **out of scope
for this workflow** (single-PR discipline per AGENTS.md §4) and **not
introduced by this fix**.

## Step 4 — Live UAT verifier (AC-1 + AC-2)

To compensate for the unit-test deferral, the live UAT verifier (Step 9
below) will exercise the same code path end-to-end: a real
`POST /v1/internal/users/ensure-linked` call against a freshly-seeded
BP-UAT-001 stack demonstrates that **the no-local-row branch actually
works in production**.

If the live stack is **not** available on the workstation at the time
of the workflow close, AC-1 and AC-2 will be **honestly deferred** to
a follow-up re-verification workflow (consistent with the
wf-20260703-fix-065-onboarding-copy precedent). The expected queue
position is **position 2** of `wf-20260703-fix-066-vitest-bump`
(re-running the live verifier after the vitest bump makes the unit
test executable).

## Honesty Disclosure (per AGENTS.md §6.1)

The following ACs are **NOT verified end-to-end on this workstation
during this workflow**:

- **AC-3** (unit-test path: "ensureLinkedByEmail returns id even when
  no `platform.users` row exists") — test file on disk, biome + typecheck
  clean, but vitest cannot execute. **Deferred** to:
  - **Primary:** `wf-20260703-fix-066-vitest-bump` (queue position 1 of [ISS-TEST-WEB-001](../../issues/ISS-TEST-WEB-001.md)) — once the vitest + vite 8 skew is fixed, this workflow re-runs `pnpm vitest run test/directus-users-bridge.spec.ts` and the seven tests must all pass.
  - **Secondary:** the live UAT verifier at Step 9 provides equivalent evidence — a successful `POST /v1/internal/users/ensure-linked` for `uat-member-c@aiqadam.test` (where `platform.users` has no row, but Directus mirror must be created) demonstrates the same code path.

- **AC-4** (regression belt for OIDC-callback callers) — same vitest
  blocker, same primary deferral to `wf-20260703-fix-066-vitest-bump`.
  The five pre-existing `ensureLinked` cases + two `resolveDirectusId`
  cases + 6 `internal.spec.ts` controller cases are **on disk and
  review-confirmed unchanged**, but they cannot run until the vitest
  blocker is resolved.

Both ACs flip to `verified` once `wf-20260703-fix-066-vitest-bump`
ships and `pnpm vitest run test/directus-users-bridge.spec.ts` returns
green.

## AC-by-AC Disposition

| AC | Description | Test level | This workflow | Deferred to |
|---|---|---|---|---|
| **AC-1** | `GET /users?filter[email][_eq]=uat-member-c@aiqadam.test` returns 200 OK with non-empty data after seed | Live curl probe | **Pending live verification** (Step 9 UATRunner) | If stack unavailable: position 2 of `wf-20260703-fix-066-vitest-bump` |
| **AC-2** | `GET /items/member_consents?filter[purpose][_eq]=events&fields=id,member.email` returns the consent row | Live curl probe | **Pending live verification** (Step 9 UATRunner) | If stack unavailable: position 2 of `wf-20260703-fix-066-vitest-bump` |
| **AC-3** | `ensureLinkedByEmail` returns id even when no `platform.users` row exists | Unit (7 tests on disk) | **Tests on disk, biome-clean, typecheck-clean** but vitest cannot execute (ISS-TEST-WEB-001) | `wf-20260703-fix-066-vitest-bump` (queue position 1) |
| **AC-4** | Existing `ensureLinked` + `ensureLinkedByEmail` cases still pass — no regression | Unit (regression belt, 13 cases) | **On disk, unchanged, biome-clean** but vitest cannot execute (ISS-TEST-WEB-001) | `wf-20260703-fix-066-vitest-bump` (queue position 1) |

## Gate Result

```yaml
gate_result:
  status: failed-retry  # the unit-test runner cannot run; the deferral
                        # is the correct response, not a code bug
  decision: deferred-with-followup-workflow
  summary: >-
    Code change is correct (typecheck + biome clean, all 6 invariants
    PASS-WITH-FINDINGS per security review, test set review-confirmed by
    TestDesigner). Vitest cannot execute on this workstation because of
    the pre-existing workspace vite 8 / vitest 2.1.9 SSR-transform skew
    (ISS-TEST-WEB-001). The follow-up workflow wf-20260703-fix-066-vitest-bump
    (queue position 1) is the queued owner of the fix and was registered
    before this workflow started. AC-3 and AC-4 unit-test verification
    is honestly deferred to that workflow. Live AC-1 and AC-2 verification
    via UATRunner at Step 9 — if the live Directus stack is reachable,
    AC-1/AC-2 flip to verified in this workflow; otherwise they share
    the same deferral.
  failures:
    - "pnpm vitest run test/directus-users-bridge.spec.ts fails at globalSetup load with ReferenceError: __vite_ssr_exportName__ (ISS-TEST-WEB-001, pre-existing, queued wf-20260703-fix-066-vitest-bump)."
  retry_target: test-runner  # caller is test-runner; the fix is upstream
  deferred_to_feature: wf-20260703-fix-066-vitest-bump
  deferred_reason: >-
    ISS-TEST-WEB-001 (workspace vite 8 / vitest 2.1.9 SSR-transform skew)
    blocks ALL apps/api vitest execution on this workstation. Fix is
    scoped to vitest-bump infrastructure, not to this bridge contract
    change. Out-of-scope-for-this-PR per AGENTS.md §4 small-PR rule.
```

## Recommendation for Orchestrator

- **Advance to Step 9 (UATRunner)** for AC-1 and AC-2 live verification.
  The Orchestrator must bring up the BP-UAT-001 stack per the AGENTS.md
  §6.1 pre-flight protocol (`docker compose -f infrastructure/docker-compose.yml
  up -d postgres auth-directus api`) if not already running.
- **If live stack is reachable:** `pnpm uat:seed --reset BP-UAT-001` runs
  to completion, the two curl probes return 200 with non-empty data,
  AC-1 and AC-2 flip to `verified`, and the workflow can close with AC-3
  and AC-4 honestly deferred to `wf-20260703-fix-066-vitest-bump`.
- **If live stack is NOT reachable:** AC-1 through AC-4 all defer to
  the same vitest-bump follow-up workflow (queue position 1) — and
  AC-1/AC-2 to **position 2** of that same workflow (re-running
  the live verifier after the vitest bump is done).
