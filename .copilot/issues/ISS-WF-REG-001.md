# ISS-WF-REG-001 — Registry-state drift: wf-20260623-feat-006 shipped FEAT-WORKFLOW-002 without flipping the registry

| Field | Value |
|---|---|
| ID | ISS-WF-REG-001 |
| Severity | minor (meta-drift; no code drift) |
| Module | workflow/orchestrator |
| Status | **resolved** (retroactive fix in wf-20260702-feat-048-bats-f5-refactor) |
| Reported | 2026-07-02 |
| Resolved | 2026-07-02 |
| Reporter | Orchestrator (wf-20260702-feat-048-bats-f5-refactor / 01-requirement-validation.md) |
| Resolver | Orchestrator (wf-20260702-feat-048-bats-f5-refactor — registry + issue file updated retroactively) |
| Workflow | wf-20260623-feat-006 (original implementation — shipped 2026-06-23 but never closed the issue) → wf-20260702-feat-048-bats-f5-refactor (reconciliation — abandoned after audit revealed work was already on main) |

## Symptom

When the user requested "Resolve issue FEAT-WORKFLOW-002" on 2026-07-02, the
Orchestrator's Step 1 (RequirementAnalyst) audit revealed that **all 7 of the
8 acceptance criteria** for FEAT-WORKFLOW-002 (AC-1 through AC-6 plus AC-8)
were **already shipped on `main` as of PR #15 (commit `0698d1e`, merged
2026-06-23T06:31:29Z)** — but the issue file and registry row both still showed
`Status: open | Workflow: _(next workflow after FEAT-WORKFLOW-001 ships)_`.

This is a textbook case of **registry-state drift**: the implementation was
correct, but the workflow's bookkeeping (registry + issue status) was not
updated at Step 9 (atomic status flip per FEAT-WORKFLOW-003 protocol).

## Root cause

`wf-20260623-feat-006` (the implementation workflow for FEAT-WORKFLOW-002)
shipped its work in PR #15 but its **Step 9 (DocWriter / atomic FR status
flip)** either (a) was skipped, (b) failed silently, or (c) wrote the wrong
content. The exact cause is not recoverable from the present workspace state
(the original Step 9 output file is in `.copilot/tasks/completed/wf-20260623-feat-006/`
which is read-only archive).

This is **exactly the failure mode** that FEAT-WORKFLOW-001 (drift detection)
was designed to catch — but the drift detection only runs at Step 0.5 of the
**next** workflow, by which time the broken state has already been merged to
main. A future hardening (out of scope here) could add a post-merge CI check
that verifies the registry is consistent with merged PRs.

## Repro

```bash
# Show that ACs are already shipped on main:
git show 0698d1e --stat
# → 7 files changed, 590+ insertions(+) covering all 4 bats test files,
#   the bats-core devDep + test:bash script, the F.5 refactor, and the
#   --source-only flag.

# Show that the registry was never updated:
git log --all --oneline -- .copilot/issues/registry.md | head -5
# → Last registry update predates PR #15 by hours/days; no commit
#   attributes the FEAT-WORKFLOW-002 row change to wf-20260623-feat-006.

# Show that the issue file frontmatter was never updated:
git log --all --oneline -- .copilot/issues/FEAT-WORKFLOW-002.md
# → Only the original creation commit; no follow-up status flip.
```

## Proposed resolution (adopted)

1. **Retroactively flip** `.copilot/issues/FEAT-WORKFLOW-002.md` frontmatter to `status: resolved` and add a `## Resolution` section pointing to PR #15 + commit `0698d1e`.
2. **Retroactively flip** `.copilot/issues/registry.md` row 7 to `Status: resolved | Workflow: wf-20260623-feat-006 | Date: 2026-06-23`.
3. **File this issue (ISS-WF-REG-001)** to document the meta-drift itself.
4. **Abandon the reconciliation workflow** `wf-20260702-feat-048-bats-f5-refactor` after Step 1 — there is no code work to do.

## Acceptance criteria

1. `.copilot/issues/FEAT-WORKFLOW-002.md` frontmatter has `status: resolved`.
2. `.copilot/issues/registry.md` row 7 has `Status: resolved` with the correct resolver (`wf-20260623-feat-006`).
3. `.copilot/issues/registry.md` has a new row for `ISS-WF-REG-001` documenting this drift.
4. `wf-20260702-feat-048-bats-f5-refactor/handoff.yaml` reflects the `abandoned` workflow status with this issue as the resolution reason.
5. Commit message on the reconciliation PR explicitly cites the meta-drift root cause (so future readers can find this record via `git log --grep`).

## References

- PR #15: https://github.com/tvolodi/aiqadam/pull/15 (`test(workflows): add bats-core test suite for FEAT-WORKFLOW-001`)
- Commit `0698d1e` — the implementation tip
- `.copilot/tasks/completed/wf-20260623-feat-006/` — original workflow archive (read-only)
- `.copilot/tasks/active/wf-20260702-feat-048-bats-f5-refactor/01-requirement-validation.md` — full audit
- AGENTS.md §9 (Honesty) and §7 (When uncertain, say so) — the protocol used to detect and disclose this drift

## Resolution

- **Workflow:** wf-20260702-feat-048-bats-f5-refactor (this is the resolution; workflow will be marked `abandoned`)
- **Branch:** `feature/FEAT-WORKFLOW-002-bats-f5-refactor`
- **PR:** _pending — opens on workflow-finish step_
- **Fix shipped (this reconciliation):**
  1. `.copilot/issues/FEAT-WORKFLOW-002.md` — frontmatter updated; `## Resolution` section added with audit trail of which ACs shipped and which (AC-7) was dropped.
  2. `.copilot/issues/registry.md` — row 7 updated to `Status: resolved | Workflow: wf-20260623-feat-006 (PR #15, commit 0698d1e — 7/8 ACs shipped; AC-7 shellcheck dropped without GPLv3 approval)`.
  3. `.copilot/issues/registry.md` — new row for `ISS-WF-REG-001` (this issue).
  4. `.copilot/issues/ISS-WF-REG-001.md` — created (this file).
  5. `wf-20260702-feat-048-bats-f5-refactor/handoff.yaml` — workflow_status flipped to `abandoned`, this issue recorded as the resolution.

- **Honesty disclosure:** The AC-7 (shellcheck) drop in `wf-20260623-feat-006` is itself a smaller instance of the same meta-drift problem (silent drop without formal user approval). It is documented in the FEAT-WORKFLOW-002 Resolution section. If the user wants to revisit AC-7, file a new issue `FEAT-WORKFLOW-003-shellcheck-gate` and provide explicit GPLv3 approval in chat.

## Lessons (for future workflows)

1. **Step 9 (atomic FR/ISS status flip) is non-negotiable** — implementers must not consider the workflow complete until the registry + issue file are committed and pushed in the same PR as the substantive change.
2. **Add a post-merge CI check** that verifies the registry is consistent with merged PRs. (Out of scope for this issue; track in a new ADR.)
3. **The "abandoned" workflow status is a first-class outcome** — when a workflow's planned work is discovered to be already done, the workflow should not be force-completed by writing trivial patches; it should be abandoned with a clear audit trail.