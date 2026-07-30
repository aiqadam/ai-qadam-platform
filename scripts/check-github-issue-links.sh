#!/usr/bin/env bash
# scripts/check-github-issue-links.sh
#
# Guards against a locally-filed issue silently never being pushed to
# GitHub — the exact gap found live during wf-20260730-fix-157/-uat-158,
# where 4 new ISS-* files were created and registered in registry.md but
# never synced via scripts/sync-github-project.sh, so they had no
# GitHub-Issue link and no visibility on the Project board. The sync call
# is documented as "best-effort, non-blocking" in protocol.md precisely
# because a GitHub API hiccup shouldn't fail a workflow — but that same
# non-blocking design means a dropped call produces no error anywhere.
# This script is the mechanical backstop: it fails loudly if any
# non-terminal issue has no real GitHub-Issue link, so the drop is
# caught before a workflow reports itself done, not months later.
#
# Every row in .copilot/issues/registry.md whose Status is NOT a
# terminal value (resolved, or a "closed (...)" variant) must have a
# real https://github.com/... GitHub-Issue link in its own ISS-<n>.md
# file — not empty, not a "—" / "not yet filed" placeholder.
#
# Exit codes:
#   0  Every non-terminal issue has a real GitHub-Issue link.
#   1  One or more non-terminal issues are missing a link (listed on stderr).
#   2  Invocation error (missing files, not a git repo, etc.).
#
# Invocation:
#   scripts/check-github-issue-links.sh                    # uses HEAD (working tree)
#   scripts/check-github-issue-links.sh --base origin/main  # check a specific ref
#   scripts/check-github-issue-links.sh --skip              # emergency bypass

set -euo pipefail

readonly SCRIPT_NAME="check-github-issue-links.sh"
readonly ISSUE_REGISTRY=".copilot/issues/registry.md"
readonly ISSUES_DIR=".copilot/issues"

BASE_REF=""
SKIP=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base)
      BASE_REF="$2"; shift 2 ;;
    --skip)
      SKIP=true; shift ;;
    -h|--help)
      sed -n '2,29p' "$0"
      exit 0 ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      echo "Run '$SCRIPT_NAME --help' for usage." >&2
      exit 2 ;;
  esac
done

if [[ "$SKIP" == "true" ]]; then
  echo "WARNING: --skip set; bypassing GitHub-issue-link check." >&2
  exit 0
fi

if ! command -v git >/dev/null 2>&1; then
  echo "ERROR: git not found in PATH." >&2
  exit 2
fi

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "ERROR: not inside a git working tree." >&2
  exit 2
fi

# ── Read registry.md + each ISS-<n>.md either from the working tree or a ref ──
read_file() {
  local path="$1"
  if [[ -n "$BASE_REF" ]]; then
    git show "${BASE_REF}:${path}" 2>/dev/null || true
  else
    cat "$path" 2>/dev/null || true
  fi
}

REGISTRY_TEXT=$(read_file "$ISSUE_REGISTRY")
if [[ -z "$REGISTRY_TEXT" ]]; then
  echo "ERROR: could not read $ISSUE_REGISTRY (base=${BASE_REF:-working tree})." >&2
  exit 2
fi

# extract_issue_ids <registry-text>
# Same char class as check-workflow-state.sh's extract_issue_ids — A–Z
# covers canonical prefixes (ISS-CI-OVERRIDE), a–f+0–9 covers the
# SHA1-prefixed tail PRSteward auto-registered classes use.
extract_issue_ids() {
  echo "$1" | grep -oE 'ISS-[A-Z0-9a-f-]+' | sort -u || true
}

