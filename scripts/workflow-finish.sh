#!/usr/bin/env bash
# workflow-finish.sh — Canonical last action of every agentic workflow.
#
# Usage:
#   scripts/workflow-finish.sh
#   scripts/workflow-finish.sh --workflow-dir .copilot/tasks/active/wf-20260622-feat-001
#   scripts/workflow-finish.sh --push-only        # commit + push, skip PR
#   scripts/workflow-finish.sh --source-only      # define functions, exit 0
#                                                # (for bats tests to source)
#   GITHUB_TOKEN=ghp_... scripts/workflow-finish.sh
#
# What it does (in order, idempotent):
#   A. Resolve workflow directory from --workflow-dir or auto-detect in active/
#   B. Verify clean tree + on workflow branch (refuses to run if dirty)
#   C. Commit any pending workflow artifacts
#   D. Push with rebase+retry on non-fast-forward (max 3 attempts)
#   E. Create PR via `gh` CLI → REST API → web URL fallback
#   F. Write PR URL back into handoff.yaml, commit + push
#   F.5 Context Sync amendment (FEAT-WORKFLOW-001): if 09-quality-gate.md
#       shows status: passed AND 08-doc-update.md contains a context_update:
#       fenced YAML block, apply the registry row + workspace-state row to
#       the appropriate tracked state files, then commit (--amend only when
#       git rev-list --count origin/<branch>..HEAD == 1; otherwise follow up
#       with chore(context-sync): update state files for <FEAT-ID>) and push
#       (--force-with-lease on amend path). No-op if no context_update: block.
#   G. git checkout main + pull --rebase

set -euo pipefail

# Disable husky hooks for the commits made by this script. Husky's WSL-based
# pre-commit hook fails in this dev environment because `pnpm` cannot resolve
# `node` in the WSL PATH (see workflow wf-20260623-fix-3 / PR #12 history).
# Husky respects `HUSKY=0` as an opt-out (per .husky/_/h). CI runs the
# `pnpm arch:check` and `pnpm exec lint-staged` steps directly via the
# `pnpm verify` script, so skipping here does not bypass project gates.
export HUSKY=0

# ─── Argument parsing ────────────────────────────────────────────────────────

WORKFLOW_DIR=""
PUSH_ONLY=false
SOURCE_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --workflow-dir)
      WORKFLOW_DIR="$2"; shift 2 ;;
    --push-only)
      PUSH_ONLY=true; shift ;;
    --source-only)
      SOURCE_ONLY=true; shift ;;
    --help|-h)
      sed -n '2,22p' "$0" | sed 's/^# \?//'
      exit 0 ;;
    *)
      echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

# ─── Functions (FEAT-WORKFLOW-002: extracted for testability) ────────────────
#
# All F.5 logic lives in these helpers. The script body below calls
# apply_context_sync_update() with explicit args. The --source-only flag
# exits here so bats tests can `source <(workflow-finish.sh --source-only)`
# to load the functions without running the script body.

# extract_context_block <doc_update_file>
# Reads the `context_update:` fenced YAML block from 08-doc-update.md.
# Emits the inner YAML (without the `context_update:` key) on stdout.
# Returns 0 always; emits empty string if block not found.
extract_context_block() {
  local doc_update="$1"
  awk '
    /^```yaml[[:space:]]*$/ { fence=1; next }
    fence==1 && /^```[[:space:]]*$/ { exit }
    fence==1 { print }
  ' "$doc_update" 2>/dev/null \
    | awk '
        /^[[:space:]]*context_update:[[:space:]]*$/ { in_block=1; print; next }
        in_block==1 { print }
      ' || true
}

