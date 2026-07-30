# ISS-WF-GH-LINK-001 — Locally-filed issues can silently never be pushed to GitHub, with no error anywhere

| Field | Value |
|---|---|
| ID | ISS-WF-GH-LINK-001 |
| Severity | minor |
| Module | workflow/registry |
| Status | resolved |
| Reported | 2026-07-30 |
| Resolved | 2026-07-30 |
| Workflow | wf-20260730-fix-159 |
| Reporter | Orchestrator (user asked directly: "why do not agents simply register new issues in GitHub?") |
| Related | ISS-UAT-SEED-003, ISS-UAT-010-1, ISS-EVT-004-1, ISS-BRIDGE-STALE-001, ISS-UAT-010-2, ISS-WF-REG-001, ISS-WF-REG-002 |
| Business-Process | — |
| GitHub-Issue | https://github.com/aiqadam/ai-qadam-platform/issues/165 |

## Symptom

During `wf-20260730-fix-157` / `wf-20260730-uat-158`, 4 new `ISS-*.md`
files were created and registered in `.copilot/issues/registry.md`, but
the `scripts/sync-github-project.sh` call that pushes a locally-discovered
issue to GitHub (documented in `protocol.md`'s "GitHub Issue / Project
Sync" section and `issue-resolution.md` Step 1) was never actually made
for any of the 4. The user asked directly whether new issues get
registered in GitHub, which is how the gap was found — nothing in the
workflow itself surfaced it.

Separately, while building the fix for this issue, two more instances of
a related-but-distinct drift were found: `ISS-ADM-010-1` (no
`GitHub-Issue` field at all) and `ISS-WF-REG-002` (registry row said
`resolved`, but the issue file's own header `Status` field still said
`open` — the exact class `ISS-WF-REG-001`/`ISS-WF-REG-002` themselves
already document, just recurring).

## Root cause

The sync call is deliberately best-effort/non-blocking (a transient
GitHub API failure must not fail a workflow's gate) — but that same
design means a step that simply skips the call produces no error, no
warning, nothing that would prompt an agent or a human to notice.

## Impact

An issue can exist only in `.copilot/issues/` and `registry.md` — both
committed to `main` — with zero visibility on the GitHub Project board
that's meant to be the queryable, cross-cutting view of open work. A
`blocker`-severity issue (like `ISS-BRIDGE-STALE-001` was, before this
session's fix) could sit invisible indefinitely unless someone happens
to read `registry.md` directly.

## Fix

`scripts/check-github-issue-links.sh` (new): scans
`.copilot/issues/registry.md`, and for every issue whose own `ISS-<n>.md`
header `Status` is non-terminal (not `resolved`/`closed`), verifies a
real `GitHub-Issue` link exists — not empty, not a placeholder. Wired
into two enforcement points:

1. `scripts/check-workflow-state.sh` (Step 0.5, every workflow start) —
   full-registry scan against the base ref.
2. `QualityGate` (`.copilot/agents/quality-gate.md` §8.5) — scoped check
   at the end of any workflow that itself created/modified an issue file.

Reads each issue file's own `Status` header as authoritative (not
`registry.md`'s Status column) — this incidentally also catches the
file-vs-registry drift class, which is how `ISS-WF-REG-002`'s stale
header was found and fixed in this same pass.

## Acceptance criteria

- [x] AC-1: `scripts/check-github-issue-links.sh` authored, with a bats
      regression suite covering: linked/unlinked/placeholder-linked
      issues, terminal-status exemption (resolved/closed, including bold
      and prose-suffixed variants), missing-file detection, `--skip`,
      `--base <ref>`, and a dedicated regression test for a real bug
      found while writing the script (an old-format issue file with no
      `| Status |` table row caused an unguarded `grep -m1` no-match exit
      1 to silently abort the ENTIRE scan under `set -e`, at whichever ID
      happened to sort first).
- [x] AC-2: Wired into `check-workflow-state.sh` (Step 0.5, blocking) and
      `quality-gate.md` (§8.5, scoped to workflows touching issue files).
- [x] AC-3: The 2 pre-existing gaps found while building this
      (`ISS-ADM-010-1`, `ISS-WF-REG-002`) fixed in this same PR — a GitHub
      issue created for `ISS-ADM-010-1` (genuinely still open), and
      `ISS-WF-REG-002`'s stale header Status flipped to match its own
      already-complete Resolution section — so the new check ships green
      against `main`, not immediately red for every future workflow.
- [x] AC-4: `bash scripts/check-github-issue-links.sh` exits 0 against
      the working tree after the above fixes.

## Resolution

**Workflow:** wf-20260730-fix-159
**Root cause:** best-effort/non-blocking sync design (correct) had no
mechanical backstop for a skipped call (the actual gap).
**Fix:** new script + 2 enforcement wiring points + 2 pre-existing gaps
closed in the same pass. See AC-by-AC above.
