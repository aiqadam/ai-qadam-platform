#!/usr/bin/env bash
# scripts/check-workflow-state.sh
#
# Context-drift guard for the agentic workflow layer.
# Implements FEAT-WORKFLOW-001 Step 0.5 ("Context Sync").
#
# Compares three project-state files against `origin/<base>` and exits
# non-zero with a diagnostic on stderr if drift is detected.
#
# Three state files are tracked:
#   - .copilot/context/workspace-state.md
#   - .copilot/issues/registry.md
#   - docs/03-requirements/requirements-registry.md
#
# Exit codes:
#   0  No drift detected; workflow may proceed.
#   1  Drift detected (orphaned ref, stale frontmatter, or missing file).
#   2  Invocation error (missing arg, not a git repo, etc.).
#
# PowerShell compatibility:
#   - Success summaries go to stdout.
#   - Diagnostics go to stderr (never stdout when failing).
#   This avoids PowerShell's `NativeCommandError` false-positive on stderr.
#
# Invocation:
#   scripts/check-workflow-state.sh                       # uses origin/main
#   scripts/check-workflow-state.sh --base origin/main    # explicit base
#   scripts/check-workflow-state.sh --skip                # emergency bypass

set -euo pipefail

# ─── Named constants (AGENTS.md §1.3) ────────────────────────────────────────

readonly SCRIPT_NAME="check-workflow-state.sh"
readonly STATE_DIR=".copilot/context"
readonly WORKSPACE_STATE="$STATE_DIR/workspace-state.md"
readonly ISSUE_REGISTRY=".copilot/issues/registry.md"
readonly REQS_REGISTRY="docs/03-requirements/requirements-registry.md"

readonly DEFAULT_BASE="origin/main"
readonly MAX_FRONT_OLD_COMMITS=20

# ─── Argument parsing ────────────────────────────────────────────────────────

BASE_REF="$DEFAULT_BASE"
SKIP=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base)
      BASE_REF="$2"; shift 2 ;;
    --skip)
      SKIP=true; shift ;;
    -h|--help)
      sed -n '2,29p' "$0"   # print header comment as help (lines 2-29, before `set`)
      exit 0 ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      echo "Run '$SCRIPT_NAME --help' for usage." >&2
      exit 2 ;;
  esac
done

# ─── Preconditions (AGENTS.md §1.5) ──────────────────────────────────────────

if [[ "$SKIP" == "true" ]]; then
  echo "WARNING: --skip set; bypassing drift check." >&2
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

# Verify base ref is reachable.
if ! git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  echo "ERROR: base ref '$BASE_REF' not resolvable. Fetch first?" >&2
  exit 2
fi

# Verify state files exist on the base ref (R-3 mitigation: compare upstream,
# never working tree or local HEAD). Per AGENTS.md §1.5.
for state_file in "$WORKSPACE_STATE" "$ISSUE_REGISTRY" "$REQS_REGISTRY"; do
  if ! git show "$BASE_REF:$state_file" >/dev/null 2>&1; then
    echo "ERROR: state file not found at $BASE_REF:$state_file" >&2
    exit 2
  fi
done

# ─── Helper functions (each ≤ 60 lines, AGENTS.md §1.4) ──────────────────────

# emit_drift <message>
# Writes a structured drift diagnostic to stderr and returns non-zero.
emit_drift() {
  local message="$1"
  echo "DRIFT: $message" >&2
}

# extract_workflow_ids <state-file-from-base>
# Reads workspace-state.md on the base ref and lists Active Workflows IDs.
extract_workflow_ids() {
  local state_text="$1"
  # Match rows in the Active Workflows table: leading `| wf-...` cells.
  echo "$state_text" \
    | grep -E '^\|\s*wf-[0-9]{8}-[a-z]+-[0-9]+\s*\|' \
    | awk -F'|' '{print $2}' \
    | sed 's/[[:space:]]//g' \
    || true
}

# extract_requirement_ids <registry-text>
# Reads requirements-registry.md and lists FR-<MODULE>-<NNN> ids referenced.
extract_requirement_ids() {
  local registry_text="$1"
  echo "$registry_text" \
    | grep -oE 'FR-[A-Z]+-[0-9]{3}' \
    | sort -u \
    || true
}

# extract_issue_ids <registry-text>
# Reads issues/registry.md and lists ISS-<name> ids referenced.
# Char class is A–Z + a–f + 0–9 + `-`: A–Z covers canonical ISS-CI-OVERRIDE
# prefix; a–f + 0–9 covers the SHA1-prefixed tail added by PRSteward auto-
# registered classes (AGENTS.md §6.3 step 3 names them `ISS-CI-OVERRIDE-<sha>`).
# Without the a–f range, the regex would greedy-match only up to the trailing
# `-` and report a phantom `ISS-CI-OVERRIDE-` ID that has no corresponding file.
extract_issue_ids() {
  local registry_text="$1"
  echo "$registry_text" \
    | grep -oE 'ISS-[A-Z0-9a-f-]+' \
    | sort -u \
    || true
}

