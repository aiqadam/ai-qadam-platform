# 01 — Issue Lookup (wf-20260703-fix-060)

## Issue under resolution

[ISS-UAT-013-12](../issues/ISS-UAT-013-12.md) — Neg 004 spec has React-18 state-commit race (`setReactInputValue` + `form.requestSubmit()`).

Severity: **minor**.
Module: `uat/test-design`.
Status (current): `open`.
Reported: 2026-07-02 by BusinessAnalyst during wf-20260702-uat-059 / 03-uat-triage.md.

## Search for similar / duplicate issues

Searched registry for `uat/test-design`, `react`, `race`, `setReactInputValue`, `neg-004`, `plus-addressing`, `LeadCaptureForm`:

| Hit | Resolution |
|---|---|
| [ISS-UAT-013-6](../issues/ISS-UAT-013-6.md) | Original strengthening of Neg 004 (added the error-message matcher regex). It was about the assertion being vacuous. **This issue (-12) is the residual that escaped that fix** — the regex is correct, but the test never gets to the assertion because the form sits in `idle`. Not a duplicate; rather, the next-iteration refinement of the same test. |
| [ISS-UAT-013-11](../issues/ISS-UAT-013-11.md) | Sibling test-stability issue (BP-UAT-013 Steps 004/005/006 fixes were deferred). Closed 2026-07-02 in PR #85. Not a duplicate. |

No other matching issues. No duplicates to merge with.

## Classification confirmed

- **Bug class:** test-spec bug (interaction sequence), NOT product bug.
- **Product behaviour is correct** — verified live during pre-flight:
  - `POST /v1/leads {"email":"uat-lead+tag@example.com"}` →
    `400 {"formErrors":[],"fieldErrors":{"email":["Plus-addressed emails (name+tag@…) are not allowed."]}}`
  - Server rejection happens at NestJS `emailField()` zod schema
    (`apps/api/src/lib/email-schema.ts`).
- **Fix scope:** the Playwright test only. The fix does not change product code, schemas, or runtime configuration.

## Set

- `issue_ref: ISS-UAT-013-12` — recorded in `handoff.yaml`.

## Gate Result

```yaml
gate_result:
  status: passed
  attempt: 1
  timestamp: 2026-07-03T00:00:00Z
  summary: "ISS-UAT-013-12 already filed; classification confirmed (test-spec race, not product bug); no duplicates to merge."
  output_file: ".copilot/tasks/active/wf-20260703-fix-060/01-issue-lookup.md"
```
