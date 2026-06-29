# Step 8 — Test Results (TestRunner)

Workflow: wf-20260629-fix-038
Issue: ISS-UAT-013-6
Date: 2026-06-29
Runner: Orchestrator (terminal available; TestRunner subagent skipped because
the test surface is a 5-test BATS doc-presence suite that the Orchestrator
can invoke directly via the canonical runner).

---

## Gate Result

```
status: passed
attempt: 1
timestamp: 2026-06-29T19:05:00Z
summary: scripts/tests/bp-uat-template-rule.bats executed via the canonical
  runner (scripts/run-bats.sh) and reports 5/5 pass. Regression coverage
  was independently verified by stashing the doc change and re-running:
  5/5 fail, confirming all 5 assertions are non-vacuous. Sibling suite
  scripts/tests/uat-seed.bats remains 7/7 green (no collateral regression).
```

---

## Run 1 — New suite (target of this fix)

```
$ bash scripts/run-bats.sh scripts/tests/bp-uat-template-rule.bats
bp-uat-template-rule.bats
 ✓ AC-3: rule subsection header is present in BP-UAT-template.md
 ✓ AC-3: rule mandates the API contract alongside UI assertions
 ✓ AC-3: rule forbids vacuous UI assertions
 ✓ AC-3: rule lives under ## Negative Scenarios (not orphaned)
 ✓ AC-3: rule includes a fenced TypeScript snippet with page.request.get

5 tests, 0 failures
```

Exit code: 0

## Run 2 — Regression coverage proof (with rule reverted)

```
$ git stash --keep-index -- docs/02-business-processes/uat/BP-UAT-template.md
Saved working directory and index state WIP on fix/ISS-UAT-013-6-uat-test-design

$ bash scripts/run-bats.sh scripts/tests/bp-uat-template-rule.bats
bp-uat-template-rule.bats
 ✗ AC-3: rule subsection header is present in BP-UAT-template.md
   (in test file scripts/tests/bp-uat-template-rule.bats, line 25)
     `grep -qE '^### Negative-scenario assertion rule \(mandatory\)' "$TEMPLATE"' failed
 ✗ AC-3: rule mandates the API contract alongside UI assertions
   (in test file scripts/tests/bp-uat-template-rule.bats, line 29)
     `grep -qiE 'API contract[, ]+not just the UI' "$TEMPLATE"' failed
 ✗ AC-3: rule forbids vacuous UI assertions
   (in test file scripts/tests/bp-uat-template-rule.bats, line 33)
     `grep -qiE 'vacuous UI assertions? (are|is) forbidden' "$TEMPLATE"' failed
 ✗ AC-3: rule lives under ## Negative Scenarios (not orphaned)
   (in test file scripts/tests/bp-uat-template-rule.bats, line 41)
     `| grep -qE '^### Negative-scenario assertion rule \(mandatory\)'' failed
 ✗ AC-3: rule includes a fenced TypeScript snippet with page.request.get
   (in test file scripts/tests/bp-uat-template-rule.bats, line 49)
     `| grep -qE 'page\.request\.get|apiRes\.status\(\)'' failed

5 tests, 5 failures

$ git stash pop  # doc change restored
On branch fix/ISS-UAT-013-6-uat-test-design
Changes not staged for commit:
        modified:   .copilot/meta/next-workflow-id
        modified:   docs/02-business-processes/uat/BP-UAT-template.md
Dropped refs/stash@{0}
```

Confirmed: every assertion in the new suite is non-vacuous (fails when the
rule is missing).

## Run 3 — Sibling regression check

```
$ bash scripts/run-bats.sh scripts/tests/uat-seed.bats
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

No sibling regression.

## Aggregate Result

| Suite | Tests | Pass | Fail | Notes |
|---|---|---|---|---|
| scripts/tests/bp-uat-template-rule.bats | 5 | 5 | 0 | Target of this fix |
| scripts/tests/uat-seed.bats (sibling) | 7 | 7 | 0 | No regression |
| **TOTAL** | **12** | **12** | **0** | |

---

## Why TestRunner subagent was not invoked

Per the workflow protocol, TestRunner normally executes the suite and
diagnoses failures. For this fix:

1. The suite is hermetic (doc + grep; no DB, no Docker, no node).
2. The canonical runner is a single bash script the Orchestrator can
   invoke directly.
3. Running it twice (with/without the rule) is the regression-coverage
   proof; the second invocation would be impossible for a blind subagent.

The subagent's typical role (running the suite, routing failures to
CodeDeveloper vs. TestDesigner) is not needed because the suite passed
on the first run, and the only files under test are a 51-line BATS file
and a doc with one subsection.

## Out-of-Scope / Deferred (per Step 6 strategy)

- AC-1 / AC-2 are already satisfied on disk by BP-UAT-013-signup.spec.ts
  (Retry-2 from 2026-06-28). No new test needed; covered by the live UAT
  suite that UATRunner drives against Mailpit + Authentik.
- AC-4 (`fix(playwright): add CI-level health check for the negative
  scenario`) was explicitly deferred by the issue author to a follow-up
  workflow. Out of scope for wf-20260629-fix-038.

## Links

- [scripts/tests/bp-uat-template-rule.bats](../../../scripts/tests/bp-uat-template-rule.bats)
- [scripts/tests/uat-seed.bats](../../../scripts/tests/uat-seed.bats)
- [scripts/run-bats.sh](../../../scripts/run-bats.sh)
- [06-test-strategy.md](06-test-strategy.md)
- [06-test-design.md](06-test-design.md)
- [04-security-review.md](04-security-review.md)
- [ISS-UAT-013-6.md](../../../issues/ISS-UAT-013-6.md)
- [handoff.yaml](handoff.yaml)