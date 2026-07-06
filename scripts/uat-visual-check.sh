#!/usr/bin/env bash
# uat-visual-check.sh — mechanical enforcement of the visual evidence protocol.
#
# Two operating modes:
#
# LEGACY MODE (VisualReviewer era, backward-compatible):
#   Usage: bash scripts/uat-visual-check.sh <BP-UAT-NNN> <path-to-02b-visual-review.md>
#   Verifies that 02b-visual-review.md contains one complete review entry per
#   screenshot in the flat uat-results/<BP>/ directory.
#
# SESSION MODE (FR-WORKFLOW-004 agent-driven UAT, AC-4 / AC-10b):
#   Usage: bash scripts/uat-visual-check.sh --session-mode <BP-UAT-NNN> <run-id> <session-log.md>
#   Verifies that the session-log.md contains:
#   (a) one verdict block per screenshot in the run-scoped directory
#       apps/e2e/uat-results/<BP>/<run-id>/, AND
#   (b) each verdict block has all required proof-of-look fields, AND
#   (c) each verdict block references a screenshot that was captured in
#       that same step (same step prefix in the screenshot filename).
#   This is the same-step-screenshot invariant: you cannot judge a screen
#   you did not capture (FR-WORKFLOW-004 AC-10b).
#
# Exit codes (both modes):
#   0 — review/verdicts complete (count match, all required fields present)
#   1 — usage / file-not-found error
#   2 — count mismatch (screenshots without verdict entries)
#   3 — one or more entries missing required proof-of-look fields
#   4 — same-step-screenshot invariant violated (session mode only)
#
# Called by: UATRunner (self-check), Orchestrator (post-session gate,
# pre-push gate) in the uat-verification workflow.

set -euo pipefail

# ---------------------------------------------------------------------------
# Mode dispatch
# ---------------------------------------------------------------------------

if [[ "${1:-}" == "--session-mode" ]]; then
  SESSION_MODE=1
  BP="${2:-}"
  RUN_ID="${3:-}"
  SESSION_LOG="${4:-}"
  if [[ -z "$BP" || -z "$RUN_ID" || -z "$SESSION_LOG" ]]; then
    echo "usage (session mode): $0 --session-mode <BP-UAT-NNN> <run-id> <session-log.md>" >&2
    exit 1
  fi
  REVIEW=""
else
  SESSION_MODE=0
  BP="${1:-}"
  REVIEW="${2:-}"
  RUN_ID=""
  SESSION_LOG=""
  if [[ -z "$BP" || -z "$REVIEW" ]]; then
    echo "usage (legacy): $0 <BP-UAT-NNN> <path-to-02b-visual-review.md>" >&2
    echo "usage (session): $0 --session-mode <BP-UAT-NNN> <run-id> <session-log.md>" >&2
    exit 1
  fi
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ---------------------------------------------------------------------------
# SESSION MODE
# ---------------------------------------------------------------------------

if [[ "$SESSION_MODE" -eq 1 ]]; then
  SHOT_DIR="$REPO_ROOT/apps/e2e/uat-results/$BP/$RUN_ID"

  if [[ ! -d "$SHOT_DIR" ]]; then
    echo "FAIL: run-scoped screenshot directory not found: $SHOT_DIR" >&2
    exit 1
  fi
  if [[ ! -f "$SESSION_LOG" ]]; then
    echo "FAIL: session log not found: $SESSION_LOG" >&2
    exit 1
  fi

  # 1. Count PNGs vs verdict blocks in session log.
  mapfile -t pngs < <(find "$SHOT_DIR" -maxdepth 1 -name '*.png' -printf '%f\n' 2>/dev/null | sort)
  png_count="${#pngs[@]}"

  if [[ "$png_count" -eq 0 ]]; then
    echo "FAIL: no screenshots in $SHOT_DIR — UATRunner produced no evidence" >&2
    exit 2
  fi

  # Count step verdict blocks (each starts with "### Step ")
  verdict_count=$(grep -c '^### Step ' "$SESSION_LOG" || true)

  echo "screenshots: $png_count, verdict blocks: $verdict_count"

  # 2. Every PNG must be referenced in a SCREENSHOT: line in the log.
  missing=0
  for png in "${pngs[@]}"; do
    if ! grep -q "^\*\*SCREENSHOT:\*\* $png " "$SESSION_LOG"; then
      echo "MISSING EVIDENCE: $png has no '**SCREENSHOT:** $png' line in session log" >&2
      missing=1
    fi
  done
  if [[ "$missing" -ne 0 ]]; then
    echo "FAIL: some screenshots have no evidence line in session log" >&2
    exit 2
  fi

  # 3. Every verdict block must reference a screenshot line WITHIN the same step block.
  #    We parse the session log block-by-block.
  required_fields=(
    "visible_elements"
    "rendered_text"
    "dominant_colors"
    "anomalies"
    "Verdict:"
  )

  fail_fields=0
  fail_same_step=0

  # Use awk to split into step blocks and check each block.
  awk '/^### Step /{n++; block=n; shot=""} n{print n "\t" $0}' "$SESSION_LOG" | {
    declare -A seen_fields
    declare -A seen_shot
    current=0

    check_block() {
      local blk="$1"
      [[ "$blk" -eq 0 ]] && return

      local bad=0
      # Check required fields
      for f in "${required_fields[@]}"; do
        if [[ -z "${seen_fields[$blk.$f]:-}" ]]; then
          echo "MISSING FIELD in verdict block #$blk: '$f'" >&2
          bad=1
        fi
      done

      # Check same-step-screenshot invariant: the step block must have a Screenshot line.
      if [[ -z "${seen_shot[$blk]:-}" ]]; then
        echo "SAME-STEP VIOLATION in verdict block #$blk: no Screenshot reference in the verdict block." >&2
        echo "  You cannot render a verdict without a screenshot captured in that same step." >&2
        bad=1
      fi

      [[ "$bad" -ne 0 ]] && return 1 || return 0
    }

    while IFS=$'\t' read -r blk line; do
      if [[ "$blk" -ne "$current" ]]; then
        if ! check_block "$current"; then
          fail_fields=1
        fi
        current="$blk"
      fi
      # Field presence tracking
      for f in "${required_fields[@]}"; do
        if [[ "$line" == *"$f"* ]]; then
          seen_fields[$blk.$f]=1
        fi
      done
      # Same-step screenshot tracking: a **Screenshot:** line inside a verdict block.
      if [[ "$line" =~ \*\*Screenshot:\*\*[[:space:]] ]]; then
        seen_shot[$blk]=1
      fi
    done
    check_block "$current" || fail_fields=1

    if [[ "$fail_fields" -ne 0 ]]; then
      echo "FAIL: one or more verdict blocks missing required proof-of-look fields or screenshot reference" >&2
      exit 3
    fi

    echo "OK: session visual check complete — $png_count screenshots, $verdict_count verdict blocks, all proof-of-look fields present, same-step invariant satisfied."
  }
  exit 0
fi

# ---------------------------------------------------------------------------
# LEGACY MODE (02b-visual-review.md, flat uat-results/<BP>/ directory)
# ---------------------------------------------------------------------------

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
