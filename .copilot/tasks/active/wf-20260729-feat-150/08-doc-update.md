# Step 9 — Documentation Update: FR-ADM-011

## Atomic FR Status Flip

Both edits below are staged in the same commit on this feature branch,
per the Status-Consistency Check protocol:

1. `docs/03-requirements/FR-ADM-011.md` frontmatter: `status: Proposed`
   → `status: Implemented`.
2. `docs/03-requirements/requirements-registry.md`: new row `# 68` added
   to the FR implementation-order table:
   `| 68 | FR-ADM-011 | Admin user and role management screen | Shipped
   | ADM-005, ADM-007, ADM-008, ADM-010 |`.

`Implemented`/`Shipped` is the established terminal-status pair for this
repo's convention (confirmed against `FR-ADM-010`'s identical pairing —
frontmatter `Implemented`, registry row `Shipped` — and explicitly
listed as the accepted pair in `.copilot/schemas/protocol.md`'s
Status-Consistency Check table).

`business_process: [BP-UAT-021]` in the frontmatter is unchanged —
confirmed still accurate: this PR's actual diff surface (the
`/workspace/admin/users` cabinet + `/v1/admin/users/*` API) matches
exactly what `BP-UAT-021` documents, no narrowing or widening needed.

## Other Documentation Updates

No other documentation files require updates for this change:

- **Architecture docs** (`architecture.md`): no new module, no new
  stack component, no new deployment target — the change fits entirely
  within the existing `admin-invites` module boundary already documented.
- **ADRs**: ADR-0021 (RBAC manifest) already documents the ≤3
  super-admin cap and the full roles inventory this FR operates on; no
  amendment needed — this FR *implements* what ADR-0021 already
  specifies, it doesn't change the manifest itself.
- **Runbooks**: no operational procedure changes — this is a new
  self-service UI/API surface, not a change to how the platform is
  deployed, backed up, or operated.
- **`docs/02-business-processes/uat/BP-UAT-021.md`**: no edit needed —
  it was pre-authored against this FR's acceptance criteria at
  `wf-20260728-bp-147` and already accurately describes the shipped
  surface. Its `linked_issues: [FR-ADM-011]` frontmatter field already
  points here (the reverse link, per protocol.md's "Reverse link on the
  BP-UAT file" section, was set at authoring time — nothing to update).

## Gate Result

gate_result:
  status: passed
  summary: "Atomic FR status flip complete: FR-ADM-011.md frontmatter -> Implemented, requirements-registry.md new row #68 -> Shipped. Both staged for the same commit. No other doc files require changes — ADR-0021 and BP-UAT-021 already accurately describe this FR's shipped surface without amendment."
  findings: []
