# ISS-WF-REG-002 — workspace-state.md and BP-UAT-013 frontmatter are stale vs. actual repo state

| Field | Value |
|---|---|
| ID | ISS-WF-REG-002 |
| Severity | minor |
| Module | workflow/registry |
| Status | open |
| Reported | 2026-07-02 |
| Reporter | BusinessAnalyst (UAT coverage audit) |
| Related | ISS-WF-REG-001 (same failure class, different files) |

## Symptom

Two documentation-sync gaps found during the UAT coverage audit:

1. **`.copilot/context/workspace-state.md`** still shows `Current branch: main`,
   `Last updated: 2026-06-30`, and `Next Workflow ID: 40` under "Notes," and lists
   `wf-20260630-fix-043` as the sole "Active Workflow." The actual repo has advanced
   well past that point — `.copilot/meta/next-workflow-id` is now in the 50s, and
   dozens of workflows have completed since 2026-06-30 per `.copilot/tasks/active/`.
2. **`docs/02-business-processes/uat/BP-UAT-013.md` frontmatter** still shows
   `status: Ready` and `last_run: ""`, while
   `docs/02-business-processes/uat/registry.md` correctly shows
   `Implemented / 2026-06-30 / partial`. The registry's own "Open Issues" column for
   BP-UAT-013 still links `ISS-UAT-013-9` and `ISS-UAT-013-10`, both of which are now
   `resolved` in their issue files — the registry table wasn't updated when they closed.

## Impact

Low — these are documentation artifacts, not runtime behavior. But this is the second
instance of this failure class (see `ISS-WF-REG-001`, registry-state drift from
`wf-20260623-feat-006`), suggesting the workflow-finish step that's supposed to update
these registries is not consistently applied, particularly for `workspace-state.md`
which appears to not be part of the standard finish checklist at all.

## Proposed resolution

- Update `workspace-state.md` and `BP-UAT-013.md` frontmatter to current state (can be
  done directly, low risk).
- Longer term: confirm whether `scripts/workflow-finish.sh` is expected to touch
  `workspace-state.md`; if not, decide whether it should be, or whether that file
  should be deprecated in favor of deriving state from `.copilot/tasks/active/` +
  `git log` on demand.

## Acceptance criteria

- [x] `workspace-state.md` reflects current branch, latest completed workflows, and current next-workflow-id
- [x] `BP-UAT-013.md` frontmatter matches registry.md
- [x] Registry's Open Issues column for BP-UAT-013 reflects resolved status (or is cleared, pending ISS-UAT-013-11's live re-verification)
- [x] Decision recorded on whether `workspace-state.md` maintenance is added to `workflow-finish.sh` or deprecated

## Resolution

- **Workflow:** `wf-20260703-fix-070`
- **Branch:** `fix/ISS-WF-REG-002-registry-state-drift`
- **PR:** _pending — opens on workflow-finish step_

### AC-by-AC disposition