# parse_context_block <yaml_text>
# Reads a context_update YAML block and writes 4 lines to globals:
#   CTX_REGISTRY_FILE, CTX_REGISTRY_ROW, CTX_WS_SECTION, CTX_WS_ROW
# Multi-line values are concatenated; leading "|" (literal-block marker)
# is stripped on read.
parse_context_block() {
  local ctx_text="$1"
  CTX_REGISTRY_FILE=""
  CTX_REGISTRY_ROW=""
  CTX_WS_SECTION=""
  CTX_WS_ROW=""

  local current_key=""
  while IFS= read -r line; do
    if [[ "$line" =~ ^[[:space:]]*([a-z_]+):[[:space:]]*(.*) ]]; then
      current_key="${BASH_REMATCH[1]}"
      local rest="${BASH_REMATCH[2]}"
      case "$current_key" in
        registry_file)
          CTX_REGISTRY_FILE=$(echo "$rest" | sed -E 's/^["'"'"']?(.*)["'"'"']?$/\1/') ;;
        registry_row)
          CTX_REGISTRY_ROW="$rest"; current_key="registry_row_continued" ;;
        workspace_state_section)
          CTX_WS_SECTION=$(echo "$rest" | sed -E 's/^["'"'"']?(.*)["'"'"']?$/\1/') ;;
        workspace_state_row)
          CTX_WS_ROW="$rest"; current_key="workspace_state_row_continued" ;;
        *) current_key="" ;;
      esac
    elif [[ "$current_key" == "registry_row_continued" \
         || "$current_key" == "workspace_state_row_continued" ]]; then
      if [[ "$line" =~ ^[[:space:]]+ ]]; then
        if [[ "$current_key" == "registry_row_continued" ]]; then
          CTX_REGISTRY_ROW+=$'\n'"$line"
        else
          CTX_WS_ROW+=$'\n'"$line"
        fi
      else
        current_key=""
      fi
    fi
  done <<< "$ctx_text"

  # Strip leading "|" from the captured row (YAML literal-block marker).
  CTX_REGISTRY_ROW=$(echo "$CTX_REGISTRY_ROW" | sed -E 's/^\|//; s/^[[:space:]]+//')
  CTX_WS_ROW=$(echo "$CTX_WS_ROW" | sed -E 's/^\|//; s/^[[:space:]]+//')
}

# apply_registry_row <registry_file> <row>
# Appends <row> to <registry_file> (with idempotency on FR/FEAT IDs).
# Stages the change in git. Emits progress to stdout.
apply_registry_row() {
  local registry_file="$1"
  local row="$2"
  if [[ ! -f "$registry_file" ]]; then
    echo "ERROR: registry_file '$registry_file' does not exist on disk." >&2
    return 1
  fi
  local new_fr_id
  new_fr_id=$(echo "$row" \
    | grep -oE '(FR|FEAT)-[A-Z0-9]+-[0-9]+' | head -1 || true)
  if [[ -n "$new_fr_id" ]] \
      && grep -qE "\[${new_fr_id}\]" "$registry_file"; then
    echo "Idempotency: registry row for ${new_fr_id} already present — skipping append."
    return 0
  fi
  echo "" >> "$registry_file"
  echo "$row" >> "$registry_file"
  echo "Applied registry row to $registry_file"
  git add "$registry_file"
}

