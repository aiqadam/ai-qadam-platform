#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.." || exit 1
echo "--- uat-seed.sh grep ---"
grep -nE 'ISS-UAT-013-14|token_plain // empty' scripts/uat-seed.sh | head -10
echo "--- file sizes ---"
wc -l scripts/uat-seed.sh scripts/tests/uat-seed.bats
echo "--- bats new @test count ---"
grep -cE '@test "ISS-UAT-013-14' scripts/tests/uat-seed.bats
echo "--- bats last 12 @tests ---"
grep -nE '@test' scripts/tests/uat-seed.bats | tail -12
