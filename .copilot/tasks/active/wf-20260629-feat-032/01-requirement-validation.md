# 01 — Requirement Validation

**Workflow:** wf-20260629-feat-032
**Requirement:** FEAT-WORKFLOW-003
**Date:** 2026-06-29

## Requirement statement

Make issue-status flip a first-class, atomic, autonomous part of the
issue-resolution workflow. The current Step 9 is underspecified: it does not
require both `ISS-<n>.md` and `registry.md` to change atomically, does not
say which status value to set, and has no post-merge verification. The bug
surfaced concretely in wf-20260628-fix-033 where the Orchestrator claimed
ISS-UAT-013-1 was "resolved" in summary prose but both files still read
`open` after the workflow "finished."

## Acceptance criteria

**AC-1 — Atomic status flip in Step 9.** After Step 9 of `issue-resolution`,
both `ISS-<n>.md` and `issues/registry.md` show `Status: resolved` for the
target issue, and both edits are in the same commit on the feature branch.

**AC-2 — Autonomous default.** By default, after QualityGate passes and CI is
green on the PR, the Orchestrator auto-merges via `gh pr merge --squash --auto`
without asking the user.

**AC-3 — Opt-in human review.** If the user explicitly says they will review
the merge, the workflow pauses at PR-open and resumes at the post-merge step
when the user merges manually.

**AC-4 — Post-merge verification (new Step 12.5).** After the PR merges, the
Orchestrator pulls main, verifies both files show `resolved`, and verifies
the working tree is clean. If verification fails, the workflow aborts with
`needs_review` — no partial state.

**AC-5 — QualityGate status-consistency check.** QualityGate gains a check:
`ISS-<n>.md` status field == `registry.md` status column == expected terminal
value, AND both files appear in the PR diff. Mismatch = gate failure.

**AC-6 — Symmetry with requirement-development.** The same atomic-status-flip
pattern applies to FR workflows: `FR-<CODE>.md` frontmatter `status` ==
`requirements-registry.md` Status column == `Shipped`.

**AC-7 — No AGENTS.md §6 violation.** No commit is pushed directly to `main`.
All commits — including status flips and archive moves — ride on the PR.

## Conflicts with existing features

None. This extends FEAT-WORKFLOW-001 (context drift guard) and uses its
Step F.5 amendment pattern as a model. It does not change the gate-status
enum or retry semantics in `protocol.md`.

## Out of scope

- Backfilling status for already-merged historical issues (separate cleanup).
- Changing the FR status vocabulary (`Shipped` / `Implemented`).
- GitHub Actions automation of the merge (the workflow runs locally in the
  agent session; a future FEAT may move it to CI).

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Requirement validated; 7 ACs, no conflicts."
```
