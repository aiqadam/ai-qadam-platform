## Requirements — wf-20260728-bp-147

Two FRs formalized, one per audited business process (per the workflow's
"one invocation per distinct process" rule).

## FR-ADM-010 — Platform admin bootstrap (no manual scripts)

- File: [FR-ADM-010.md](../../../../docs/03-requirements/FR-ADM-010.md)
- From: `admin-bootstrap.md`
- Status: Proposed
- `business_process: [BP-UAT-020]` (reserved, authored at Step 4)
- Summary: automated, Authentik-hosted bootstrap of the first super-admin
  account on a fresh environment, replacing the manual ADR-0021 §9
  console procedure. Forced password change via Authentik's own
  mechanism — platform never owns the credential.

## FR-ADM-011 — Admin user and role management screen

- File: [FR-ADM-011.md](../../../../docs/03-requirements/FR-ADM-011.md)
- From: `admin-user-management.md`
- Status: Proposed
- `business_process: [BP-UAT-021]` (reserved, authored at Step 4)
- Summary: generalizes `/workspace/admin/users` from invite-list-only into
  full role management, with live-verified apply-and-display (closing the
  silent-failure gap from the triggering incident) and blocking
  enforcement of the ADR-0021 ≤3-super-admin cap.

## Registry updates made

- `docs/03-requirements/requirements-registry.md` — Module Abbrev table
  row for `ADM` extended with `010`, `011`.
- `docs/02-business-processes/operator-playbook/admin-bootstrap.md` —
  System requirements table added, pointing to FR-ADM-010.
- `docs/02-business-processes/operator-playbook/admin-user-management.md` —
  System requirements table added, pointing to FR-ADM-011.

## Carried-forward open item (not resolved here, by design)

Both FRs explicitly defer scoped-admin (`country_lead`) access to a
country-limited version of the role-management screen — noted as a
"Deferred, not decided" item in FR-ADM-011's Notes section, consistent
with the audit's own advisory (non-blocking) finding and the user's
original direction to let this stage "develop use case scenarios."
Recorded here so it isn't lost — a candidate follow-up FR, not silently
assumed either way.

## Gate Result

gate_result:
  status: passed
  summary: "Two FRs formalized (FR-ADM-010 bootstrap, FR-ADM-011 role management), both business_process-linked to reserved BP-UAT codes, registry updated."
  findings:
    - "FR-ADM-010 and FR-ADM-011 both status: Proposed, ready for independent requirement-development runs"
    - "Scoped-admin access explicitly deferred as a named open item, not silently dropped"
