#!/usr/bin/env bash
# sync-github-project.sh — Create-or-update a typed GitHub Issue + GitHub
# Project (v2) item for a local ISS-<n> / FR-<CODE> tracking record.
#
# Usage:
#   scripts/sync-github-project.sh --ref <ISS-n|FR-CODE> --status <todo|in-progress|implemented|agent-verified|done>
#     [--title <text>] [--body-file <path>] [--severity <value>]
#     [--business-process <codes>] [--existing-url <url>] [--dry-run]
#     [--repo <owner/name>]
#
# Status model (added 2026-07-29, split for the volunteer-UAT distinction):
#   todo / in-progress / implemented — as before.
#   agent-verified — an agent (post-merge UAT re-run, or "nothing
#     process-related to verify") has done everything it can. This is a
#     SCRIPT-SET status, same as the others.
#   done — a human volunteer spot-checked it and confirmed. This status is
#     NEVER set by this script or by any workflow step — it is set only by
#     a human directly on the Project board. Passing --status done here is
#     a hard error; if a caller thinks it needs to, that's a bug in the
#     caller, not a valid use of this script.
#
# --title/--body-file are required on first create (no existing issue
# found and no --existing-url given); ignored (with a warning) on
# update-only runs. --severity maps an ISS-* ref to GitHub Issue Type
# Bug/Task; FR-* refs always become Feature type regardless of --severity.
#
# Idempotent: safe to re-run. Re-running with an unchanged --status is a
# true no-op on GitHub's side. Re-running with a new --status updates only
# the Status field — title/body/type are never touched on an update run
# unless --body-file is explicitly passed, so a later sync call never
# clobbers edits a human made on GitHub in between.
#
# Emits on stdout (last line): GITHUB_ISSUE_URL=<url>
# Exit codes: 0 success, 1 hard failure, 2 invocation error.
#
# Called by:
#   - scripts/migrate-open-items-to-github.sh (one-time Phase 1 migration)
#   - .copilot/workflows/issue-resolution.md Step 1 / 9 / 12.5
#   - .copilot/workflows/requirement-development.md Step 1 / 9 / 11.5
#
# See .copilot/schemas/protocol.md "GitHub Issue / Project Sync" and
# docs/04-development/github-access.md §5 for the full mechanism and how
# to re-verify the constants below if this script starts failing.

set -euo pipefail

REPO="aiqadam/ai-qadam-platform"
REPO_OWNER="aiqadam"
REPO_NAME="ai-qadam-platform"
PROJECT_NUMBER=1
PROJECT_OWNER="aiqadam"
PROJECT_ID="PVT_kwDOEXUt6M4BewJJ"

# Status option ids — confirmed live 2026-07-29 via
#   gh api graphql -f query='query { organization(login:"aiqadam") {
#     projectV2(number:1) { field(name:"Status") { ... on
#     ProjectV2SingleSelectField { options { id name } } } } } }'
# Re-verify with the same query if this script starts failing with an
# "invalid single-select option" GraphQL error (options renamed/removed).
declare -A STATUS_OPTION_ID=(
  [todo]="f75ad846"
  [in-progress]="47fc9ee4"
  [implemented]="f0db74f6"
  [agent-verified]="875a2bc9"
  [done]="98236657"
)

# "done" is human-only — see the header comment. Enforced in argument
# validation below, not just documented, so a workflow-file typo (passing
# --status done from an agent step) fails loudly instead of silently
# claiming a human confirmation that never happened.
HUMAN_ONLY_STATUSES=("done")

# Issue Type ids — confirmed live 2026-07-29 via
#   gh api graphql -f query='query { repository(owner:"aiqadam",
#     name:"ai-qadam-platform") { issueTypes(first:20) { nodes { name id } } } } }'
# Re-verify the same way if a "type not found" error appears.
ISSUE_TYPE_BUG="IT_kwDOEXUt6M4CCp-x"
ISSUE_TYPE_TASK="IT_kwDOEXUt6M4CCp-w"
ISSUE_TYPE_FEATURE="IT_kwDOEXUt6M4CCp-y"

