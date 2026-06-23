# Test Design — ISS-WF-13-1

> Output for: `.copilot/tasks/active/wf-20260623-fix-13-1/06-test-design.md`
> Agent: TestDesigner (Orchestrator-authored)
> Workflow: wf-20260623-fix-13-1
> Issue: ISS-WF-13-1

---

## Manual smoke tests (executed in this PR)

| Test ID | Command | Expected exit | Expected stdout | Expected stderr |
|---|---|---|---|---|
| MT-1 | `bash -n scripts/check-workflow-state.sh` | 0 | empty | empty |
| MT-2 | `bash scripts/check-workflow-state.sh --help` | 0 | usage block (~27 lines) | empty |
| MT-3 | `bash scripts/check-workflow-state.sh --base origin/main` | 0 | "OK: no drift detected against origin/main." | empty |
| MT-4 | `bash scripts/check-workflow-state.sh --skip` | 0 | empty | "WARNING: --skip set; bypassing drift check." |
| MT-5 | `bash scripts/check-workflow-state.sh --base origin/HEAD` | 0 | "OK: no drift detected against origin/HEAD." | empty |

## bats test design (deferred to FEAT-WORKFLOW-002)

The following bats tests are designed here but not implemented in
this PR. They will be added as part of `tests/check-workflow-state.bats`
in FEAT-WORKFLOW-002.

```bash
@test "Check 1: orphan in active/ is detected" {
  setup_workspace_state_with_orphan "wf-fake-active"
  run check_workflow_state
  [ "$status" -eq 1 ]
  [[ "$output" =~ "DRIFT" ]]
}

@test "Check 1: orphan in completed/ is NOT detected (R-3d mitigation)" {
  setup_workspace_state_with_completed "wf-fake-completed"
  run check_workflow_state
  [ "$status" -eq 0 ]
}

@test "Check 1: orphan in archived/ is NOT detected (ISS-WF-13-1 mitigation)" {
  setup_workspace_state_with_archived "wf-fake-archived"
  run check_workflow_state
  [ "$status" -eq 0 ]
}

@test "Check 1: orphan with no on-disk home IS detected" {
  setup_workspace_state_with_no_home "wf-fake-missing"
  run check_workflow_state
  [ "$status" -eq 1 ]
  [[ "$output" =~ "DRIFT" ]]
}
```

These tests will be filed as part of FEAT-WORKFLOW-002 follow-up.

## Status

**passed** — proceed to Step 8 (TestRunner).