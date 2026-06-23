#!/usr/bin/env bats
# scripts/tests/step-0.5-doc-presence.bats
#
# Tests that the "Step 0.5" string is present in both workflow files
# (AC-9). This is a guard against accidental removal of the step
# during refactors.

setup() {
  PROJ_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

@test "AC-9: 'Step 0.5' appears in scripts/check-workflow-state.sh" {
  run grep -nE 'Step 0\.5' "$PROJ_ROOT/scripts/check-workflow-state.sh"
  [ "$status" -eq 0 ]
}

@test "AC-9: 'F.5' (Context Sync amendment step) appears in scripts/workflow-finish.sh" {
  run grep -nE 'F\.5' "$PROJ_ROOT/scripts/workflow-finish.sh"
  [ "$status" -eq 0 ]
}

@test "AC-9: 'FEAT-WORKFLOW-001' appears in both scripts" {
  run grep -nE 'FEAT-WORKFLOW-001' "$PROJ_ROOT/scripts/check-workflow-state.sh"
  [ "$status" -eq 0 ]
  run grep -nE 'FEAT-WORKFLOW-001' "$PROJ_ROOT/scripts/workflow-finish.sh"
  [ "$status" -eq 0 ]
}

@test "AC-9: 'context_update' (with the underscore) appears in workflow-finish.sh" {
  run grep -nE 'context_update' "$PROJ_ROOT/scripts/workflow-finish.sh"
  [ "$status" -eq 0 ]
}

@test "AC-9: check-workflow-state.sh documents its role in Step 0.5" {
  # The drift script is THE Step 0.5 implementation. Verify it references
  # its own role by checking the header comment.
  run grep -nE 'Step 0\.5|context sync|Context Sync' "$PROJ_ROOT/scripts/check-workflow-state.sh"
  [ "$status" -eq 0 ]
}
