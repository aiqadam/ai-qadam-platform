#!/usr/bin/env bash
# scripts/check-closing-keyword.sh
#
# Guards against a commit closing a GitHub issue before its mandatory
# Step 13 post-merge UAT re-verification has actually run — the exact gap
# found live on issue #130 (FR-EVT-004): wf-20260730-feat-155's own
# squash-merge commit contained "Closes #130", which GitHub auto-closed
# on merge, even though that FR's `business_process: [BP-UAT-010]` meant
# Step 13 hadn't run yet. Step 13 later found 2 real open issues on that
# same surface — the GitHub issue read as "done" the whole time despite
# the Project board's own Status field correctly staying at `Implemented`
# (never `agent-verified`). Two independent "is this done" signals had
# drifted apart with nothing to notice.
#
# GitHub's own closing-keyword scanner (Closes/Fixes/Resolves #N, case
# insensitive) fires off ANY commit reaching the default branch — this
# script cannot intercept that after the fact, so it is a PRE-COMMIT /
# PRE-PUSH style guard: given a commit message and the business_process
# value of the issue/FR it references, it fails if the message contains a
# closing keyword for an issue whose business_process is non-empty (i.e.
# Step 13 has not necessarily run yet). When business_process is empty
# ("—"), a closing keyword is correct and unchanged — nothing further
# needs verifying.
#
# Usage:
#   scripts/check-closing-keyword.sh --message-file <path> --issue-ref <ISS-n|FR-CODE>
#   scripts/check-closing-keyword.sh --message-file <path> --issue-ref <ISS-n|FR-CODE> --business-process "BP-UAT-010"
#   scripts/check-closing-keyword.sh --message-file <path> --issue-ref <ISS-n|FR-CODE> --business-process "—"
#
# --business-process may also be omitted, in which case this script reads
# it directly from .copilot/issues/<ISS-n>.md's `Business-Process` field
# or docs/03-requirements/FR-<CODE>.md's `business_process` frontmatter.
#
# Exit codes:
#   0  No closing keyword found, OR business_process is empty/— (closing
#      keyword is correct in that case).
#   1  A closing keyword was found for an issue with non-empty
#      business_process — the commit message must use a neutral
#      reference (e.g. "Refs #N") instead; Step 13's own gate closes the
#      issue once verification actually passes.
#   2  Invocation error (missing file, unreadable issue ref, etc.).

set -euo pipefail

readonly SCRIPT_NAME="check-closing-keyword.sh"

MESSAGE_FILE=""
ISSUE_REF=""
BUSINESS_PROCESS=""
HAVE_BP_ARG=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --message-file)
      MESSAGE_FILE="$2"; shift 2 ;;
    --issue-ref)
      ISSUE_REF="$2"; shift 2 ;;
    --business-process)
      BUSINESS_PROCESS="$2"; HAVE_BP_ARG=true; shift 2 ;;
    -h|--help)
      sed -n '2,40p' "$0"
      exit 0 ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      echo "Run '$SCRIPT_NAME --help' for usage." >&2
      exit 2 ;;
  esac
done

if [[ -z "$MESSAGE_FILE" || -z "$ISSUE_REF" ]]; then
  echo "ERROR: --message-file and --issue-ref are required." >&2
  exit 2
fi

if [[ ! -f "$MESSAGE_FILE" ]]; then
  echo "ERROR: message file not found: $MESSAGE_FILE" >&2
  exit 2
fi

# ── Resolve business_process if not passed explicitly ──────────────────
resolve_business_process() {
  local ref="$1" file text bp
  if [[ "$ref" == FR-* ]]; then
    file="docs/03-requirements/${ref}.md"
    [[ -f "$file" ]] || { echo "ERROR: $file not found." >&2; exit 2; }
    bp=$(grep -m1 -E '^business_process:' "$file" | sed -E 's/^business_process:\s*//' || true)
  else
    file=".copilot/issues/${ref}.md"
    [[ -f "$file" ]] || { echo "ERROR: $file not found." >&2; exit 2; }
    bp=$(grep -m1 -E '^\| Business-Process \|' "$file" | sed -E 's/^\| Business-Process \| *//; s/ *\|$//' || true)
  fi
  printf '%s' "$bp"
}

if [[ "$HAVE_BP_ARG" != "true" ]]; then
  BUSINESS_PROCESS=$(resolve_business_process "$ISSUE_REF")
fi

# ── Is business_process empty/— (closing keyword is fine)? ─────────────
is_empty_business_process() {
  local bp="$1"
  bp="${bp//[[]}"
  bp="${bp//]}"
  bp="${bp//\"}"
  bp="$(echo "$bp" | xargs 2>/dev/null || true)"
  [[ -z "$bp" || "$bp" == "—" || "$bp" == "-" ]]
}

if is_empty_business_process "$BUSINESS_PROCESS"; then
  echo "OK: ${ISSUE_REF} has no business_process linkage — a closing keyword is correct."
  exit 0
fi

# ── Extract the numeric GitHub issue number from ISS-<n>.md / FR-<CODE>.md ──
extract_gh_number() {
  local ref="$1" file url
  if [[ "$ref" == FR-* ]]; then
    file="docs/03-requirements/${ref}.md"
    url=$(grep -m1 -E '^github_issue:' "$file" | sed -E 's/^github_issue:\s*//' || true)
  else
    file=".copilot/issues/${ref}.md"
    url=$(grep -m1 -E '^\| GitHub-Issue \|' "$file" | sed -E 's/^\| GitHub-Issue \| *//; s/ *\|$//' || true)
  fi
  echo "$url" | grep -oE '[0-9]+$' || true
}

GH_NUMBER=$(extract_gh_number "$ISSUE_REF")
if [[ -z "$GH_NUMBER" ]]; then
  echo "OK: ${ISSUE_REF} has no resolvable GitHub issue number yet — nothing to check."
  exit 0
fi

# ── Scan the commit message for a closing keyword targeting this issue ──
# GitHub's own keyword list: close, closes, closed, fix, fixes, fixed,
# resolve, resolves, resolved — case-insensitive, followed by #N (or
# owner/repo#N, not needed here since this is same-repo).
if grep -qiE "(close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)[[:space:]]+#${GH_NUMBER}([^0-9]|\$)" "$MESSAGE_FILE"; then
  echo "ERROR: commit message contains a closing keyword for #${GH_NUMBER}, but ${ISSUE_REF}'s business_process (${BUSINESS_PROCESS}) means Step 13 post-merge re-verification has not necessarily run yet. Use a neutral reference instead (e.g. 'Refs #${GH_NUMBER}') — Step 13's own gate closes the issue once verification actually passes clean. See ISS-WF-GH-CLOSE-001 for the motivating incident (issue #130)." >&2
  exit 1
fi

echo "OK: no premature closing keyword for #${GH_NUMBER} found."
exit 0
