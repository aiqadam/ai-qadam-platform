# Step 5+6 — Test Strategy & Test Design

**Workflow:** wf-20260802-fix-194
**Steps:** 5 (TestStrategist), 6 (TestDesigner)
**Date:** 2026-08-02

## Strategy summary

The bug is in production code (`.astro` page frontmatter) AND in a
mirror function (`.test.ts` file) used by an existing test. The
test was the failing surface, not an absence of tests.

| Level | Status | Notes |
|---|---|---|
| Unit | **Existing — already present** | `apps/web-next/src/lib/event-lifecycle-tab.test.ts` already covers 9 cases (3 well-formed, 2 boundary, 4 malformed). The "startsAt-only bad" case is the failing one. Fix: update the local `deriveDefaultTab` mirror to match the page logic, which makes the existing test pass. No new tests needed. |
| Integration | N/A | No API endpoints touched |
| E2E | N/A | No user-facing flow change for well-formed events (the dominant production case). The fix only changes behavior for the rare malformed-data case, which is hard to seed in an E2E without a Directus data-quality setup; covered adequately by unit test. |

## Coverage verification

The 9 existing test cases (all PASS after fix):

| # | Scenario | Expected | Verified |
|---|---|---|---|
| 1 | Both parseable, now well before startsAt | `upcoming` | ✓ |
| 2 | Both parseable, now between | `live` | ✓ |
| 3 | Both parseable, now well after endsAt | `finished` | ✓ |
| 4 | Both parseable, now === startsAt | `live` (boundary: `>=`) | ✓ |
| 5 | Both parseable, now === endsAt | `finished` (boundary: `>=`) | ✓ |
| 6 | Both unparseable | `upcoming` | ✓ |
| 7 | endsAt unparseable, now past startsAt | `live` | ✓ |
| 8 | endsAt unparseable, now before startsAt | `upcoming` | ✓ |
| 9 | **startsAt unparseable** | **`upcoming`** | ✓ (was the failing case) |

## AAA pattern adherence

All tests follow Arrange / Act / Assert (constants defined at the
top of `describe`, single call, single `expect`). No `it.skip`,
no `console.log` in tests, no flakiness potential.

## Test-runner expectations for Step 7

- `pnpm --filter @aiqadam/web-next test` → 40 files / 1017 tests pass.
- The single previously-failing test now passes; no other test
  changed status.
- `pnpm typecheck` → 0 errors (test file imports only `vitest`).

## Gate

PASS — strategy is "update existing unit-test mirror to match
corrected page logic"; no new test files needed.
