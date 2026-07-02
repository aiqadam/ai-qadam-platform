# 03 — Code Summary (wf-20260703-fix-060)

## Requirement Implemented

ISS-UAT-013-12 — rewrite the Neg 004 test body in
`apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` to use the proven
`emailInput.fill()` + `submit.click()` interaction pattern (already used
by Step 001) instead of the broken `setReactInputValue(...)` +
`form.requestSubmit()` sequence that races with React 18's batched
setState.

The product behaviour is unchanged: the api's `emailField()` zod
refinement in `apps/api/src/lib/email-schema.ts` correctly rejects
plus-addressed emails (`uat-lead+tag@example.com`) with HTTP 400 and the
structured message `"Plus-addressed emails (name+tag@…) are not
allowed."`. Verified live during pre-flight. This fix is purely on the
test consumer side.

## Files Changed

| File | Change Type | Description |
|---|---|---|
| `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` | Modified | (1) Replaced the Neg 004 test body with a `fill()` + `click()` rewrite that adds a long comment block at the top of the test documenting the React-18 state-commit race and pointing future maintainers to the proven pattern. (2) Replaced the now-stale top-of-file "Neg 004 uses `dispatchEvent(new Event('submit'))`" Retry-2 comment with a fresh Retry-3 note that references ISS-UAT-013-12 and explains why the `setReactInputValue` helper is INTENTIONALLY KEPT. (3) Strengthened the assertion set: the new body checks the success panel is absent (with `toHaveCount(0)`), checks the error `<p>` is visible with the matching regex, AND verifies Mailpit never received a message for the plus-addressed recipient. |

## Key Design Decisions

1. **Kept the `setReactInputValue` helper.** Neg 001 (honeypot test)
   still uses it for the off-screen hidden honeypot field
   (`<input name="company" style="left:-9999px; opacity:0">`).
   Playwright's `.fill()` refuses to interact with off-screen elements,
   so deleting the helper would break Neg 001. The issue's AC-4 says
   "delete if no other test references it" — Neg 001 does reference it,
   so the helper stays.

2. **Used Playwright's high-level `emailInput.fill()` + `submit.click()`.**
   Both methods are conditional, not timer-based: `fill()` awaits the
   React value-commit internally; `click()` is preceded by
   `await expect(submit).toBeEnabled()` which awaits the React state
   transition that enables the button. The same pattern already passes
   in Step 001 and Step 004.

3. **Strengthened the assertion set (beyond the issue's literal AC-3).**
   - Added an explicit `await expect(page.getByText(/check your inbox/i)).toHaveCount(0)`
     so any future regression that lets the form transition to `success`
     fails Neg 004 with a precise error.
   - Added a `mailpitSearch(LEAD_PLUS)` check at the end to verify the
     api never dispatched email for the rejected recipient (defence in
     depth — the 400 already proves the api rejected, but the Mailpit
     check guards against any future code path that bypasses the
     validator before reaching the mailer).
   These additions are not in the literal issue AC list, but they
   follow the wf-20260629-fix-038 test-design rule that ISS-UAT-013-6
   introduced ("non-vacuous evidence that the validation rejected the
   input"). They make Neg 004 strictly more rigorous than before.

4. **Kept the `hideDevToolbar(page)` call** at the top of Neg 004. The
   issue body does not explicitly mention the dev toolbar, but every
   other Neg test in the file calls it and Step 001's working pattern
   also calls it before the form interaction. Omitting it would
   reintroduce the "Astro dev toolbar intercepts submit click" failure
   mode that the Retry-2 commit fixed.

5. **Did NOT change the api's submitLead() error message.** The issue's
   Honesty disclosures section already notes that the web form discards
   the api's `fieldErrors.email` body and only renders
   `POST /api/v1/leads → 400`. Surfacing the api's structured text in
   the form is filed separately as copy-smell ISS-UAT-013-13.

## Architecture Rule Compliance

- [x] **Small PR rule** (AGENTS.md §4) — 1 file, ~+50/-15 lines, well
  under the 400-line / 5-file budget.
- [x] **No new dependencies** (AGENTS.md §8) — only existing
  Playwright API used (`Locator.fill`, `Locator.click`,
  `expect(...).toBeEnabled`, `expect(...).toHaveCount`).
- [x] **No magic strings** (AGENTS.md §1.3) — the only literal in the
  new body is `LEAD_PLUS` (already a named constant at the top of the
  file).
- [x] **Functions fit on one screen** (AGENTS.md §1.4) — Neg 004
  remains a single 40-line `test(...)` block.
- [x] **At least one assertion per function** (§1.5) — three explicit
  assertions + one regex match on the error text.
- [x] **No `any`, no `as` casts, no `@ts-ignore`** (§3).
- [x] **No raw hex, no gradients, no emoji** (AGENTS.md §11) — N/A
  (test file, no UI authored).
- [x] **Comments explain why, not what** (§3) — the long comment block
  at the top of Neg 004 documents the React-18 state-commit race and
  the reasoning behind the chosen pattern, not the mechanics of `fill()`
  vs `requestSubmit()`.

## Formatter Check

- `pnpm biome check apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` →
  **clean** (Checked 1 file in 44ms. No fixes applied.)
- `pnpm --filter @aiqadam/e2e typecheck` — script does not exist on
  the e2e package; ran `pnpm exec tsc --noEmit` from `apps/e2e/`
  directly → **clean** (no output = no type errors).

## Known Limitations

- **Mailpit assertion is timing-sensitive.** A 4-second wait
  (`await new Promise((r) => setTimeout(r, 4_000))`) is used, the same
  as Step 004 and Neg 001. A future improvement could replace the
  timer with a `waitFor(mailpitSearch(LEAD_PLUS), (m) => m.length > 0)`
  poll-with-assertion-inversion pattern, but that's a separate refactor
  — the issue is closed by Step 8 confirming Neg 004 passes against
  the live stack.
- **The api's `fieldErrors.email` structured text is still discarded
  by the web client.** Per the issue's Honesty disclosures, surfacing
  the api's structured text in the form is filed separately as
  ISS-UAT-013-13 (copy-smell), not in scope of this fix.

## Gate Result

```yaml
gate_result:
  status: passed
  attempt: 1
  timestamp: 2026-07-03T00:00:00Z
  summary: >-
    Single-file Playwright interaction-sequence rewrite. setReactInputValue
    helper kept (Neg 001 still uses it). Biome clean, tsc clean. New body
    uses fill() + click() with three explicit assertions and a Mailpit
    defence-in-depth check.
  output_file: ".copilot/tasks/active/wf-20260703-fix-060/03-code-summary.md"
```
