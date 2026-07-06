#!/usr/bin/env bash
# uat-teardown-check.sh — Enforce the deliberate teardown requirement
# (FR-WORKFLOW-004 AC-6 / AC-10c).
#
# Verifies that teardown.md exists in the run-scoped directory and contains
# at least one state entry declaring what was removed or retained.
#
# Usage:
#   bash scripts/uat-teardown-check.sh <bp-uat-nnn> <run-id>
#   bash scripts/uat-teardown-check.sh <teardown-md-path>   (direct path mode)
#
# Exit codes:
#   0 — teardown.md exists and declares at least one state item
#   1 — usage / file-not-found error
#   2 — teardown.md is absent from the run-scoped directory
#   3 — teardown.md exists but names no removed/retained state
#
# teardown.md format produced by UATSessionDriver.writeTeardown():
#   # Teardown — <BP-UAT-NNN>
#   **Policy:** clean-up | hand-off
#   ## State
#   - **<item>:** <action>
#   ...
#
# Called by: Orchestrator after the UAT session and again at the pre-push gate.
# A session with no teardown record fails-retry, not silent-pass.

set -euo pipefail

if [[ -z "$*" ]]; then
  echo "usage: $0 <bp-uat-nnn> <run-id>" >&2
  echo "       $0 <teardown-md-path>" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Accept either (bp-uat, run-id) or a direct path to teardown.md.
if [[ "$#" -ge 2 ]]; then
  BP="$1"
  RUN_ID="$2"
  TEARDOWN="$REPO_ROOT/apps/e2e/uat-results/$BP/$RUN_ID/teardown.md"
else
  TEARDOWN="$1"
fi

# ---------------------------------------------------------------------------
# 1. File existence
# ---------------------------------------------------------------------------

if [[ ! -f "$TEARDOWN" ]]; then
  echo "FAIL: teardown.md not found at: $TEARDOWN" >&2
  echo "Every UAT session MUST end with a deliberate teardown record." >&2
  echo "Call driver.writeTeardown({policy, state}) at the end of the session." >&2
  exit 2
fi

# ---------------------------------------------------------------------------
# 2. At least one declared state item
# ---------------------------------------------------------------------------

# A state item is a line starting with '- **' (the markdown list-item format).
state_count=$(grep -c '^\- \*\*' "$TEARDOWN" || true)

if [[ "$state_count" -eq 0 ]]; then
  echo "FAIL: teardown.md at $TEARDOWN has no state items." >&2
  echo "The teardown record must name at least one item that was removed or retained." >&2
  echo "A silent/empty teardown is a protocol violation (FR-WORKFLOW-004 AC-6)." >&2
  exit 3
fi

# ---------------------------------------------------------------------------
# 3. Policy field present
# ---------------------------------------------------------------------------

if ! grep -q '^\*\*Policy:\*\*' "$TEARDOWN"; then
  echo "FAIL: teardown.md missing '**Policy:** clean-up | hand-off' line." >&2
  exit 3
fi

echo "OK: teardown.md present with $state_count state item(s)."