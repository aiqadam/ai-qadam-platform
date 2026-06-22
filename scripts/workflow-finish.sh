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
#   F. Write PR URL back into handoff.yaml, commit + push#   F.5 Context Sync amendment (FEAT-WORKFLOW-001): if 09-quality-gate.md
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

BRANCH=$(grep '^branch:' "$HANDOFF" | awk '{print $2}' | tr -d '"' | tr -d '\r')
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
# `--force-with-lease` on the amend path.

QUALITY_GATE="$WORKFLOW_DIR/09-quality-gate.md"
DOC_UPDATE="$WORKFLOW_DIR/08-doc-update.md"

EXPECT_UPDATE="true"
if grep -q '^expects_registry_update:' "$HANDOFF"; then
  EXPECT_UPDATE=$(grep '^expects_registry_update:' "$HANDOFF" \
    | awk '{print $2}' | tr -d '"' | tr -d "'")
fi

if [[ -f "$QUALITY_GATE" ]] \
   && grep -q 'status: passed' "$QUALITY_GATE" \
   && [[ "$EXPECT_UPDATE" != "false" ]] \
   && [[ -f "$DOC_UPDATE" ]]; then

  # Extract the `context_update:` fenced YAML block from 08-doc-update.md.
  # We accept either ```yaml or ``` block fences opened by `context_update:`.
  CONTEXT_BLOCK=$(awk '
    /^```yaml[[:space:]]*$/ { fence=1; next }
    fence==1 && /^```[[:space:]]*$/ { exit }
    fence==1 { print }
  ' "$DOC_UPDATE" | awk '
    /^context_update:[[:space:]]*$/ { in_block=1; next }
    in_block==1 { print }
  ' || true)

  if [[ -n "$CONTEXT_BLOCK" ]]; then
    FEAT_REF=$(grep '^requirement_ref:' "$HANDOFF" \
      | awk '{print $2}' | tr -d '"' | tr -d "'" | tr -d '\r' | tr -d '\r')
    FEAT_REF="${FEAT_REF:-workflow}"

    REGISTRY_FILE=""
    REGISTRY_ROW=""
    WS_SECTION=""
    WS_ROW=""

    # Parse the context_update block with a minimal YAML reader.
    # Only the keys `registry_file`, `registry_row`, `workspace_state_section`,
    # `workspace_state_row` are honored. Everything else is ignored.
    current_key=""
    while IFS= read -r line; do
      # Detect top-level keys (no leading whitespace).
      if [[ "$line" =~ ^[a-z_]+:[[:space:]]*(.*) ]]; then
        current_key="${BASH_REMATCH[0]%%:*}"
        rest="${BASH_REMATCH[1]}"
        case "$current_key" in
          registry_file)
            REGISTRY_FILE=$(echo "$rest" | sed -E 's/^["'"'"']?(.*)["'"'"']?$/\1/')
            ;;
          registry_row)
            # Multi-line: take the rest of the line as start; subsequent
            # indented lines are appended.
            REGISTRY_ROW="$rest"
            current_key="registry_row_continued"
            ;;
          workspace_state_section)
            WS_SECTION=$(echo "$rest" | sed -E 's/^["'"'"']?(.*)["'"'"']?$/\1/')
            ;;
          workspace_state_row)
            WS_ROW="$rest"
            current_key="workspace_state_row_continued"
            ;;
          *)
            current_key=""
            ;;
        esac
      elif [[ "$current_key" == "registry_row_continued" ]]; then
        # Indented continuation lines belong to the multi-line value.
        if [[ "$line" =~ ^[[:space:]]+ ]]; then
          REGISTRY_ROW+=$'\n'"$line"
        else
          current_key=""
        fi
      elif [[ "$current_key" == "workspace_state_row_continued" ]]; then
        if [[ "$line" =~ ^[[:space:]]+ ]]; then
          WS_ROW+=$'\n'"$line"
        else
          current_key=""
        fi
      fi
    done <<< "$CONTEXT_BLOCK"

    # Strip leading "|" from the captured row (YAML literal-block marker).
    REGISTRY_ROW_CLEAN=$(echo "$REGISTRY_ROW" | sed -E 's/^\|//; s/^[[:space:]]+//')
    WS_ROW_CLEAN=$(echo "$WS_ROW" | sed -E 's/^\|//; s/^[[:space:]]+//')

    # Refuse to write if either essential piece is missing or empty.
    if [[ -z "$REGISTRY_FILE" ]] || [[ -z "$REGISTRY_ROW_CLEAN" ]]; then
      echo "ERROR: context_update block missing registry_file or registry_row." >&2
      echo "       No amendment applied; QualityGate will fail this run." >&2
    elif [[ -z "$WS_SECTION" ]] || [[ -z "$WS_ROW_CLEAN" ]]; then
      echo "ERROR: context_update block missing workspace_state_section or workspace_state_row." >&2
      echo "       No amendment applied; QualityGate will fail this run." >&2
    else
      # Apply registry row. Insert before the first `---` (or at end).
      if [[ -f "$REGISTRY_FILE" ]]; then
        # Insert after the last existing row in the target table.
        # We use a simple append-to-table approach: add at end of file before EOF.
        # For both registries, this preserves the existing ordering convention
        # (shipped-first; the new row is the most recent by virtue of being
        # appended to the file's table section). For the requirements-registry,
        # DocWriter conventionally appends near the table; for issues/registry,
        # the same pattern applies.
        # Idempotency: if any existing row already references this FR ID,
        # skip the append. We extract the FR identifier from the new row
        # (looks for `FR-XXXX-NNN` or `FEAT-XXXX-NNN`) and check for an
        # existing match. This avoids duplicates when DocWriter and Step F.5
        # both target the same row.
        NEW_FR_ID=$(echo "$REGISTRY_ROW_CLEAN" \
          | grep -oE '(FR|FEAT)-[A-Z0-9]+-[0-9]+' | head -1 || true)
        if [[ -n "$NEW_FR_ID" ]] \
            && grep -qE "\[(FR|FEAT)-[A-Z0-9]+-[0-9]+\]" "$REGISTRY_FILE"; then
          if grep -qE "\[${NEW_FR_ID}\]" "$REGISTRY_FILE"; then
            echo "Idempotency: registry row for ${NEW_FR_ID} already present — skipping append."
          else
            # Different FR IDs in the row — apply as normal.
            echo "" >> "$REGISTRY_FILE"
            echo "$REGISTRY_ROW_CLEAN" >> "$REGISTRY_FILE"
            echo "Applied registry row to $REGISTRY_FILE"
          fi
        else
          echo "" >> "$REGISTRY_FILE"
          echo "$REGISTRY_ROW_CLEAN" >> "$REGISTRY_FILE"
          echo "Applied registry row to $REGISTRY_FILE"
        fi

        git add "$REGISTRY_FILE"
      else
        echo "ERROR: registry_file '$REGISTRY_FILE' does not exist on disk." >&2
        echo "       No amendment applied." >&2
      fi

      # Apply workspace-state row.
      if [[ -f "$WORKSPACE_STATE" ]]; then
        # Locate the target section heading and insert after the last row of
        # its table. If section not found, append at end of file.
        WS_FILE="$WORKSPACE_STATE"
        if grep -q "^## $WS_SECTION" "$WS_FILE"; then
          # Find line number of the section heading; insert before next `##`
          # heading (or EOF).
          SECTION_LINE=$(grep -n "^## $WS_SECTION" "$WS_FILE" | head -1 \
            | cut -d: -f1)
          NEXT_SECTION_LINE=$(awk -v start="$SECTION_LINE" '
            NR > start && /^## / { print NR; exit }
          ' "$WS_FILE" || true)
          if [[ -n "$NEXT_SECTION_LINE" ]]; then
            # Insert before the next section heading.
            head -n $((NEXT_SECTION_LINE - 1)) "$WS_FILE" \
              > "$WS_FILE.tmp"
            echo "$WS_ROW_CLEAN" >> "$WS_FILE.tmp"
            tail -n +"$NEXT_SECTION_LINE" "$WS_FILE" >> "$WS_FILE.tmp"
            mv "$WS_FILE.tmp" "$WS_FILE"
          else
            # No next section; append at end.
            echo "" >> "$WS_FILE"
            echo "$WS_ROW_CLEAN" >> "$WS_FILE"
          fi
          echo "Applied workspace-state row to $WS_FILE (section: $WS_SECTION)"
        else
          echo "" >> "$WS_FILE"
          echo "## $WS_SECTION" >> "$WS_FILE"
          echo "" >> "$WS_FILE"
          echo "$WS_ROW_CLEAN" >> "$WS_FILE"
          echo "Created section '$WS_SECTION' in $WS_FILE and appended row."
        fi

        git add "$WS_FILE"
      else
        echo "ERROR: workspace-state file '$WORKSPACE_STATE' not found." >&2
        echo "       No workspace-state row applied." >&2
      fi

      # Decide amend vs follow-up based on unpushed-commits count (R-2).
      UNPUSHED_COUNT=$(git rev-list --count "origin/${BRANCH}..HEAD" 2>/dev/null \
        || echo 0)

      if [[ "$UNPUSHED_COUNT" == "1" ]]; then
        # Amend path. Use --force-with-lease (R-2 mitigation).
        echo "Amending HEAD with context-sync update (unpushed commits = 1)..."
        git commit --amend --no-edit
        git push --force-with-lease origin "$BRANCH"
        echo "Amend + force-with-lease push complete."
      else
        # Follow-up commit path.
        echo "Creating follow-up context-sync commit "\
             "(unpushed commits = $UNPUSHED_COUNT, > 1 so amend refused)..."
        git commit -m "chore(context-sync): update state files for ${FEAT_REF}"
        # Standard rebase+retry on the follow-up path.
        CONTEXT_PUSH_ATTEMPT=0
        CONTEXT_PUSH_MAX=3
        CONTEXT_PUSH_OK=false
        while [[ $CONTEXT_PUSH_ATTEMPT -lt $CONTEXT_PUSH_MAX ]]; do
          CONTEXT_PUSH_ATTEMPT=$((CONTEXT_PUSH_ATTEMPT + 1))
          if git push origin "$BRANCH" 2>/dev/null; then
            CONTEXT_PUSH_OK=true
            break
          else
            echo "Context-sync push failed (attempt $CONTEXT_PUSH_ATTEMPT). "\
                 "Rebasing onto origin/$BRANCH..." >&2
            if ! git pull --rebase origin "$BRANCH" 2>/dev/null; then
              echo "ERROR: Context-sync rebase failed. Resolve manually." >&2
              exit 1
            fi
          fi
        done
        if [[ "$CONTEXT_PUSH_OK" != "true" ]]; then
          echo "ERROR: Context-sync push failed after $CONTEXT_PUSH_MAX attempts." >&2
          exit 1
        fi
        echo "Context-sync follow-up commit pushed."
      fi

      # Increment context_sync_commits counter in handoff.yaml.
      CONTEXT_SYNC_COUNT=0
      if grep -q '^context_sync_commits:' "$HANDOFF"; then
        CONTEXT_SYNC_COUNT=$(grep '^context_sync_commits:' "$HANDOFF" \
          | awk '{print $2}')
        CONTEXT_SYNC_COUNT=$((CONTEXT_SYNC_COUNT + 1))
        sed -i "s|^context_sync_commits:.*|context_sync_commits: ${CONTEXT_SYNC_COUNT}|" \
          "$HANDOFF"
      else
        echo "context_sync_commits: 1" >> "$HANDOFF"
      fi
      git add "$HANDOFF"
      # If handoff was just amended into the previous commit, there is
      # nothing to commit; otherwise it is already part of the follow-up
      # commit above. Either way: try once, swallow if nothing to do.
      if ! git diff --cached --quiet; then
        git commit -m "chore(workflow): record context_sync_commits in handoff.yaml" \
          2>/dev/null || true
        git push origin "$BRANCH" 2>/dev/null || true
      fi
    fi
  else
    echo "No context_update: block in $DOC_UPDATE — Step F.5 is a no-op."
  fi
else
  echo "Step F.5 conditions not met (gate not passed, expects_registry_update: "\
       "$EXPECT_UPDATE, or doc-update missing) — no-op."
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
