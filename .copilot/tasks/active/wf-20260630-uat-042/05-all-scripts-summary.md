# All Scripts Run Summary — wf-20260630-uat-042
# 2026-06-30

## Overall Result

**1 script run (BP-UAT-013), 18 scripts blocked.**

## Why Only BP-UAT-013 Was Run

All 19 UAT scripts (BP-UAT-000 to BP-UAT-018) were reviewed. Only BP-UAT-013 has an
existing Playwright spec file (`apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts`).
The remaining 18 scripts have no spec files, meaning the UATRunner cannot execute them
without first creating the spec files.

## Script Status Summary

| Script | Status | Blocker |
|---|---|---|
| BP-UAT-000 | not-run | No Playwright spec; env checks done manually in pre-flight |
| BP-UAT-001 | not-run | No spec; involves cron workers (not browser-testable directly) |
| BP-UAT-002 | not-run | No spec |
| BP-UAT-003 | not-run | No spec |
| BP-UAT-004 | not-run | No spec |
| BP-UAT-005 | not-run | No spec |
| BP-UAT-006 | not-run | No spec |
| BP-UAT-007 | not-run | No spec; cron-based test |
| BP-UAT-008 | not-run | No spec; cron-based test |
| BP-UAT-009 | not-run | No spec; seed exists (uat-member/uat-operator) |
| BP-UAT-010 | not-run | No spec; seed missing events data |
| BP-UAT-011 | not-run | No spec; seed missing events + QR code |
| BP-UAT-012 | not-run | No spec; seed missing check-in data |
| **BP-UAT-013** | **10/12 passed** | **DONE — see BP-UAT-013-04-triage.md** |
| BP-UAT-014 | not-run | No spec; seed missing events data |
| BP-UAT-015 | not-run | No spec; seed missing registration data |
| BP-UAT-016 | not-run | No spec |
| BP-UAT-017 | not-run | No spec; cron-based test |
| BP-UAT-018 | not-run | No spec; cron-based test |

## Honest Assessment

Running "all UAT tests" requires:
1. Creating Playwright spec files for each script (18 scripts missing specs)
2. Extending the seed to include events, registrations, QR codes, etc.

These are separate development tasks, not infra issues. Each script needs a dedicated
uat-verification workflow to create the spec and run the tests.

## What Was Accomplished

- ✓ BP-UAT-013 re-run: 10/12 tests passed
- ✓ AC-2 from ISS-UAT-013-8 verified (email verify link flow works end-to-end)
- ✓ New issues registered: ISS-UAT-013-9 (product bug), ISS-UAT-013-10 (spec fix)
- ✓ Infrastructure issues documented
- ✓ Pre-flight verified all services healthy

## Follow-up Needed

For each of the 18 blocked scripts, a separate uat-verification workflow should:
1. Have BusinessAnalyst validate the script
2. Have TestDesigner create the Playwright spec
3. Extend the seed as needed
4. Run via UATRunner
