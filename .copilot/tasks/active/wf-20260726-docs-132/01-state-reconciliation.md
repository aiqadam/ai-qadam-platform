# 01 — State reconciliation

**Workflow:** `wf-20260726-docs-132`
**Issue:** ISS-WF-STATE-001 (workspace-state drift)
**Status:** passed

---

## Problem

`.copilot/context/workspace-state.md` — read at the **blocking Step 0.5 context
sync of every workflow** — had degraded into a 48.5 KB append-only log:

1. **Stale.** Newest entry `2026-07-23` / `wf-20260723-fix-127`, while `main`
   had advanced six commits to `866f83f` (2026-07-26).
2. **Mostly superseded narrative.** 13 prepended close-out entries (~25 KB,
   lines 1–59) describing merged-and-archived workflows, ahead of the actual
   structured state.
3. **Self-contradictory.** The `2026-07-18` entry documents `COOLIFY_TOKEN` as
   a live CI secret; Coolify was removed from CI five days later (PR #45).
4. **Internally inconsistent.** Two `# Workspace State` H1s (lines 1 and 61);
   a malformed table separator mid-table (line 98) with no separator under the
   header (line 93); `## Next Workflow ID` claimed `111` while
   `.copilot/meta/next-workflow-id` held `132`.
5. **"Open Issues" mostly resolved.** 6 of 8 rows were closed items.

Separately, five merged workflows remained in `.copilot/tasks/active/`, two of
them still marked `status: in-progress`.

## Constraint discovered before editing

`scripts/check-workflow-state.sh` parses this file and is **blocking**:

- Check 2 requires a `^\*\*Last updated:\*\*` line — absence is drift.
- Check 1 extracts `^\|\s*wf-\d{8}-[a-z]+-\d+\s*\|` rows and treats any ID with
  no directory under `tasks/{active,completed,archived}/` as an orphan.

`scripts/workflow-finish.sh` (step F.5) inserts rows under `^## <section>`
headings, creating the section when absent.

A naive truncation would have broken Step 0.5 for every future workflow. The
new file satisfies both contracts, and both were re-verified after the edit.

## Changes

| # | Change | Verification |
|---|---|---|
| 1 | 13 close-out entries (lines 3–59) moved verbatim to `workflow-history.md` under a dated, explicitly-historical heading | `diff` of migrated block vs. `git show HEAD:` original → **identical** |
| 2 | `workspace-state.md` rewritten as a current-state snapshot with an explicit "this is a snapshot, not a log" contract | parser checks below |
| 3 | Every section re-verified against live state (`git log`, `deploy/`, `.github/workflows/`, `.copilot/tasks/`) | see below |
| 4 | 4 merged task dirs archived: `wf-20260706-docs-111`, `-docs-113`, `-fix-113`, `wf-20260720-feat-125`, `wf-20260723-fix-126` (5 total) | each merge commit confirmed on `main` |
| 5 | Corrected `status: in-progress` → `completed` in the two archived handoffs, with merge SHA + PR URL | — |
| 6 | `## Next Workflow ID` now points at the counter file instead of restating a stale number | — |

### Merge verification (change 4)

| Dir | Merge commit on `main` |
|---|---|
| `wf-20260720-feat-125` | `77e21ed` (PR #39) |
| `wf-20260723-fix-126` | `d0536ac` (PR #42) |
| `wf-20260706-docs-111` | `5d1e706` (PR #124) |
| `wf-20260706-docs-113` | `29d80fa` (PR #127) |
| `wf-20260706-fix-113` | `e1f4f3d` (PR #126) |

### Deliberately NOT changed

`wf-20260629-feat-032` remains in `active/` with `workflow_status: paused`.
PR #115 paused it **intentionally** ("Step 0 never completed… Resume later by
re-running RequirementAnalyst + ImpactAnalyzer from scratch"). Its requirement
FR-WORKFLOW-003 is marked `Implemented`, so the pause may now be resolvable —
but reversing a deliberate decision is out of scope here and is flagged for the
user instead.

## Verification

```
$ MSYS_NO_PATHCONV=1 bash scripts/check-workflow-state.sh --base "origin/main"
OK: no drift detected against origin/main.        # exit 0
```

- Parser check 1 — `**Last updated:**` present ✅
- Parser check 2 — extracts exactly `wf-20260726-docs-132` ✅
- Parser check 3 — that ID resolves to a real directory (no orphan) ✅
- `bats scripts/tests/step-0.5-doc-presence.bats` → **5/5 pass**
- `bats scripts/tests/quality-gate-context.bats` → **2/2 pass**

### Pre-existing failures (not caused by this workflow)

`bats scripts/tests/check-workflow-state.bats` → **4/14 pass, 10 fail**.

Verified pre-existing by running the identical suite in a clean worktree at
`origin/main` (`866f83f`): **byte-identical 4/14 pass, same 10 failures.**
This matches the already-known breakage recorded against
`scripts/tests/check-workflow-state.bats` (10 pre-existing failures noted in
`wf-20260718-feat-121`'s close-out). Not introduced here, and not in scope.

## Residual risk

Low. Changes are confined to two context files plus task-dir moves — no
application code, no schema, no CI config. The one behavioral surface is the
Step 0.5 parser contract, which is directly re-verified above.

The underlying cause — nothing enforces that close-out actually archives its
task dir or refreshes state — is **not** fixed by this workflow. It is recorded
in the new `## Documentation state` section and is the subject of the CI
enforcement step of the audit plan.
