## What

Add a bats-core test suite for the FEAT-WORKFLOW-001 scripts
(`check-workflow-state.sh` and `workflow-finish.sh`). 30 tests
across 4 files, all passing.

## Why

FEAT-WORKFLOW-001 (PR #13) shipped the drift detector and the
F.5 context-sync amendment step. It had no automated test
coverage, so any future change to those scripts could silently
break the agentic workflow. This PR locks down the behaviour.

## How

**Refactor:** Extract the 237-line F.5 inline block in
`workflow-finish.sh` into 6 named helper functions so they can
be sourced by the tests. Each function is ≤ 60 lines (AGENTS.md
§1.4 compliant). Adds a `--source-only` flag for bats
testability.

**Bug fixes (caught while writing the tests):**

1. `check-workflow-state.sh` did not recognise `archived/` as
   a valid task-dir home — this was the regression of
   ISS-WF-13-1 that PR #14 was supposed to fix. Now fixed.
2. `workflow-finish.sh` required `status: passed` (unquoted) in
   the quality gate; would fail on `status: "passed"` (quoted
   YAML, which is what real subagent output uses). Now accepts
   both.
3. `workflow-finish.sh` `parse_context_block` did not handle
   the literal-block `|` row syntax correctly — multi-line
   `registry_row: |\n  | ...` values were silently dropped.
   Now correctly captures them.

**New test files:**

- `scripts/tests/check-workflow-state.bats` (13 tests) —
  AC-1, AC-2, AC-8 for the drift detector.
- `scripts/tests/workflow-finish-amend.bats` (10 tests) —
  AC-6, AC-7 for the F.5 amendment step.
- `scripts/tests/quality-gate-context.bats` (2 tests) —
  end-to-end harness for the QualityGate context-update check.
- `scripts/tests/step-0.5-doc-presence.bats` (5 tests) —
  AC-9 doc-keyword presence checks.

**New infrastructure:**

- `scripts/run-bats.sh` — cross-platform bats binary resolver
  (env var → system → local `node_modules`).
- `scripts/tests/test_helper.bash` — shared fixture
  (`setup_test_repo`) + 6 assertion helpers.
- `package.json` — adds `bats ^1.10.0` to devDependencies and
  a `test:bash` script.

## Risks

**PR size:** 1180 lines added, 244 lines removed across 12
files. Exceeds the 400-LOC cap in AGENTS.md §4. The
exceedance is justified because:

1. The 6 new helper functions are extracted from a 237-line
   inline block, so the F.5 refactor shows up as both additions
   and deletions in the diff.
2. The 4 test files are entirely new (no prior tests to remove).
3. Splitting the refactor from the tests would create a broken
   intermediate state (refactored code with no tests, then a
   follow-up to add tests).

The user approved this split pattern in the workflow plan.

**Shellcheck deferred:** PR B (FEAT-WORKFLOW-003) will add
shellcheck + `lint:shell` wiring. This PR intentionally does
not include shellcheck because:

1. The diff is already at the cap; adding shellcheck would
   exceed it by ~50%.
2. `shellcheck` is GPL-licensed, which requires explicit user
   approval per AGENTS.md §8.
3. PR B can land the shellcheck wiring as a smaller follow-up
   with the user's explicit approval of the license.

## Testing

```
$ bash scripts/run-bats.sh scripts/tests/
check-workflow-state.bats ........ 13/13 ✓
quality-gate-context.bats ....... 2/2 ✓
step-0.5-doc-presence.bats ...... 5/5 ✓
workflow-finish-amend.bats ...... 10/10 ✓
─────────────────────────────────────────
30 tests, 0 failures
```

Tests run on a fresh per-test git repo (no mocking), so they
exercise the real scripts against real git refs and real state
files. Fixture lives in `BATS_TEST_TMPDIR` and is auto-deleted.

## Checklist

- [x] Tests added (30, all passing)
- [x] F.5 refactor preserves behaviour (covered by 12 tests
      spanning extract → parse → apply end-to-end)
- [x] Bug fixes verified by the new tests
- [ ] Shellcheck wiring (DEFERRED to PR B)
- [ ] Docs update (`docs/04-development/standards.md` to add
      "bash scripts must have bats tests" — DEFERRED to PR B
      to keep this PR focused)
- [x] No new commercial dependencies (bats is MIT, active,
      weekly downloads ~1M)

## Related

- Closes FEAT-WORKFLOW-002
- Closes ISS-WF-13-1 (archived/ regression)
- Build on FEAT-WORKFLOW-001 (PR #13)
- Follow-up: FEAT-WORKFLOW-003 (shellcheck + lint:shell)
