#!/usr/bin/env bats
# scripts/tests/bp-uat-template-rule.bats
#
# Documentation regression test for the "Negative-scenario assertion
# rule (mandatory)" subsection added to
# docs/02-business-processes/uat/BP-UAT-template.md by
# wf-20260629-fix-038 (ISS-UAT-013-6).
#
# These are NOT application tests. They are doc-presence assertions
# that fail if a future contributor deletes the rule paragraph. They
# follow the same pattern as scripts/tests/step-0.5-doc-presence.bats.
#
# Run:
#   bash scripts/run-bats.sh scripts/tests/bp-uat-template-rule.bats
#   pnpm test:bash

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  TEMPLATE="$REPO_ROOT/docs/02-business-processes/uat/BP-UAT-template.md"
  export REPO_ROOT TEMPLATE
}

@test "AC-3: rule subsection header is present in BP-UAT-template.md" {
  [ -f "$TEMPLATE" ]
  grep -qE '^### Negative-scenario assertion rule \(mandatory\)' "$TEMPLATE"
}

@test "AC-3: rule mandates the API contract alongside UI assertions" {
  grep -qiE 'API contract[, ]+not just the UI' "$TEMPLATE"
}

@test "AC-3: rule forbids vacuous UI assertions" {
  grep -qiE 'vacuous UI assertions? (are|is) forbidden' "$TEMPLATE"
}

@test "AC-3: rule lives under ## Negative Scenarios (not orphaned)" {
  # awk prints only the part of the file after the ## Negative Scenarios
  # heading; if the rule subsection heading does not appear within that
  # window, the rule is misplaced.
  awk '/^## Negative Scenarios/{flag=1; next} /^## /{flag=0} flag' "$TEMPLATE" \
    | grep -qE '^### Negative-scenario assertion rule \(mandatory\)'
}

@test "AC-3: rule includes a fenced TypeScript snippet with page.request.get" {
  # Take the slice starting at the rule subsection header, then look
  # for the canonical API-disambiguation pattern in any fenced code
  # block that follows it.
  awk '/^### Negative-scenario assertion rule \(mandatory\)/{flag=1; next} flag' "$TEMPLATE" \
    | grep -qE 'page\.request\.get|apiRes\.status\(\)'
}
