#!/usr/bin/env python3
"""
archive-stale-active-dupes.py
=============================

One-shot operational cleanup. Workflows in `.copilot/tasks/active/` whose PR
is already MERGED on `origin/main` are archived to `completed/`. For workflows
where both an `active/` and a `completed/` copy exist, the two are unioned
(active's missing files copied into completed, then active removed) and the
handoff.yaml is back-filled with workflow_status: completed + merge SHA.

This script is idempotent: re-running after a partial pass is a no-op for
already-archived workflows. The script does not touch `registry.md`,
`workspace-state.md`, `ISS-<n>.md`, or `next-workflow-id` — those are owned
by the DocWriter pass that follows this commit.

Run from the repo root:
    python scripts/archive-stale-active-dupes.py
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
ACTIVE = REPO / ".copilot" / "tasks" / "active"
COMPLETED = REPO / ".copilot" / "tasks" / "completed"


def gh(args: list[str]) -> dict:
    """Run `gh <args> --json ...` and return the parsed JSON."""
    out = subprocess.run(
        ["gh", *args],
        capture_output=True, text=True, check=True, cwd=REPO,
    )
    return json.loads(out.stdout)


def merge_metadata(pr: str) -> tuple[str, str, str]:
    """Return (merge_sha, merged_at_iso, head_ref) for the given PR number."""
    j = gh(["pr", "view", pr, "--json", "state,mergedAt,mergeCommit,headRefName,title"])
    if j.get("state") != "MERGED":
        raise RuntimeError(f"PR #{pr} is not MERGED (state={j.get('state')})")
    sha = j["mergeCommit"]["oid"]
    merged = j["mergedAt"]
    head = j["headRefName"]
    return sha, merged, head


def backfill_handoff(ho: Path, pr: str, sha: str, merged_at: str, head: str) -> list[str]:
    """Update handoff.yaml: workflow_status=completed, github_pr_url, merge SHA, mergedAt.
    Returns a list of human-readable change descriptions.
    """
    changes: list[str] = []
    txt = ho.read_text(encoding="utf-8")
    new = txt

    # 1. workflow_status
    import re
    if re.search(r"workflow_status:\s*\"?[A-Za-z0-9_-]+\"?", new):
        new = re.sub(
            r"workflow_status:\s*\"?[A-Za-z0-9_-]+\"?",
            'workflow_status: "completed"',
            new, count=1,
        )
        changes.append("workflow_status -> completed")
    elif "workflow_status" not in new:
        # No status key at all (old schema) — inject before last_updated_at
        m = re.search(r"(last_updated_at:.*\n)", new)
        if m:
            new = new[:m.end()] + 'workflow_status: "completed"\n' + new[m.end():]
            changes.append("workflow_status -> completed (inserted)")
    # else: schema is too old to have the key — leave it, workflow_type/running
    #       is fine for archival; the registry is the source of truth.

    # 2. github_pr_url
    pr_url = f"https://github.com/tvolodi/aiqadam/pull/{pr}"
    if "github_pr_url:" in new:
        new = re.sub(
            r'github_pr_url:\s*"?https://github\.com/tvolodi/aiqadam/pull/\d+"?',
            f'github_pr_url: "{pr_url}"',
            new, count=1,
        )
        if f'github_pr_url: "{pr_url}"' in new:
            changes.append(f"github_pr_url -> {pr_url}")
    else:
        # Inject after branch:
        m = re.search(r"(base_branch:.*\n)", new)
        if m:
            new = new[:m.end()] + f'github_pr_url: "{pr_url}"\n' + new[m.end():]
            changes.append(f"github_pr_url -> {pr_url} (inserted)")

    # 3. merge commit SHA + mergedAt — append a back-fill block if not present
    if "merge_commit_sha:" not in new and "Merge Commit" not in new:
        block = (
            "\n# ─── Back-filled by archive-stale-active-dupes.py ─────────────────────\n"
            f'merge_commit_sha: "{sha}"\n'
            f'merged_at: "{merged_at}"\n'
            f'head_ref: "{head}"\n'
            f'pr_number: "{pr}"\n'
        )
        new = new.rstrip() + "\n" + block
        changes.append(f"merge_commit_sha -> {sha[:8]}")
        changes.append(f"merged_at -> {merged_at}")
        changes.append(f"head_ref -> {head}")

    if new != txt:
        ho.write_text(new, encoding="utf-8")
    return changes


def union_then_delete(active_dir: Path, completed_dir: Path) -> tuple[list[str], list[str]]:
    """Copy files from active_dir that are missing in completed_dir; then rm active_dir.
    Returns (copied, removed_active_files).
    """
    copied: list[str] = []
    for src in active_dir.rglob("*"):
        if src.is_dir():
            continue
        rel = src.relative_to(active_dir)
        dst = completed_dir / rel
        if dst.exists():
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        copied.append(str(rel))

    # Remove the active leftover
    removed: list[str] = []
    for src in active_dir.rglob("*"):
        if src.is_file():
            removed.append(str(src.relative_to(active_dir)))
    shutil.rmtree(active_dir)
    return copied, removed


def main() -> int:
    # 13 active-only + 4 both-copies
    to_archive_active_only = [
        # (wf_id, pr_number)
        ("wf-20260625-feat-026", "51"),     # FR-CRM-001
        ("wf-20260625-feat-027", "52"),     # FR-AUTH-002
        ("wf-20260625-feat-028", "53"),     # FR-WORKFLOW-002
        ("wf-20260625-feat-029", "54"),     # FR-WORKFLOW-002 PR2
        ("wf-20260628-uat-030",  "59"),     # BP-UAT-013
        ("wf-20260629-fix-035",  "67"),     # ISS-UAT-013-3
        ("wf-20260630-fix-043",  "75"),     # ISS-UAT-013-9
        ("wf-20260630-uat-042",  "74"),     # all-scripts
        ("wf-20260701-fix-044",  "78"),     # ISS-LEAD-DISC-001
        ("wf-20260701-uat-045-mailpit-resend", "79"),  # ISS-UAT-013-7
        ("wf-20260702-fix-049",  "76"),     # ISS-UAT-013-10
        ("wf-20260702-uat-058",  "84"),     # BP-UAT-009
        ("wf-20260703-feat-063", "87"),     # FR-WORKFLOW-003
    ]
    to_union = [
        # (wf_id, pr_number, larger_copy)
        ("wf-20260703-fix-067-coverage-registry", "91", "completed"),
        ("wf-20260703-uat-063",                   "88", "active"),
        ("wf-20260704-feat-090",                 "107", "active"),
        ("wf-20260704-fix-085",                 "104", "completed"),
    ]

    report: dict[str, dict] = {}

    for wf, pr in to_archive_active_only:
        active_dir = ACTIVE / wf
        completed_dir = COMPLETED / wf
        if not active_dir.is_dir():
            report[wf] = {"action": "skip", "reason": "not in active/"}
            continue
        if completed_dir.is_dir():
            report[wf] = {"action": "skip", "reason": "completed/ copy also exists (should be in to_union)"}
            continue
        sha, merged_at, head = merge_metadata(pr)
        # Move
        shutil.move(str(active_dir), str(completed_dir))
        ho = completed_dir / "handoff.yaml"
        changes: list[str] = []
        if ho.is_file():
            changes = backfill_handoff(ho, pr, sha, merged_at, head)
        report[wf] = {
            "action": "move-active->completed",
            "pr": pr,
            "sha": sha,
            "merged_at": merged_at,
            "head_ref": head,
            "handoff_changes": changes,
        }

    for wf, pr, _larger in to_union:
        active_dir = ACTIVE / wf
        completed_dir = COMPLETED / wf
        if not active_dir.is_dir() or not completed_dir.is_dir():
            report[wf] = {"action": "skip", "reason": "expected both active/ and completed/"}
            continue
        sha, merged_at, head = merge_metadata(pr)
        copied, removed = union_then_delete(active_dir, completed_dir)
        ho = completed_dir / "handoff.yaml"
        changes: list[str] = []
        if ho.is_file():
            changes = backfill_handoff(ho, pr, sha, merged_at, head)
        report[wf] = {
            "action": "union+delete-active",
            "pr": pr,
            "sha": sha,
            "merged_at": merged_at,
            "head_ref": head,
            "files_copied_from_active": copied,
            "files_removed_with_active": removed,
            "handoff_changes": changes,
        }

    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