# issue_file_status <iss-id>
# Reads the Status field from .copilot/issues/<iss-id>.md's own header
# table — the authoritative source, per the atomic-pair convention
# (protocol.md's Status-Consistency Check). Deliberately does NOT read
# registry.md's Status column: that row can drift from the issue file's
# own Status (a real, live example found while writing this script —
# ISS-WF-REG-002's registry row says "resolved" while its own file still
# says "open", the exact drift class ISS-WF-REG-001/002 already
# document). Trusting the issue file catches that drift as a side
# effect instead of silently propagating it.
issue_file_status() {
  local iss_id="$1"
  local file_text
  file_text=$(read_file "${ISSUES_DIR}/${iss_id}.md")
  [[ -z "$file_text" ]] && { printf '%s' "MISSING-FILE"; return; }
  # `|| true` is load-bearing: some historical issue files (e.g.
  # ISS-CI-OVERRIDE-ebd184b.md) use a bold-prose "**Status:**" header
  # instead of the "| Status |" table row, so grep -m1 legitimately
  # finds no match and exits 1. Under this script's `set -e`, an
  # unguarded exit 1 here silently kills the ENTIRE script mid-loop —
  # this exact bug was caught live while writing this script: every ID
  # alphabetically after the first old-format file (including
  # ISS-WF-REG-002, this script's own motivating example) was silently
  # never checked, with no error printed at all.
  echo "$file_text" \
    | grep -m1 -E '^\| Status \|' \
    | sed -E 's/^\| Status \| *//; s/ *\|$//' \
    || true
}

# is_terminal_status <status>
# "resolved" and "closed" are terminal — no GitHub link is required (a
# closed-as-wrong-diagnosis issue was never meant to be tracked
# publicly). Substring match (not exact/prefix), case-insensitive, and
# strips markdown bold markers first — real Status field values in this
# repo vary in phrasing ("**resolved**", "resolved (won't fix as
# filed)", "closed — wrong diagnosis", "closed (wrong diagnosis)").
# Everything else (open, in-progress, partially-resolved, and any
# future status) is non-terminal.
is_terminal_status() {
  local status="${1//\*/}"
  status="${status,,}"
  [[ "$status" == *resolved* || "$status" == *closed* ]]
}

# github_issue_link <iss-id>
# Reads the GitHub-Issue field from .copilot/issues/<iss-id>.md.
# Empty, "—", or any "not yet filed"/"not filed" placeholder text all
# count as missing.
github_issue_link() {
  local iss_id="$1"
  local file_text link
  file_text=$(read_file "${ISSUES_DIR}/${iss_id}.md")
  if [[ -z "$file_text" ]]; then
    printf '%s' "MISSING-FILE"
    return
  fi
  # Same `set -e`-under-no-match hazard as issue_file_status() above —
  # `|| true` is load-bearing here too.
  link=$(echo "$file_text" \
    | grep -m1 -E '^\| GitHub-Issue \|' \
    | sed -E 's/^\| GitHub-Issue \| *//; s/ *\|$//' \
    || true)
  if [[ -z "$link" || "$link" == "—"* || "$link" == "-"* || "$link" == *"not yet filed"* || "$link" == *"not filed"* ]]; then
    printf '%s' ""
  else
    printf '%s' "$link"
  fi
}

# ── Scan every ISS-<n> referenced in the registry ─────────────────────────────

mapfile -t ISS_IDS < <(extract_issue_ids "$REGISTRY_TEXT")

missing_count=0
for iss_id in "${ISS_IDS[@]}"; do
  [[ -z "$iss_id" ]] && continue

  status=$(issue_file_status "$iss_id")
  if [[ "$status" == "MISSING-FILE" ]]; then
    echo "MISSING: ${iss_id} is referenced in ${ISSUE_REGISTRY} but .copilot/issues/${iss_id}.md does not exist" >&2
    missing_count=$((missing_count + 1))
    continue
  fi
  [[ -z "$status" ]] && continue
  is_terminal_status "$status" && continue

  link=$(github_issue_link "$iss_id")
  if [[ -z "$link" ]]; then
    echo "MISSING: ${iss_id} (status='${status}') has no GitHub-Issue link — run scripts/sync-github-project.sh --ref ${iss_id} --status todo --title ... --body-file ... --severity ..." >&2
    missing_count=$((missing_count + 1))
  fi
done

if [[ "$missing_count" -gt 0 ]]; then
  echo "ERROR: ${missing_count} non-terminal issue(s) missing a GitHub-Issue link." >&2
  exit 1
fi

echo "OK: every non-terminal issue in ${ISSUE_REGISTRY} has a GitHub-Issue link."
exit 0
