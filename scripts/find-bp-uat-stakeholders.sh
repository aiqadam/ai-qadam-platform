#!/usr/bin/env bash
# scripts/find-bp-uat-stakeholders.sh
#
# Given a BP-UAT-NNN code, prints every FR-<CODE>/ISS-<n> ref that has a
# stake in that business process — i.e. should have its GitHub Project
# board Status synced to `agent-verified` whenever that BP-UAT passes a
# clean post-merge re-verification, not just the ref of the workflow that
# happened to trigger the run.
#
# Motivating gap (ISS-WF-PARENT-SYNC-001): FR-EVT-004/#130 sat at
# Project-board Status `Implemented` for its entire lifetime, even though
# its own linked business process (BP-UAT-010) passed 4 separate clean
# post-merge re-verifications across 4 different follow-up workflows.
# Each of those workflows correctly synced ITS OWN issue ref to
# agent-verified — none of them ever asked "does some OTHER FR/ISS also
# declare this same BP-UAT-NNN and need the same sync?". The BP-UAT
# file's own `linked_issues` frontmatter list only ever recorded CHILD
# follow-up issues as they were filed — the ORIGINAL parent FR that first
# declared the process_ref relationship was never added to that list, so
# even a naive scan of linked_issues alone would still have missed
# FR-EVT-004. This script closes both gaps at once: it unions
# linked_issues with a direct grep of every FR-*.md/ISS-*.md file's own
# business_process/Business-Process field.
#
# Output: one ref per line (e.g. "FR-EVT-004", "ISS-UAT-010-1"), sorted,
# deduplicated. Empty output (exit 0) is valid — it just means nothing
# currently declares that BP-UAT-NNN.
#
# Exit codes:
#   0  Ran successfully (output may be empty).
#   2  Invocation error (missing arg, BP-UAT file not found, not a repo).
#
# Invocation:
#   scripts/find-bp-uat-stakeholders.sh BP-UAT-010
#   scripts/find-bp-uat-stakeholders.sh BP-UAT-010 --base origin/main

set -euo pipefail

readonly SCRIPT_NAME="find-bp-uat-stakeholders.sh"
readonly BP_UAT_DIR="docs/02-business-processes/uat"
readonly REQUIREMENTS_DIR="docs/03-requirements"
readonly ISSUES_DIR=".copilot/issues"

BP_UAT_CODE=""
BASE_REF=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base)
      BASE_REF="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,32p' "$0"
      exit 0 ;;
    BP-UAT-*)
      BP_UAT_CODE="$1"; shift ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      echo "Run '$SCRIPT_NAME --help' for usage." >&2
      exit 2 ;;
  esac
done

if [[ -z "$BP_UAT_CODE" ]]; then
  echo "ERROR: missing required BP-UAT-NNN argument." >&2
  echo "Run '$SCRIPT_NAME --help' for usage." >&2
  exit 2
fi

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "ERROR: not inside a git working tree." >&2
  exit 2
fi

# read_file <path> — working tree or a specific ref, same convention as
# check-github-issue-links.sh.
read_file() {
  local path="$1"
  if [[ -n "$BASE_REF" ]]; then
    git show "${BASE_REF}:${path}" 2>/dev/null || true
  else
    cat "$path" 2>/dev/null || true
  fi
}

# list_files <dir> <prefix> — working tree or a specific ref. Lists
# "<dir>/<prefix>*.md" (top-level only). Deliberately takes a plain
# prefix, not a glob/regex, and builds the match itself for each branch
# — an earlier version tried to share one regex string across both the
# `find -name` and `git ls-tree | grep` branches and silently matched
# nothing in the working-tree case (a regex is not a valid `find -name`
# pattern).
list_files() {
  local dir="$1" prefix="$2"
  if [[ -n "$BASE_REF" ]]; then
    git ls-tree -r --name-only "$BASE_REF" -- "$dir" 2>/dev/null \
      | grep -E "^${dir}/${prefix}[^/]*\.md\$" || true
  else
    find "$dir" -maxdepth 1 -type f -name "${prefix}*.md" 2>/dev/null || true
  fi
}

BP_UAT_FILE="${BP_UAT_DIR}/${BP_UAT_CODE}.md"
BP_UAT_TEXT=$(read_file "$BP_UAT_FILE")
if [[ -z "$BP_UAT_TEXT" ]]; then
  echo "ERROR: could not read ${BP_UAT_FILE} (base=${BASE_REF:-working tree})." >&2
  exit 2
fi

results=""

# 1. This BP-UAT file's own linked_issues frontmatter list (child
#    follow-up issues, as each was independently filed).
linked_line=$(echo "$BP_UAT_TEXT" | grep -m1 -E '^linked_issues:' || true)
if [[ -n "$linked_line" ]]; then
  refs=$(echo "$linked_line" \
    | sed -E 's/^linked_issues: *\[//; s/\]$//' \
    | tr ',' '\n' \
    | sed -E 's/^ *//; s/ *$//' \
    | grep -E '^(ISS|FR)-' || true)
  results="${results}${refs}"$'\n'
fi

# 2. Every FR-<CODE>.md whose own business_process frontmatter names this
#    BP-UAT-NNN — this is what catches the PARENT FR that linked_issues
#    alone misses (ISS-WF-PARENT-SYNC-001's actual motivating gap).
for f in $(list_files "$REQUIREMENTS_DIR" "FR-"); do
  text=$(read_file "$f")
  bp_line=$(echo "$text" | grep -m1 -E '^business_process:' || true)
  [[ -z "$bp_line" ]] && continue
  if echo "$bp_line" | grep -q "$BP_UAT_CODE"; then
    code=$(echo "$text" | grep -m1 -E '^code:' | sed -E 's/^code: *//' || true)
    [[ -n "$code" ]] && results="${results}${code}"$'\n'
  fi
done

# 3. Every ISS-<n>.md whose own Business-Process header field names this
#    BP-UAT-NNN.
for f in $(list_files "$ISSUES_DIR" "ISS-"); do
  text=$(read_file "$f")
  bp_line=$(echo "$text" | grep -m1 -E '^\| Business-Process \|' || true)
  [[ -z "$bp_line" ]] && continue
  if echo "$bp_line" | grep -q "$BP_UAT_CODE"; then
    id=$(echo "$text" | grep -m1 -E '^\| ID \|' | sed -E 's/^\| ID \| *//; s/ *\|$//' || true)
    [[ -n "$id" ]] && results="${results}${id}"$'\n'
  fi
done

echo "$results" | grep -E '^(ISS|FR)-' | sort -u || true