# ─── Argument parsing ────────────────────────────────────────────────────────

REF=""
STATUS=""
TITLE=""
BODY_FILE=""
SEVERITY=""
BUSINESS_PROCESS=""
EXISTING_URL=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref) REF="$2"; shift 2 ;;
    --status) STATUS="$2"; shift 2 ;;
    --title) TITLE="$2"; shift 2 ;;
    --body-file) BODY_FILE="$2"; shift 2 ;;
    --severity) SEVERITY="$2"; shift 2 ;;
    --business-process) BUSINESS_PROCESS="$2"; shift 2 ;;
    --existing-url) EXISTING_URL="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --repo) REPO="$2"; REPO_OWNER="${2%%/*}"; REPO_NAME="${2##*/}"; shift 2 ;;
    --help|-h)
      sed -n '2,25p' "$0" | sed 's/^# \?//'
      exit 0 ;;
    *)
      echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$REF" || -z "$STATUS" ]]; then
  echo "ERROR: --ref and --status are required." >&2
  exit 2
fi

if [[ -z "${STATUS_OPTION_ID[$STATUS]+x}" ]]; then
  echo "ERROR: --status must be one of: ${!STATUS_OPTION_ID[*]}" >&2
  exit 2
fi

for human_only in "${HUMAN_ONLY_STATUSES[@]}"; do
  if [[ "$STATUS" == "$human_only" ]]; then
    echo "ERROR: --status $STATUS is human-only — no script or workflow step may set it." >&2
    echo "A human volunteer sets this directly on the Project board after spot-checking. See the header comment." >&2
    exit 2
  fi
done

MARKER="<!-- aiqadam-sync-ref: ${REF} -->"

# ─── Functions ────────────────────────────────────────────────────────────

verify_repo_resolution() {
  local actual
  actual=$(gh repo view --json owner,name -q '.owner.login + "/" + .name' 2>/dev/null || true)
  if [[ "$actual" != "$REPO" ]]; then
    echo "ERROR: gh repo view resolved to '${actual:-<none>}', expected '$REPO'." >&2
    echo "See docs/04-development/github-access.md §2 — gh's default-repo cache can drift from git remote." >&2
    exit 1
  fi
}

# resolve_issue_type_id <ref> <severity>
# ISS-* → Bug for blocker/bug/critical, Task for enhancement/minor/operational.
# FR-* → always Feature, --severity ignored.
resolve_issue_type_id() {
  local ref="$1" severity="$2"
  if [[ "$ref" == FR-* ]]; then
    echo "$ISSUE_TYPE_FEATURE"
    return
  fi
  case "$severity" in
    blocker|bug|critical) echo "$ISSUE_TYPE_BUG" ;;
    enhancement|minor|operational) echo "$ISSUE_TYPE_TASK" ;;
    "")
      echo "ERROR: --severity is required to create a new ISS-* issue (got ref=$ref, no --severity)." >&2
      exit 2 ;;
    *)
      echo "ERROR: unrecognized --severity '$severity' for ref '$ref'." >&2
      exit 2 ;;
  esac
}

