#!/usr/bin/env bash
# scripts/tests/test_helper.bash
#
# Shared bats helper. Loaded by every .bats file via:
#   load 'test_helper'
#
# Provides:
#   - setup_test_repo: initialise a fresh git repo in BATS_TEST_TMPDIR
#     with the minimum state files (workspace-state.md, registry.md) and
#     a copy of check-workflow-state.sh / workflow-finish.sh.
#   - assert_exit_code <expected> <cmd...>: assert <cmd...> exits <expected>.
#   - assert_file_contains <file> <regex>: assert <file> matches <regex>.
#   - assert_file_not_contains <file> <regex>: assert <file> lacks <regex>.

# setup_test_repo <repo_type>
# Creates a fresh git repo under BATS_TEST_TMPDIR/repo with:
#   - .copilot/context/workspace-state.md (empty frontmatter)
#   - .copilot/issues/registry.md (empty)
#   - docs/03-requirements/requirements-registry.md (empty)
#   - .copilot/tasks/{active,completed,archived}/ (empty dirs)
#   - scripts/check-workflow-state.sh and scripts/workflow-finish.sh
#     (copied from the project root)
# Args:
#   repo_type: "with-origin" (default) or "local-only"
#     - "with-origin": creates a bare remote under BATS_TEST_TMPDIR/origin
#       and configures the test repo to push to it.
#     - "local-only": no remote; useful for tests that don't push.
setup_test_repo() {
  local repo_type="${1:-with-origin}"
  local repo_root="$BATS_TEST_TMPDIR/repo"
  rm -rf "$repo_root"
  mkdir -p "$repo_root"
  cd "$repo_root"
  git init -q --initial-branch=main
  git config user.email "test@aiqadam.local"
  git config user.name "Test Runner"
  mkdir -p .copilot/context .copilot/issues docs/03-requirements \
           .copilot/tasks/active .copilot/tasks/completed \
           .copilot/tasks/archived scripts
  # State files (empty templates)
  cat > .copilot/context/workspace-state.md <<'EOF'
# Workspace State

**Last updated:** 2026-06-23T00:00:00Z

---

## Active Workflows

_(none)_

---

## Completed Workflows (recent)

| Workflow ID | Type | Feature/Issue | Branch | PR | Date |
|---|---|---|---|---|---|

---

## Open Issues

| ID | Severity | Summary | Status |
|---|---|---|---|

_(none)_

---

## Git State

- **Current branch:** main
- **Last sync with origin:** 2026-06-23
- **Pending PRs:** (none)

## Next Workflow ID

See `.copilot/meta/next-workflow-id` (currently: 0)

---
EOF
  cat > .copilot/issues/registry.md <<'EOF'
# Issues Registry

| ID | Severity | Module | Summary | Status | Workflow | Updated |
|---|---|---|---|---|---|---|
EOF
  cat > docs/03-requirements/requirements-registry.md <<'EOF'
# Requirements Registry

| ID | Module | Summary | Workflow | Status | Date |
|---|---|---|---|---|---|
EOF
  # Copy scripts from project root
  local proj_root
  proj_root="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  cp "$proj_root/scripts/check-workflow-state.sh" scripts/
  cp "$proj_root/scripts/workflow-finish.sh" scripts/
  chmod +x scripts/*.sh
  git add -A
  git commit -q -m "init test repo"
  if [[ "$repo_type" == "with-origin" ]]; then
    local origin_dir="$BATS_TEST_TMPDIR/origin"
    rm -rf "$origin_dir"
    mkdir -p "$origin_dir"
    git init -q --bare "$origin_dir" -b main
    git remote add origin "$origin_dir"
    git push -q origin main
    # Make origin/HEAD resolvable to origin/main.
    git remote set-head origin --auto >/dev/null 2>&1 || true
  fi
  # Disable husky for any commits in tests
  export HUSKY=0
}

# assert_exit_code <expected> <cmd...>
assert_exit_code() {
  local expected="$1"
  shift
  local actual
  # Run the command; capture exit code
  ( "$@" ) >/dev/null 2>&1
  actual=$?
  if [[ "$actual" != "$expected" ]]; then
    echo "FAIL: expected exit $expected, got $actual from: $*" >&2
    return 1
  fi
}

# assert_file_contains <file> <regex>
assert_file_contains() {
  local file="$1"
  local pattern="$2"
  if ! grep -qE "$pattern" "$file"; then
    echo "FAIL: file '$file' does not match regex: $pattern" >&2
    echo "--- file content: ---" >&2
    cat "$file" >&2
    echo "--- end ---" >&2
    return 1
  fi
}

# assert_file_not_contains <file> <regex>
assert_file_not_contains() {
  local file="$1"
  local pattern="$2"
  if grep -qE "$pattern" "$file"; then
    echo "FAIL: file '$file' unexpectedly matches regex: $pattern" >&2
    echo "--- file content: ---" >&2
    cat "$file" >&2
    echo "--- end ---" >&2
    return 1
  fi
}

# assert_stderr_contains <cmd...> <substring>
# Asserts that running <cmd...> writes <substring> to stderr.
# (Used for the PowerShell stderr rule: diagnostics must go to stderr.)
assert_stderr_contains() {
  local substring="${!#}"  # last arg
  set -- "${@:1:$#-1}"      # all but last
  local stderr_actual
  stderr_actual=$("$@" 2>&1 >/dev/null || true)
  if [[ "$stderr_actual" != *"$substring"* ]]; then
    echo "FAIL: stderr of [$*] did not contain: $substring" >&2
    echo "--- actual stderr: ---" >&2
    echo "$stderr_actual" >&2
    echo "--- end ---" >&2
    return 1
  fi
}

# assert_stdout_contains <cmd...> <substring>
# Asserts that running <cmd...> writes <substring> to stdout.
# (Used for the success-summary-on-stdout rule.)
assert_stdout_contains() {
  local substring="${!#}"
  set -- "${@:1:$#-1}"
  local stdout_actual
  stdout_actual=$("$@" 2>/dev/null || true)
  if [[ "$stdout_actual" != *"$substring"* ]]; then
    echo "FAIL: stdout of [$*] did not contain: $substring" >&2
    echo "--- actual stdout: ---" >&2
    echo "$stdout_actual" >&2
    echo "--- end ---" >&2
    return 1
  fi
}