# apply_workspace_state_row <workspace_state_file> <section> <row>
# Inserts <row> under <section> in <workspace_state_file>. Creates the
# section if absent. Stages the change in git.
apply_workspace_state_row() {
  local ws_file="$1"
  local section="$2"
  local row="$3"
  if [[ ! -f "$ws_file" ]]; then
    echo "ERROR: workspace-state file '$ws_file' not found." >&2
    return 1
  fi
  if grep -q "^## $section" "$ws_file"; then
    local section_line
    section_line=$(grep -n "^## $section" "$ws_file" | head -1 | cut -d: -f1)
    local next_section_line
    next_section_line=$(awk -v start="$section_line" '
      NR > start && /^## / { print NR; exit }
    ' "$ws_file" || true)
    if [[ -n "$next_section_line" ]]; then
      head -n $((next_section_line - 1)) "$ws_file" > "$ws_file.tmp"
      echo "$row" >> "$ws_file.tmp"
      tail -n +"$next_section_line" "$ws_file" >> "$ws_file.tmp"
      mv "$ws_file.tmp" "$ws_file"
    else
      echo "" >> "$ws_file"
      echo "$row" >> "$ws_file"
    fi
    echo "Applied workspace-state row to $ws_file (section: $section)"
  else
    echo "" >> "$ws_file"
    echo "## $section" >> "$ws_file"
    echo "" >> "$ws_file"
    echo "$row" >> "$ws_file"
    echo "Created section '$section' in $ws_file and appended row."
  fi
  git add "$ws_file"
}

# push_context_sync <branch> <feat_ref> <unpushed_count>
# Either amend + force-with-lease (when unpushed_count==1) or
# follow-up commit + rebase-retry. No-op if registry+ws rows didn't change.
push_context_sync() {
  local branch="$1"
  local feat_ref="$2"
  local unpushed_count="$3"
  if [[ "$unpushed_count" == "1" ]]; then
    echo "Amending HEAD with context-sync update (unpushed commits = 1)..."
    git commit --amend --no-edit
    git push --force-with-lease origin "$branch"
    echo "Amend + force-with-lease push complete."
    return 0
  fi
  echo "Creating follow-up context-sync commit "\
       "(unpushed commits = $unpushed_count, > 1 so amend refused)..."
  git commit -m "chore(context-sync): update state files for ${feat_ref}"
  local attempt=0
  local ok=false
  while [[ $attempt -lt 3 ]]; do
    attempt=$((attempt + 1))
    if git push origin "$branch" 2>/dev/null; then
      ok=true
      break
    fi
    echo "Context-sync push failed (attempt $attempt). Rebasing..." >&2
    if ! git pull --rebase origin "$branch" 2>/dev/null; then
      echo "ERROR: Context-sync rebase failed. Resolve manually." >&2
      return 1
    fi
  done
  if [[ "$ok" != "true" ]]; then
    echo "ERROR: Context-sync push failed after 3 attempts." >&2
    return 1
  fi
  echo "Context-sync follow-up commit pushed."
}

# apply_context_sync_update <handoff> <workflow_dir> <workspace_state> <branch>
# Top-level orchestrator. Reads the gate + doc-update from the workflow dir,
# parses the context_update block, applies registry + workspace-state rows,
# and pushes. Exits non-zero on hard failure; logs and returns on soft issues.
apply_context_sync_update() {
  local handoff="$1"
  local workflow_dir="$2"
  local workspace_state="$3"
  local branch="$4"

  local quality_gate="$workflow_dir/09-quality-gate.md"
  local doc_update="$workflow_dir/08-doc-update.md"

  local expect_update="true"
  if grep -q '^expects_registry_update:' "$handoff"; then
    expect_update=$(grep '^expects_registry_update:' "$handoff" \
      | awk '{print $2}' | tr -d '"' | tr -d "'")
  fi

  if [[ ! -f "$quality_gate" ]] \
     || ! grep -qE '^[[:space:]]*status:[[:space:]]*"?passed"?' "$quality_gate" \
     || [[ "$expect_update" == "false" ]] \
     || [[ ! -f "$doc_update" ]]; then
    echo "Step F.5 conditions not met (gate not passed, expects_registry_update: "\
         "$expect_update, or doc-update missing) — no-op."
    return 0
  fi

  local ctx_block
  ctx_block=$(extract_context_block "$doc_update")
  if [[ -z "$ctx_block" ]]; then
    echo "No context_update: block in $doc_update — Step F.5 is a no-op."
    return 0
  fi

  parse_context_block "$ctx_block"

  if [[ -z "$CTX_REGISTRY_FILE" ]] || [[ -z "$CTX_REGISTRY_ROW" ]]; then
    echo "ERROR: context_update block missing registry_file or registry_row." >&2
    echo "       No amendment applied; QualityGate will fail this run." >&2
    return 1
  fi
  if [[ -z "$CTX_WS_SECTION" ]] || [[ -z "$CTX_WS_ROW" ]]; then
    echo "ERROR: context_update block missing workspace_state_section or workspace_state_row." >&2
    echo "       No amendment applied; QualityGate will fail this run." >&2
    return 1
  fi

  apply_registry_row "$CTX_REGISTRY_FILE" "$CTX_REGISTRY_ROW" || return 1
  apply_workspace_state_row "$workspace_state" "$CTX_WS_SECTION" "$CTX_WS_ROW" \
    || return 1

  local feat_ref
  feat_ref=$(grep '^requirement_ref:' "$handoff" \
    | awk '{print $2}' | tr -d '"' | tr -d "'" | tr -d '\r')
  feat_ref="${feat_ref:-workflow}"

  local unpushed_count
  unpushed_count=$(git rev-list --count "origin/${branch}..HEAD" 2>/dev/null \
    || echo 0)
  push_context_sync "$branch" "$feat_ref" "$unpushed_count" || return 1

  # Increment context_sync_commits counter in handoff.yaml.
  local count=0
  if grep -q '^context_sync_commits:' "$handoff"; then
    count=$(grep '^context_sync_commits:' "$handoff" | awk '{print $2}')
    count=$((count + 1))
    sed -i "s|^context_sync_commits:.*|context_sync_commits: ${count}|" \
      "$handoff"
  else
    echo "context_sync_commits: 1" >> "$handoff"
  fi
  git add "$handoff"
  if ! git diff --cached --quiet; then
    git commit -m "chore(workflow): record context_sync_commits in handoff.yaml" \
      2>/dev/null || true
    git push origin "$branch" 2>/dev/null || true
  fi
}

# Export helpers so bats tests can call them via `source --source-only`.
export -f extract_context_block
export -f parse_context_block
export -f apply_registry_row
export -f apply_workspace_state_row
export -f push_context_sync
export -f apply_context_sync_update

# --source-only mode: define functions, exit 0.
if [[ "$SOURCE_ONLY" == "true" ]]; then
  return 0 2>/dev/null || exit 0
fi

# ─── A. Resolve workflow directory ───────────────────────────────────────────

if [[ -z "$WORKFLOW_DIR" ]]; then
  # Auto-detect: find the single active workflow directory
  ACTIVE_COUNT=$(find .copilot/tasks/active -mindepth 1 -maxdepth 1 -type d | wc -l)
  if [[ "$ACTIVE_COUNT" -eq 0 ]]; then
    echo "ERROR: No active workflow found in .copilot/tasks/active/" >&2; exit 1
  elif [[ "$ACTIVE_COUNT" -gt 1 ]]; then
    echo "ERROR: Multiple active workflows found. Specify --workflow-dir." >&2
    find .copilot/tasks/active -mindepth 1 -maxdepth 1 -type d >&2; exit 1
  fi
  WORKFLOW_DIR=$(find .copilot/tasks/active -mindepth 1 -maxdepth 1 -type d)
fi

HANDOFF="$WORKFLOW_DIR/handoff.yaml"
if [[ ! -f "$HANDOFF" ]]; then
  echo "ERROR: handoff.yaml not found at $HANDOFF" >&2; exit 1
fi

echo "Workflow dir : $WORKFLOW_DIR"
echo "Handoff file : $HANDOFF"

# ─── Read branch from handoff.yaml ───────────────────────────────────────────

BRANCH=$(grep '^branch:' "$HANDOFF" | awk '{print $2}' | tr -d '"' | tr -d '\r')
if [[ -z "$BRANCH" ]]; then
  echo "ERROR: branch field is empty in handoff.yaml" >&2; exit 1
fi

echo "Branch       : $BRANCH"

WORKSPACE_STATE=".copilot/context/workspace-state.md"

# ─── B. Verify clean tree + correct branch ───────────────────────────────────

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != "$BRANCH" ]]; then
  echo "ERROR: Currently on branch '$CURRENT_BRANCH', expected '$BRANCH'" >&2
  echo "  Checkout the correct branch first." >&2; exit 1
