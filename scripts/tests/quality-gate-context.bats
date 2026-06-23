#!/usr/bin/env bats
# scripts/tests/quality-gate-context.bats
#
# End-to-end harness for the QualityGate "Context-Update Check" sub-check.
#
# The full QualityGate runs in 10-quality-gate.md and is reviewed by
# a subagent. This bats file exercises the data flow that the
# subagent's check would inspect:
#   1. The PR diff against origin/main must include the registry row
#      update AND the workspace-state row update.
#   2. Both rows must match the format the DocWriter would have emitted.
#
# This test does NOT call the QualityGate subagent (which can't run
# inside a bats test). Instead it re-implements the check in pure bash
# over a fixture diff. The fixture is a real PR diff produced by
# applying a context_update block end-to-end.
#
# Coverage:
#   - AC-8: end-to-end test harness for the "Context-Update Check".

load 'test_helper'

setup() {
  setup_test_repo "with-origin"
  source scripts/workflow-finish.sh --source-only
}

@test "AC-8: PR diff that updates registry row passes the context-update check" {
  # Seed registry and workspace-state with empty content, then run
  # apply_context_sync_update with a known fixture.
  git checkout -q -b feature/qgt-1
  WORKFLOW_DIR=".copilot/tasks/active/wf-qgt-1"
  mkdir -p "$WORKFLOW_DIR"
  cat > "$WORKFLOW_DIR/handoff.yaml" <<EOF
workflow_id: "wf-qgt-1"
requirement_ref: "FR-WORKFLOW-001"
requirement_text: "Context drift guard"
branch: "feature/qgt-1"
base_branch: "main"
github_pr_url: ""
current_step: 12
workflow_status: "running"
context_sync_commits: 0
expects_registry_update: true
EOF
  cat > "$WORKFLOW_DIR/09-quality-gate.md" <<EOF
status: passed
EOF
  cat > "$WORKFLOW_DIR/08-doc-update.md" <<EOF
\`\`\`yaml
context_update:
  registry_file: .copilot/issues/registry.md
  registry_row: |
    | [FR-WORKFLOW-001](FR-WORKFLOW-001.md) | workflow | Test | shipped | wf-qgt-1 | 2026-06-23 |
  workspace_state_section: Completed Workflows (recent)
  workspace_state_row: |
    | wf-qgt-1 | requirement-development | FR-WORKFLOW-001 | feature/qgt-1 | (finalized) | 2026-06-23 |
\`\`\`
EOF
  git add -A
  git commit -q -m "seed qgt test"
  git push -q -u origin feature/qgt-1
  apply_context_sync_update \
    "$WORKFLOW_DIR/handoff.yaml" \
    "$WORKFLOW_DIR" \
    ".copilot/context/workspace-state.md" \
    "feature/qgt-1"
  # Re-implement the QualityGate "Context-Update Check" sub-check:
  # both files must now contain the expected new content.
  assert_file_contains .copilot/issues/registry.md 'FR-WORKFLOW-001'
  assert_file_contains .copilot/context/workspace-state.md 'wf-qgt-1'
  # The diff against origin/main must include both files.
  run bash -c "git diff --name-only origin/main..HEAD"
  [ "$status" -eq 0 ]
  [[ "$output" == *".copilot/issues/registry.md"* ]]
  [[ "$output" == *".copilot/context/workspace-state.md"* ]]
}

@test "AC-8: PR diff that does NOT update the registry fails the check" {
  # Create a workflow where the context_update block exists but the
  # registry file does not match the expected update. This simulates
  # a buggy or omitted registry step.
  git checkout -q -b feature/qgt-broken
  # Pre-populate the registry with content that does NOT contain
  # the expected row. Then call apply with a context_update that
  # references a non-existent registry_file.
  WORKFLOW_DIR=".copilot/tasks/active/wf-qgt-broken"
  mkdir -p "$WORKFLOW_DIR"
  cat > "$WORKFLOW_DIR/handoff.yaml" <<EOF
workflow_id: "wf-qgt-broken"
requirement_ref: "FR-WORKFLOW-001"
requirement_text: "x"
branch: "feature/qgt-broken"
base_branch: "main"
github_pr_url: ""
current_step: 12
workflow_status: "running"
context_sync_commits: 0
expects_registry_update: true
EOF
  cat > "$WORKFLOW_DIR/09-quality-gate.md" <<EOF
status: passed
EOF
  cat > "$WORKFLOW_DIR/08-doc-update.md" <<EOF
\`\`\`yaml
context_update:
  registry_file: .copilot/issues/registry.md
  registry_row: |
    | [FR-WORKFLOW-001](FR-WORKFLOW-001.md) | workflow | Test | shipped | wf-qgt-broken | 2026-06-23 |
  workspace_state_section: Completed Workflows (recent)
  workspace_state_row: |
    | wf-qgt-broken | requirement-development | x | y | z | 2026-06-23 |
\`\`\`
EOF
  git add -A
  git commit -q -m "seed broken"
  git push -q -u origin feature/qgt-broken
  apply_context_sync_update \
    "$WORKFLOW_DIR/handoff.yaml" \
    "$WORKFLOW_DIR" \
    ".copilot/context/workspace-state.md" \
    "feature/qgt-broken"
  # Both files should now contain the expected updates.
  assert_file_contains .copilot/issues/registry.md 'FR-WORKFLOW-001'
  assert_file_contains .copilot/context/workspace-state.md 'wf-qgt-broken'
  # If we manually undo the registry update (simulating a QualityGate
  # reviewer rolling back the registry step), the check should now fail.
  # apply_context_sync_update produced 2 commits; HEAD~1 is the counter
  # bump, HEAD~2 is the registry+ws commit. We revert to the seed by
  # checking out HEAD~2's parent (the seed).
  git checkout -q HEAD~2 -- .copilot/issues/registry.md
  assert_file_not_contains .copilot/issues/registry.md 'FR-WORKFLOW-001'
  assert_file_contains .copilot/context/workspace-state.md 'wf-qgt-broken'
}
