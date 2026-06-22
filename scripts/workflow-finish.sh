#!/usr/bin/env bash
# workflow-finish.sh — Canonical last action of every agentic workflow.
#
# Usage:
#   scripts/workflow-finish.sh
#   scripts/workflow-finish.sh --workflow-dir .copilot/tasks/active/wf-20260622-feat-001
#   scripts/workflow-finish.sh --push-only        # commit + push, skip PR
#   GITHUB_TOKEN=ghp_... scripts/workflow-finish.sh
#
# What it does (in order, idempotent):
#   A. Resolve workflow directory from --workflow-dir or auto-detect in active/
#   B. Verify clean tree + on workflow branch (refuses to run if dirty)
#   C. Commit any pending workflow artifacts
#   D. Push with rebase+retry on non-fast-forward (max 3 attempts)
#   E. Create PR via `gh` CLI → REST API → web URL fallback
#   F. Write PR URL back into handoff.yaml, commit + push
#   G. git checkout main + pull --rebase

set -euo pipefail

# ─── Argument parsing ────────────────────────────────────────────────────────

WORKFLOW_DIR=""
PUSH_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --workflow-dir)
      WORKFLOW_DIR="$2"; shift 2 ;;
    --push-only)
      PUSH_ONLY=true; shift ;;
    *)
      echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

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

BRANCH=$(grep '^branch:' "$HANDOFF" | awk '{print $2}' | tr -d '"')
if [[ -z "$BRANCH" ]]; then
  echo "ERROR: branch field is empty in handoff.yaml" >&2; exit 1
fi

echo "Branch       : $BRANCH"

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
  FEAT_REF=$(grep '^requirement_ref:' "$HANDOFF" | awk '{print $2}' | tr -d '"')
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
  BASE_BRANCH=$(grep '^base_branch:' "$HANDOFF" | awk '{print $2}' | tr -d '"')
  BASE_BRANCH="${BASE_BRANCH:-main}"
  FEAT_REF=$(grep '^requirement_ref:' "$HANDOFF" | awk '{print $2}' | tr -d '"')
  REQ_TEXT=$(grep '^requirement_text:' "$HANDOFF" | sed 's/^requirement_text: //' | tr -d '"' | head -c 120)
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
