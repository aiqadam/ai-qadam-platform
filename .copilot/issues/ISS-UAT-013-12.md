# ISS-UAT-013-12 — Neg 004 spec has React-18 state-commit race (setReactInputValue + form.requestSubmit())

| Field | Value |
|---|---|
| ID | ISS-UAT-013-12 |
| Severity | minor |
| Module | uat/test-design |
| Status | resolved |
| Reported | 2026-07-02 |
| Reporter | BusinessAnalyst (wf-20260702-uat-059 / 03-uat-triage.md) |
| Resolved | 2026-07-03 |
| Workflow | wf-20260703-fix-060 |
| Related | [ISS-UAT-013-6](ISS-UAT-013-6.md) (Neg 004 was originally strengthened by that issue; this issue is the residual race that escaped that fix) |
| AC ref | AC-1 (BP-UAT-013) — Neg 004 |

## Symptom

Neg 004 of the BP-UAT-013 Playwright spec
(`apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts`) fails consistently when run against
the live stack. The 2026-07-02 re-run (workflow `wf-20260702-uat-059`) reports:

```
Playwright test FAILED to find a <p> element matching
/plus.?addressed|plus-addressing|not allowed|invalid email|\b400\b/i
within 10 s of form.requestSubmit().
```

Error-context YAML at failure shows the form in `idle` state with the email field
empty (`you@domain.com` placeholder) and the submit button still `[disabled]`.

## Classification

**Test-spec bug — NOT a UI bug, NOT a data bug, NOT a flow bug, NOT an env failure.**

The product behaviour is correct: a direct API probe
(`POST /v1/leads {"email":"uat-lead+tag@example.com"}`) returns
`400 {"formErrors":[],"fieldErrors":{"email":["Plus-addressed emails (name+tag@…) are not allowed."]}}`
(rejection at NestJS `emailField()` zod schema, `apps/api/src/lib/email-schema.ts`).
The api is doing the right thing.

## Root cause

The Neg 004 test uses the `setReactInputValue(...)` helper followed by
`form.requestSubmit()`. The helper dispatches a native `input` event synchronously,
but React 18 schedules the corresponding `setState` for `form.email` asynchronously.
When `form.requestSubmit()` runs on the very next line, React has not yet committed
`form.email = LEAD_PLUS` to the React state, so the React `onSubmit` handler is
never invoked. The submit button remains `[disabled]` (because
`form.email.trim().length === 0` in React state), and the form's HTML5 native
submit is suppressed by the disabled button — hence the form sits in `idle`
forever.

The comment block at spec lines 40–47 already documented this risk; the spec was
authored this way because the Astro dev toolbar used to intercept `submit.click()`.
A `hideDevToolbar(page)` helper was added later (spec lines 122–127) that makes
the simpler `emailInput.fill()` + `submit.click()` pattern viable — Step 001
already uses exactly that pattern and passes.

## Impact

Neg 004 cannot be relied on as a guard against regressions in the plus-addressing
validation. If a future code change accidentally removes the `emailField()` zod
refinement, Neg 004 would silently stop catching it (because the test never gets
the form into the error state to assert against).

## Expected state

When a user submits the lead capture form with a plus-addressed email
(`name+tag@example.com`), the form transitions to its `error` phase, renders a
`<p>` element with the literal text `POST /api/v1/leads → 400` (the api's
structured `fieldErrors.email` text is discarded by `submitLead` in
`apps/web/src/components/LeadCaptureForm.tsx:75`, only the status code is
re-thrown — see Honesty disclosures below).

## Actual state

The form remains in its `idle` phase: email input shows the
`you@domain.com` placeholder, submit button is `[disabled]`. No error `<p>`
renders. The Playwright matcher times out at 10 s.

## Screenshot

`apps/e2e/test-results/BP-UAT-013-signup-BP-UAT-0-139d6-essing-in-email-is-rejected-uat-desktop-chrome/test-failed-1.png`
(form in `idle`, not the expected `error` phase). The spec's own screenshot
output `neg-004-plus-addressing-rejected.png` is overwritten to the same
idle state.

## Proposed resolution

Rewrite the Neg 004 test body in
`apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` to use the same pattern as
Step 001 (which already passes):

```typescript
// Neg 004 — plus-addressing in email is rejected
//
// NOTE: do NOT use setReactInputValue(...) + form.requestSubmit() here —
// the helper dispatches a synchronous input event, but React 18's batched
// setState has not committed form.email by the time requestSubmit() fires.
// The submit button stays [disabled] and the React onSubmit handler never
// runs. Use emailInput.fill() (which awaits value commit) + submit.click()
// (which awaits button enable) instead — the same pattern as Step 001.
await page.goto(UAT_BASE_URL);
const emailInput = page.getByRole('textbox', { name: /email/i });
await emailInput.fill(UAT_LEAD_PLUS_EMAIL);
const submit = page.getByRole('button', { name: /send me a confirmation/i });
await submit.click();
await expect(
  page.getByText(/plus.?addressed|plus-addressing|not allowed|invalid email|\b400\b/i)
).toBeVisible({ timeout: 5_000 });
await expect(page.getByText(/check your inbox/i)).not.toBeVisible();
// Mailpit: no message for plus-addressed recipient
const msgs = await searchMailpit(UAT_LEAD_PLUS_EMAIL);
expect(msgs.length).toBe(0);
```

