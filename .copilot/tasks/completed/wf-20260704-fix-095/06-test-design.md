# Step 7 — Test Design (TestDesigner)

**Workflow:** `wf-20260704-fix-095`
**Issue:** `ISS-TEST-WEB-001`

## Scope

No new test files were authored by this workflow. The regression test
already exists at `apps/web/src/components/OnboardingForm.test.ts`
(authored by `wf-20260703-fix-065-onboarding-copy`, PR #90 squash
`e38dd18` on 2026-07-03). This file is the canonical regression test
for `ISS-UAT-013-13` and was unblocked by this fix.

## Test file inventory

The fix does not add, modify, or delete any test files. It only changes
dependency versions and one test-config workaround. The existing tests
that exercise the change are:

| File | Module | Authored by | Pre-fix state |
|---|---|---|---|
| `apps/web/src/components/OnboardingForm.test.ts` | web/onboarding | `wf-20260703-fix-065-onboarding-copy` | SSRE crash — could not run |
| `apps/web/src/lib/utm.test.ts` | web/utm | (pre-existing) | ran via "local re-implementation" workaround |
| `apps/web-next/src/blocks/workspace/FilterChip.test.tsx` | web-next/ui | (pre-existing) | SSRE crash — could not run |
| `apps/web-next` other 32 test files (`.ts`, not `.tsx`) | web-next/* | various | ran green, continue to run green |
| `apps/api` 94 of 97 test files | api/* | various | could not run (SSRE on setup-pg.ts); now run |
| `apps/api/test/leads-service.spec.ts` | api/leads | `wf-20260629-fix-034` | could not run; now passes |
| `apps/api/test/auth-logout-doc-coverage.spec.ts` | api/auth | `wf-20260704-fix-073` | could not run; now passes |

## Verification commands (run in Step 8)

The verification commands listed in `06-test-strategy.md` (Steps 1–6)
are themselves the test-design for this fix. No new test was added; the
existing test surface was exercised.

```yaml
gate_result:
  status: passed
  attempt: 1
  timestamp: "2026-07-04T21:13:50Z"
  summary: "No new test authored — verify the existing regression test (OnboardingForm.test.ts) now runs."
  output_file: ".copilot/tasks/active/wf-20260704-fix-095/06-test-design.md"
```