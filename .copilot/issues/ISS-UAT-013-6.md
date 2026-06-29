# ISS-UAT-013-6 — UAT script test-design defects: Neg 004 vacuous assertion + Neg 002/003 UI-coincidence risk

| Field | Value |
|---|---|
| ID | ISS-UAT-013-6 |
| Severity | enhancement |
| Module | uat / test-design |
| Status | resolved |
| Reported | 2026-06-28 |
| Resolved | 2026-06-29 |
| Reporter | UATRunner (wf-20260628-uat-030 / 03-uat-runner-report.md) — Honest disclosures #2 and #3 |
| Workflow | wf-20260629-fix-038 |
| PR | [#70](https://github.com/tvolodi/aiqadam/pull/70) |
| Merged | _pending PR merge_ |

## Symptom

Two test-design defects in the BP-UAT-013 spec (`apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts`) surfaced during the 2026-06-28 run:

### Defect A — Neg 004 (plus-addressing) is a vacuous pass

Neg 004's assertion is `success panel not visible`. This passes whether the email is correctly rejected (validation error shown) OR the api is down (no panel ever renders). The test does NOT verify what its name claims.

Reproduced: in the 2026-06-28 run with the api down, Neg 004 passed at the assertion level — the runner correctly flagged it as `FAIL (vacuous)` rather than `PASS`.

The script's expected UI state — `"Form shows a validation error rejecting the plus-addressed email"` — is the actual contract. The current assertion does not check for it.

### Defect B — Neg 002 / Neg 003 have UI-coincidence risk

`apps/web-next/src/blocks/customer/OnboardingForm.tsx` falls back to `<GonePanel>` ("This link can't be used.") on **any** non-OK response from `/api/v1/onboard/preview`, not just 410. This means a 404 (foreign Next.js during 2026-06-28) renders visually identically to a 410 (the real api contract for used / expired tokens).

In the 2026-06-28 run, Neg 002 / Neg 003 had the UI assertion `expect(page.getByText(/this link can.?t be used/i)).toBeVisible()` pass while the API-level assertion `expect(apiRes.status()).toBe(410)` correctly failed. Without the API-level assertion, Neg 002 / Neg 003 would have been **falsely classified as PASS**.

The runner already added the API-level disambiguating call. This issue is to make that defense permanent in the spec and to strengthen Neg 004's assertion.

## Repro

```typescript
// apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts — Neg 004 (current, vacuous)
await page.goto(UAT_BASE_URL);
await page.fill('input[name="email"]', 'uat-lead+tag@aiqadam.test');
await page.click('button[type="submit"]');
// No assertion on validation error message
// → passes whether api rejects the email or api is down

// Defect B (Neg 002 / Neg 003 — coincidental UI pass)
const apiRes = await page.request.get('/api/v1/onboard/preview', {
  params: { token: USED_TOKEN },
});
// API returns 404 (foreign Next.js) OR 410 (real aiqadam api).
// GonePanel renders identically for both.
```

## Root cause

- **Defect A**: the original spec author treated "no success panel" as sufficient evidence of rejection. That's true at the loose level but doesn't actually verify the plus-addressing rule from `FR-USR-001` (Notes: plus-addressing rejected at validation).
- **Defect B**: the `OnboardingForm` component was written defensively (any `!res.ok` → `GonePanel`) to avoid crashing on network errors. That's good UX, but it makes the UI alone insufficient evidence for the API's 410 contract. The current spec asserts both UI and API; future specs that drop the API assertion will silently regress.

## Proposed resolution

### Spec edits — `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts`

**Neg 004 — strengthen the assertion** to actually verify the rejection message:

```typescript
// Neg 004 — plus-addressing rejected (strengthened)
await page.goto(UAT_BASE_URL);
await page.fill('input[name="email"]', 'uat-lead+tag@aiqadam.test');
await page.click('button[type="submit"]');
// Real contract: form shows validation error.
await expect(
  page.getByText(/invalid email|plus.?addressing|not allowed/i)
).toBeVisible({ timeout: 5_000 });
// And no success panel.
await expect(page.getByText(/check your inbox/i)).not.toBeVisible();
// Mailpit should have nothing for the plus-addressed recipient.
const msgs = await searchMailpit('uat-lead+tag@aiqadam.test');
expect(msgs.length).toBe(0);
```

**Neg 002 / Neg 003 — keep the API assertion as a hard requirement.** Add a comment block at the top of each:

```typescript
// Neg 002 — used token returns 410.
//
// UI-only assertions are insufficient: OnboardingForm's GonePanel
// renders on any non-OK response (including 404 from a misconfigured
// proxy). The API-level assertion below is what verifies the 410
// contract. Do NOT remove it.
```

Move the API call into a `test.beforeAll` or helper so future specs can't accidentally drop it.

### Documentation

Add to `docs/02-business-processes/uat/BP-UAT-template.md` under "Negative scenarios":

> **Negative scenarios must assert the API contract, not just the UI.**
> When the user-facing component falls back to a generic error panel on
> any non-OK response (as `OnboardingForm` does with `<GonePanel>`),
> a UI-only assertion can be visually satisfied by a misconfigured
> proxy returning 404. Always include `expect(apiRes.status()).toBe(<expected>)`
> alongside any UI assertion for negative scenarios.

## Acceptance criteria

1. Neg 004's assertion includes `expect(page.getByText(/invalid email|plus.?addressing|not allowed/i)).toBeVisible()`.
2. Neg 002 / Neg 003 retain their API-level `expect(apiRes.status()).toBe(410)` assertion, with a comment explaining why it must not be removed.
3. `docs/02-business-processes/uat/BP-UAT-template.md` gains the negative-scenarios guidance above.
4. A re-run of BP-UAT-013 with the api down fails Neg 004 (because the validation error never renders) — proving the assertion is no longer vacuous.

## References

- `.copilot/tasks/active/wf-20260628-uat-030/03-uat-runner-report.md` — Honest disclosures #2 and #3
- `apps/web-next/src/blocks/customer/OnboardingForm.tsx` — `GonePanel` fallback behavior
- `docs/02-business-processes/uat/BP-UAT-013.md` — current spec text for Neg 002 / 003 / 004
- `docs/03-requirements/FR-USR-001.md` — plus-addressing rule (Notes)

## Resolution

Closed by workflow `wf-20260629-fix-038` on 2026-06-29.

**Spec edits (AC-1, AC-2) — already on disk from Retry-2 on 2026-06-28**:
Neg 002 / Neg 003 already had API-level `expect(apiRes.status()).toBe(410)` assertions
plus a comment block documenting why they must not be removed (BP-UAT-013-signup.spec.ts:364-412).
Neg 004 already had the strengthened error-text regex match (BP-UAT-013-signup.spec.ts:425-481).

**Doc change shipped by this workflow (AC-3)**:
Added a new subsection `### Negative-scenario assertion rule (mandatory)` under
`## Negative Scenarios` in `docs/02-business-processes/uat/BP-UAT-template.md`. The rule
mandates:
- (a) Negative scenarios must assert the API contract, not just the UI.
- (b) Vacuous UI assertions are forbidden.
- (c) Includes a fenced TypeScript snippet demonstrating `page.request.get` +
      `apiRes.status()` alongside the UI assertion.

**Regression test shipped by this workflow (AC-3 verification)**:
New file `scripts/tests/bp-uat-template-rule.bats` (51 lines, 5 `@test` blocks).
Run output:
- With rule present: 5/5 pass.
- With rule reverted (stash-and-revert proof): 5/5 fail — confirms every assertion is non-vacuous.
- Sibling `scripts/tests/uat-seed.bats`: 7/7 green (no collateral regression).

**AC-4 status**: deferred by the issue author to a follow-up workflow. Out of scope here.

Honesty note: most of the spec-file changes proposed in this issue were already on disk
from Retry-2 on 2026-06-28; this workflow's residual work was the doc template + bats
regression test (AC-3 only). The handoff context_refs originally pointed at
`apps/web-next/src/blocks/customer/OnboardingForm.tsx`, which is the wrong file — the
actual `<GonePanel>` fallback lives in `apps/web/src/components/OnboardingForm.tsx`
(the legacy Astro web app). The fix landed in the template instead, which is the
correct durable artifact for the AC-3 contract.