# find_existing_issue <ref>
# Searches by embedded marker comment, not the bare ref string, to avoid
# matching prose mentions (several registry entries already cite
# "GitHub issue #NN" in free text). Prints the issue's GraphQL node id,
# number, url, and its first ProjectV2 item id (if already on the board)
# as 4 space-separated fields, or nothing if no match. Hard-fails on >1 match.
find_existing_issue() {
  local ref="$1"
  local result
  result=$(gh api graphql -f query='
    query($searchQuery: String!) {
      search(query: $searchQuery, type: ISSUE, first: 5) {
        nodes {
          ... on Issue {
            id
            number
            url
            projectItems(first: 5) {
              nodes { id project { id } }
            }
          }
        }
      }
    }' -f searchQuery="repo:${REPO} in:body \"${MARKER}\" is:issue" \
    --jq '.data.search.nodes')

  local count
  count=$(echo "$result" | jq 'length')

  if [[ "$count" -eq 0 ]]; then
    return 0
  elif [[ "$count" -gt 1 ]]; then
    echo "ERROR: found $count issues matching marker for '$ref' — ambiguous, refusing to guess:" >&2
    echo "$result" | jq -r '.[].url' >&2
    exit 1
  fi

  local issue_id number url item_id
  issue_id=$(echo "$result" | jq -r '.[0].id')
  number=$(echo "$result" | jq -r '.[0].number')
  url=$(echo "$result" | jq -r '.[0].url')
  item_id=$(echo "$result" | jq -r --arg pid "$PROJECT_ID" \
    '.[0].projectItems.nodes[] | select(.project.id == $pid) | .id' | head -n1)

  echo "$issue_id $number $url $item_id"
}

# find_issue_by_url <url>
# Resolves --existing-url to issue id + project item id (adding it to the
# project first if it isn't already an item, e.g. a raw pre-existing issue).
find_issue_by_url() {
  local url="$1"
  local number
  number=$(echo "$url" | grep -oE '[0-9]+$')

  local result
  result=$(gh api graphql -f query='
    query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        issue(number: $number) {
          id
          projectItems(first: 5) {
            nodes { id project { id } }
          }
        }
      }
    }' -f owner="$REPO_OWNER" -f name="$REPO_NAME" -F number="$number" \
    --jq '.data.repository.issue')

  local issue_id item_id
  issue_id=$(echo "$result" | jq -r '.id')
  item_id=$(echo "$result" | jq -r --arg pid "$PROJECT_ID" \
    '.projectItems.nodes[] | select(.project.id == $pid) | .id' | head -n1)

  if [[ -z "$item_id" || "$item_id" == "null" ]]; then
    item_id=$(gh api graphql -f query='
      mutation($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
          item { id }
        }
      }' -f projectId="$PROJECT_ID" -f contentId="$issue_id" \
      --jq '.data.addProjectV2ItemById.item.id')
  fi

  echo "$issue_id $number $url $item_id"
}

