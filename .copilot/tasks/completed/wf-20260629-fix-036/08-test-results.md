# Step 8: Test Results — wf-20260629-fix-036

**Workflow:** wf-20260629-fix-036
**Date:** 2026-06-29

## New Tests (scripts/tests/uat-seed.bats)

```
uat-seed.bats
 ✓ AC-1: mock mode exits 0 and provisions all 3 operator_invite tokens
 ✓ AC-1: mock mode summary lists all three token names
 ✓ AC-2: uat-seed.sh has a DIRECTUS_TOKEN guard that emits a FATAL message
 ✓ AC-3: ensure_operator_invite has idempotency GET check before POST
 ✓ AC-4: uat-env-setup.sh contains UAT_ONBOARD_TOKEN
 ✓ AC-4: uat-env-setup.sh contains UAT_ONBOARD_USED_TOKEN
 ✓ AC-4: uat-env-setup.sh contains UAT_ONBOARD_EXPIRED_TOKEN

7 tests, 0 failures
```

## Full Suite (pnpm test:bash)

```
49 tests, 0 failures
```

All pre-existing test suites pass:
- check-workflow-state.bats: 13/13 ✓
- quality-gate-context.bats: 2/2 ✓
- step-0.5-doc-presence.bats: 5/5 ✓
- uat-preflight-check.bats: 12/12 ✓
- uat-seed.bats: 7/7 ✓ (new)
- workflow-finish-amend.bats: 10/10 ✓

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "7/7 new tests pass. 49/49 full suite passes. Zero regressions."
  findings:
    - "Primary regression test AC-1a passes: ensure_operator_invite is called 3 times in mock mode."
    - "No pre-existing test failures introduced."
```
