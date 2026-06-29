# Step 7: Test Results — wf-20260629-fix-035

**Workflow:** wf-20260629-fix-035
**Date:** 2026-06-29

## Unit Tests — `apps/web-next`

**File:** `apps/web-next/src/blocks/customer/LeadCaptureForm.test.ts`
**Runner:** Vitest v2.1.9
**Environment:** node

```
Test Files  1 passed (1)
     Tests  15 passed (15)
  Duration  691ms
```

### Test cases executed

| # | Suite | Test | Result |
|---|---|---|---|
| 1 | [REGRESSION] ISS-UAT-013-3 | `LeadCaptureForm.tsx exists and exports the named function` | ✓ PASS |
| 2 | [REGRESSION] ISS-UAT-013-3 | `LeadCaptureForm is re-exported from the customer barrel index.ts` | ✓ PASS |
| 3 | buildLeadBody | `trims email` | ✓ PASS |
| 4 | buildLeadBody | `includes city when non-empty` | ✓ PASS |
| 5 | buildLeadBody | `omits city when whitespace-only` | ✓ PASS |
| 6 | buildLeadBody | `includes interestTopics when non-empty` | ✓ PASS |
| 7 | buildLeadBody | `omits interestTopics when empty` | ✓ PASS |
| 8 | buildLeadBody | `honeypot always forwarded` | ✓ PASS |
| 9 | toggleTopic | `adds missing topic` | ✓ PASS |
| 10 | toggleTopic | `removes existing topic` | ✓ PASS |
| 11 | readUtmFirstTouch | `returns null in node env` | ✓ PASS |
| 12 | INTEREST_PRESETS | `contains 11 entries` | ✓ PASS |
| 13 | isSubmitDisabled | `email empty → true` | ✓ PASS |
| 14 | isSubmitDisabled | `submitting → true` | ✓ PASS |
| 15 | isSubmitDisabled | `idle + valid email → false` | ✓ PASS |

## Pre-existing failures (not introduced by this PR)

2 test files fail in web-next with JSX parse errors (`AsyncSelect.test.tsx`, `FilterChip.test.tsx`).
These are pre-existing and not related to this change.

## gate_result

```yaml
gate_result:
  status: passed
  step: 8
  attempt: 1
  timestamp: "2026-06-29T00:15:00Z"
  summary: "15/15 new tests pass. 0 regressions introduced. 2 pre-existing failures confirmed unrelated."
```
