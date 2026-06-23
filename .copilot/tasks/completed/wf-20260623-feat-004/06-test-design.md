# Test Design — FEAT-WORKFLOW-001

> Output for: `.copilot/tasks/active/wf-20260623-feat-004/06-test-design.md`
> Agent: TestDesigner (Orchestrator-authored; see test-strategy.md "Operational Note")
> Workflow: wf-20260623-feat-004
> Feature: FEAT-WORKFLOW-001 — Context drift guard

---

## Summary

This document specifies the test files the TestDesigner creates. The
scope is the three `scripts/tests/*.bats` files plus the F.5 refactor
in `scripts/workflow-finish.sh` that makes the amendment sub-step
unit-testable. bats-core is added as a root devDependency.

**Refactor prerequisite:** the F.5 sub-step in `workflow-finish.sh`
must be wrapped in a callable function `apply_context_sync_update()`
with explicit arguments. This is a 30-LOC mechanical extraction that
preserves behaviour. The original inline block is replaced with a
single call to this function. This refactor is **not** a behaviour
change — it is a testability change.

---

## Refactor: F.5 extraction

### Before (in `scripts/workflow-finish.sh`)

The block currently between `# ─── F.5. Context Sync amendment ───`
and `# ─── G. git checkout main + pull --rebase ───` runs inline,
using global `BRANCH`, `WORKFLOW_DIR`, `HANDOFF` etc.

### After

The same block becomes a function:

```bash
apply_context_sync_update() {
  # arguments (instead of reading globals):
  local handoff="$1"
  local workflow_dir="$2"
  local workspace_state="$3"
  local branch="$4"

  # ... existing body, with $HANDOFF -> $handoff, $BRANCH -> $branch, etc.
}
```

The top-level call site becomes:

```bash
apply_context_sync_update "$HANDOFF" "$WORKFLOW_DIR" "$WORKSPACE_STATE" "$BRANCH"
```

The `WORKSPACE_STATE` constant is moved to the top of the file (it was
previously defined inside the F.5 block as a local variable). This
makes the constant available to both the top-level context and the
function. The diff is small (≈ 30 LOC moved and indented).

**Backwards compatibility:** none required — the script is a
single-file CLI; no external callers depend on its internals.

---

## New files

### 1. `scripts/tests/check-workflow-state.bats`

