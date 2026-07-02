#!/usr/bin/env bash
# uat-visual-check.sh — mechanical enforcement of the VisualReviewer protocol.
#
# Verifies that the visual review file contains one complete review entry per
# screenshot produced by UATRunner. This makes "skipping the visual review"
# a hard gate failure instead of a soft instruction violation.
#
# Usage:
#   bash scripts/uat-visual-check.sh <BP-UAT-NNN> <path-to-02b-visual-review.md>
#
# Exit codes:
#   0 — review complete (entry count matches, all required fields present)
#   1 — usage / file-not-found error
#   2 — entry count mismatch (screenshots without review entries)
#   3 — one or more entries missing required proof-of-look fields
#
# Called by: VisualReviewer (self-check) and Orchestrator (pre-push gate) in
# the uat-verification workflow.

set -euo pipefail

BP="${1:-}"
REVIEW="${2:-}"

if [[ -z "$BP" || -z "$REVIEW" ]]; then
  echo "usage: $0 <BP-UAT-NNN> <path-to-02b-visual-review.md>" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHOT_DIR="$REPO_ROOT/apps/e2e/uat-results/$BP"

if [[ ! -d "$SHOT_DIR" ]]; then
  echo "FAIL: screenshot directory not found: $SHOT_DIR" >&2
  exit 1
fi
if [[ ! -f "$REVIEW" ]]; then
  echo "FAIL: review file not found: $REVIEW" >&2
  exit 1
fi

# --- 1. Count screenshots vs review entries -------------------------------
mapfile -t pngs < <(find "$SHOT_DIR" -maxdepth 1 -name '*.png' -printf '%f\n' | sort)
png_count="${#pngs[@]}"
entry_count="$(grep -c '^### Screenshot: ' "$REVIEW" || true)"

if [[ "$png_count" -eq 0 ]]; then
  echo "FAIL: no screenshots in $SHOT_DIR — UATRunner produced no evidence" >&2
  exit 2
fi

missing=0
for png in "${pngs[@]}"; do
  if ! grep -q "^### Screenshot: $png" "$REVIEW"; then
    echo "MISSING ENTRY: $png has no '### Screenshot: $png' block in review" >&2
    missing=1
  fi
done

echo "screenshots: $png_count, review entries: $entry_count"
if [[ "$missing" -ne 0 || "$entry_count" -lt "$png_count" ]]; then
  echo "FAIL: review is incomplete — every PNG needs a review entry" >&2
  exit 2
fi

# --- 2. Required proof-of-look fields per entry ----------------------------
# Split the file into entry blocks and check each block has all fields.
required_fields=(
  "visible_elements"
  "rendered_text"
  "dominant_colors"
  "anomalies"
  "expected_state_verdict"
  "design_system"
)

fail_fields=0
awk '/^### Screenshot: /{n++} n{print n "\t" $0}' "$REVIEW" | {
  # collect field presence per block
  declare -A seen
  current=0
  bad=0
  check_block() {
    local blk="$1"
    [[ "$blk" -eq 0 ]] && return
    for f in "${required_fields[@]}"; do
      if [[ -z "${seen[$blk.$f]:-}" ]]; then
        echo "MISSING FIELD: entry #$blk lacks '$f'" >&2
        bad=1
      fi
    done
  }
  while IFS=$'\t' read -r blk line; do
    if [[ "$blk" -ne "$current" ]]; then
      check_block "$current"
      current="$blk"
    fi
    for f in "${required_fields[@]}"; do
      if [[ "$line" == *"$f"* ]]; then seen[$blk.$f]=1; fi
    done
  done
  check_block "$current"
  exit "$bad"
} || fail_fields=1

if [[ "$fail_fields" -ne 0 ]]; then
  echo "FAIL: one or more entries missing required proof-of-look fields" >&2
  exit 3
fi

echo "OK: visual review complete — $png_count/$png_count screenshots reviewed with all required fields."
