# 01 — Doc Back-Fill Scope for the wf-20260705-doc-100 Workflow

## Workflow ID policy

This handoff file uses **`wf-20260705-doc-100`** for traceability of the
queued-entry creation moment. When the workflow is started:

- Move `.copilot/tasks/queued/wf-20260705-doc-100/` →
  `.copilot/tasks/active/wf-<new-id>/` where `<new-id>` is the next
  counter value from `.copilot/meta/next-workflow-id` (currently **100**).
  Increment `next-workflow-id` to **101**.
- Rename `handoff.yaml`'s `workflow_instance_id` to the new id.
- Update `current_step_name: "Initialize"` from the queued state.
- Branch: `feature/docs-backfill-21-active-pass` (or `chore/docs-backfill-21-active-pass`).

---

## Drift summary

Two chore PRs in rapid succession changed `.copilot/tasks/` on disk
without back-filling the user-facing mirror documents:

| PR | Title | Squash | `.copilot/tasks/` change |
|---|---|---|---|
| [#114](https://github.com/tvolodi/aiqadam/pull/114) | chore(workflow): archive 17 stale active duplicates | `1819add` | 17 active→completed moves; 17 handoff back-fills; `scripts/archive-stale-active-dupes.py` |
| [#115](https://github.com/tvolodi/aiqadam/pull/115) | chore(workflow): close 4 stalled active workflows | `180c5af` | 2 active→archived moves; 2 active pauses (handoff flip); `scripts/close-stalled-active-workflows.py` |

Net: 17 + 2 = **19 directories moved out of `active/`**; 2 directories
**paused in place**. Pre-PR-114 active count was 21; post-PR-115 active
count is 2. **None of these 21 transitions are reflected in
`workspace-state.md`, `registry.md`, or `ISS-<n>.md` files.**

---

## Item 1 — `.copilot/issues/registry.md`

The registry maps each `ISS-<n>` (and `FEAT-<n>` / `ISS-CI-OVERRIDE-*`) to
a workflow id and a status. After PR #114, the rows for the 17 archived
issues still read whatever status they had at merge time (mostly
`resolved`, but with no link to the directory move itself).

### 1a. Add a "Workflow directory location" clarification

Append a single new column to the registry's header row and every data
row:

```
| ID | Severity | Module | Summary | Status | Workflow | Workflow dir | Date |
```

For the 21 affected rows, set `Workflow dir` to:

- `completed/wf-<id>/` for the 17 from PR #114
- `archived/wf-<id>/` for the 2 from PR #115
- `active/wf-<id>/ (paused 2026-07-05)` for the 2 paused

Use this exact list (issue-id ↔ wf-id):

| Issue | Workflow | Directory |
|---|---|---|
| ISS-WF-13-1 | wf-20260623-fix-13-1 | completed/ |
| ISS-PREEX-001 | wf-20260623-fix-3 | completed/ |
| FEAT-WORKFLOW-002 | wf-20260623-feat-006 | completed/ |
| ISS-CI-001 | n/a (PR batch) | completed/ (PRs #37–#41) |
| ISS-CI-002 | wf-20260702-fix-052 | completed/ |
| ISS-UAT-013-1 | wf-20260629-fix-033 | completed/ |
| ISS-UAT-013-2 | wf-20260628-fix-031 | completed/ |
| ISS-UAT-013-3 | wf-20260629-fix-035 | completed/ |
| ISS-UAT-013-4 | wf-20260629-fix-036 | completed/ |
| ISS-UAT-013-5 | wf-20260629-fix-037 | completed/ |
| ISS-UAT-013-6 | wf-20260629-fix-038 | completed/ |
| ISS-UAT-013-7 | wf-20260629-fix-034 + wf-20260701-uat-045 | completed/ |
| ISS-UAT-013-8 | wf-20260629-fix-039 | completed/ |
| ISS-UAT-013-9 | wf-20260630-fix-043 | completed/ |
| ISS-UAT-013-10 | wf-20260702-fix-049 | completed/ |
| ISS-UAT-SEED-001 | wf-20260702-fix-055 | completed/ |
| ISS-WF-GIT-AUTH-1 | wf-20260629-fix-036 | completed/ |
| ISS-LEAD-DISC-001 | wf-20260701-fix-044 | completed/ |
| ISS-WF-REG-001 | wf-20260702-feat-048-bats-f5-refactor | completed/ |
| ISS-UAT-013-11 | wf-20260702-uat-059 | completed/ |
| ISS-UAT-013-12 | wf-20260703-fix-060 | completed/ |
| ISS-UAT-013-13 | wf-20260703-fix-065-onboarding-copy | completed/ |
| ISS-UAT-COV-001 | wf-20260703-fix-067-coverage-registry | completed/ |
| ISS-UAT-COV-002 | wf-20260705-fix-099-uat-cov-002 | completed/ |
| ISS-WF-REG-002 | wf-20260703-fix-070 | completed/ |
| ISS-UAT-009-1 | wf-20260704-fix-073 | completed/ |
| _(no ISS, chore-only)_ | wf-20260705-chore-close-21-active (this PR) | n/a — chore |

Note: **For the 21 directories that moved but whose issue was already
resolved (most of them), the registry row does NOT need to change
status**. Only the new `Workflow dir` column needs the new value. The
existing `Status: resolved` is still correct — these are completed
workflows whose issues were resolved before PR #114.

### 1b. Two exceptions where the issue resolution was specifically about the directory location

These two need a registry status update as well as a directory update:

- **ISS-UAT-009-1** — Its resolution already references `wf-20260704-fix-073`,
  which has been archived (moved to `completed/`). The row currently says
  `Workflow: wf-20260704-fix-073`; update `Workflow dir` to
  `completed/wf-20260704-fix-073/`. (Already resolved; no status flip.)
- **ISS-WF-REG-002** — Same: `Workflow: wf-20260703-fix-070` →
  `Workflow dir: completed/wf-20260703-fix-070/`. Status stays `resolved`.

For the 2 paused workflows (no issue file currently exists for them
since they were never completed), **do not add a registry row** —
they aren't tracked in the registry yet, that's the whole point of
`pause_note`. Just leave them in `active/`.

---

## Item 2 — `.copilot/context/workspace-state.md`

`workspace-state.md` follows a **delta-only** pattern (each new merged
PR appends an entry, older entries are marked "Superseded entry,
retained for delta-only history"). Two new entries are needed:

### 2a-2b. Append PR #114 and PR #115 entries

The existing "Last updated: ..." line is the most-recent delta; the
newest line for the DocWriter pass becomes the next delta. The two
required entries follow the same one-paragraph format as the existing
entries. Summarize:

- **PR #114 squash `1819add`** — `scripts/archive-stale-active-dupes.py`,
  17 active→completed moves (13 simple + 4 unions), 17 handoff
  back-fills, no code/schema, deferred registry edits to this workflow.
- **PR #115 squash `180c5af`** — `scripts/close-stalled-active-workflows.py`,
  2 active→archived moves, 2 in-place pauses (`feat-032` Step 0,
  `feat-056` Step 1), no code/schema, deferred registry edits to this
  workflow.

The currently-newest entry should be marked "Superseded entry, retained
for delta-only history" per the existing convention. The 2a/2b entry
templates are in the prior workspace-state.md history (e.g. the
`wf-20260703-fix-070` block at line ~22).

### 2c. Update Active Workflows section

Currently reads:

```
## Active Workflows

_(none — `wf-20260704-fix-095` has merged. Next to pick up is one of the queued follow-up workflows below, in priority order.)_
```

This was true *before* PR #114+#115. After PR #115, active count is 2.
Replace with:

```
## Active Workflows

_(paused) `wf-20260629-feat-032` — FEAT-WORKFLOW-003 (atomic issue-status flip). Step 0 never completed; see `pause_note` in `.copilot/tasks/active/wf-20260629-feat-032/handoff.yaml`. Not blocking anything._

_(paused) `wf-20260702-feat-056` — FR-UAT-VISUAL-001 (VisualReviewer agent + 3-layer visual testing). Step 1 mid-spec; see `pause_note` in `.copilot/tasks/active/wf-20260702-feat-056/handoff.yaml`. Not blocking anything._

Next to pick up is one of the queued follow-up workflows below, in priority order.
```

### 2d. Append the 4 paused/archived to Completed Workflows table (if one exists)

The Completed Workflows table is currently self-maintained via delta-only
history. No explicit list of completed-wf-ids lives in `workspace-state.md`
(the per-PR squash subject line is the per-entry record). No change needed.

---

## Item 3 — `.copilot/issues/ISS-<n>.md` Resolution blocks

For each of the 17 issues moved to `completed/` by PR #114, append a
**Resolution directory marker** to the `## Resolution` section. The
intent: when an agent or human opens `ISS-UAT-013-3.md`, they see both
"this issue was fixed by `wf-20260629-fix-035`" (the existing summary
prose) AND "the workflow's artifacts are in `completed/wf-20260629-fix-035/`"
(the new pointer).

### 3a. Affected issue files (17)

All are in `.copilot/issues/`. The agent should:

1. Open each ISS-<n>.md listed in Item 1a's table.
2. Find the `## Resolution` section.
3. If the section already mentions the workflow id, append a one-line
   `**Workflow directory:**` sub-bullet. If it doesn't, do nothing (most
   files have at least a sentence about the wf-id, but if absent, just
   skip — drift correction is best-effort, not a hard requirement).
4. For the 2 paused workflows, **do not** create a new ISS-<n>.md file —
   the `pause_note` in the handoff is the durable record.

Concrete format for the new bullet:

```markdown
- **Workflow directory:** `.copilot/tasks/completed/wf-<wf-id>/` (PR #<n> squash `<sha>`)
```

### 3b. Two skipped issues

- **ISS-CI-001** — Was resolved by a batch PR (#37–#41), not a single
  workflow directory. Add a `Workflow directory:` line that points to
  the 5 individual completed PR-directories if they exist; otherwise
  skip and add a note "(resolved by PR batch — see git log #37..#41)".
- **ISS-UAT-013-7** — Was resolved by two workflows (`wf-20260629-fix-034`
  + `wf-20260701-uat-045`). Add two `Workflow directory:` lines, one per
  workflow.

### 3c. Order of work

Open the issues in alphabetical order by issue-id. Each edit is a
two-line addition. Total: ~17 issues × 2 lines = 34 lines added; ~20
lines added to `workspace-state.md`; ~28 lines added to `registry.md`.
Well under the §4 "small PR" rule.

---

## Item 4 — `.copilot/meta/next-workflow-id`

The counter is the next available wf-id for any new workflow's handoff
file. Currently **100**. PR #115 created `wf-20260705-doc-100` as the
**queued** id; the counter does NOT get bumped by creating a queued
entry (counter bumps when the workflow starts and renames to a real id
in `active/`).

After this back-fill workflow starts:

- Rename `wf-20260705-doc-100` → `wf-<new-id>/`
- Set `<new-id>` to `100` (current counter value)
- Bump `next-workflow-id` to `101`

This is the only Item-4 change; it has already been done for the
queued file creation. The DocWriter agent confirms it at workflow start.

---

## Item 5 — Out of scope for this workflow (deferred)

These items were *touched* by PR #114/#115 but back-fill would be
over-engineering:

- **`scripts/archive-stale-active-dupes.py`** / **`close-stalled-active-workflows.py`** —
  Operational tools, not features. No registry row needed.
- **The 21 directories' gitignored logs** — Gitignored by design.
- **`workspace-state.md`'s older "Superseded" entries** — Delta-only
  history is intentional; pruning is a separate chore if ever needed.
- **`.github/copilot-instructions.md`** — Auto-generated from AGENTS.md
  via `pnpm ai:sync`; no back-fill needed.

---

## Acceptance criteria

A single PR (≤400 lines) that:

1. **Modifies `registry.md`** — adds `Workflow dir` column and fills in
   the 26 affected rows per Item 1a/1b.
2. **Appends two `Last updated: ...` entries** to `workspace-state.md`
   per Item 2a/2b.
3. **Updates `## Active Workflows` section** of `workspace-state.md`
   per Item 2c.
4. **Edits `## Resolution` blocks** of the 17 ISS-<n>.md files (and the
   2 special cases in 3b) to add a `Workflow directory:` line.
5. **Bumps `next-workflow-id`** from 100 → 101.
6. **Passes pre-commit hooks**: lint-staged biome + arch:check.
7. **No new dependencies, code, or schema changes.**

QualityGate AC-by-AC: each of AC 1–7 must be `verified` in
`09-quality-gate.md` (not deferred-with-followup).

---

## Honesty disclosures

- The 2 paused workflows (feat-032, feat-056) get **no ISS-<n>.md file**
  from this workflow — the handoff's `pause_note` is the durable record.
  If formal ISS files are wanted, queue a separate DocWriter workflow.
- The 21 directories touched by PR #114+#115 were operational
  re-organization, NOT code changes. The "deferred to follow-up" pattern
  applies here as it does to any test not run end-to-end in the parent
  workflow.

---

## References

- PR #114 — `chore(workflow): archive 17 stale active duplicates` (squash `1819add`)
- PR #115 — `chore(workflow): close 4 stalled active workflows` (squash `180c5af`)
- AGENTS.md §4 (small PR rule), §6.1 (production-readiness), §6.2 (autonomous mode)
- `.copilot/schemas/handoff.schema.yaml`