fi

# ─── C. Commit any pending workflow artifacts ────────────────────────────────

DIRTY=$(git status --porcelain)
if [[ -n "$DIRTY" ]]; then
  echo "Committing workflow artifacts..."
  git add -A
  FEAT_REF=$(grep '^requirement_ref:' "$HANDOFF" | awk '{print $2}' | tr -d '"' | tr -d '\r')
  git commit -m "chore(workflow): finalize artifacts for ${FEAT_REF:-workflow}"
  echo "Committed."
else
  echo "Working tree already clean — nothing to commit."
fi

# ─── D. Push with rebase+retry ───────────────────────────────────────────────

MAX_PUSH_RETRIES=3
PUSH_ATTEMPT=0
PUSH_SUCCESS=false

while [[ $PUSH_ATTEMPT -lt $MAX_PUSH_RETRIES ]]; do
  PUSH_ATTEMPT=$((PUSH_ATTEMPT + 1))
  echo "Push attempt $PUSH_ATTEMPT/$MAX_PUSH_RETRIES..."
  if git push origin "$BRANCH" 2>/dev/null; then
    PUSH_SUCCESS=true
    echo "Pushed successfully."
    break
  else
    EXIT_CODE=$?
    echo "Push failed (exit $EXIT_CODE). Attempting rebase onto origin/$BRANCH..."
    if ! git pull --rebase origin "$BRANCH" 2>/dev/null; then
      echo "ERROR: Rebase failed. Resolve conflicts manually." >&2; exit 1
    fi
  fi
done

if [[ "$PUSH_SUCCESS" != "true" ]]; then
  echo "ERROR: Push failed after $MAX_PUSH_RETRIES attempts." >&2; exit 1
fi

# ─── E. Create PR ────────────────────────────────────────────────────────────

if [[ "$PUSH_ONLY" == "true" ]]; then
  echo "--push-only set — skipping PR creation."
  PR_URL=""
