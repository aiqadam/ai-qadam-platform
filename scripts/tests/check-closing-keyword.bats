#!/usr/bin/env bats
# scripts/tests/check-closing-keyword.bats
#
# Tests for scripts/check-closing-keyword.sh — guards against a commit
# closing a GitHub issue via a keyword (Closes/Fixes/Resolves #N) before
# its mandatory Step 13 post-merge UAT re-verification has run. The
# motivating incident: issue #130 (FR-EVT-004) closed at merge time via
# an unreviewed "Closes #130" in the squash commit, even though its
# business_process linkage meant Step 13 hadn't run yet — Step 13 later
# found 2 real open issues on that same surface, but the closed GitHub
# issue gave no signal of that. See ISS-WF-GH-CLOSE-001.
#
# Coverage:
#   - Closing keyword + non-empty business_process → exit 1
#   - Closing keyword + empty/— business_process → exit 0 (correct, unchanged)
#   - No closing keyword (e.g. "Refs #N") + non-empty business_process → exit 0
#   - Case-insensitive keyword matching (Closes/CLOSES/fixes/Resolved)
#   - --business-process passed explicitly overrides file lookup
#   - Works for both ISS-<n> and FR-<CODE> refs
#   - No resolvable GitHub issue number yet → exit 0 (nothing to check)

load 'test_helper'

setup() {
  setup_test_repo "local-only"
}

write_iss_file() {
  local iss_id="$1" business_process="$2" gh_issue="$3"
  cat > ".copilot/issues/${iss_id}.md" <<EOF
# ${iss_id} — test fixture

| Field | Value |
|---|---|
| ID | ${iss_id} |
| Severity | bug |
| Module | test |
| Status | open |
| Business-Process | ${business_process} |
| GitHub-Issue | ${gh_issue} |

## Symptom

Test fixture.
EOF
}

write_fr_file() {
  local fr_code="$1" business_process="$2" gh_issue="$3"
  mkdir -p docs/03-requirements
  cat > "docs/03-requirements/${fr_code}.md" <<EOF
---
code: ${fr_code}
name: Test fixture
status: Implemented
module: Test
github_issue: ${gh_issue}
business_process: ${business_process}
---

## Description

Test fixture.
EOF
}

@test "AC-1: closing keyword + non-empty business_process exits 1" {
  write_iss_file "ISS-TEST-001" "[BP-UAT-010]" "https://github.com/aiqadam/ai-qadam-platform/issues/130"
  echo "fix(x): do the thing

Closes #130" > commit-msg.txt
  run bash scripts/check-closing-keyword.sh --message-file commit-msg.txt --issue-ref ISS-TEST-001
  [ "$status" -eq 1 ]
  [[ "$output" == *"ERROR"* ]]
}

@test "AC-2: closing keyword + empty business_process (—) exits 0" {
  write_iss_file "ISS-TEST-002" "—" "https://github.com/aiqadam/ai-qadam-platform/issues/131"
  echo "fix(x): do the thing

Closes #131" > commit-msg.txt
  run bash scripts/check-closing-keyword.sh --message-file commit-msg.txt --issue-ref ISS-TEST-002
  [ "$status" -eq 0 ]
  [[ "$output" == *"OK:"* ]]
}

@test "AC-3: no closing keyword (Refs #N) + non-empty business_process exits 0" {
  write_iss_file "ISS-TEST-003" "[BP-UAT-010]" "https://github.com/aiqadam/ai-qadam-platform/issues/132"
  echo "fix(x): do the thing

Refs #132" > commit-msg.txt
  run bash scripts/check-closing-keyword.sh --message-file commit-msg.txt --issue-ref ISS-TEST-003
  [ "$status" -eq 0 ]
}

@test "AC-4: case-insensitive keyword matching (CLOSES)" {
  write_iss_file "ISS-TEST-004" "[BP-UAT-013]" "https://github.com/aiqadam/ai-qadam-platform/issues/133"
  echo "fix(x): do the thing

CLOSES #133" > commit-msg.txt
  run bash scripts/check-closing-keyword.sh --message-file commit-msg.txt --issue-ref ISS-TEST-004
  [ "$status" -eq 1 ]
}

@test "AC-4b: case-insensitive keyword matching (fixes / Resolved)" {
  write_iss_file "ISS-TEST-004B" "[BP-UAT-013]" "https://github.com/aiqadam/ai-qadam-platform/issues/134"
  echo "fix(x): do the thing

fixes #134" > commit-msg-a.txt
  run bash scripts/check-closing-keyword.sh --message-file commit-msg-a.txt --issue-ref ISS-TEST-004B
  [ "$status" -eq 1 ]

  echo "fix(x): do the thing

Resolved #134" > commit-msg-b.txt
  run bash scripts/check-closing-keyword.sh --message-file commit-msg-b.txt --issue-ref ISS-TEST-004B
  [ "$status" -eq 1 ]
}

