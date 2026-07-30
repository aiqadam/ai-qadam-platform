# Step 1 — UAT Script Validation

**Workflow:** wf-20260730-uat-158
**Business process:** BP-UAT-010

`docs/02-business-processes/uat/BP-UAT-010.md` exists, has 7 ACs, 6 Steps,
3 Negative scenarios (Negative 001-003), and a "Seed Fixtures Required"
table — satisfies the negative-scenario-mandatory requirement.

Known, already-disclosed gaps in the script itself (per ISS-UAT-010-1,
filed during the parent `wf-20260730-fix-157`): AC-1/AC-6/AC-7 wording
uses field values that don't match the real implementation. This does
NOT block this workflow's ability to attempt a live run — the seed
fixture manifest (this workflow's own reason for existing) is now correct
and usable regardless of the doc's prose being imprecise.

## Gate Result

gate_result:
  status: passed
  summary: "BP-UAT-010.md has the required structure (ACs, steps, negative scenarios, seed fixtures table). Known wording gaps already tracked in ISS-UAT-010-1 — do not block this run."
  findings:
    - "ISS-UAT-010-1 (already filed) documents AC-1/AC-6/AC-7 wording drift — expected to produce MISMATCH verdicts on those specific ACs, not a run failure."