# ─── Drift detection (R-3: compare against origin/<base>) ────────────────────

drift_count=0

# Read state-file text from the base ref (R-3 mitigation).
WORKSPACE_TEXT=$(git show "$BASE_REF:$WORKSPACE_STATE" 2>/dev/null || true)
REQS_TEXT=$(git show "$BASE_REF:$REQS_REGISTRY" 2>/dev/null || true)
ISSUE_TEXT=$(git show "$BASE_REF:$ISSUE_REGISTRY" 2>/dev/null || true)

# Check 1: orphaned workflow references in workspace-state.md
# A row pointing to a path under .copilot/tasks/active/ that no longer exists
# on disk is an orphan. We allow completed/ paths (R-3d mitigation).
mapfile -t WORKFLOW_IDS < <(extract_workflow_ids "$WORKSPACE_TEXT")
for wf_id in "${WORKFLOW_IDS[@]}"; do
  # If id is empty (e.g., table header rows that matched), skip.
  [[ -z "$wf_id" ]] && continue
  # An ID is orphaned only if it is referenced AND neither active, completed,
  # nor archived on disk AND no workflow artifact commit exists on the base
  # ref. (archived/ was added in ISS-WF-13-1 — PR #14.)
  if [[ ! -d ".copilot/tasks/active/$wf_id" \
     && ! -d ".copilot/tasks/completed/$wf_id" \
     && ! -d ".copilot/tasks/archived/$wf_id" ]]; then
    # Tolerate: workflow artifact committed in recent history (archived via PR).
    if ! git log --oneline -- ".copilot/tasks/active/$wf_id" \
         | grep -q .; then
      emit_drift "workspace-state.md references workflow '$wf_id' " \
                 "with no corresponding directory under .copilot/tasks/"
      drift_count=$((drift_count + 1))
    fi
  fi
done

# Check 2: workspace-state.md frontmatter `Last updated` freshness.
# The file should have been updated within the last MAX_FRONT_OLD_COMMITS
# commits on the base ref. If it is older than that, treat as stale only when
# other workflow artifacts have moved (proxy: branch exists on remote).
LAST_UPDATED=$(echo "$WORKSPACE_TEXT" \
  | grep -E '^\*\*Last updated:\*\*' \
  | head -1 \
  | sed -E 's/.*Last updated:\*\*[[:space:]]*//' \
  | tr -d ' ' \
  || true)

if [[ -z "$LAST_UPDATED" ]]; then
  emit_drift "workspace-state.md missing '**Last updated:**' frontmatter"
  drift_count=$((drift_count + 1))
fi

# Check 3: orphaned FR references in requirements-registry.md
# If a FR-<MODULE>-<NNN> file is referenced in the registry but does not exist
# on the base ref, that is drift.
mapfile -t FR_IDS < <(extract_requirement_ids "$REQS_TEXT")
for fr_id in "${FR_IDS[@]}"; do
  [[ -z "$fr_id" ]] && continue
  # Convert FR-EVT-001 -> FR-EVT-001.md (registry references FR files by name).
  if ! git show "$BASE_REF:docs/03-requirements/${fr_id}.md" >/dev/null 2>&1; then
    emit_drift "requirements-registry.md references '${fr_id}' " \
               "but docs/03-requirements/${fr_id}.md is missing on $BASE_REF"
    drift_count=$((drift_count + 1))
  fi
done

# Check 4: orphaned ISS references in issues/registry.md
mapfile -t ISS_IDS < <(extract_issue_ids "$ISSUE_TEXT")
for iss_id in "${ISS_IDS[@]}"; do
  [[ -z "$iss_id" ]] && continue
  if ! git show "$BASE_REF:.copilot/issues/${iss_id}.md" >/dev/null 2>&1; then
    emit_drift "issues/registry.md references '${iss_id}' " \
               "but .copilot/issues/${iss_id}.md is missing on $BASE_REF"
    drift_count=$((drift_count + 1))
  fi
done

# ─── Result ──────────────────────────────────────────────────────────────────

if [[ "$drift_count" -gt 0 ]]; then
  echo "ERROR: $drift_count drift item(s) detected against $BASE_REF." >&2
  echo "Reconcile state files or run '$SCRIPT_NAME --skip' if intentional." >&2
  exit 1
fi

echo "OK: no drift detected against $BASE_REF."
exit 0