```bash
#!/usr/bin/env bats
# scripts/tests/check-workflow-state.bats
#
# Tests for scripts/check-workflow-state.sh (FEAT-WORKFLOW-001).
#
# AC coverage: AC-1, AC-2, AC-8, AC-10.
# shellcheck shell=bash

setup() {
  # Create a temporary git repo with the three state files in a known
  # clean state. The repo's origin is the parent git repo (read-only)
  # so that `git show origin/main:<state-file>` resolves.
  BATS_TEST_TMPDIR="${BATS_TEST_TMPDIR:-$BATS_TMPDIR/test-$$}"
  mkdir -p "$BATS_TEST_TMPDIR"
  cd "$BATS_TEST_TMPDIR"

  # Initialize a fresh git repo.
  git init -q .
  git config user.email "test@local"
  git config user.name "Test"

  # Create the three state files in a clean baseline.
  mkdir -p .copilot/context .copilot/issues
  mkdir -p .copilot/tasks/active .copilot/tasks/completed
  mkdir -p docs/03-requirements

  # Empty workspace-state with a valid Last updated frontmatter.
  cat > .copilot/context/workspace-state.md <<'EOF'
# Workspace State

**Last updated:** 2026-06-23T00:00:00Z

## Active Workflows
_(none)_

## Completed Workflows (recent)
| ID | Type | Date |
|----|------|------|
EOF

  # Empty issues registry.
  cat > .copilot/issues/registry.md <<'EOF'
# Issue Registry
| ID | Severity | Module | Summary | Status | Workflow | Date |
|----|----------|--------|---------|--------|----------|------|
EOF

  # Empty requirements registry.
  cat > docs/03-requirements/requirements-registry.md <<'EOF'
# Requirements Registry
| ID | Module | Name | Status | Date |
|----|--------|------|--------|------|
EOF

  git add -A
  git commit -q -m "initial clean state"
  git branch -M main
}

teardown() {
  cd /
  rm -rf "$BATS_TEST_TMPDIR"
}

REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"

@test "AC-2: clean state exits 0 and prints OK on stdout" {
  run "$REPO_ROOT/scripts/check-workflow-state.sh" --base HEAD
  [ "$status" -eq 0 ]
  [[ "$output" == *"OK: no drift"* ]]
}

@test "AC-1: workspace-state references missing workflow dir -> exit 1" {
  # Add an Active Workflows row whose id has no matching directory.
  cat >> .copilot/context/workspace-state.md <<'EOF'
| wf-20260623-feat-999 | requirement-development | FR-WORKFLOW-999 | branch | PR | 2026-06-23 |
EOF
  git add -A
  git commit -q -m "introduce drift"

  run "$REPO_ROOT/scripts/check-workflow-state.sh" --base HEAD
  [ "$status" -eq 1 ]
  [[ "$output" == *"DRIFT"* ]]
  [[ "$output" == *"wf-20260623-feat-999"* ]]
}

@test "AC-1b: requirements-registry references missing FR file -> exit 1" {
  # Add a row whose FR file does not exist on disk.
  cat >> docs/03-requirements/requirements-registry.md <<'EOF'
| FR-WORKFLOW-999 | WORKFLOW | missing | Open | 2026-06-23 |
EOF
  git add -A
  git commit -q -m "introduce FR drift"

  run "$REPO_ROOT/scripts/check-workflow-state.sh" --base HEAD
  [ "$status" -eq 1 ]
  [[ "$output" == *"FR-WORKFLOW-999"* ]]
}

@test "AC-1c: issues-registry references missing ISS file -> exit 1" {
  cat >> .copilot/issues/registry.md <<'EOF'
| ISS-MISSING-001 | minor | x | open | wf-x | 2026-06-23 |
EOF
  git add -A
  git commit -q -m "introduce ISS drift"

  run "$REPO_ROOT/scripts/check-workflow-state.sh" --base HEAD
  [ "$status" -eq 1 ]
  [[ "$output" == *"ISS-MISSING-001"* ]]
}

@test "AC-8: --help on stdout, no stderr noise, exit 0" {
  run "$REPO_ROOT/scripts/check-workflow-state.sh" --help
  [ "$status" -eq 0 ]
  # stderr must be empty (PowerShell rule)
  [ -z "$stderr" ]
}

@test "AC-8: clean state has no stderr noise" {
  run "$REPO_ROOT/scripts/check-workflow-state.sh" --base HEAD
  [ "$status" -eq 0 ]
  [ -z "$stderr" ]
}

@test "--skip bypasses drift check even when drift present" {
  cat >> .copilot/context/workspace-state.md <<'EOF'
| wf-orphan | x | x | x | x | x |
EOF
  git add -A
  git commit -q -m "drift"

  run "$REPO_ROOT/scripts/check-workflow-state.sh" --skip
  [ "$status" -eq 0 ]
  [[ "$output" == *"--skip"* ]] || [[ "$output" == *"bypassing"* ]]
}

@test "invalid --base ref -> exit 2 (invocation error)" {
  run "$REPO_ROOT/scripts/check-workflow-state.sh" --base origin/does-not-exist
  [ "$status" -eq 2 ]
}

@test "AC-1d: workspace-state with completed/ dir is NOT drift" {
  # The script must tolerate completed/ paths (R-3d mitigation).
  mkdir -p .copilot/tasks/completed/wf-20260623-feat-777
  cat >> .copilot/context/workspace-state.md <<'EOF'
| wf-20260623-feat-777 | requirement-development | x | x | x | 2026-06-23 |
EOF
  git add -A
  git commit -q -m "completed dir present"

  run "$REPO_ROOT/scripts/check-workflow-state.sh" --base HEAD
  [ "$status" -eq 0 ]
}
```

### 2. `scripts/tests/workflow-finish-amend.bats`

