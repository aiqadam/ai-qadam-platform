#!/usr/bin/env python3
"""
close-stalled-active-workflows.py
================================

Operational close-out for workflows that have been sitting in
`.copilot/tasks/active/` past the typical stall threshold without
making forward progress. Two outcomes are supported:

  1. ARCHIVE  — move to `.copilot/tasks/archived/` with the handoff
     left untouched (the directory location is the signal that the
     workflow is closed-without-PR). The gitignored log files in
     `wf-20260629-fix-043` are deliberately NOT preserved in the
     archive copy — they were diagnostic scratch.

  2. PAUSE    — leave the directory in `active/` but flip
     `workflow_status: running` -> `paused` in the handoff and append
     a `pause_note:` block explaining why. This is the right action
     for workflows that are real-but-stalled: the directory is
     already in the right place, the user may want to resume later,
     and removing the directory would lose the in-progress artifacts.

Idempotent: re-running after a partial pass is a no-op for
already-archived/paused workflows.

Run from the repo root:
    python scripts/close-stalled-active-workflows.py
"""
from __future__ import annotations

import datetime as dt
import json
import re
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
ACTIVE = REPO / ".copilot" / "tasks" / "active"
ARCHIVED = REPO / ".copilot" / "tasks" / "archived"

ARCHIVE_THESE = [
    # (wf_id, reason_for_archive)
    (
        "wf-20260629-fix-043",
        "No handoff.yaml; only diagnostic log files (gitignored: authentik-users.log, "
        "biome.log, typecheck.log, test*.log, uat-authentik-check.log). Never produced "
        "a PR. The underlying investigation space is already covered by "
        "wf-20260629-fix-036..039 and wf-20260630-fix-043 (all merged via PRs #68..#75).",
    ),
    (
        "wf-20260703-uat-064",
        "Sub-workflow of wf-20260703-fix-064 (in completed/, merged via PR #89). "
        "Created to re-verify BP-UAT-001 AC-1/2/3 deferred from the parent. "
        "Those ACs were subsequently re-deferred to wf-20260704-fix-085 (now in "
        "completed/, merged via PR #104) and wf-20260704-fix-086 (in queued/, "
        "re-targeted at ISS-UAT-BRIDGE-002). The uat-064 sub-workflow is dead "
        "code; its parent ACs are owned by a different chain.",
    ),
]

PAUSE_THESE = [
    # (wf_id, pause_note)
    (
        "wf-20260629-feat-032",
        "Paused 2026-07-05 during wf-20260705-close-stalled-active cleanup. "
        "FEAT-WORKFLOW-003 (atomic issue-status flip in issue-resolution Step 9) "
        "is a real protocol gap and worth implementing, but Step 0 (init) was "
        "never completed and only 02-impact-analysis.md exists in the "
        "directory. Not blocking any other workflow. Resume by completing the "
        "RequirementAnalyst + ImpactAnalyzer steps from scratch.",
    ),
    (
        "wf-20260702-feat-056",
        "Paused 2026-07-05 during wf-20260705-close-stalled-active cleanup. "
        "FR-UAT-VISUAL-001 (VisualReviewer agent + three-layer visual testing "
        "strategy) was at Step 1 (author-artifacts) with the spec drafted but "
        "the agent files not yet written. No progress for 2 days. Not blocking "
        "any other workflow. Resume by completing the agent definition + "
        "enforcement script in `.copilot/agents/visual-reviewer.md` and "
        "`scripts/visual-check.sh`.",
    ),
]


def archive_workflow(wf_id: str, reason: str) -> dict:
    active_dir = ACTIVE / wf_id
    archived_dir = ARCHIVED / wf_id
    if not active_dir.is_dir():
        return {"action": "skip", "reason": "not in active/"}
    if archived_dir.is_dir():
        return {"action": "skip", "reason": "already archived"}

    # Move only tracked files (skip gitignored logs). We rely on the
    # move-default behavior: shutil.move() copies every file, then
    # post-archive we delete the gitignored ones from the new location.
    shutil.move(str(active_dir), str(archived_dir))
    removed_gitignored: list[str] = []
    for src in archived_dir.rglob("*"):
        if src.is_file():
            rel = src.relative_to(REPO)
            # Check if git ignores this file
            cp = __import__("subprocess").run(
                ["git", "check-ignore", "-q", str(rel)],
                cwd=REPO, capture_output=True,
            )
            if cp.returncode == 0:
                rel_in_arch = src.relative_to(archived_dir)
                src.unlink()
                removed_gitignored.append(str(rel_in_arch))

    # Append archive reason to the handoff if it exists
    ho = archived_dir / "handoff.yaml"
    archive_note_added = False
    if ho.is_file():
        txt = ho.read_text(encoding="utf-8")
        block = (
            "\n# ─── Archived by close-stalled-active-workflows.py ────────────────\n"
            f"workflow_status: \"archived\"\n"
            f"archived_at: \"{dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')}\"\n"
            f"archive_reason: |\n"
        )
        for line in reason.splitlines() or [""]:
            block += f"  {line}\n" if line else "\n"
        ho.write_text(txt.rstrip() + "\n" + block, encoding="utf-8")
        archive_note_added = True

    return {
        "action": "archived",
        "removed_gitignored": removed_gitignored,
        "handoff_note_added": archive_note_added,
    }


def pause_workflow(wf_id: str, note: str) -> dict:
    active_dir = ACTIVE / wf_id
    if not active_dir.is_dir():
        return {"action": "skip", "reason": "not in active/"}
    ho = active_dir / "handoff.yaml"
    if not ho.is_file():
        return {"action": "skip", "reason": "no handoff.yaml"}
    txt = ho.read_text(encoding="utf-8")
    if 'workflow_status: "paused"' in txt or "workflow_status: paused" in txt:
        return {"action": "skip", "reason": "already paused"}

    # 1. Flip workflow_status
    new = re.sub(
        r"workflow_status:\s*\"?[A-Za-z0-9_-]+\"?",
        'workflow_status: "paused"',
        txt, count=1,
    )
    if new == txt:
        # No existing key — inject after current_step_name
        m = re.search(r"(current_step_name:.*\n)", new)
        if m:
            new = new[:m.end()] + 'workflow_status: "paused"\n' + new[m.end():]
        else:
            new = 'workflow_status: "paused"\n' + new

    # 2. Update last_updated_at
    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    new = re.sub(
        r"last_updated_at:\s*\"[^\"]+\"",
        f'last_updated_at: "{now}"',
        new, count=1,
    )

    # 3. Append pause_note block
    block = (
        "\n# ─── Paused by close-stalled-active-workflows.py ──────────────────\n"
        f"paused_at: \"{now}\"\n"
        f"pause_note: |\n"
    )
    for line in note.splitlines() or [""]:
        block += f"  {line}\n" if line else "\n"
    new = new.rstrip() + "\n" + block

    ho.write_text(new, encoding="utf-8")
    return {"action": "paused", "paused_at": now}


def main() -> int:
    report: dict[str, dict] = {}
    for wf_id, reason in ARCHIVE_THESE:
        report[wf_id] = archive_workflow(wf_id, reason)
    for wf_id, note in PAUSE_THESE:
        report[wf_id] = pause_workflow(wf_id, note)
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
