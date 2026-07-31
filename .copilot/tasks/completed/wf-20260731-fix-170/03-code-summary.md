# Step 4 — Fix Summary

## Root cause

Both `issue-resolution.md` Step 13 and `requirement-development.md` Step
13 (the post-merge UAT re-verification gate) only ever called
`sync-github-project.sh --status agent-verified` for the CURRENT
workflow's own `requirement_ref`. Nothing asked whether some OTHER
FR/ISS also declares the same `Business-Process`/`business_process`
linkage and needs the identical sync. `FR-EVT-004`/GitHub issue #130 sat
at Project-board Status `Implemented` through four separate clean
`BP-UAT-010` post-merge re-verifications — each one correctly synced its
own triggering issue (`ISS-BRIDGE-STALE-001`, `ISS-UAT-010-2`,
`ISS-UAT-010-1`), but none of them ever touched #130's row, because none
of them were "the FR-EVT-004 workflow."

Compounding factor: `BP-UAT-010.md`'s own `linked_issues` reverse-link
list only ever recorded CHILD follow-up issues as they were independently
filed — the ORIGINAL parent FR that first declared the `process_ref`
relationship (`FR-EVT-004`) was never itself added to that list. So even
a naive fix that just scanned `linked_issues` for stale non-verified refs
would still have missed the actual motivating case.

## Fix

New `scripts/find-bp-uat-stakeholders.sh <BP-UAT-NNN>` unions two sources:
1. The BP-UAT file's own `linked_issues` frontmatter list.
2. A direct scan of every `FR-*.md`/`ISS-*.md` file's own
   `business_process`/`Business-Process` field for a match.

Both workflow files' Step 13 now loop the `agent-verified` sync call over
every ref this script returns (in addition to the current workflow's own
ref) whenever the linked BP-UAT(s) pass clean. The sync call is already
idempotent, so no pre-filtering of "already agent-verified" refs is
needed — just call it for the full list.

`protocol.md` documents the rule under a new "Syncing ALL stakeholders,
not just the current workflow's own ref" subsection, using #130 as the
motivating incident (same style as `ISS-WF-GH-CLOSE-001`'s own
subsection).

## Retroactive fix for this session's specific instance

`FR-EVT-004`/#130 was manually synced to `agent-verified` earlier this
session (`scripts/sync-github-project.sh --ref FR-EVT-004 --status
agent-verified --existing-url https://github.com/aiqadam/ai-qadam-platform/issues/130`),
confirmed via `gh issue view 130 --json projectItems`. Not re-done as
part of this workflow's own commits — already landed directly against
the live board.

## Gate Result

gate_result:
  status: passed
  summary: "New stakeholder-lookup script + both workflows' Step 13 updated to loop the sync over it; protocol.md documents the rule."
  findings: []