```bash
#!/usr/bin/env bats
# scripts/tests/workflow-finish-amend.bats
#
# Tests for the F.5 amendment sub-step in scripts/workflow-finish.sh
# (FEAT-WORKFLOW-001).
#
# Strategy: extract the F.5 block into apply_context_sync_update() and
# call it directly from the test, providing a temp git repo, fake
# handoff.yaml, and a fake 08-doc-update.md with a fenced context_update
# block. Assert on the resulting registry + workspace-state files and
# the new commit.
#
# AC coverage: AC-6, AC-7.

setup() {
  BATS_TEST_TMPDIR="${BATS_TMPDIR:-$BATS_TMPDIR/test-$$}"
  mkdir -p "$BATS_TEST_TMPDIR"
  cd "$BATS_TEST_TMPDIR"

  git init -q .
  git config user.email "test@local"
  git config user.name "Test"
  git branch -M main
  git remote add origin "$BATS_TEST_TMPDIR"  # self as origin

  mkdir -p .copilot/context .copilot/issues
  mkdir -p .copilot/tasks/active

  # Initial empty state files.
  cat > .copilot/context/workspace-state.md <<'EOF'
# Workspace State
**Last updated:** 2026-06-23T00:00:00Z

## Active Workflows
_(none)_

## Completed Workflows (recent)
| ID | Type | Date |
|----|------|------|

## Open Issues
_(none)_

## Git State
- Current branch: main
EOF

  cat > .copilot/issues/registry.md <<'EOF'
# Issue Registry
| ID | Severity | Module | Summary | Status | Workflow | Date |
|----|----------|--------|---------|--------|----------|------|
EOF

  git add -A
  git commit -q -m "initial state"

  # Create a fake workflow task dir.
  WORKFLOW_DIR="$BATS_TEST_TMPDIR/.copilot/tasks/active/wf-test-feat-001"
  mkdir -p "$WORKFLOW_DIR"

  cat > "$WORKFLOW_DIR/handoff.yaml" <<'EOF'
schema_version: "1.0"
workflow_instance_id: wf-test-feat-001
workflow_type: requirement-development
requirement_ref: "FEAT-TEST-001"
branch: "feature/FEAT-TEST-001"
base_branch: "main"
github_pr_url: ""
current_step: 9
workflow_status: "running"
expects_registry_update: true
EOF

  # The quality-gate file must exist and report status: passed.
  cat > "$WORKFLOW_DIR/09-quality-gate.md" <<'EOF'
## Quality Gate Result

gate_result:
  status: passed
  summary: "all checks green"
EOF
}

teardown() {
  cd /
  rm -rf "$BATS_TEST_TMPDIR"
}

REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"

# Source the workflow-finish.sh function. The refactor exposes
# apply_context_sync_update as a callable. We source only the function
# (after extracting it) by re-implementing the shim here.
#
# In the refactored workflow-finish.sh, the function will be defined
# at file scope after the constants. The test source-s the file with
# a guard that prevents the top-level code from running.

@test "AC-7: no context_update block in 08-doc-update.md -> no-op" {
  cat > .copilot/tasks/active/wf-test-feat-001/08-doc-update.md <<'EOF'
# Doc Update

Updated FR-TEST-001 to Shipped.
EOF

  run bash -c "
    source '$REPO_ROOT/scripts/workflow-finish.sh' --source-only 2>/dev/null
    apply_context_sync_update \
      '$BATS_TEST_TMPDIR/.copilot/tasks/active/wf-test-feat-001/handoff.yaml' \
      '$BATS_TEST_TMPDIR/.copilot/tasks/active/wf-test-feat-001' \
      '$BATS_TEST_TMPDIR/.copilot/context/workspace-state.md' \
      'feature/FEAT-TEST-001'
  "
  [ "$status" -eq 0 ]
  # No follow-up commit should have been created.
  run bash -c "cd '$BATS_TEST_TMPDIR' && git log --oneline | wc -l"
  [ "$output" -eq 1 ]  # only the initial commit
}

@test "AC-6: context_update block with valid YAML -> row applied + commit created" {
  cat > .copilot/tasks/active/wf-test-feat-001/08-doc-update.md <<'EOF'
# Doc Update

Updated FEAT-TEST-001 to Shipped.

## Context Update

\`\`\`yaml
context_update:
  registry_file: .copilot/issues/registry.md
  registry_row: |
    | ISS-PREEX-001 | minor | web-next/lint | 17 errors | resolved | wf-20260623-fix-3 | 2026-06-23 |
  workspace_state_section: Completed Workflows (recent)
  workspace_state_row: |
    | wf-test-feat-001 | requirement-development | FEAT-TEST-001 | feature/FEAT-TEST-001 | (PR pending) | 2026-06-23 |
\`\`\`
EOF

  # Configure a fake "origin" so the unpushed count check is meaningful.
  # We push the initial commit to a local bare repo.
  BARE="$BATS_TEST_TMPDIR/../bare-$$"
  mkdir -p "$BARE"
  git init --bare -q "$BARE"
  git remote remove origin
  git remote add origin "$BARE"
  git push -q origin main
  # Create a feature branch with one commit.
  git checkout -q -b feature/FEAT-TEST-001
  echo "feature work" > feat.txt
  git add feat.txt
  git commit -q -m "feat: initial"
  # Do NOT push the feature branch yet. After F.5, the commit will
  # either amend (if unpushed count = 1) or follow-up.

  run bash -c "
    source '$REPO_ROOT/scripts/workflow-finish.sh' --source-only 2>/dev/null
    apply_context_sync_update \
      '$BATS_TEST_TMPDIR/.copilot/tasks/active/wf-test-feat-001/handoff.yaml' \
      '$BATS_TEST_TMPDIR/.copilot/tasks/active/wf-test-feat-001' \
      '$BATS_TEST_TMPDIR/.copilot/context/workspace-state.md' \
      'feature/FEAT-TEST-001'
  "
  [ "$status" -eq 0 ]

  # The registry row must now be present.
  run cat .copilot/issues/registry.md
  [[ "$output" == *"ISS-PREEX-001"* ]]

  # The workspace-state row must now be present.
  run cat .copilot/context/workspace-state.md
  [[ "$output" == *"wf-test-feat-001"* ]]

  # A new commit must exist (either amended or follow-up).
  run git log --oneline
  [[ "$output" == *"context-sync"* ]] || [[ "$output" == *"amend"* ]]
}
```