**AC-1 (`workspace-state.md` current).** ✅ **Satisfied by self-heal** on
2026-07-03. The issue was filed on 2026-07-02 with symptoms
(`Current branch: main`, `Last updated: 2026-06-30`, `Next Workflow ID: 40`)
that described a snapshot from 2026-06-30. By the time this workflow started
on 2026-07-03, `workspace-state.md` had already been updated by
`wf-20260703-fix-069-biome-scope` (PR #92 merged 2026-07-03); the
`**Last updated:**` frontmatter now reads `2026-07-03`, the
`Completed Workflows` table includes all 19 most-recent merges
(through `wf-20260703-fix-069-biome-scope`), and `Next Workflow ID` reads
`69` (counter also bumped to 70 by this workflow).
No edit needed.

**AC-2 (`BP-UAT-013.md` frontmatter matches registry).** ✅ **Fixed** in
this workflow. `docs/02-business-processes/uat/BP-UAT-013.md` frontmatter
flipped from `status: Ready` → `status: Implemented`. `last_run` retained
as `"2026-07-02"` (correct; that was the last live run per the run report
at `.copilot/tasks/completed/wf-20260702-uat-059/02-uat-report.md`,
verdict `partial` 11/12). The pre-refactor
`docs/02-business-processes/uat/registry.md` row held
`Implemented | 2026-07-02 | partial` (set by `5bf0ac8` in the
ISS-UAT-013-11 close-out); the post-`wf-20260703-fix-067-coverage-registry`
table refactor dropped the Status / Last Run / Run Status / Open Issues
columns, so the script's own frontmatter is now the only place this
information lives. Aligning the frontmatter is the right move.

**AC-3 (Registry's Open Issues column for BP-UAT-013).** ✅ **Resolved
by table refactor**, not by a direct edit. Commit `113e69d` (PR #91,
`wf-20260703-fix-067-coverage-registry`, merged 2026-07-03) replaced the
table structure: the `Open Issues` column was removed entirely in favour
of `Spec` (link to the BP-UAT Playwright spec) and `Smoke Overlap`
(heuristic list of overlapping `smoke-*.spec.ts` files) columns. The
stale references to `ISS-UAT-013-9` and `ISS-UAT-013-10` that the issue
flagged were already cleared from the row at `5bf0ac8` (the
ISS-UAT-013-11 close-out). The remaining
`ISS-UAT-013-12` and `ISS-UAT-013-13` references that existed at
`5bf0ac8` have since been resolved (`wf-20260703-fix-060` PR #86 on
2026-07-03; `wf-20260703-fix-065-onboarding-copy` PR #90 on 2026-07-03),
but are not visible in the new table structure anyway. No edit needed
to the registry.

**AC-4 (Decision on `workspace-state.md` lifecycle).** ✅ **Keep F.5
amendment in `scripts/workflow-finish.sh` as-is; do not deprecate
`workspace-state.md`.**

The F.5 amendment (see `scripts/workflow-finish.sh` lines F.5 + the
`apply_context_sync_update` helper) does already touch
`workspace-state.md` — but only when the `08-doc-update.md` of the
current workflow includes a `context_update:` fenced YAML block naming
the `workspace_state_section` + `workspace_state_row`. This is opt-in
and DocWriter is responsible for emitting the block when the workflow
introduces a new row that should be reflected in workspace-state
(e.g. a new "Active Workflows" entry, a new "Queued follow-up" row, a
new "Completed Workflows" row). The previous gap (workspace-state
going stale between workflows) is not a tooling gap — it is a
**DocWriter step-skipped** failure, already caught by the Step 0.5
context-sync drift check (see `scripts/check-workflow-state.sh` Check 2:
`**Last updated:**` frontmatter freshness within `MAX_FRONT_OLD_COMMITS`
commits). When the gap recurs, Step 0.5 will block the *next* workflow
from starting until the state file is brought up to date.

Recommendation: **deprecate nothing**. The drift check at Step 0.5 is
the right enforcement; manual workspace-state maintenance is the right
fallback; F.5's opt-in amendment is the right automation surface. The
minor failure class documented in this issue and its sibling
`ISS-WF-REG-001` is "DocWriter skipped on a workflow that should have
emitted a context_update: block" — the workflow layer already detects
this at the next Step 0.5, and the work to update the state file then
is small.

### Files changed (this workflow)

- `docs/02-business-processes/uat/BP-UAT-013.md` — `status: Ready` → `status: Implemented` (frontmatter)
- `.copilot/issues/ISS-WF-REG-002.md` — this Resolution section + AC checkboxes flipped
- `.copilot/issues/registry.md` — row 29 Status `open` → `resolved`, Workflow field populated
- `.copilot/context/workspace-state.md` — new "Completed Workflows" row for `wf-20260703-fix-070` (added on Step 12)
- `.copilot/meta/next-workflow-id` — counter 69 → 70 (this workflow's first action)

### Honesty disclosures

1. The `workspace-state.md` "last updated" symptom in this issue is
   reported-as-of 2026-07-02; the actual repo state as of 2026-07-03
   already self-heals the symptom. If a reader pulls `origin/main` on
   any date after 2026-07-03, they will not see the stale state — they
   will see this Resolution and the corresponding registry flip.
2. The `BP-UAT-013.md` frontmatter had drifted from the registry's
   effective value since at least `5bf0ac8` (2026-07-02). The drift
   was benign (the file is a script description, not a status tracker;
   the registry is the source of truth) but it's the right thing to
   fix now that the registry is the only remaining place this
   information lives (post-`wf-20260703-fix-067-coverage-registry`).
3. No test infrastructure was required; no live infra was required; no
   regressions introduced; no deferral used. All four ACs are
   `verified`, not `deferred`.

### Lessons (for future workflows)

- The drift class "DocWriter step-skipped on a workflow that emitted
  no `context_update:` block" is now the third instance in the
  registry (`ISS-WF-REG-001` → `ISS-WF-REG-002` plus the implicit
  instance corrected in `5bf0ac8`). A small UX improvement (out of
  scope here) would be to make the F.5 helper emit a warning when
  `09-quality-gate.md` shows `status: passed` and
  `expects_registry_update: true` but the `08-doc-update.md` has no
  `context_update:` block — that is the exact pre-condition for the
  drift this issue describes. Not filed as a new issue here (out of
  scope for a minor docs-only fix); can be picked up by a future
  workflow.
