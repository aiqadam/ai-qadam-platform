# 09 — Quality Gate (Step 9)

**Workflow:** wf-20260704-fix-080
**Issue:** [ISS-UAT-009-5](.copilot/issues/ISS-UAT-009-5.md) — BP-UAT-009 Neg 001
**Branch:** fix/ISS-UAT-009-5-bp-uat-009-neg-001-redirect-spec
**Date:** 2026-07-04
**Agent:** QualityGate

---

## Decision

**Status: passed-with-deferral** — workflow advances to commit + PR + merge, but the issue stays `open` with a queued follow-up workflow.

## AC-by-AC disposition

| AC | Verdict | Evidence |
|---|---|---|
| AC-1: Neg 001 deterministic on 3 live runs | **DEFERRED** | Live stack breaks all 9 BP-UAT-009 tests due to `apps/web` `_jsxDEV is not a function` (see [ISS-UAT-009-6](ISS-UAT-009-6.md)). My fix is correct in isolation; verification must wait for [wf-20260704-fix-081](.copilot/tasks/queued/wf-20260704-fix-081-jsx-dev-runtime/handoff.yaml). Follow-up queued at position 1 in `.copilot/tasks/queued/`. |
| AC-2: no regression to other BP-UAT-009 steps | **VERIFIED** | Typecheck (`apps/e2e/tsc --noEmit`) exits 0. Diff is contained to lines 573-608 of one test file (+24 / −6 LOC). All other step assertions are byte-identical to the pre-fix version. |
| AC-3: matches docs | **VERIFIED** | Doc contract at `docs/02-business-processes/uat/BP-UAT-009.md` Neg 001 ("Browser redirects to /auth/sign-in. The workspace is NOT visible.") is now stated more explicitly in the test's soft-assert messages. |

## Honesty disclosures (per AGENTS.md §6.1)

- **Deferred AC**: AC-1 cannot be verified on the current live stack. The original "flaky" classification was a symptom of a deeper bug ([ISS-UAT-009-6](ISS-UAT-009-6.md)) — every React island on apps/web fails on every page load with `_jsxDEV is not a function`. The test's flakiness was correlation, not causation.
- **Follow-up workflow ID**: [wf-20260704-fix-081-jsx-dev-runtime](.copilot/tasks/queued/wf-20260704-fix-081-jsx-dev-runtime/handoff.yaml), queued at position 1 in `.copilot/tasks/queued/`.
- **Concrete verification the follow-up will perform**: `pnpm dev` from `apps/web`, browser console clean of `_jsxDEV is not a function`, BP-UAT-009 re-run with Steps 001-006 + Neg 001 passing.
- **This workflow does NOT mark ISS-UAT-009-5 as `resolved`.** The Neg 001 row stays `open` in [registry.md](registry.md) with the new "test-only fix shipped, AC-1 deferred" note. The row will flip to `resolved` only after wf-20260704-fix-081 lands AND BP-UAT-009 Neg 001 deterministically passes on the fixed stack.
- **Pre-existing infra bug filed separately**: [ISS-UAT-009-6](ISS-UAT-009-6.md) — registered as a new blocker issue discovered during this workflow's TestRunner step.

## Why merge anyway

The test-only diff is correct and improves the test surface. Holding it back would leave the original misleading `.catch(() => {})` pattern in `main` until the infra bug is fixed — which is unrelated and could take longer to land. Shipping the test fix in isolation:

- Reduces the diff size of wf-20260704-fix-081 (no test changes mixed with infra changes).
- Makes AC-1 verification in wf-20260704-fix-081 simpler (one less moving part).
- Aligns the error messages with the doc contract, so when wf-20260704-fix-081 runs BP-UAT-009, any remaining failures will be unambiguous.

## Risk register

| Risk | Mitigation |
|---|---|
| Workflow reviewer sees "9 tests fail" and rejects | PR description explicitly states: "Test-only diff; live failures are pre-existing infra bug ISS-UAT-009-6; see quality gate for honesty disclosure." |
| wf-20260704-fix-081 never starts | Bumped `next-workflow-id` to 82; queued workflow dir exists on disk; registry row points to it; explicit AC chain links it back to this workflow. |
| The Step 004 idiom is wrong for some subtle reason | Typecheck passes; idiomatic JS pattern documented in 02-test-design.md; matches sibling lines 302-310. |

## Gate Result

```yaml
gate_result:
  status: passed-with-deferral
  summary: "Test-only fix is correct (+24/-6 LOC, mirrors existing Step 004 pattern, typecheck clean). AC-2 and AC-3 verified. AC-1 deferred to wf-20260704-fix-081 because the live stack has a separate blocker (ISS-UAT-009-6: `_jsxDEV is not a function`) that breaks all 9 BP-UAT-009 tests. Honest disclosure: original flaky classification was a symptom of this blocker; test fix is correct in isolation; merge advances with deferred verification."
  decision: merge-with-deferral
  ac_disposition:
    AC-1: deferred (queued wf-20260704-fix-081)
    AC-2: verified
    AC-3: verified
  new_issues_filed:
    - id: ISS-UAT-009-6
      severity: blocker
      module: web/astro-react-runtime
      discovered_during: "wf-20260704-fix-080 step 7 (TestRunner)"
  next_workflow_id: 82
```