#!/usr/bin/env bats
# scripts/tests/check-github-issue-links.bats
#
# Tests for scripts/check-github-issue-links.sh — guards against a
# locally-filed issue silently never being pushed to GitHub, the exact
# gap found live during wf-20260730-fix-157/-uat-158, where 4 new ISS-*
# files were created and registered in registry.md but never synced via
# scripts/sync-github-project.sh.
#
# Coverage:
#   - Every non-terminal (open/in-progress/partially-resolved) issue with
#     a real GitHub-Issue link → exit 0
#   - A non-terminal issue with no GitHub-Issue field at all → exit 1
#   - A non-terminal issue with a placeholder ("—", "not yet filed") link
#     → exit 1
#   - A "resolved" issue with no link → exit 0 (terminal, no link required)
#   - A "closed (...)" issue with no link → exit 0 (terminal)
#   - Bold status text ("**resolved**") is still recognised as terminal
#   - An issue file referenced in registry.md but missing on disk → exit 1
#   - --skip bypasses the check entirely → exit 0
#   - --base <ref> reads state from a git ref, not the working tree
#   - Regression: a file with NO "| Status |" table row at all (older
#     header format, e.g. "**Status:** ...") must not silently abort the
#     scan of every ID that sorts after it — this was a real bug found
#     while writing this script (an unguarded `grep -m1` with no match
#     exits 1, and under `set -e` that silently kills the whole script
#     mid-loop with no error printed)

load 'test_helper'

setup() {
  setup_test_repo "local-only"
}

# write_issue_file <iss-id> <status> <github-issue-field-or-empty>
# Writes a minimal .copilot/issues/<iss-id>.md with the standard header
# table shape this script parses.
write_issue_file() {
  local iss_id="$1" status="$2" gh_issue="${3:-}"
  local gh_line=""
  if [[ -n "$gh_issue" ]]; then
    gh_line="| GitHub-Issue | ${gh_issue} |"
  fi
  cat > ".copilot/issues/${iss_id}.md" <<EOF
# ${iss_id} — test fixture

| Field | Value |
|---|---|
| ID | ${iss_id} |
| Severity | bug |
| Module | test |
| Status | ${status} |
${gh_line}

## Symptom

Test fixture.
EOF
}

# append_registry_row <iss-id> <status>
append_registry_row() {
  local iss_id="$1" status="$2"
  echo "| [${iss_id}](${iss_id}.md) | bug | test | test fixture | ${status} | wf-test | 2026-01-01 |" \
    >> .copilot/issues/registry.md
}

@test "AC-1: a non-terminal issue with a real GitHub-Issue link exits 0" {
  write_issue_file "ISS-TEST-001" "open" "https://github.com/aiqadam/ai-qadam-platform/issues/1"
  append_registry_row "ISS-TEST-001" "open"
  run bash scripts/check-github-issue-links.sh
  [ "$status" -eq 0 ]
  [[ "$output" == *"OK:"* ]]
}

@test "AC-2: a non-terminal issue with NO GitHub-Issue field exits 1" {
  write_issue_file "ISS-TEST-002" "open"
  append_registry_row "ISS-TEST-002" "open"
  run bash scripts/check-github-issue-links.sh
  [ "$status" -eq 1 ]
  [[ "$output" == *"MISSING: ISS-TEST-002"* ]]
}

@test "AC-3: a non-terminal issue with a '—' placeholder link exits 1" {
  write_issue_file "ISS-TEST-003" "open" "— (not yet filed)"
  append_registry_row "ISS-TEST-003" "open"
  run bash scripts/check-github-issue-links.sh
  [ "$status" -eq 1 ]
  [[ "$output" == *"MISSING: ISS-TEST-003"* ]]
}

@test "AC-4: a 'resolved' issue with no link exits 0 (terminal, no link required)" {
  write_issue_file "ISS-TEST-004" "resolved"
  append_registry_row "ISS-TEST-004" "resolved"
  run bash scripts/check-github-issue-links.sh
  [ "$status" -eq 0 ]
}

