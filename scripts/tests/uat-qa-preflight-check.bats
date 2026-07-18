#!/usr/bin/env bats
# scripts/tests/uat-qa-preflight-check.bats
#
# Regression tests for scripts/uat-qa-preflight-check.sh — the read-only
# QA-target HTTPS reachability pre-flight introduced for FR-WORKFLOW-005
# (see .copilot/tasks/active/wf-20260718-feat-121/).
#
# These tests use the `UAT_QA_PREFLIGHT_HTTP_CODES` test hook to inject
# synthetic HTTP status codes. They therefore do NOT exercise the real
# `curl` network path against qa.aiqadam.org / auth.qa.aiqadam.org — see
# the script header for the test-hook contract and 03-code-summary.md for
# Known Limitations.
#
# Coverage:
#   - AC-3a/b: both QA hosts healthy → pass, exit 0
#   - AC-3b:   QA app host down → fail, exit 1, names qa.aiqadam.org
#   - AC-3b:   QA IdP host down → fail, exit 1, names auth.qa.aiqadam.org
#   - AC-3b:   both hosts down → fail, exit 1
#   - AC-3c:   read-only message printed verbatim
#   - AC-3c:   structural regression guard — script source contains no
#              `uat:seed` token at all (grep -c expects 0)
#   - bonus:   --help / -h exit 0 with usage; --base-url override honoured;
#              invocation errors exit 2; --base-url does not redirect the
#              fixed IdP check (TestDesigner addition, wf-20260718-feat-121,
#              06-test-design.md)
#
# Run:
#   bash scripts/run-bats.sh scripts/tests/uat-qa-preflight-check.bats
#   pnpm test:bash                                       # picks up the glob

load 'test_helper'

setup() {
  unset UAT_QA_PREFLIGHT_HTTP_CODES
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  export REPO_ROOT
}

teardown() {
  unset UAT_QA_PREFLIGHT_HTTP_CODES
}

@test "AC-3a/b: both QA hosts healthy passes with exit 0" {
  export UAT_QA_PREFLIGHT_HTTP_CODES="qa.aiqadam.org=200,auth.qa.aiqadam.org=200"
  run bash "$REPO_ROOT/scripts/uat-qa-preflight-check.sh" 2>&1
  [ "$status" -eq 0 ]
  [[ "$output" == *"QA pre-flight passed"* ]]
}

@test "AC-3a/b: both QA hosts healthy via 3xx also passes" {
  export UAT_QA_PREFLIGHT_HTTP_CODES="qa.aiqadam.org=301,auth.qa.aiqadam.org=302"
  run bash "$REPO_ROOT/scripts/uat-qa-preflight-check.sh" 2>&1
  [ "$status" -eq 0 ]
  [[ "$output" == *"QA pre-flight passed"* ]]
}

@test "AC-3b: QA app host down fails with exit 1 and names qa.aiqadam.org" {
  export UAT_QA_PREFLIGHT_HTTP_CODES="qa.aiqadam.org=500,auth.qa.aiqadam.org=200"
  run bash "$REPO_ROOT/scripts/uat-qa-preflight-check.sh" 2>&1
  [ "$status" -eq 1 ]
  [[ "$output" == *"qa.aiqadam.org"* ]]
  [[ "$output" == *"unreachable"* ]]
  [[ "$output" == *"QA pre-flight failed"* ]]
}

@test "AC-3b: QA IdP host down (connection failure) fails with exit 1 and names auth.qa.aiqadam.org" {
  export UAT_QA_PREFLIGHT_HTTP_CODES="qa.aiqadam.org=200,auth.qa.aiqadam.org=000"
  run bash "$REPO_ROOT/scripts/uat-qa-preflight-check.sh" 2>&1
  [ "$status" -eq 1 ]
  [[ "$output" == *"auth.qa.aiqadam.org"* ]]
  [[ "$output" == *"unreachable"* ]]
  [[ "$output" == *"QA pre-flight failed"* ]]
}