# create_issue <ref> <title> <body_file> <type_id>
# Single createIssue mutation: sets title/body/type and attaches to the
# project in one call. Prints: issue_id number url item_id
create_issue() {
  local ref="$1" title="$2" body_file="$3" type_id="$4"
  local repo_id body

  repo_id=$(gh api graphql -f query='
    query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) { id }
    }' -f owner="$REPO_OWNER" -f name="$REPO_NAME" --jq '.data.repository.id')

  body=$(printf '%s\n\n%s\n' "$MARKER" "$(cat "$body_file")")
  if [[ -n "$BUSINESS_PROCESS" ]]; then
    body=$(printf '%s\n\n**Business-Process:** %s\n' "$body" "$BUSINESS_PROCESS")
  fi

  local result
  result=$(gh api graphql -f query='
    mutation($repositoryId: ID!, $title: String!, $body: String!, $typeId: ID!, $projectIds: [ID!]) {
      createIssue(input: {
        repositoryId: $repositoryId, title: $title, body: $body,
        issueTypeId: $typeId, projectV2Ids: $projectIds
      }) {
        issue {
          id
          number
          url
          projectItems(first: 5) { nodes { id project { id } } }
        }
      }
    }' -f repositoryId="$repo_id" -f title="$title" -f body="$body" \
    -f typeId="$type_id" -f projectIds="$PROJECT_ID" \
    --jq '.data.createIssue.issue')

  local issue_id number url item_id
  issue_id=$(echo "$result" | jq -r '.id')
  number=$(echo "$result" | jq -r '.number')
  url=$(echo "$result" | jq -r '.url')
  item_id=$(echo "$result" | jq -r --arg pid "$PROJECT_ID" \
    '.projectItems.nodes[] | select(.project.id == $pid) | .id' | head -n1)

  # projectV2Ids attachment is eventually consistent — the mutation's own
  # response frequently returns an empty projectItems.nodes even though
  # the attachment succeeded (confirmed live 2026-07-29). Poll briefly.
  if [[ -z "$item_id" || "$item_id" == "null" ]]; then
    local attempt=0
    while [[ $attempt -lt 5 && ( -z "$item_id" || "$item_id" == "null" ) ]]; do
      sleep 1
      item_id=$(gh api graphql -f query='
        query($owner: String!, $name: String!, $number: Int!) {
          repository(owner: $owner, name: $name) {
            issue(number: $number) {
              projectItems(first: 5) { nodes { id project { id } } }
            }
          }
        }' -f owner="$REPO_OWNER" -f name="$REPO_NAME" -F number="$number" \
        --jq '.data.repository.issue.projectItems.nodes' \
        | jq -r --arg pid "$PROJECT_ID" '.[] | select(.project.id == $pid) | .id' \
        | head -n1)
      attempt=$((attempt + 1))
    done
  fi

  echo "$issue_id $number $url $item_id"
}

# set_status <item_id> <status>
# Resolves the Status field's own id live (never hardcoded) then sets it.
set_status() {
  local item_id="$1" status="$2"
  local field_id option_id

  field_id=$(gh project field-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json \
    | jq -r '.fields[] | select(.name == "Status") | .id')

  if [[ -z "$field_id" || "$field_id" == "null" ]]; then
    echo "ERROR: could not resolve the 'Status' field id on project $PROJECT_NUMBER — was it renamed?" >&2
    exit 1
  fi

  option_id="${STATUS_OPTION_ID[$status]}"

  gh project item-edit \
    --id "$item_id" \
    --project-id "$PROJECT_ID" \
    --field-id "$field_id" \
    --single-select-option-id "$option_id" >/dev/null
}

# ─── Main ─────────────────────────────────────────────────────────────────

verify_repo_resolution

TYPE_ID=""
if [[ -z "$EXISTING_URL" ]]; then
  TYPE_ID=$(resolve_issue_type_id "$REF" "$SEVERITY")
fi

if $DRY_RUN; then
  echo "[dry-run] ref=$REF status=$STATUS existing_url=${EXISTING_URL:-<none>} type_id=${TYPE_ID:-<n/a, using existing>}"
  if [[ -z "$EXISTING_URL" ]]; then
    echo "[dry-run] would search for existing issue via marker: $MARKER"
    echo "[dry-run] if not found, would create issue: title='${TITLE:-<MISSING>}' body_file='${BODY_FILE:-<MISSING>}' type_id=$TYPE_ID projectIds=$PROJECT_ID"
  else
    echo "[dry-run] would resolve issue + project item from $EXISTING_URL"
  fi
  echo "[dry-run] would set Status to '$STATUS' (option id ${STATUS_OPTION_ID[$STATUS]})"
  exit 0
fi

ISSUE_ID="" ISSUE_NUMBER="" ISSUE_URL="" ITEM_ID=""

if [[ -n "$EXISTING_URL" ]]; then
  read -r ISSUE_ID ISSUE_NUMBER ISSUE_URL ITEM_ID <<< "$(find_issue_by_url "$EXISTING_URL")"
else
  found=$(find_existing_issue "$REF")
  if [[ -n "$found" ]]; then
    read -r ISSUE_ID ISSUE_NUMBER ISSUE_URL ITEM_ID <<< "$found"
  fi
fi

if [[ -z "$ISSUE_ID" ]]; then
  if [[ -z "$TITLE" || -z "$BODY_FILE" ]]; then
    echo "ERROR: no existing issue found for '$REF' and --title/--body-file not both given — cannot create." >&2
    exit 2
  fi
  read -r ISSUE_ID ISSUE_NUMBER ISSUE_URL ITEM_ID <<< "$(create_issue "$REF" "$TITLE" "$BODY_FILE" "$TYPE_ID")"
else
  if [[ -n "$TITLE" || -n "$BODY_FILE" ]] && [[ -z "$BODY_FILE" ]]; then
    echo "WARNING: --title given on an update run without --body-file — ignoring (title/body only change together, on purpose)." >&2
  fi
fi

if [[ -z "$ITEM_ID" || "$ITEM_ID" == "null" ]]; then
  echo "ERROR: could not resolve a Project item id for issue $ISSUE_URL." >&2
  exit 1
fi

set_status "$ITEM_ID" "$STATUS"

echo "GITHUB_ISSUE_URL=$ISSUE_URL"
