# Step 7 — Test Design

**Workflow:** wf-20260704-fix-073
**Issue:** ISS-UAT-009-1
**Date:** 2026-07-04

## Tests delivered

Two new test files / one new test case, all runnable on this branch:

### 1. `apps/api/test/auth-logout-doc-coverage.spec.ts` (NEW — 4 assertions)

Doc-coverage regression that pins the `buildLogoutUrl()` comment so the
ISS-UAT-009-1 trade-off narrative cannot silently regress.

| Assertion | Verifies |
|---|---|
| `not.toMatch(/MAY skip the user-confirmation step and run the invalidation flow silently/)` | The pre-fix misleading claim is gone. |
| `toMatch(/confirmation interstitial/i)` | The post-fix comment names the actual observed UX. |
| `toMatch(/Trade-off made on 2026-05-23/)` | The historical anchor survives any refactor. |
| `toMatch(/ISS-UAT-009-1/)` | The comment is traceable to the issue file. |

**Runnability:** pure string-grep over the source file, no sibling-module
imports — runs cleanly under the current ISS-TEST-WEB-001 vitest SSR
skew.

### 2. `scripts/tests/check-workflow-state.bats` (one new `@test`)

`regression: SHA-suffixed ISS IDs (PRSteward auto-registered) do NOT trigger phantom drift`

Verifies the Step 0.5 corrective fix (the regex character-class change
in `extract_issue_ids`). Creates a real `ISS-CI-OVERRIDE-ebd184b.md` and
a registry row referencing it, then asserts the drift detector exits 0
and the diagnostic does not contain the phantom `ISS-CI-OVERRIDE-' ` or
`ISS-CI-OVERRIDE-.` substrings.

### 3. `apps/api/test/auth-logout-url.spec.ts` (one test removed)

The in-file doc-coverage test was extracted to
`auth-logout-doc-coverage.spec.ts` so it can run under ISS-TEST-WEB-001.
The 3 behavioural `buildLogoutUrl` tests are preserved unchanged and
will resume running once the ISS-TEST-WEB-001 fix lands.

## AC → Test mapping

| AC | Test |
|---|---|
| AC-2 (code/spec update) | `auth-logout-doc-coverage.spec.ts` (4 assertions) + the BP-UAT-009.md Step 004 / AC-7 wording update |
| AC-3 (live re-run of BP-UAT-009 Step 004) | Re-run of `apps/e2e/tests/uat/BP-UAT-009.spec.ts` (existing spec) in Step 8 |

## Run instructions

```bash
# Doc-coverage regression (runnable on this branch today)
cd apps/api && npx vitest run -c vitest.unit.config.ts

# Drift-detector regression (runnable on this branch today)
bash scripts/run-bats.sh scripts/tests/check-workflow-state.bats

# Live BP-UAT-009 Step 004 re-run (requires local stack — see Step 8)
bash scripts/uat-preflight-check.sh
npx playwright test --config=apps/e2e/playwright.uat.config.ts \
                    --grep "BP-UAT-009"
```

## Gate Result

gate_result:
  status: passed
  summary: "Two new test artifacts delivered; 3 behavioural tests preserved unchanged. All ACs mapped."
  findings:
    - "Doc-coverage regression is runnable today (avoids ISS-TEST-WEB-001 by pure file-read design)"
    - "Bats regression verifies Step 0.5 corrective fix"
    - "Live BP-UAT-009 re-run uses the existing Playwright spec (no new design)"