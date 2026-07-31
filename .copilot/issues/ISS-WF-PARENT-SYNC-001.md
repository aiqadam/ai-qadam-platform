# ISS-WF-PARENT-SYNC-001 — Post-merge UAT re-verification only syncs the CURRENT workflow's own issue to `agent-verified`, never a parent FR/ISS that shares the same `Business-Process`

| Field | Value |
|---|---|
| ID | ISS-WF-PARENT-SYNC-001 |
| Severity | minor |
| Module | workflow/github-sync |
| Status | resolved |
| Reported | 2026-07-31 |
| Resolved | 2026-07-31 |
| Workflow | wf-20260731-fix-170 |
| Reporter | User (asked directly why #130's Project board Status was still `Implemented`, not `Agent-Verified`, despite 4 clean post-merge BP-UAT-010 re-verifications since it shipped) |
| Related | ISS-WF-GH-CLOSE-001, ISS-UAT-010-1, FR-EVT-004 |
| Business-Process | — |
| GitHub-Issue | — (workflow-tooling only, not user-facing) |

## Symptom

GitHub issue [#130](https://github.com/aiqadam/ai-qadam-platform/issues/130)
(`FR-EVT-004`, "Event detail page") sat at Project board Status
`Implemented` — never `Agent-Verified` — for its entire lifetime, despite
its linked business process (`BP-UAT-010`) passing a clean live
re-verification **four separate times** across four different follow-up
workflows (`wf-20260730-uat-158`, `wf-20260731-uat-163`,
`wf-20260731-uat-166`, and this session's manual retest for
`ISS-UAT-010-1`/`wf-20260731-fix-169`). Each of those workflows correctly
synced **its own** issue (`ISS-BRIDGE-STALE-001`, `ISS-UAT-010-2`,
`ISS-UAT-010-1`) to `agent-verified` — but none of them touched `#130`'s
row, because none of them were "the FR-EVT-004 workflow." The user had to
ask directly why the board didn't reflect reality; the gap was invisible
to any automated check.

## Root cause (confirmed via source read)

`protocol.md`'s "Business-Process Linkage & Post-Merge UAT" section wires
the `agent-verified` sync to **the workflow's own `ISS-<n>`/`FR-<CODE>`**
only (`issue-resolution.md` Step 13 / `requirement-development.md` Step
13, both call `sync-github-project.sh --ref <the-current-workflow's-own-ref>`).
Nothing in either workflow ever asks "does any OTHER FR/ISS also declare
this same `BP-UAT-NNN` in its `Business-Process`/`business_process` field,
and is it sitting below `agent-verified`?" — even though
`docs/02-business-processes/uat/<BP-UAT-NNN>.md`'s own `linked_issues`
frontmatter list is exactly the registry needed to answer that question;
it was just never read for this purpose.

Concretely, for `FR-EVT-004`/`#130`: `FR-EVT-004.md`'s frontmatter already
declares `business_process: [BP-UAT-010]` — the ORIGINAL business-process
link, present since the FR shipped. Every one of the four post-merge
re-verifications above was, in substance, re-verifying `#130`'s own
business process. But `BP-UAT-010.md`'s `linked_issues` list only names
the sub-issues (`ISS-UAT-SEED-003`, `ISS-UAT-010-1`, `ISS-EVT-004-1`,
`ISS-BRIDGE-STALE-001`, `ISS-UAT-010-2`) — `FR-EVT-004` itself is not in
that list (the parent FR that originally declared the `process_ref`
relationship was never added to the BP-UAT file's reverse-link list,
only its child follow-up issues were, as each was independently filed).
So even a script that DID scan `linked_issues` for stale non-`agent-verified`
rows would have missed `#130`, because the parent/child relationship
between an FR and its own spun-off `ISS-*` follow-ups isn't itself
tracked anywhere machine-readable.

This is the same **class** of bug as `ISS-WF-GH-CLOSE-001` (two
independent "is this done" signals, silently unwired) — but on the
opposite axis: that issue was about the GitHub open/closed STATE drifting
from the Project board Status; this one is about the Project board
Status of a **parent** item drifting from the verification history of the
**business process it owns**, because nothing ever asked the parent's
question on the child's behalf.

## Impact

- Any FR/ISS whose own follow-up bugs get fixed and re-verified in later,
  separate workflows will have its Project board Status permanently stuck
  at `Implemented`, understating how much verification work has actually
  accumulated against its surface — unless a human happens to notice and
  ask, as happened here.
- Not a data-loss or security issue — a Project-board accuracy/traceability
  gap, same severity class as `ISS-WF-GH-CLOSE-001`.
- Confirmed today's specific instance (#130) by manually running
  `sync-github-project.sh --ref FR-EVT-004 --status agent-verified` — a
  one-off fix, not a systemic one (that's this issue).

## Acceptance criteria

- [x] AC-1: `protocol.md`'s "Business-Process Linkage & Post-Merge UAT"
      section gains a new step: after a `uat-verification` run passes
      clean for a `BP-UAT-NNN`, the Orchestrator scans
      `docs/02-business-processes/uat/<BP-UAT-NNN>.md`'s own
      `linked_issues` list AND every `FR-<CODE>.md`/`ISS-<n>.md` file
      whose `business_process`/`Business-Process` field names this same
      `BP-UAT-NNN`, and syncs `agent-verified` for every one of them
      currently below that status (not just the current workflow's own ref).
- [x] AC-2: New mechanical script `scripts/find-bp-uat-stakeholders.sh
      <BP-UAT-NNN>` — given a BP-UAT code, greps
      `docs/03-requirements/*.md` frontmatter and `.copilot/issues/*.md`
      header tables for a matching `business_process`/`Business-Process`
      field, unions that with the BP-UAT file's own `linked_issues` list,
      and prints every matching ref. This is the machine-readable
      "who has a stake in this business process" query that didn't exist
      before.
- [x] AC-3: Both `issue-resolution.md` Step 13 and
      `requirement-development.md` Step 13 updated to call the new script
      and loop the `agent-verified` sync over its output, in addition to
      the existing sync of the current workflow's own ref.
- [x] AC-4: Regression coverage —
      `scripts/tests/find-bp-uat-stakeholders.bats`, including a direct
      reproduction of this issue's motivating shape (an FR declaring
      `business_process` on a BP-UAT whose `linked_issues` list contains
      other, unrelated-by-name issues).
- [x] AC-5 (retroactive, this instance only): `#130`/`FR-EVT-004` already
      manually synced to `agent-verified` this session (see the parent
      conversation); no further action needed for #130 itself under this
      issue.

## Resolution

**Workflow:** wf-20260731-fix-170
**PR:** https://github.com/aiqadam/ai-qadam-platform/pull/192 (squash `26bac8b`)
**Root cause:** The post-merge UAT re-verification protocol only ever
synced the CURRENT workflow's own `ISS-<n>`/`FR-<CODE>` ref to
`agent-verified` — never asked whether other FR/ISS files sharing the
same `Business-Process` linkage existed and needed the same sync. The
`linked_issues` reverse-link list on each `BP-UAT-NNN.md` file only ever
recorded child follow-up issues as they were filed, never the original
parent FR that first declared the `process_ref` relationship — so even a
naive scan of that list would have missed the parent.
**Fix:** New `scripts/find-bp-uat-stakeholders.sh` unions
`linked_issues` with a direct grep of every `FR-*.md`/`ISS-*.md`
`business_process`/`Business-Process` field for the given `BP-UAT-NNN`.
Both workflows' Step 13 now loop `sync-github-project.sh --status
agent-verified` over every ref that script returns and is currently below
`agent-verified`, not just the current workflow's own ref.
**Regression test:** `scripts/tests/find-bp-uat-stakeholders.bats` — new
suite reproducing this issue's exact motivating shape (FR-EVT-004 +
BP-UAT-010, where `linked_issues` alone would have missed the FR).
**Merged:** `26bac8b` (2026-07-31T11:10:51Z)
