# 01-issue-lookup.md — Issue Lookup (wf-20260629-fix-038)

**Step:** 1 (Issue Lookup, Orchestrator-direct)
**Date:** 2026-06-29
**Issue:** ISS-UAT-013-6

---

## Issue summary

| Field | Value |
|---|---|
| ID | ISS-UAT-013-6 |
| Severity | enhancement |
| Module | uat / test-design |
| Status | open (pending resolution) |
| Reported | 2026-06-28 |
| Reporter | UATRunner (wf-20260628-uat-030 / 03-uat-runner-report.md) — Honest disclosures #2 and #3 |
| Workflow (this) | wf-20260629-fix-038 |

---

## Cross-reference search (registry scan)

Searched `.copilot/issues/registry.md` for issues that share
keywords: `uat`, `test`, `vacuous`, `coincidence`, `Neg 004`,
`Neg 002`, `Neg 003`, `OnboardingForm`, `GonePanel`, `BP-UAT-013`.

| Existing | Same defect? | Why |
|---|---|---|
| ISS-UAT-013-1 | NO | port-guard api startup |
| ISS-UAT-013-2 | NO | preflight process-identity |
| ISS-UAT-013-3 | NO | LeadCaptureForm missing on homepage |
| ISS-UAT-013-4 | NO | `uat-seed.sh` missing `operator_invites` rows |
| ISS-UAT-013-5 | NO | Directus 503 retry — RESOLVED via PR #69 |
| ISS-UAT-013-7 | NO | SMTP/Mailpit email transport |
| ISS-UAT-013-8 | NO | operator_invites.email mismatch with Authentik user |
| **ISS-UAT-013-6 (this)** | YES | this is the test-design defect |

**No duplicate.** The issue registry already lists ISS-UAT-013-6
with status `open` (registry row confirmed at
`.copilot/issues/registry.md:14`). No similar past issue exists —
this is the first UAT test-design defect specifically about UI/API
disambiguation for negative scenarios in the customer signup spec.

---

## Issue context (verbatim from `.copilot/issues/ISS-UAT-013-6.md`)

### Defect A — Neg 004 (plus-addressing) is a vacuous pass

Neg 004's assertion is `success panel not visible`. This passes whether
the email is correctly rejected (validation error shown) OR the api is
down (no panel ever renders). The test does NOT verify what its name
claims.

### Defect B — Neg 002 / Neg 003 have UI-coincidence risk

`apps/web-next/src/blocks/customer/OnboardingForm.tsx` falls back to
`<GonePanel>` ("This link can't be used.") on **any** non-OK response
from `/api/v1/onboard/preview`, not just 410. A 404 (foreign Next.js
during 2026-06-28) renders visually identically to a 410 (the real api
contract for used / expired tokens). Without the API-level `expect(apiRes.status()).toBe(410)`
assertion, Neg 002 / Neg 003 would have been falsely classified as PASS.

---

## Plan (preview — Step 2 will detail)

1. **Strengthen Neg 004 assertion** in `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts`:
   - Look for validation error text (`/invalid email|plus.?addressing|not allowed/i`)
   - Confirm absence of success panel (`/check your inbox/i`)
   - Confirm Mailpit inbox is empty for the plus-addressed recipient
2. **Keep Neg 002 / Neg 003 API-level assertion** as a hard requirement and add
   an inline comment block above each explaining why it must not be removed.
3. **Extract** the API-level call into a `test.beforeAll` or helper so future specs
   cannot accidentally drop it.
4. **Document** in `docs/02-business-processes/uat/BP-UAT-template.md` under
   "Negative scenarios" — Negative scenarios must assert the API contract, not
   just the UI, when a UI fallback panel renders on any non-OK response.
5. **Verify** by re-running BP-UAT-013 with the api down — Neg 004 must FAIL
   (because validation error never renders), proving the assertion is no longer vacuous.

---

## Acceptance criteria (from issue)

1. Neg 004's assertion includes `expect(page.getByText(/invalid email|plus.?addressing|not allowed/i)).toBeVisible()`.
2. Neg 002 / Neg 003 retain their API-level `expect(apiRes.status()).toBe(410)` assertion, with a comment explaining why it must not be removed.
3. `docs/02-business-processes/uat/BP-UAT-template.md` gains the negative-scenarios guidance above.
4. A re-run of BP-UAT-013 with the api down fails Neg 004 (because the validation error never renders).

---

## Reference files

- `.copilot/issues/ISS-UAT-013-6.md` — issue (source of truth)
- `.copilot/tasks/active/wf-20260628-uat-030/03-uat-runner-report.md` — UATRunner honest disclosures #2 and #3
- `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` — current spec (to strengthen)
- `apps/web-next/src/blocks/customer/OnboardingForm.tsx` — `GonePanel` fallback behavior
- `docs/02-business-processes/uat/BP-UAT-013.md` — current spec business-process doc
- `docs/02-business-processes/uat/BP-UAT-template.md` — UAT template (to amend)
- `apps/e2e/playwright.uat.config.ts` — UAT Playwright config (localhost-only)

---

**Gate:** passed → advance to Step 2 (ImpactAnalyzer)
