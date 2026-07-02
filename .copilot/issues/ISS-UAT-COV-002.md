# ISS-UAT-COV-002 — Operator approvals queue has no UAT script

| Field | Value |
|---|---|
| ID | ISS-UAT-COV-002 |
| Severity | enhancement |
| Module | uat/coverage |
| Status | open |
| Reported | 2026-07-02 |
| Reporter | BusinessAnalyst (UAT coverage audit) |

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

- [ ] `BP-UAT-019.md` authored following `BP-UAT-template.md`, referencing `operator-approvals-queue.md`
- [ ] Registry row added
- [ ] Script validated by BusinessAnalyst (status: Ready)
