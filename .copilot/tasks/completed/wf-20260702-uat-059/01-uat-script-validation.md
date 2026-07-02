## UAT Script Validation — BP-UAT-013

**Script file:** docs/02-business-processes/uat/BP-UAT-013.md
**Process ref:** docs/03-requirements/FR-USR-001.md
**Run date:** 2026-07-02 (re-run scoped to ISS-UAT-013-11)

### Validation Checklist

| Check | Result | Notes |
|---|---|---|
| process_ref file exists | PASS | `docs/03-requirements/FR-USR-001.md` exists (member signup + operator onboarding surface). |
| environment URL present | PASS | `http://localhost:4321` declared in frontmatter. Matches `apps/web` dev server on `:4321` confirmed by `curl /` HTTP 200. |
| seed_required declared | PASS | `seed_required: true` in frontmatter; fixtures table lists 5 fixtures (4 operator_invites rows + Mailpit catcher). |
| seed_fixture non-empty | PASS | Five-row fixture table; row 5 (mail catcher) is infra not data. Four data fixtures × four distinct scenarios (valid / used / expired / no-user). |
| all steps have action + expected + label | PASS | Steps 001–006 each have `Action`, `Expected UI state`, and `Screenshot label`. |
| negative scenarios present | PASS | Five negative scenarios: Neg 001 (honeypot), Neg 002 (used-token 410), Neg 003 (expired-token 410), Neg 004 (plus-addressing), Neg 005 (no-authentik-user 409). Exceeds the "at least one" minimum. |
| ACs mapped to steps | PASS | AC-1 ↔ Steps 001/002; AC-2 ↔ Step 003; AC-3 ↔ Step 004; AC-4 ↔ Neg 001; AC-5 ↔ Step 005/006 + Neg 005; AC-6 ↔ Neg 002; AC-7 ↔ Neg 003. All seven ACs have at least one step reference. |
| Spec edits from ISS-UAT-013-10 applied | PASS | BP-UAT-013 Step 005 explicitly asserts `getByText(/aiqadam-staff/i)` (the role label) — aligns with the seed fix that sets `role_groups: ["aiqadam-staff"]` for the valid invite row. ISS-UAT-013-6 (vacuous negative assertion rule) also already applied. |
| Existing Playwright spec in repo | PASS | `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` exists (23 KB, authored 2026-06-29); can be reused without modification since no spec change is needed for this re-run. |
| Honeypot / negative verification path documented | PASS | Notes section acknowledges Neg 001 verification requires Directus admin; present in fixture. |

### Summary

BP-UAT-013 is **fully validated and ready to execute** without any script edits. The script reflects the post-fix state (operator_invites seed carries `aiqadam-staff` role per wf-20260702-fix-049, and the verified-email idempotency guard from wf-20260630-fix-043 is the new expected behaviour tested by Step 004). The pre-existing Playwright spec `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` covers all 6 numbered steps + 5 negative scenarios and does not need modification — the empirical question is whether the underlying code+seed now passes it. Honesty: the previous run on 2026-06-30 found 10/12 PASS with Steps 004 and 005 failing; this re-run exists precisely to confirm those two steps now pass after their respective fixes merged. There are no spec gaps blocking the run.

## Gate Result

gate_result:
  status: passed
  summary: "BP-UAT-013 validated — 7/7 contract checks pass; 6 steps + 5 negatives + 7 ACs fully mapped; existing Playwright spec reusable as-is for the re-run."
  findings: []