```yaml
context_update:
  registry_file: .copilot/issues/registry.md
  registry_row: |
    | [FEAT-WORKFLOW-002](FEAT-WORKFLOW-002.md) | workflow | Add bats-core test suite for FEAT-WORKFLOW-001 | shipped | wf-20260623-feat-006 | 2026-06-23 |
  workspace_state_section: Completed Workflows (recent)
  workspace_state_row: |
    | wf-20260623-feat-006 | requirement-development | FEAT-WORKFLOW-002 Add bats-core test suite for FEAT-WORKFLOW-001 | feature/FEAT-WORKFLOW-002-bats-test-suite | (finalized) | 2026-06-23 |
```

# Doc Update — FEAT-WORKFLOW-002

## Summary

This workflow adds automated test coverage for the FEAT-WORKFLOW-001
scripts (`check-workflow-state.sh` and `workflow-finish.sh`) using
bats-core. It also fixes two bugs found while writing the tests:

1. **check-workflow-state.sh** did not recognise `.copilot/tasks/archived/`
   as a valid task-dir home (regression of ISS-WF-13-1).
2. **workflow-finish.sh** required `status: passed` in the quality
   gate (unquoted) and would fail on `status: "passed"` (quoted YAML).

## What is documented where

| File | What it documents |
|---|---|
| `package.json` | New `test:bash` script and `bats` devDependency |
| `scripts/run-bats.sh` | Cross-platform runner that finds bats binary |
| `scripts/tests/*.bats` | 30 tests across 4 files |
| `scripts/tests/test_helper.bash` | Shared fixture + assertion library |
| `docs/04-development/standards.md` | (To update) Add "bash scripts must have bats tests" rule |
| `docs/04-development/workflow.md` | (To update) Reference `pnpm test:bash` in Step 8 |

## Decision

Test coverage is now in place. Future changes to the workflow scripts
must keep the test suite green.