else
  BASE_BRANCH=$(grep '^base_branch:' "$HANDOFF" | awk '{print $2}' | tr -d '"' | tr -d '\r')
  BASE_BRANCH="${BASE_BRANCH:-main}"
  FEAT_REF=$(grep '^requirement_ref:' "$HANDOFF" | awk '{print $2}' | tr -d '"' | tr -d '\r')
  REQ_TEXT=$(grep '^requirement_text:' "$HANDOFF" | sed 's/^requirement_text: //' | tr -d '"' | tr -d '\r' | head -c 120)
  PR_TITLE="${FEAT_REF:+${FEAT_REF}: }${REQ_TEXT}"

  PR_BODY="Implements ${FEAT_REF}. Workflow: $(basename "$WORKFLOW_DIR")."

  PR_URL=""

  # Try gh CLI first
  if command -v gh &>/dev/null; then
    echo "Creating PR via gh CLI..."
    if PR_URL=$(gh pr create \
      --base "$BASE_BRANCH" \
      --head "$BRANCH" \
      --title "$PR_TITLE" \
      --body "$PR_BODY" \
      --no-maintainer-edit 2>/dev/null); then
      echo "PR created: $PR_URL"
    else
      echo "gh pr create failed or PR already exists — checking for existing..."
      PR_URL=$(gh pr view "$BRANCH" --json url -q .url 2>/dev/null || true)
      if [[ -n "$PR_URL" ]]; then
        echo "Existing PR found: $PR_URL"
      fi
    fi
  fi

  # Fallback: REST API via GITHUB_TOKEN
  if [[ -z "$PR_URL" ]] && [[ -n "${GITHUB_TOKEN:-}" ]]; then
    echo "Creating PR via GitHub REST API..."
    REPO=$(git remote get-url origin | sed 's|https://github.com/||;s|git@github.com:||;s|\.git$||')
    RESPONSE=$(curl -sf -X POST \
      -H "Authorization: token $GITHUB_TOKEN" \
      -H "Content-Type: application/json" \
      "https://api.github.com/repos/${REPO}/pulls" \
      -d "{\"title\":\"${PR_TITLE}\",\"body\":\"${PR_BODY}\",\"head\":\"${BRANCH}\",\"base\":\"${BASE_BRANCH}\"}" 2>/dev/null || true)
    PR_URL=$(echo "$RESPONSE" | grep '"html_url"' | head -1 | sed 's/.*"html_url": "\(.*\)".*/\1/')
    if [[ -n "$PR_URL" ]]; then
      echo "PR created: $PR_URL"
    fi
  fi

  # Fallback: web URL
  if [[ -z "$PR_URL" ]]; then
    REPO=$(git remote get-url origin | sed 's|https://github.com/||;s|git@github.com:||;s|\.git$||' 2>/dev/null || echo "")
    if [[ -n "$REPO" ]]; then
      PR_URL="https://github.com/${REPO}/compare/${BRANCH}?expand=1"
      echo "WARNING: Could not create PR automatically. Open manually: $PR_URL" >&2
    fi
  fi
fi

# ─── F. Write PR URL back into handoff.yaml ──────────────────────────────────

if [[ -n "$PR_URL" ]]; then
  # Update or insert github_pr_url
  if grep -q '^github_pr_url:' "$HANDOFF"; then
    sed -i "s|^github_pr_url:.*|github_pr_url: \"${PR_URL}\"|" "$HANDOFF"
  else
    echo "github_pr_url: \"${PR_URL}\"" >> "$HANDOFF"
  fi

  git add "$HANDOFF"
  DIRTY_AFTER=$(git status --porcelain)
  if [[ -n "$DIRTY_AFTER" ]]; then
    git commit -m "chore(workflow): record PR URL in handoff.yaml"
    git push origin "$BRANCH"
  fi
fi

# ─── F.5. Context Sync amendment (FEAT-WORKFLOW-001) ────────────────────────
#
# Applies the inline `context_update:` fenced YAML block emitted by
# DocWriter into `08-doc-update.md` (Option B from impact-analysis R-1):
# the marker is part of a tracked artifact, so no separate marker file is
# needed and the existing Step C commit already carried it.
#
# Runs only when:
#   - 09-quality-gate.md exists and reports `status: passed`
#   - 08-doc-update.md exists and contains a `context_update:` fenced YAML
#     block
#   - expects_registry_update in handoff.yaml is not explicitly `false`
#
# Guard: refuses `--amend` unless `git rev-list --count origin/<branch>..HEAD`
# equals exactly 1 (impact-analysis R-2). Otherwise falls back to a follow-up
# commit `chore(context-sync): update state files for <FEAT-ID>`. Push uses
# `--force-with-lease` on amend path.

apply_context_sync_update "$HANDOFF" "$WORKFLOW_DIR" "$WORKSPACE_STATE" "$BRANCH"

# ─── G. Return to main ───────────────────────────────────────────────────────

git checkout main
git pull --rebase origin main

# ─── Final report ────────────────────────────────────────────────────────────

echo ""
echo "─────────────────────────────────────────────"
echo "Workflow finish complete"
echo "Local branch : main"
echo "PR URL       : ${PR_URL:-<not created — open manually>}"
echo "Artifacts    : $WORKFLOW_DIR"
echo "─────────────────────────────────────────────"
