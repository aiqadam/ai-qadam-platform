# Step 8 — Test Results (wf-20260629-fix-039)

Workflow: wf-20260629-fix-039
Issue: ISS-UAT-013-8
Date: 2026-06-29
Runner: Orchestrator (terminal available; TestRunner subagent skipped because
the test surface is hermetic BATS suites + a Playwright spec against a live
stack the local environment does not have).

---

## Gate Result

```
status: passed
attempt: 1
timestamp: 2026-06-29T22:45:00Z
summary: scripts/tests/uat-seed.bats executed via the canonical runner
  (scripts/run-bats.sh) reports 8/8 pass with the fix and 3/8 fail with
  the seed reverted (proves all three new AC-1 assertions are non-vacuous).
  Sibling suite scripts/tests/bp-uat-template-rule.bats reports 5/5 pass
  (no regression on the wf-20260629-fix-038 template-rule suite).
  pnpm arch:check reports 249 files pass (no architectural drift).
  The new Neg 005 Playwright test is on disk; live execution against the
  UAT stack is out of scope for this workflow per AC-2 deferral — handled
  by the follow-up UATRunner workflow.
```

---

## Run 1 — Target suite (with fix)

```
$ bash scripts/run-bats.sh scripts/tests/uat-seed.bats
uat-seed.bats
1..8
ok 1 AC-1: mock mode exits 0 and provisions all 4 operator_invite tokens
ok 2 AC-1: mock mode summary lists all four token names
ok 3 AC-1: three happy rows share the bare operator email; the no-user row is plus-addressed
ok 4 AC-2: uat-seed.sh has a DIRECTUS_TOKEN guard that emits a FATAL message
ok 5 AC-3: ensure_operator_invite has idempotency GET check before POST
ok 6 AC-4: uat-env-setup.sh contains UAT_ONBOARD_TOKEN
ok 7 AC-4: uat-env-setup.sh contains UAT_ONBOARD_USED_TOKEN
ok 8 AC-4: uat-env-setup.sh contains UAT_ONBOARD_EXPIRED_TOKEN

8 tests, 0 failures
```

Exit code: 0.

## Run 2 — Regression coverage proof (seed.sh reverted, bats unchanged)

```
$ git stash --keep-index -- scripts/uat-seed.sh
Saved working directory and index state WIP on fix/ISS-UAT-013-8-invite-email-match: 6238bfc

$ bash scripts/run-bats.sh scripts/tests/uat-seed.bats
uat-seed.bats
 ✗ AC-1: mock mode exits 0 and provisions all 4 operator_invite tokens
   (in test file scripts/tests/uat-seed.bats, line 53)
     `[ "$count" -eq 4 ]' failed
 ✗ AC-1: mock mode summary lists all four token names
   (in test file scripts/tests/uat-seed.bats, line 62)
     `[[ "$output" == *"uat-onboard-no-user-token"* ]]' failed
 ✗ AC-1: three happy rows share the bare operator email; the no-user row is plus-addressed
   (in test file scripts/tests/uat-seed.bats, line 78)
     `[ "$bare" -eq 3 ]' failed
 ✓ AC-2: uat-seed.sh has a DIRECTUS_TOKEN guard that emits a FATAL message
 ✓ AC-3: ensure_operator_invite has idempotency GET check before POST
 ✓ AC-4: uat-env-setup.sh contains UAT_ONBOARD_TOKEN
 ✓ AC-4: uat-env-setup.sh contains UAT_ONBOARD_USED_TOKEN
 ✓ AC-4: uat-env-setup.sh contains UAT_ONBOARD_EXPIRED_TOKEN

8 tests, 3 failures

$ git stash pop
On branch fix/ISS-UAT-013-8-invite-email-match
Changes not staged for commit:
        modified:   .copilot/meta/next-workflow-id
```

Confirmed: with the seed reverted, all three new AC-1 assertions fail
(count=4, no-user-token summary, bare-email distribution). The other 5
AC-2/3/4 tests are static greps unaffected by the seed changes; they
remain green. After `git stash pop`, all 8 pass again.

## Run 3 — Sibling regression (bp-uat-template-rule.bats, from wf-20260629-fix-038)

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

No regression. The template-rule suite from the prior workflow remains green.

## Run 4 — Architectural check

```
$ pnpm arch:check
> tsx tools/architecture-check.ts
✓ arch:check passed (249 file(s) scanned, mode=full).
```

## Aggregate Result

| Suite | Tests | Pass | Fail | Notes |
|---|---|---|---|---|
| scripts/tests/uat-seed.bats | 8 | 8 | 0 | Target of this fix |
| scripts/tests/bp-uat-template-rule.bats | 5 | 5 | 0 | Sibling regression (no drift) |
| pnpm arch:check | 249 files | 249 | 0 | Architectural integrity |
| **TOTAL** | **13 + 249** | **262** | **0** | |

---

## Why TestRunner subagent was not invoked

Per the workflow protocol, TestRunner normally executes the suite and
diagnoses failures. For this fix:

1. The suites are hermetic (BATS + grep + mock-mode seed; no DB, no Docker,
   no node).
2. The canonical runner is a single bash script the Orchestrator can
   invoke directly.
3. Running it twice (with/without the seed reverted) is the regression-
   coverage proof; the second invocation requires the terminal the
   Orchestrator has.
4. The new Neg 005 Playwright test requires the live UAT stack (Directus +
   Authentik + Mailpit + Postgres + api + web-next). That is documented as
   the follow-up UATRunner workflow's job per Step 6's "Deferred
   Verification" section.

---

## Out-of-Scope / Deferred (per Step 6 strategy)

- **AC-2** (live BP-UAT-013 Step 006 end-to-end success) is deferred to a
  follow-up UATRunner workflow (`wf-20260630-uat-031-rerun-bp-uat-013` or
  equivalent). The Orchestrator will spawn it after PR merge.
- **Stale-row cleanup** in already-seeded Directus environments: documented
  in the PR description's "Risks" section. Mitigation:
  `DELETE FROM operator_invites WHERE token_prefix LIKE 'uat-onboard%'`
  before re-running `pnpm uat:seed`.

---

## Links

- [scripts/tests/uat-seed.bats](../../../scripts/tests/uat-seed.bats)
- [scripts/tests/bp-uat-template-rule.bats](../../../scripts/tests/bp-uat-template-rule.bats)
- [scripts/run-bats.sh](../../../scripts/run-bats.sh)
- [06-test-strategy.md](06-test-strategy.md)
- [06-test-design.md](06-test-design.md)
- [04-security-review.md](04-security-review.md)
- [ISS-UAT-013-8.md](../../../issues/ISS-UAT-013-8.md)
- [handoff.yaml](handoff.yaml)