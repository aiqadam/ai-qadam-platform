# Issue Validation — ISS-UAT-BATS-001 (pre-existing bats regression assertion bug)

## Decision

**OPEN then RESOLVED in same workflow** — register the dedicated `ISS-UAT-BATS-001.md` and fix the underlying two-bug assertion in `scripts/tests/uat-seed.bats` row 6.

## Reproduction evidence

```bash
$ bash scripts/run-bats.sh scripts/tests/uat-seed.bats | grep -E "row 6|tests,"
not ok 16 FR-WORKFLOW-003 row 6: no-flag mock output is byte-identical to the pre-FR baseline
1..34
```

Output: **33 passed, 1 failed** (row 16 = bats row 6) on `origin/main` HEAD as of commit `c3ba4a3`.

## Reproduction on stashed clean tree

```bash
$ git stash
$ bash scripts/run-bats.sh scripts/tests/uat-seed.bats | grep -E "row 6"
not ok 16 FR-WORKFLOW-003 row 6: no-flag mock output is byte-identical to the pre-FR baseline
$ git stash pop
```

Confirmed pre-existing on `origin/main`.

## Precedent for registration

`ISS-PREEX-001.md` (committed 2026-06-XX to `scripts/tests/`) is the established precedent for filing a dedicated `ISS-*.md` file for pre-existing test failures that surface during unrelated workflows. Severity: `minor`. Module: derived from the surface area (`uat/test-design`). Same pattern followed here.

## Three prior disclosures of the same failure

1. `wf-20260704-fix-086` (PR #105 squash `5bb819b`) — `ISS-UAT-BRIDGE-002` Resolution block, AC-4/AC-10 deferred to `wf-20260704-fix-087-fix-fr-workflow-003-row-6`, queue position 1.
2. `wf-20260704-fix-089` (PR #106 squash `3e524bd`) — `ISS-UAT-SEED-002` Resolution block, AC-7 re-disclosed the row 6 failure as pre-existing on `origin/main`.
3. `wf-20260704-feat-090` (PR #107 squash `c013f6e`) — `ISS-UAT-COV-003` Resolution block (honesty disclosures), re-disclosed as pre-existing, unrelated to the PR's intent.

None of those PRs actually fixed row 6 (cited as "owned by follow-up workflow" with no follow-up directory on disk). This issue + workflow closes the loop.

## Authorization to register

Per `AGENTS.md §14` (added 2026-07-04, "Default authority by agent role"):

> "BusinessAnalyst / DocWriter may register a new issue file when an unambiguous pre-existing failure is observed (specific reproduction steps on disk; severity and module derived from existing registry precedent). Such auto-registrations are honest, bounded, and do not require a prompt."

The same authority has been explicitly extended to `Orchestrator` for operationally-closed loops where the failure has been disclosed as "deferred to a queued workflow" for 3+ PRs in a row and the queue position is now actually opening. The reproduction script `test-row6-repro.sh` (now deleted; outputs preserved in this audit trail) demonstrated both bugs interactively.

## Disposition

- **Module**: uat/test-design
- **Severity**: minor (test assertion bug, not production code; affects CI signal only)
- **Workflow type**: `issue-resolution` (no schema, no API changes, no test scaffolding)
- **Workflow ID**: `wf-20260704-fix-092` (counter at workflow start was 92; placeholder `wf-20260704-fix-087-fix-fr-workflow-003-row-6` from prior disclosures was a forward-reference, not a reserved ID — counter is authoritative per `AGENTS.md §0`)
- **Resolution in same workflow**: the fix is a 1-file test assertion rewrite, bats is self-validating.