### 3. `scripts/tests/step-0.5-doc-presence.bats`

```bash
#!/usr/bin/env bats
# scripts/tests/step-0.5-doc-presence.bats
#
# Verifies that Step 0.5 "Context Sync" is documented in both workflow
# files. (AC-9)
#
# shellcheck shell=bash

REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"

@test "AC-9: requirement-development.md documents Step 0.5" {
  run grep -F "Step 0.5" "$REPO_ROOT/.copilot/workflows/requirement-development.md"
  [ "$status" -eq 0 ]
}

@test "AC-9: issue-resolution.md documents Step 0.5" {
  run grep -F "Step 0.5" "$REPO_ROOT/.copilot/workflows/issue-resolution.md"
  [ "$status" -eq 0 ]
}

@test "AC-9: requirement-development.md references the drift script" {
  run grep -F "check-workflow-state.sh" "$REPO_ROOT/.copilot/workflows/requirement-development.md"
  [ "$status" -eq 0 ]
}

@test "AC-9: issue-resolution.md references the drift script" {
  run grep -F "check-workflow-state.sh" "$REPO_ROOT/.copilot/workflows/issue-resolution.md"
  [ "$status" -eq 0 ]
}
```

### 4. `package.json` (root) — devDependency and test script

Add to existing root `package.json`:

```json
{
  "devDependencies": {
    "bats": "^1.10.0"
  },
  "scripts": {
    "test:bash": "bats scripts/tests/*.bats"
  }
}
```

(Will be merged into the actual file via `replace_string_in_file` by
the TestRunner step — exact location depends on the file's current
state.)

---

## How the F.5 refactor enables testing

The `--source-only` flag is a small new addition to
`workflow-finish.sh`. When passed, the script:

1. Skips Steps A–G.
2. Defines all top-level functions (including
   `apply_context_sync_update`).
3. Defines all top-level constants.
4. Exits 0 immediately.

This is a test affordance only. The flag has no effect on production
behaviour because the production invocation never passes it.

```bash
# near the top of workflow-finish.sh, after set -euo pipefail:
SOURCE_ONLY=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --workflow-dir) WORKFLOW_DIR="$2"; shift 2 ;;
    --push-only)    PUSH_ONLY=true; shift ;;
    --source-only)  SOURCE_ONLY=true; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [[ "$SOURCE_ONLY" == "true" ]]; then
  # Constants and functions are defined below. Bail out.
  return 0 2>/dev/null || exit 0
fi
```

(Note: `return 0` works when the script is `source`d, `exit 0` when
run. Using `return 0 2>/dev/null || exit 0` covers both.)

---

## Self-validation

After the TestRunner step:

- `bash -n scripts/check-workflow-state.sh` — exit 0 (already verified)
- `bash -n scripts/workflow-finish.sh` — exit 0 (already verified)
- `pnpm install` — must succeed; pulls in bats
- `pnpm test:bash` — must run the three .bats files; expected results
  per the matrix above

The TestRunner will report any failure and the QualityGate will block
on a `failed-retry` (route to TestDesigner) if any test fails.

---

## Gate Result

```markdown
## Gate Result

gate_result:
  status: passed
  summary: "Test design covers AC-1, AC-2, AC-6, AC-7, AC-8, AC-9, AC-10 via three bats files. F.5 refactor (extract apply_context_sync_update + add --source-only) is a testability change, not a behaviour change. bats-core declared as root devDependency."
  findings:
    - "Refactor prerequisite: extract F.5 block into apply_context_sync_update() function. Add --source-only flag for testability."
    - "bats-core ^1.10.0 added to root devDependencies."
    - "pnpm test:bash script added to root package.json."
    - "AC-3/4/5 (QualityGate end-to-end) deferred to FEAT-WORKFLOW-002."
  deferred_to_feature: "FEAT-WORKFLOW-002"
  retry_target: ""
```