@test "AC-5: a 'closed (wrong diagnosis)' issue with no link exits 0 (terminal)" {
  write_issue_file "ISS-TEST-005" "closed (wrong diagnosis)"
  append_registry_row "ISS-TEST-005" "closed (wrong diagnosis)"
  run bash scripts/check-github-issue-links.sh
  [ "$status" -eq 0 ]
}

@test "AC-6: bold status text ('**resolved**') is still recognised as terminal" {
  write_issue_file "ISS-TEST-006" "**resolved**"
  append_registry_row "ISS-TEST-006" "resolved"
  run bash scripts/check-github-issue-links.sh
  [ "$status" -eq 0 ]
}

@test "AC-7: an in-progress issue with prose suffix ('in-progress (partial)') is still non-terminal and requires a link" {
  write_issue_file "ISS-TEST-007" "in-progress (partial)"
  append_registry_row "ISS-TEST-007" "in-progress"
  run bash scripts/check-github-issue-links.sh
  [ "$status" -eq 1 ]
  [[ "$output" == *"MISSING: ISS-TEST-007"* ]]
}

@test "AC-8: an issue referenced in registry.md but missing on disk exits 1" {
  append_registry_row "ISS-TEST-008" "open"
  # Deliberately do NOT write ISS-TEST-008.md
  run bash scripts/check-github-issue-links.sh
  [ "$status" -eq 1 ]
  [[ "$output" == *"ISS-TEST-008"* ]]
  [[ "$output" == *"does not exist"* ]]
}

@test "AC-9: --skip bypasses the check entirely, even with a real gap present" {
  write_issue_file "ISS-TEST-009" "open"
  append_registry_row "ISS-TEST-009" "open"
  run bash scripts/check-github-issue-links.sh --skip
  [ "$status" -eq 0 ]
  [[ "$output" == *"WARNING"* ]]
}

@test "AC-10 (regression): a file with NO '| Status |' table row does not silently abort the scan of later IDs" {
  # ISS-TEST-OLD uses the older bold-prose header format
  # ("**Status:** ...") instead of a "| Status |" table row — grep -m1
  # finds no match, exits 1, and (before the fix) that exit 1 propagated
  # through `set -e` and silently killed the whole script mid-loop.
  cat > ".copilot/issues/ISS-TEST-OLD.md" <<'EOF'
# ISS-TEST-OLD — old-format header

**Severity:** blocker
**Status:** RESOLVED 2026-01-01

## Symptom

Test fixture using the older bold-prose header format.
EOF
  append_registry_row "ISS-TEST-OLD" "resolved"
  # ISS-TEST-ZZZ sorts alphabetically AFTER ISS-TEST-OLD and is a real,
  # genuine gap — it must still be found, proving the scan did not stop
  # at ISS-TEST-OLD.
  write_issue_file "ISS-TEST-ZZZ" "open"
  append_registry_row "ISS-TEST-ZZZ" "open"

  run bash scripts/check-github-issue-links.sh
  [ "$status" -eq 1 ]
  [[ "$output" == *"MISSING: ISS-TEST-ZZZ"* ]]
}

@test "AC-11: --base <ref> reads registry/issue state from a git ref, not the dirty working tree" {
  write_issue_file "ISS-TEST-011" "open" "https://github.com/aiqadam/ai-qadam-platform/issues/11"
  append_registry_row "ISS-TEST-011" "open"
  git add -A && git commit -q -m "add ISS-TEST-011 with a link"

  # Now dirty the working tree by removing the link — --base HEAD must
  # still see the committed (linked) version, not this uncommitted edit.
  write_issue_file "ISS-TEST-011" "open"

  run bash scripts/check-github-issue-links.sh --base HEAD
  [ "$status" -eq 0 ]
}

@test "AC-12: multiple non-terminal issues missing links are all reported, not just the first" {
  write_issue_file "ISS-TEST-A" "open"
  append_registry_row "ISS-TEST-A" "open"
  write_issue_file "ISS-TEST-B" "open"
  append_registry_row "ISS-TEST-B" "open"

  run bash scripts/check-github-issue-links.sh
  [ "$status" -eq 1 ]
  [[ "$output" == *"MISSING: ISS-TEST-A"* ]]
  [[ "$output" == *"MISSING: ISS-TEST-B"* ]]
  [[ "$output" == *"2 non-terminal issue(s)"* ]]
}