@test "AC-3b: both QA hosts down fails with exit 1 and names both hosts" {
  export UAT_QA_PREFLIGHT_HTTP_CODES="qa.aiqadam.org=000,auth.qa.aiqadam.org=500"
  run bash "$REPO_ROOT/scripts/uat-qa-preflight-check.sh" 2>&1
  [ "$status" -eq 1 ]
  [[ "$output" == *"qa.aiqadam.org"* ]]
  [[ "$output" == *"auth.qa.aiqadam.org"* ]]
  [[ "$output" == *"QA pre-flight failed"* ]]
}

@test "AC-3c: read-only / never-invoked-against-QA message is printed verbatim" {
  export UAT_QA_PREFLIGHT_HTTP_CODES="qa.aiqadam.org=200,auth.qa.aiqadam.org=200"
  run bash "$REPO_ROOT/scripts/uat-qa-preflight-check.sh" 2>&1
  [ "$status" -eq 0 ]
  [[ "$output" == *"QA target is read-only; seed/reset is out of scope for FR-WORKFLOW-005 and is never invoked against QA."* ]]
}

@test "AC-3c: read-only message is printed even on failure (always logged before checks)" {
  export UAT_QA_PREFLIGHT_HTTP_CODES="qa.aiqadam.org=500,auth.qa.aiqadam.org=500"
  run bash "$REPO_ROOT/scripts/uat-qa-preflight-check.sh" 2>&1
  [ "$status" -eq 1 ]
  [[ "$output" == *"QA target is read-only; seed/reset is out of scope for FR-WORKFLOW-005 and is never invoked against QA."* ]]
}

@test "AC-3c: structural regression guard — script source contains no uat:seed token" {
  run grep -c 'uat:seed' "$REPO_ROOT/scripts/uat-qa-preflight-check.sh"
  # grep -c prints "0" and exits 1 when there are zero matches; assert both
  # the count is exactly 0 and (implicitly, via the -c output itself) that
  # no invocation of the seed script appears anywhere in the source,
  # including comments — a stronger guarantee than "not reachable at
  # runtime", per AC-3c / the SecurityReviewer flag in 02-impact-analysis.md.
  [ "$output" = "0" ]
}

@test "bonus: --help exits 0 with usage on stdout" {
  run bash "$REPO_ROOT/scripts/uat-qa-preflight-check.sh" --help
  [ "$status" -eq 0 ]
  [[ "$output" == *"usage"* ]]
  [[ "$output" == *"base-url"* ]]
}

@test "bonus: -h exits 0 with usage on stdout" {
  run bash "$REPO_ROOT/scripts/uat-qa-preflight-check.sh" -h
  [ "$status" -eq 0 ]
  [[ "$output" == *"usage"* ]]
}

@test "bonus: --base-url override is honoured and checked against the test hook" {
  export UAT_QA_PREFLIGHT_HTTP_CODES="staging.example.com=200,auth.qa.aiqadam.org=200"
  run bash "$REPO_ROOT/scripts/uat-qa-preflight-check.sh" --base-url https://staging.example.com 2>&1
  [ "$status" -eq 0 ]
  [[ "$output" == *"staging.example.com"* ]]
  [[ "$output" == *"QA pre-flight passed"* ]]
}

@test "bonus: --base-url with missing value exits 2 (invocation error)" {
  run bash "$REPO_ROOT/scripts/uat-qa-preflight-check.sh" --base-url 2>&1
  [ "$status" -eq 2 ]
  [[ "$output" == *"usage"* ]]
}

@test "bonus: unrecognized flag exits 2 (invocation error)" {
  run bash "$REPO_ROOT/scripts/uat-qa-preflight-check.sh" --bogus 2>&1
  [ "$status" -eq 2 ]
  [[ "$output" == *"usage"* ]]
}

@test "bonus: --base-url does not affect the fixed IdP URL (auth.qa.aiqadam.org is always checked)" {
  export UAT_QA_PREFLIGHT_HTTP_CODES="staging.example.com=200,auth.qa.aiqadam.org=500"
  run bash "$REPO_ROOT/scripts/uat-qa-preflight-check.sh" --base-url https://staging.example.com 2>&1
  [ "$status" -eq 1 ]
  [[ "$output" == *"staging.example.com"* ]]
  [[ "$output" == *"auth.qa.aiqadam.org"* ]]
  [[ "$output" == *"unreachable"* ]]
  [[ "$output" == *"QA pre-flight failed"* ]]
}
