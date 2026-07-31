#!/usr/bin/env bats
# scripts/tests/find-bp-uat-stakeholders.bats
#
# Tests for scripts/find-bp-uat-stakeholders.sh — given a BP-UAT-NNN code,
# returns every FR-<CODE>/ISS-<n> ref that declares it in a
# business_process/Business-Process field, unioned with the BP-UAT file's
# own linked_issues list.
#
# Motivating gap (ISS-WF-PARENT-SYNC-001): FR-EVT-004/#130 sat at Project
# board Status "Implemented" (never "agent-verified") despite its business
# process (BP-UAT-010) passing 4 separate clean post-merge
# re-verifications — because every one of those re-verification workflows
# only synced ITS OWN issue ref, never asked whether some OTHER FR/ISS
# also had a stake in the same business process. BP-UAT-010.md's own
# linked_issues list only ever recorded child follow-up issues as they
# were filed — the ORIGINAL parent FR-EVT-004, which first declared the
# process_ref relationship, was never added to that list. This script
# closes both gaps: it unions linked_issues with a direct scan of every
# FR-*.md/ISS-*.md file's own business_process/Business-Process field.

load 'test_helper'

setup() {
  setup_test_repo "local-only"
}

write_bp_uat_file() {
  local code="$1" linked_issues="$2"
  cat > "docs/02-business-processes/uat/${code}.md" <<EOF
---
code: ${code}
name: "Test business process"
status: Ready
process_ref: "docs/03-requirements/FR-TEST-001.md"
environment: "http://localhost:4321"
seed_required: false
linked_issues: ${linked_issues}
---

# ${code} — Test business process

## Purpose

Test fixture.
EOF
}

write_fr_file() {
  local fr_code="$1" business_process="$2"
  cat > "docs/03-requirements/${fr_code}.md" <<EOF
---
code: ${fr_code}
name: Test fixture
status: Implemented
module: Test
business_process: ${business_process}
---

## Description

Test fixture.
EOF
}

write_iss_file() {
  local iss_id="$1" business_process="$2"
  cat > ".copilot/issues/${iss_id}.md" <<EOF
# ${iss_id} — test fixture

| Field | Value |
|---|---|
| ID | ${iss_id} |
| Severity | minor |
| Module | test |
| Status | open |
| Business-Process | ${business_process} |

## Symptom

Test fixture.
EOF
}

@test "ISS-WF-PARENT-SYNC-001 motivating case: parent FR is found even when linked_issues only lists child issues" {
  write_bp_uat_file "BP-UAT-010" "[ISS-UAT-010-1, ISS-EVT-004-1]"
  write_fr_file "FR-EVT-004" "[BP-UAT-010]"
  write_iss_file "ISS-UAT-010-1" "BP-UAT-010"
  write_iss_file "ISS-EVT-004-1" "BP-UAT-010"

  run bash scripts/find-bp-uat-stakeholders.sh BP-UAT-010
  [ "$status" -eq 0 ]
  [[ "$output" == *"FR-EVT-004"* ]]
  [[ "$output" == *"ISS-UAT-010-1"* ]]
  [[ "$output" == *"ISS-EVT-004-1"* ]]
}

@test "AC-1: linked_issues entries are included even if their own file has no matching Business-Process field" {
  write_bp_uat_file "BP-UAT-010" "[ISS-ORPHAN-001]"
  # Deliberately no ISS-ORPHAN-001.md file at all — linked_issues is the
  # only source for this one; the script must not crash or drop it.
  run bash scripts/find-bp-uat-stakeholders.sh BP-UAT-010
  [ "$status" -eq 0 ]
  [[ "$output" == *"ISS-ORPHAN-001"* ]]
}

@test "AC-2: an FR/ISS for a DIFFERENT BP-UAT code is excluded" {
  write_bp_uat_file "BP-UAT-010" "[]"
  write_fr_file "FR-UNRELATED-001" "[BP-UAT-020]"
  write_iss_file "ISS-UNRELATED-001" "BP-UAT-020"

  run bash scripts/find-bp-uat-stakeholders.sh BP-UAT-010
  [ "$status" -eq 0 ]
  [[ "$output" != *"FR-UNRELATED-001"* ]]
  [[ "$output" != *"ISS-UNRELATED-001"* ]]
}

@test "AC-3: an FR/ISS declaring multiple BP-UAT codes is still matched" {
  write_bp_uat_file "BP-UAT-010" "[]"
  write_fr_file "FR-MULTI-001" "[BP-UAT-009, BP-UAT-010, BP-UAT-013]"

  run bash scripts/find-bp-uat-stakeholders.sh BP-UAT-010
  [ "$status" -eq 0 ]
  [[ "$output" == *"FR-MULTI-001"* ]]
}

@test "AC-4: output is deduplicated when linked_issues and the file scan both name the same ref" {
  write_bp_uat_file "BP-UAT-010" "[ISS-DUP-001]"
  write_iss_file "ISS-DUP-001" "BP-UAT-010"

  run bash scripts/find-bp-uat-stakeholders.sh BP-UAT-010
  [ "$status" -eq 0 ]
  local count
  count=$(echo "$output" | grep -c "ISS-DUP-001")
  [ "$count" -eq 1 ]
}

@test "AC-5: BP-UAT with no stakeholders at all returns empty output, exit 0" {
  write_bp_uat_file "BP-UAT-999" "[]"
  run bash scripts/find-bp-uat-stakeholders.sh BP-UAT-999
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "AC-6: nonexistent BP-UAT file exits 2" {
  run bash scripts/find-bp-uat-stakeholders.sh BP-UAT-DOES-NOT-EXIST
  [ "$status" -eq 2 ]
  [[ "$output" == *"ERROR"* ]]
}

@test "invocation error: missing BP-UAT-NNN argument exits 2" {
  run bash scripts/find-bp-uat-stakeholders.sh
  [ "$status" -eq 2 ]
  [[ "$output" == *"ERROR"* ]]
}

@test "AC-7: --base ref reads historical state, not the working tree" {
  write_bp_uat_file "BP-UAT-010" "[]"
  write_fr_file "FR-OLD-001" "[BP-UAT-010]"
  git add -A
  git commit -q -m "snapshot with FR-OLD-001"

  # Now add a new stakeholder in the working tree only (uncommitted).
  write_fr_file "FR-NEW-001" "[BP-UAT-010]"

  run bash scripts/find-bp-uat-stakeholders.sh BP-UAT-010 --base HEAD
  [ "$status" -eq 0 ]
  [[ "$output" == *"FR-OLD-001"* ]]
  [[ "$output" != *"FR-NEW-001"* ]]

  # Working-tree (default) mode sees both.
  run bash scripts/find-bp-uat-stakeholders.sh BP-UAT-010
  [ "$status" -eq 0 ]
  [[ "$output" == *"FR-OLD-001"* ]]
  [[ "$output" == *"FR-NEW-001"* ]]
}
