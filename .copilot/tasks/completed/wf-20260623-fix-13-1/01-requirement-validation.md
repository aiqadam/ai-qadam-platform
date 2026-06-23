# Requirement Validation — ISS-WF-13-1

> Output for: `.copilot/tasks/active/wf-20260623-fix-13-1/01-requirement-validation.md`
> Agent: RequirementAnalyst (Orchestrator-authored)
> Workflow: wf-20260623-fix-13-1
> Issue: ISS-WF-13-1

---

## Issue text

> Pre-existing workflow state drift detected by FEAT-WORKFLOW-001 blocks
> Step 0.5 of every future workflow until reconciled.

## Clarified requirement

Two changes to `origin/main` are required so the new
`check-workflow-state.sh` (shipped in PR #13) reports no drift on a
clean origin/main:

**Change 1 — script (Part A):** Extend the orphan check in
`scripts/check-workflow-state.sh` to recognize
`.copilot/tasks/archived/<wf-id>` as a valid task-dir home, in addition
to `active/` and `completed/`. The current code (line 155-156) only
checks `active/` and `completed/`. Workflows that have been moved to
`archived/` (e.g., after their PR merges) currently appear as false-
positive orphans.

**Change 2 — repo cleanup (Part B):** Remove the tracked files under
`.copilot/tasks/active/wf-20260622-feat-001/` (3 files:
01-requirement-validation.md, 02-impact-analysis.md, handoff.yaml).
These were committed before `.copilot/tasks/` was added to
`.gitignore`. They are tracked in `origin/main` even though the
workflow finished 2026-06-22 and the FR-MIG-003 feature has been
shipped. They are dead artifacts and the canonical reference is
in `requirements-registry.md` row 5.

**No registry update expected** for FR / issue. Both `requirements-registry.md`
and `issues/registry.md` reference this issue only as a transient
state (the issue will be marked `resolved` in the registry, but the
registry doesn't track a "feature" for this fix — it's a hygiene
fix, not a feature).

## Conflict check

| Source | Status |
|---|---|
| `docs/03-requirements/` | No FR conflict. ISS-WF-13-1 is the only reference. |
| `docs/04-development/architecture/architecture.md` | No conflict. |
| Open issues | Only ISS-PREEX-001 (resolved) and ISS-WF-13-1 (this). No collisions. |
| `next-workflow-id` | Counter is 5 from prior workflow. wf-20260623-fix-13-1 is generated from 5 → bump to 6. |

## Architectural feasibility

Both changes are isolated:
- Change 1 is a 1-line edit to the orphan check helper function.
- Change 2 is `git rm --cached` of 3 files in a gitignored path.

No new dependencies. No DB changes. No new tokens or configs.

## Status

**passed** — proceed to Step 2.