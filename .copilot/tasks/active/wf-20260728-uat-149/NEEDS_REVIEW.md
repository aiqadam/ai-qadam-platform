# NEEDS_REVIEW — wf-20260728-uat-149 (BP-UAT-020 post-merge verification)

**Workflow instance:** wf-20260728-uat-149
**Type:** uat-verification
**Business process:** BP-UAT-020 (Platform admin bootstrap, no manual scripts)
**Spawned by:** wf-20260728-feat-148 (FR-ADM-010's requirement-development
workflow), Step 13 post-merge UAT re-verification, per
`.copilot/schemas/protocol.md` "Business-Process Linkage & Post-Merge UAT."

## Step where the workflow stopped

Step 1 (BusinessAnalyst — Validate UAT Script). `gate_result: failed-retry`.

## Why this is NOT retried

Step 1's `failed-retry` semantics are for correctable script gaps (a
missing field, an unmapped AC, a formatting issue) — the workflow's own
retry limit for this step is 1. The gap found here is not correctable by
a mechanical retry: BP-UAT-020's Seed Fixtures table doesn't merely have
a formatting problem, it documents an **unresolved design question**
(dedicated Authentik test realm vs. destructive remove-and-restore
against shared local dev state) that requires real engineering/design
work to close, not a quick text edit. Re-invoking BusinessAnalyst's Step
1 immediately would reproduce the identical finding. This is treated as
the environment/script-gap equivalent of `failed-escalate` per
`protocol.md`'s outcome-handling rule: *"uat-verification itself hits
failed-escalate (environment failure, not a product finding) → register
the env issue... and note the deferral explicitly in the parent's
Resolution section."*

## Issue registered

[ISS-UAT-020-1](../../../issues/ISS-UAT-020-1.md) — blocker,
uat/environment + admin/ADM. Registered in
`.copilot/issues/registry.md` and `.copilot/context/workspace-state.md`
Open Issues. No follow-up workflow queued yet — designing the
fixture-isolation mechanism is a real, undecided engineering choice
(three viable options identified, no default), correctly judged out of
scope to improvise inside this verification session.

## What passed, what failed

- **FR-ADM-010's code-level implementation:** verified, unaffected.
  `wf-20260728-feat-148` shipped with 48/48 tests passing (15 new +
  siblings), independently re-run by TestRunner and confirmed by
  QualityGate across two attempts. Merged via PR #110, archived via PR
  #111. `docs/03-requirements/FR-ADM-010.md` correctly shows `status:
  Implemented`; `requirements-registry.md` correctly shows `Shipped`.
- **BP-UAT-020's live verification:** did not run. BusinessAnalyst's
  Step 1 script-validation checklist failed on the `seed_fixture`
  non-empty check — see
  `.copilot/tasks/active/wf-20260728-uat-149/01-uat-script-validation.md`
  for the full checklist and reasoning. UATRunner (Step 3) was never
  invoked; no live browser session was attempted; no destructive action
  was taken against the shared local dev environment.

## Artifacts (file links, not contents)

- `.copilot/tasks/active/wf-20260728-uat-149/handoff.yaml`
- `.copilot/tasks/active/wf-20260728-uat-149/01-uat-script-validation.md`
- `.copilot/issues/ISS-UAT-020-1.md`

## What the parent workflow (wf-20260728-feat-148) records

Per `protocol.md`'s outcome-handling rule, the parent
`requirement-development` workflow for FR-ADM-010 is **not** blocked by
this outcome — it already merged and archived (PR #110, #111) before
this Step 13 UAT re-verification ran. This NEEDS_REVIEW documents the
disclosure that protocol.md requires: FR-ADM-010's Notes section and
`workspace-state.md` already flagged the forced-password-change
mechanism as unverified pending BP-UAT-020; this workflow confirms that
BP-UAT-020 itself cannot yet run, and names the blocking issue
(ISS-UAT-020-1) that must be resolved before it can.
