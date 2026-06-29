# Step 7: Test Design — wf-20260629-fix-036

**Workflow:** wf-20260629-fix-036
**Issue:** ISS-UAT-013-4
**Date:** 2026-06-29
**Agent:** TestDesigner

---

## Test File Created

`scripts/tests/uat-seed.bats` — 7 test cases.

## Test Cases

| ID | Name | Technique | Regression? |
|---|---|---|---|
| 1 | AC-1: mock mode exits 0 and provisions all 3 operator_invite tokens | `UAT_SEED_DIRECTUS_MOCK=1`, count=3 grep | YES |
| 2 | AC-1: mock mode summary lists all three token names | `UAT_SEED_DIRECTUS_MOCK=1`, output contains token names | YES |
| 3 | AC-2: uat-seed.sh has a DIRECTUS_TOKEN guard | static grep for 'DIRECTUS_TOKEN missing' | structural |
| 4 | AC-3: ensure_operator_invite has idempotency GET check before POST | static grep for token_hash in operator_invites URL | structural |
| 5 | AC-4: uat-env-setup.sh contains UAT_ONBOARD_TOKEN | static grep | YES |
| 6 | AC-4: uat-env-setup.sh contains UAT_ONBOARD_USED_TOKEN | static grep | YES |
| 7 | AC-4: uat-env-setup.sh contains UAT_ONBOARD_EXPIRED_TOKEN | static grep | YES |

## Results (pre-run in Step 8)

All 7 tests passed. Full suite (49 tests) passed with 0 regressions.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "7 bats tests implemented and passing. All 49 suite tests pass. Labeled regression tests (AC-1a, AC-1b, AC-4a/b/c) would fail on the pre-fix codebase."
  findings:
    - "scripts/tests/uat-seed.bats created with 7 test cases."
    - "No it.skip usage."
    - "Test 1 (AC-1a) is the primary regression test."
```
