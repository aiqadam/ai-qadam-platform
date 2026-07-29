#!/usr/bin/env bash
# migrate-open-items-to-github.sh — ONE-TIME Phase 1 migration: creates
# typed GitHub Issues + Project items for every currently-open ISS-*/FR-*
# record. Re-runnable (each row is idempotent via sync-github-project.sh's
# marker-based dedup) but not intended for routine use — ongoing sync
# happens via the per-workflow hooks in issue-resolution.md /
# requirement-development.md.
#
# The row list below is a static, reviewed snapshot of what was open in
# .copilot/issues/registry.md and docs/03-requirements/requirements-registry.md
# as of 2026-07-29 (commit eed2305) — deliberately not re-derived
# dynamically at run time, to avoid picking up mid-flight churn during a
# one-time migration. If the registries have moved on since, re-derive the
# list by hand (grep for non-terminal Status values) before running this.
#
# Usage: scripts/migrate-open-items-to-github.sh [--dry-run]

set -euo pipefail

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ISSUES_DIR="$REPO_ROOT/.copilot/issues"
FR_DIR="$REPO_ROOT/docs/03-requirements"
SYNC_SCRIPT="$REPO_ROOT/scripts/sync-github-project.sh"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

# ref|severity|status
ISS_ROWS=(
  "ISS-USR-PWRESET-001|blocker|in-progress"
  "ISS-USR-REDIRECT-003|blocker|todo"
  "ISS-RBAC-PERMS-001|blocker|in-progress"
  "ISS-UAT-020-1|blocker|todo"
)

# ref|status  (all Feature type — --severity not needed)
FR_ROWS=(
  "FR-AUTH-002|in-progress"
  "FR-AUTH-004|todo"
  "FR-AUTH-003|todo"
  "FR-CRM-002|todo"
  "FR-EVT-004|in-progress"
  "FR-NTF-003|todo"
  "FR-CRM-003|todo"
  "FR-PTN-002|todo"
  "FR-EVT-007|todo"
  "FR-NTF-005|todo"
  "FR-NTF-002|todo"
  "FR-BOT-001|todo"
  "FR-AUTH-005|todo"
  "FR-AUTH-006|todo"
  "FR-BOT-002|todo"
  "FR-BOT-003|todo"
  "FR-NTF-004|todo"
  "FR-AUTH-007|todo"
)

# extract_iss_title <file> — H1 minus the "ISS-<n> — " prefix
extract_iss_title() {
  head -n1 "$1" | sed -E 's/^# [A-Za-z0-9_-]+ — //'
}

# extract_iss_body <file> <out> — Symptom section (or, failing that, the
# whole file minus the header table) as the GitHub issue body.
extract_iss_body() {
  local file="$1" out="$2"
  awk '
    /^## Symptom/ { found=1 }
    found { print }
    found && /^## / && !/^## Symptom/ && NR>1 && seen { exit }
    /^## Symptom/ { seen=1 }
  ' "$file" > "$out"
  if [[ ! -s "$out" ]]; then
    # Fallback: everything after the header table.
    awk '/^\| ID \|/{t=1} t && /^$/{c++} c>=1{print}' "$file" > "$out"
  fi
  printf '\n\n_Full record: [%s](%s)_\n' "$(basename "$file")" \
    "https://github.com/aiqadam/ai-qadam-platform/blob/main/.copilot/issues/$(basename "$file")" >> "$out"
}

# extract_fr_title <file>
extract_fr_title() {
  awk -F': ' '/^name:/{print $2; exit}' "$1"
}

# extract_fr_body <file> <out> — Description + Functional scope sections.
extract_fr_body() {
  local file="$1" out="$2"
  awk '
    /^## Description/ { found=1 }
    /^## Acceptance criteria/ { found=0 }
    found { print }
  ' "$file" > "$out"
  if [[ ! -s "$out" ]]; then
    awk '/^---$/{c++; next} c>=2{print}' "$file" > "$out"
  fi
  printf '\n\n_Full record: [%s](%s)_\n' "$(basename "$file")" \
    "https://github.com/aiqadam/ai-qadam-platform/blob/main/docs/03-requirements/$(basename "$file")" >> "$out"
}

# write_back_iss_field <file> <url> — insert GitHub-Issue row into the
# header table, right after the ID row.
write_back_iss_field() {
  local file="$1" url="$2"
  if grep -q '^| GitHub-Issue |' "$file"; then
    return
  fi
  awk -v url="$url" '
    { print }
    /^\| ID \|/ && !done { print "| GitHub-Issue | " url " |"; done=1 }
  ' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
}

# write_back_fr_field <file> <url> — insert github_issue key into frontmatter.
write_back_fr_field() {
  local file="$1" url="$2"
  if grep -q '^github_issue:' "$file"; then
    return
  fi
  awk -v url="$url" '
    { print }
    /^phase:/ && !done { print "github_issue: " url; done=1 }
  ' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
}

run_sync() {
  local ref="$1" status="$2" title="$3" body_file="$4" severity="${5:-}"
  local args=(--ref "$ref" --status "$status" --title "$title" --body-file "$body_file")
  [[ -n "$severity" ]] && args+=(--severity "$severity")
  $DRY_RUN && args+=(--dry-run)
  "$SYNC_SCRIPT" "${args[@]}"
}

echo "=== Migrating ${#ISS_ROWS[@]} ISS-* issues ==="
for row in "${ISS_ROWS[@]}"; do
  IFS='|' read -r ref severity status <<< "$row"
  file="$ISSUES_DIR/$ref.md"
  if [[ ! -f "$file" ]]; then
    echo "SKIP: $file not found" >&2
    continue
  fi
  title=$(extract_iss_title "$file")
  body_file="$TMP_DIR/$ref.md"
  extract_iss_body "$file" "$body_file"

  echo "--- $ref ($status, $severity): $title"
  output=$(run_sync "$ref" "$status" "$title" "$body_file" "$severity")
  echo "$output"

  if ! $DRY_RUN; then
    url=$(echo "$output" | grep '^GITHUB_ISSUE_URL=' | cut -d= -f2-)
    if [[ -n "$url" ]]; then
      write_back_iss_field "$file" "$url"
    fi
  fi
done

echo
echo "=== Migrating ${#FR_ROWS[@]} FR-* requirements ==="
for row in "${FR_ROWS[@]}"; do
  IFS='|' read -r ref status <<< "$row"
  file="$FR_DIR/$ref.md"
  if [[ ! -f "$file" ]]; then
    echo "SKIP: $file not found" >&2
    continue
  fi
  title=$(extract_fr_title "$file")
  body_file="$TMP_DIR/$ref.md"
  extract_fr_body "$file" "$body_file"

  echo "--- $ref ($status): $title"
  output=$(run_sync "$ref" "$status" "$title" "$body_file")
  echo "$output"

  if ! $DRY_RUN; then
    url=$(echo "$output" | grep '^GITHUB_ISSUE_URL=' | cut -d= -f2-)
    if [[ -n "$url" ]]; then
      write_back_fr_field "$file" "$url"
    fi
  fi
done

echo
echo "=== Migration complete ==="
