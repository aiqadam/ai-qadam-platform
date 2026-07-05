# ISS-UAT-COV-002 — Operator approvals queue has no UAT script

| Field | Value |
|---|---|
| ID | ISS-UAT-COV-002 |
| Severity | enhancement |
| Module | uat/coverage |
| Status | resolved |
| Reported | 2026-07-02 |
| Reporter | BusinessAnalyst (UAT coverage audit) |
| Resolved | 2026-07-05 |
| Workflow | wf-20260705-fix-099-uat-cov-002 |

## Symptom

Of the 14 operational runbooks in `docs/02-business-processes/operations/`, 3 have no
BP-UAT script: `operator-approvals-queue.md`, `country-lead-activation.md`, and
`member-graph-foundation.md`. Of these, **operator-approvals-queue** is the priority —
it is the trust-and-safety surface (pending registrations + member flags per
`docs/02-business-processes/operations/operator-approvals-queue.md`), which carries
higher business risk if broken than the other two (country-lead-activation is a
low-frequency onboarding runbook; member-graph-foundation is largely internal/data
plumbing per its own doc).

## Impact

A broken or regressed approvals queue could let flagged members through, or block
legitimate registrations, with no UAT script to catch it — only the shallow
`smoke-workspace-approvals.spec.ts` contract test (status codes / auth gates) exists
today.

## Proposed resolution

Author `BP-UAT-019` (next available code) covering the operator approvals queue:
reviewing pending registrations, approving/rejecting, flagging a member, and
confirming the flagged state surfaces correctly elsewhere (e.g., cohort builder,
member profile). Register it in `docs/02-business-processes/uat/registry.md` following
the existing template.

country-lead-activation and member-graph-foundation can be tracked as lower-priority
follow-ups under `ISS-UAT-COV-001`'s backlog rather than separate issues.

## Acceptance criteria

- [x] `BP-UAT-019.md` authored following `BP-UAT-template.md`, referencing `operator-approvals-queue.md`
- [x] Registry row added
- [x] Script validated by BusinessAnalyst (status: Ready)

## Resolution

**Workflow:** wf-20260705-fix-099-uat-cov-002

**PR:** [PR #113](https://github.com/tvolodi/aiqadam/pull/113) (squash `25502b2`)

**Root cause:** The issue as filed assumed a live "review pending
registrations, approve/reject, flag a member" flow on the operator approvals
queue. Reading `apps/api/src/modules/workspace/approvals.service.ts` and the
runbook (`docs/02-business-processes/operations/operator-approvals-queue.md`)
showed this is factually incorrect as of 2026-07-05: the cabinet is an
empty-shell v1 (F-S3.7) — all three aggregation sources (`sponsor_onboarding`,
`speaker_proposal`, `operator_assisted_interaction`) are `ready: false`, there
is no approve/reject endpoint, and no "flag a member" concept exists anywhere
in the codebase (confirmed by a repo-wide search). The issue's proposed scope
described a feature that does not exist yet.

**Fix:** Per user decision (asked via clarifying question — "Author a
v1-accurate BP-UAT-019"), authored `docs/02-business-processes/uat/BP-UAT-019.md`
covering what the cabinet actually does today: authenticated empty-state
render (AC-1/AC-2), roadmap footer listing all three not-ready sources
(AC-3), and auth gating for both the page and the API (AC-4/AC-5). The
originally-envisioned approve/reject/flag steps are documented in a
"Deferred Steps" section explaining exactly what would need to ship first
(a real source flipping `ready: true` for approve/reject; a net-new
FR for the flagging concept, which doesn't exist in any form today).
Registered in `docs/02-business-processes/uat/registry.md`. Status
validated `Ready` by BusinessAnalyst self-check (every AC maps to at least
one step, per `BP-UAT-template.md`'s validation rule).

**Regression test:** N/A — this is a documentation-authoring issue (no code
changed). No Playwright spec was authored in this workflow; BP-UAT-019 has no
`.spec.ts` yet (Spec column shows `—` in the registry), consistent with 15 of
19 BP-UAT scripts in the same state per `ISS-UAT-COV-001`. Authoring a
Playwright spec for BP-UAT-019 can be queued as a follow-up once a source
ships (see the "Deferred Steps" section of BP-UAT-019.md) — no follow-up
workflow is queued now because there is nothing for it to verify yet (the
approve/reject/flag surfaces don't exist).

**Merged:** `25502b2` (squash-merged to main 2026-07-05T00:55:42Z)

**Honesty disclosures:**
- This resolution deliberately narrows scope versus the issue as filed. The
  three "empty-shell" ACs (AC-1/2/3) and two auth ACs (AC-4/5) are fully
  authored and validated. The approve/reject/flag scope from the original
  issue text is NOT implemented as a UAT script — it is explicitly deferred
  with no queued follow-up workflow, because no target code exists for a
  follow-up to verify. This is a "project-level out-of-scope until a
  prerequisite ships" deferral, not a "we ran out of time" deferral.
- `country-lead-activation` and `member-graph-foundation` (the other two
  runbooks without BP-UAT scripts, named in the original issue's "Proposed
  resolution") remain untouched, per the issue's own suggestion to track
  them under `ISS-UAT-COV-001`'s backlog rather than as separate issues.