@test "AC-5: --business-process passed explicitly overrides file lookup" {
  write_iss_file "ISS-TEST-005" "—" "https://github.com/aiqadam/ai-qadam-platform/issues/135"
  echo "fix(x): do the thing

Closes #135" > commit-msg.txt
  run bash scripts/check-closing-keyword.sh --message-file commit-msg.txt --issue-ref ISS-TEST-005 --business-process "[BP-UAT-010]"
  [ "$status" -eq 1 ]
}

@test "AC-6: works for FR-<CODE> refs (frontmatter business_process)" {
  write_fr_file "FR-EVT-004" "[BP-UAT-010]" "https://github.com/aiqadam/ai-qadam-platform/issues/130"
  echo "FR-EVT-004: ship event detail page

Closes #130" > commit-msg.txt
  run bash scripts/check-closing-keyword.sh --message-file commit-msg.txt --issue-ref FR-EVT-004
  [ "$status" -eq 1 ]
}

@test "AC-7: FR-<CODE> with empty business_process ([]) exits 0" {
  write_fr_file "FR-TEST-001" "[]" "https://github.com/aiqadam/ai-qadam-platform/issues/136"
  echo "FR-TEST-001: ship thing

Closes #136" > commit-msg.txt
  run bash scripts/check-closing-keyword.sh --message-file commit-msg.txt --issue-ref FR-TEST-001
  [ "$status" -eq 0 ]
}

@test "AC-8: no resolvable GitHub issue number yet exits 0 (nothing to check)" {
  write_iss_file "ISS-TEST-008" "[BP-UAT-010]" ""
  echo "fix(x): do the thing

Closes #999" > commit-msg.txt
  run bash scripts/check-closing-keyword.sh --message-file commit-msg.txt --issue-ref ISS-TEST-008
  [ "$status" -eq 0 ]
}

@test "AC-9: closing keyword for a DIFFERENT issue number does not false-positive" {
  write_iss_file "ISS-TEST-009" "[BP-UAT-010]" "https://github.com/aiqadam/ai-qadam-platform/issues/140"
  echo "fix(x): do the thing, also mentions an unrelated issue

Refs #140
Closes #999" > commit-msg.txt
  run bash scripts/check-closing-keyword.sh --message-file commit-msg.txt --issue-ref ISS-TEST-009
  [ "$status" -eq 0 ]
}

@test "invocation error: missing --message-file/--body-file exits 2" {
  write_iss_file "ISS-TEST-010" "[BP-UAT-010]" "https://github.com/aiqadam/ai-qadam-platform/issues/141"
  run bash scripts/check-closing-keyword.sh --issue-ref ISS-TEST-010
  [ "$status" -eq 2 ]
}

@test "invocation error: nonexistent message file exits 2" {
  write_iss_file "ISS-TEST-011" "[BP-UAT-010]" "https://github.com/aiqadam/ai-qadam-platform/issues/142"
  run bash scripts/check-closing-keyword.sh --message-file /nonexistent --issue-ref ISS-TEST-011
  [ "$status" -eq 2 ]
}

# ── ISS-WF-GH-CLOSE-002: --body-file (PR body text), a second closing-
# keyword vector GitHub's auto-close scanner honors independently of
# commit messages. Motivating incident: PR #181's body contained
# "Closes #160" in prose while its commit message correctly used
# "Refs #160" — the commit-message-only guard had nothing to say about
# the PR body, so the issue closed at merge before Step 13 ran.

@test "ISS-WF-GH-CLOSE-002 AC-1: PR body closing keyword + non-empty business_process exits 1 (reproduces issue #160)" {
  write_iss_file "ISS-UAT-010-2-TEST" "[BP-UAT-010]" "https://github.com/aiqadam/ai-qadam-platform/issues/160"
  echo "Fixes a race condition.

Closes #160 / ISS-UAT-010-2-TEST. Live UAT found this bug." > pr-body.txt
  run bash scripts/check-closing-keyword.sh --body-file pr-body.txt --issue-ref ISS-UAT-010-2-TEST
  [ "$status" -eq 1 ]
  [[ "$output" == *"PR body"* ]]
}

@test "ISS-WF-GH-CLOSE-002 AC-2: PR body with neutral reference + non-empty business_process exits 0" {
  write_iss_file "ISS-TEST-012" "[BP-UAT-010]" "https://github.com/aiqadam/ai-qadam-platform/issues/143"
  echo "Fixes a race condition.

Addresses #143 / ISS-TEST-012." > pr-body.txt
  run bash scripts/check-closing-keyword.sh --body-file pr-body.txt --issue-ref ISS-TEST-012
  [ "$status" -eq 0 ]
}

@test "ISS-WF-GH-CLOSE-002 AC-3: --message-file and --body-file together is an invocation error" {
  write_iss_file "ISS-TEST-013" "[BP-UAT-010]" "https://github.com/aiqadam/ai-qadam-platform/issues/144"
  echo "Refs #144" > commit-msg.txt
  echo "Refs #144" > pr-body.txt
  run bash scripts/check-closing-keyword.sh --message-file commit-msg.txt --body-file pr-body.txt --issue-ref ISS-TEST-013
  [ "$status" -eq 2 ]
}
