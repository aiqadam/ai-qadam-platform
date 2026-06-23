#!/usr/bin/env bats
# scripts/tests/workflow-finish-amend.bats
#
# Tests for the F.5 context-sync amendment logic in scripts/workflow-finish.sh.
# After FEAT-WORKFLOW-002, F.5 lives in a callable function
# `apply_context_sync_update()`. These tests exercise the function
# directly by sourcing the script with --source-only.
#
# Coverage:
#   - AC-6: marker present (context_update: block in 08-doc-update.md)
#     AND gate passed → registry row + workspace-state row are applied.
#   - AC-7: marker absent → no-op.
#   - Idempotency: applying the same context_update twice does not
#     create a duplicate row in the registry.
#   - Failure modes: missing registry_file, missing row, gate not
#     passed, expects_registry_update: false.

load 'test_helper'

setup() {
  setup_test_repo "with-origin"
  # Make a workflow branch to operate on.
  git checkout -q -b feature/test-amend
  # Populate the workflow dir with a handoff.yaml + 08-doc-update.md +
  # 09-quality-gate.md that all indicate "passed".
  WORKFLOW_DIR=".copilot/tasks/active/wf-test-amend-1"
  mkdir -p "$WORKFLOW_DIR"
  cat > "$WORKFLOW_DIR/handoff.yaml" <<EOF
workflow_id: "wf-test-amend-1"
requirement_ref: "FR-WORKFLOW-001"
requirement_text: "Context drift guard"
branch: "feature/test-amend"
base_branch: "main"
github_pr_url: "https://github.com/tvolodi/aiqadam/pull/9999"
current_step: 12
current_step_name: "Archive"
workflow_status: "running"
context_sync_commits: 0
expects_registry_update: true
EOF
  cat > "$WORKFLOW_DIR/09-quality-gate.md" <<EOF
# Quality Gate

gate_result:
  decision: "passed"
  status: "passed"
  timestamp: "2026-06-23T00:00:00Z"
EOF
  cat > "$WORKFLOW_DIR/08-doc-update.md" <<EOF
# Doc Update

\`\`\`yaml
context_update:
  registry_file: .copilot/issues/registry.md
  registry_row: |
    | [FR-WORKFLOW-001](FR-WORKFLOW-001.md) | workflow | Context drift guard | shipped | (finalized) | 2026-06-23 |
  workspace_state_section: Completed Workflows (recent)
  workspace_state_row: |
    | wf-20260623-feat-006 | requirement-development | FR-WORKFLOW-001 Context drift guard | feature/test | (finalized) | 2026-06-23 |
\`\`\`
EOF
  git add -A
  git commit -q -m "seed test workflow"
  git push -q -u origin feature/test-amend
  # Source the script in --source-only mode so apply_context_sync_update
  # is defined in the current shell.
  source scripts/workflow-finish.sh --source-only
}

teardown() {
  cd "$BATS_TEST_TMPDIR/repo"
  git checkout -q main 2>/dev/null || true
}

@test "AC-6: marker present + gate passed → registry row applied" {
  run apply_context_sync_update \
    ".copilot/tasks/active/wf-test-amend-1/handoff.yaml" \
    ".copilot/tasks/active/wf-test-amend-1" \
    ".copilot/context/workspace-state.md" \
    "feature/test-amend"
  # The function should succeed and stage the registry + ws files.
  [ "$status" -eq 0 ]
  # Registry should now have the FR-WORKFLOW-001 row.
  assert_file_contains .copilot/issues/registry.md 'FR-WORKFLOW-001'
}

@test "AC-6: marker present + gate passed → workspace-state row applied" {
  apply_context_sync_update \
    ".copilot/tasks/active/wf-test-amend-1/handoff.yaml" \
    ".copilot/tasks/active/wf-test-amend-1" \
    ".copilot/context/workspace-state.md" \
    "feature/test-amend"
  # workspace-state.md should now have the new row in the section.
  assert_file_contains .copilot/context/workspace-state.md 'wf-20260623-feat-006'
  # Specifically, the row should appear under "Completed Workflows (recent)".
  run grep -A 20 '^## Completed Workflows' .copilot/context/workspace-state.md
  [ "$status" -eq 0 ]
  [[ "$output" == *"wf-20260623-feat-006"* ]]
}

@test "AC-7: marker absent (no context_update block) → no-op" {
  # Replace 08-doc-update.md with content that has no context_update block.
  cat > .copilot/tasks/active/wf-test-amend-1/08-doc-update.md <<'EOF'
# Doc Update

No fenced YAML block here.
EOF
  git add -A
  git commit -q -m "remove context_update block"
  run apply_context_sync_update \
    ".copilot/tasks/active/wf-test-amend-1/handoff.yaml" \
    ".copilot/tasks/active/wf-test-amend-1" \
    ".copilot/context/workspace-state.md" \
    "feature/test-amend"
  [ "$status" -eq 0 ]
  [[ "$output" == *"no-op"* ]]
  # Registry should NOT have the new row.
  assert_file_not_contains .copilot/issues/registry.md 'FR-WORKFLOW-001'
}

@test "AC-7: gate not passed → no-op" {
  # Replace 09-quality-gate.md with a "failed" status.
  cat > .copilot/tasks/active/wf-test-amend-1/09-quality-gate.md <<'EOF'
# Quality Gate

gate_result:
  decision: "failed"
  status: "failed"
EOF
  git add -A
  git commit -q -m "mark gate failed"
  run apply_context_sync_update \
    ".copilot/tasks/active/wf-test-amend-1/handoff.yaml" \
    ".copilot/tasks/active/wf-test-amend-1" \
    ".copilot/context/workspace-state.md" \
    "feature/test-amend"
  [ "$status" -eq 0 ]
  [[ "$output" == *"no-op"* ]]
  # Registry should NOT have the new row.
  assert_file_not_contains .copilot/issues/registry.md 'FR-WORKFLOW-001'
}

@test "AC-7: expects_registry_update: false → no-op" {
  sed -i 's/^expects_registry_update:.*/expects_registry_update: false/' \
    .copilot/tasks/active/wf-test-amend-1/handoff.yaml
  git add -A
  git commit -q -m "expects_registry_update: false"
  run apply_context_sync_update \
    ".copilot/tasks/active/wf-test-amend-1/handoff.yaml" \
    ".copilot/tasks/active/wf-test-amend-1" \
    ".copilot/context/workspace-state.md" \
    "feature/test-amend"
  [ "$status" -eq 0 ]
  [[ "$output" == *"no-op"* ]]
  assert_file_not_contains .copilot/issues/registry.md 'FR-WORKFLOW-001'
}

@test "AC-6: idempotency — applying twice does not duplicate registry row" {
  # First application
  apply_context_sync_update \
    ".copilot/tasks/active/wf-test-amend-1/handoff.yaml" \
    ".copilot/tasks/active/wf-test-amend-1" \
    ".copilot/context/workspace-state.md" \
    "feature/test-amend"
  # Count occurrences of FR-WORKFLOW-001 in the registry.
  local_count_1=$(grep -c 'FR-WORKFLOW-001' .copilot/issues/registry.md || true)
  # Second application (reset the function-local state by re-sourcing)
  source scripts/workflow-finish.sh --source-only
  apply_context_sync_update \
    ".copilot/tasks/active/wf-test-amend-1/handoff.yaml" \
    ".copilot/tasks/active/wf-test-amend-1" \
    ".copilot/context/workspace-state.md" \
    "feature/test-amend"
  local_count_2=$(grep -c 'FR-WORKFLOW-001' .copilot/issues/registry.md || true)
  [ "$local_count_1" -eq 1 ]
  [ "$local_count_2" -eq 1 ]
}

@test "AC-6: missing registry_file in context_update block → ERROR to stderr" {
  # Replace 08-doc-update.md with a block missing registry_file.
  cat > .copilot/tasks/active/wf-test-amend-1/08-doc-update.md <<'EOF'
# Doc Update

```yaml
context_update:
  workspace_state_section: Completed Workflows (recent)
  workspace_state_row: |
    | wf-test | requirement-development | x | y | z | 2026-06-23 |
```
EOF
  git add -A
  git commit -q -m "broken context_update block"
  run apply_context_sync_update \
    ".copilot/tasks/active/wf-test-amend-1/handoff.yaml" \
    ".copilot/tasks/active/wf-test-amend-1" \
    ".copilot/context/workspace-state.md" \
    "feature/test-amend" 2>&1
  [ "$status" -eq 1 ]
  [[ "$output" == *"ERROR"* ]]
  [[ "$output" == *"registry_file"* ]]
}

@test "AC-6: extract_context_block reads the right YAML" {
  # Direct unit test of the helper.
  run extract_context_block .copilot/tasks/active/wf-test-amend-1/08-doc-update.md
  [ "$status" -eq 0 ]
  [[ "$output" == *"registry_file: .copilot/issues/registry.md"* ]]
  [[ "$output" == *"workspace_state_section: Completed Workflows (recent)"* ]]
  # The literal `context_update:` key should NOT appear (it's been stripped).
  [[ "$output" != *"^context_update:"* ]]
}

@test "AC-6: parse_context_block populates CTX_* globals" {
  ctx_text=$(extract_context_block .copilot/tasks/active/wf-test-amend-1/08-doc-update.md)
  parse_context_block "$ctx_text"
  [ -n "$CTX_REGISTRY_FILE" ]
  [ "$CTX_REGISTRY_FILE" = ".copilot/issues/registry.md" ]
  [ -n "$CTX_REGISTRY_ROW" ]
  [[ "$CTX_REGISTRY_ROW" == *"FR-WORKFLOW-001"* ]]
  [ "$CTX_WS_SECTION" = "Completed Workflows (recent)" ]
  [ -n "$CTX_WS_ROW" ]
  [[ "$CTX_WS_ROW" == *"wf-20260623-feat-006"* ]]
}

@test "AC-6: workspace_state row is inserted into the named section, not at end" {
  # The current workspace-state.md has "## Open Issues" immediately
  # after "## Completed Workflows (recent)". The new row must be
  # inserted before "## Open Issues", not at the end of the file.
  apply_context_sync_update \
    ".copilot/tasks/active/wf-test-amend-1/handoff.yaml" \
    ".copilot/tasks/active/wf-test-amend-1" \
    ".copilot/context/workspace-state.md" \
    "feature/test-amend"
  # Find the line number of the new row and the next section header.
  new_row_line=$(grep -n 'wf-20260623-feat-006' .copilot/context/workspace-state.md | cut -d: -f1)
  next_section_line=$(grep -n '^## ' .copilot/context/workspace-state.md | awk -F: '$1 > 0 {print $1; exit}' \
    | xargs -I{} bash -c 'awk -v start="{}" "NR>start && /^## / {print NR; exit}" .copilot/context/workspace-state.md')
  [ -n "$new_row_line" ]
  # The next section after "Completed Workflows (recent)" is "Open Issues".
  open_issues_line=$(grep -n '^## Open Issues' .copilot/context/workspace-state.md | cut -d: -f1)
  [ -n "$open_issues_line" ]
  [ "$new_row_line" -lt "$open_issues_line" ]
}