Once the rewrite is in place, the `setReactInputValue` helper and its
associated comment block at spec lines 40–47 can be deleted if no other
test references them (verify with `grep -rn setReactInputValue apps/e2e/tests/`).

### Honesty disclosures

- **The api's structured error text is thrown away by the web client.**
  `apps/web/src/components/LeadCaptureForm.tsx:75` builds the user-facing
  error as `Error('POST /api/v1/leads → ${res.status}')` and discards the
  response body's `fieldErrors.email` array. The api returns the helpful
  `"Plus-addressed emails (name+tag@…) are not allowed."` text, but the
  web form only renders `POST /api/v1/leads → 400`. The matcher regex
  accepts the 400-status-code rendering, which is what the user actually
  sees today. A future improvement could surface the api's `fieldErrors`
  text in the form (filed separately as copy-smell ISS-UAT-013-13 if
  useful).

- **The race is intrinsic to `setReactInputValue` + `form.requestSubmit()`.**
  Even with explicit `await page.waitForTimeout(...)`, the timing of
  React's commit is not guaranteed. The robust fix is to switch to
  Playwright's high-level `fill()` + `click()` which wait for state
  visibility, not for time.

## Acceptance criteria

- [ ] Neg 004 rewritten in `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts`
      to use `emailInput.fill()` + `submit.click()` (no `setReactInputValue`
      or `form.requestSubmit()`).
- [ ] A comment block at the top of Neg 004 documents the React-18
      state-commit race and the reason for not using `setReactInputValue`.
- [ ] BP-UAT-013 re-run reports 12/12 PASS (Neg 004 inclusive).
- [ ] `setReactInputValue` helper deleted from the spec if no other test
      references it.

## Resolution

- **Workflow:** wf-20260703-fix-060
- **PR:** <pending>  (Step 12 back-fills the URL after `gh pr create`.)
- **Root cause:** The Neg 004 test used `setReactInputValue(...)` followed by
  `form.requestSubmit()`. The helper dispatches a synchronous native `input`
  event, but React 18 schedules the corresponding `setState` for `form.email`
  asynchronously. By the time `form.requestSubmit()` ran on the very next
  line, React had not yet committed `form.email = LEAD_PLUS` to the React
  state, so the submit button stayed `[disabled]` (because
  `form.email.trim().length === 0` in React state) and the React `onSubmit`
  handler was never invoked. The form sat in `idle` forever; the matcher
  timed out at 10 s; the test failed vacuously.
- **Fix:** Rewrote the Neg 004 test body in
  `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` to use
  `emailInput.fill(LEAD_PLUS) + await expect(submit).toBeEnabled() + await
  submit.click()` — the same proven pattern that Step 001 already uses
  successfully. Added a 24-line comment block at the top of Neg 004
  documenting the React-18 state-commit race and the reason for not using
  `setReactInputValue` (which is INTENTIONALLY KEPT for Neg 001's hidden
  honeypot field — `<input name="company" style="left:-9999px; opacity:0">`
  — which Playwright's `.fill()` refuses to target). Also added two
  defensive assertions (success-panel `toHaveCount(0)`; Mailpit
  dispatch-absence) to make Neg 004 strictly more rigorous than before.
- **Regression test:** The rewritten Neg 004 itself. If a future refactor
  reintroduces the `setReactInputValue + form.requestSubmit` pattern (or
  any non-conditional timer-based wait), Neg 004 will fail again because
  the form will sit in `idle` and the matcher will time out. If a future
  code change accidentally removes the api's `emailField()` plus-addressing
  zod refinement, Neg 004 will fail with a clean assertion error (the form
  would transition to `success` instead of `error`).
- **Verification:** Run live against the local stack.
  - `pnpm --filter @aiqadam/e2e exec playwright test --config apps/e2e/playwright.uat.config.ts --grep "Neg 004"` → **1 passed (11.1s)**.
  - `pnpm --filter @aiqadam/e2e exec playwright test --config apps/e2e/playwright.uat.config.ts --grep "BP-UAT-013"` → 8/12 passed. The 4 failures (Steps 002, 003, 005, 006) are pre-existing env-constraints (RESEND_API_KEY empty → no Mailpit dispatch; seed is stale → no fresh operator_invites row) and are exactly the same failures the prior wf-20260702-uat-059 reported. Neg 004 PASSES in both the isolation run and the full re-run. See `07-test-results.md` for the full breakdown and the honesty disclosures on AC-3 wording.
- **Merged:** <pending>  (Step 12.5 back-fills the actual merge SHA.)
