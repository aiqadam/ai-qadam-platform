#!/usr/bin/env bash
# uat-navigation-check.sh — Enforce the one-goto rule (FR-WORKFLOW-004 AC-2 / AC-10a).
#
# Parses a session-log.md action trace and fails if any navigation (GOTO or HOP)
# after the initial landing-page visit is undeclared — i.e. not preceded by a
# CLICK in the same step AND not a declared external HOP.
#
# Usage:
#   bash scripts/uat-navigation-check.sh <session-log.md> <bp-uat-script.md>
#
# Exit codes:
#   0 — all navigations are legal (initial goto + declared hops + click-driven)
#   1 — usage / file-not-found error
#   2 — undeclared mid-session deep-link found (names the offending step/URL)
#
# Action-trace format emitted by uat-session-driver.ts:
#   **ACTION-TRACE:** GOTO url="<url>" type=landing step=initial
#   **ACTION-TRACE:** HOP url="<url>" justification="<reason>"
#   **ACTION-TRACE:** CLICK target="<desc>" url="<current-url>"
#   **ACTION-TRACE:** FILL  target="<desc>" url="<current-url>"
#   **ACTION-TRACE:** GOTO url="<url>" type=undeclared  ← VIOLATION
#
# Called by: Orchestrator after the UAT session and again at the pre-push gate.

set -euo pipefail

SESSION_LOG="${1:-}"
BP_SCRIPT="${2:-}"

if [[ -z "$SESSION_LOG" || -z "$BP_SCRIPT" ]]; then
  echo "usage: $0 <session-log.md> <bp-uat-script.md>" >&2
  exit 1
fi
if [[ ! -f "$SESSION_LOG" ]]; then
  echo "FAIL: session log not found: $SESSION_LOG" >&2
  exit 1
fi
if [[ ! -f "$BP_SCRIPT" ]]; then
  echo "FAIL: BP-UAT script not found: $BP_SCRIPT" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 1. Extract declared external_hops from BP-UAT front-matter
# ---------------------------------------------------------------------------
# The YAML front-matter block is delimited by '---' lines. We extract URL
# values from lines like: `  - url: "http://localhost:8025"`.

declare -a declared_hops=()
in_frontmatter=0
frontmatter_seen=0
while IFS= read -r line; do
  if [[ "$line" == "---" ]]; then
    if [[ "$frontmatter_seen" -eq 0 ]]; then
      frontmatter_seen=1
      in_frontmatter=1
      continue
    elif [[ "$in_frontmatter" -eq 1 ]]; then
      in_frontmatter=0
      break
    fi
  fi
  if [[ "$in_frontmatter" -eq 1 && "$line" =~ url:[[:space:]]*\"([^\"]+)\" ]]; then
    declared_hops+=("${BASH_REMATCH[1]}")
  fi
done < "$BP_SCRIPT"

# ---------------------------------------------------------------------------
# 2. Parse the action trace
# ---------------------------------------------------------------------------

violations=0
initial_goto_seen=0
last_action=""
lineno=0

while IFS= read -r line; do
  lineno=$((lineno + 1))

  if [[ "$line" != *"ACTION-TRACE:"* ]]; then
    continue
  fi

  # Determine action type from the trace line.
  if [[ "$line" =~ GOTO[[:space:]]url=\"([^\"]+)\"[[:space:]]type=landing ]]; then
    # The initial landing-page visit — always allowed.
    initial_goto_seen=1
    last_action="GOTO_LANDING"
    continue
  fi

  if [[ "$line" =~ HOP[[:space:]]url=\"([^\"]+)\" ]]; then
    # A declared external hop — allowed regardless of last_action.
    hop_url="${BASH_REMATCH[1]}"
    last_action="HOP"
    # Verify the hop URL was declared in the BP-UAT front-matter.
    found=0
    for h in "${declared_hops[@]:-}"; do
      if [[ "$hop_url" == "$h"* ]]; then
        found=1
        break
      fi
    done
    if [[ "$found" -eq 0 ]]; then
      echo "VIOLATION at line $lineno: HOP to '$hop_url' is not declared in '$BP_SCRIPT' external_hops front-matter." >&2
      violations=$((violations + 1))
    fi
    continue
  fi

  if [[ "$line" =~ GOTO[[:space:]]url=\"([^\"]+)\" ]]; then
    # A GOTO that is neither the landing page nor a HOP → undeclared deep-link.
    goto_url="${BASH_REMATCH[1]}"
    echo "VIOLATION at line $lineno: undeclared mid-session GOTO to '$goto_url'. Use externalHop() if this navigation is intentional." >&2
    violations=$((violations + 1))
    continue
  fi

  if [[ "$line" =~ CLICK[[:space:]] ]]; then
    last_action="CLICK"
    continue
  fi

  if [[ "$line" =~ FILL[[:space:]] || "$line" =~ CHECK[[:space:]] ]]; then
    last_action="FILL_OR_CHECK"
    continue
  fi

done < "$SESSION_LOG"

if [[ "$initial_goto_seen" -eq 0 ]]; then
  echo "FAIL: no initial landing-page GOTO found in session log — session did not start at the landing page." >&2
  exit 2
fi

if [[ "$violations" -gt 0 ]]; then
  echo "FAIL: $violations undeclared navigation(s) found. See lines above." >&2
  exit 2
fi

echo "OK: all navigations are legal (initial goto + ${#declared_hops[@]} declared hops, no undeclared deep-links)."