# ISS-UAT-COV-003 — BP-UAT-001 process verification: no Playwright spec authored; uat-064 deferred the live Playwright run

| Field | Value |
|---|---|
| ID | ISS-UAT-COV-003 |
| Severity | enhancement |
| Module | uat/coverage |
| Status | **open** |
| Reported | 2026-07-03 |
| Reporter | Orchestrator (wf-20260703-uat-064, Step 4 — registry update) |
| Related | [ISS-UAT-COV-001](ISS-UAT-COV-001.md) (parent — 18 of 19 BP-UAT scripts have no Playwright spec). BP-UAT-001 was the #1 gap on that list; this issue is the BP-UAT-001-specific entry carved out so it can be tracked separately when a focused workflow addresses it. |

## Symptom

BP-UAT-001 ("Event publication broadcast — member_consents events
purpose gates the recipient count for the publication broadcast call")
has a process description in
`docs/02-business-processes/uat/BP-UAT-001.md` (including the seed
fixtures table that was promoted to JSON in PR #87 / commit `fb01386`)
but **no Playwright spec under `apps/e2e/tests/uat/BP-UAT-001.spec.ts`**.

Other BP-UAT-* scripts have specs (e.g., `BP-UAT-009.spec.ts`,
`BP-UAT-013.spec.ts`) but BP-UAT-001, BP-UAT-002…018 do not.

## What was deferred in wf-20260703-uat-064

Path A of that workflow (verbatim from the user's choice):
"verify the deferred ACs (AC-1/2/3 from fix-064) via
`pnpm uat:seed --reset BP-UAT-001` + 3 curl probes; honestly
document that BP-UAT-001's full Playwright-based process verification
is blocked by missing spec."

So AC-4 and AC-5 from the original FR-WORKFLOW-003 functional-scope
checklist are NOT re-classified. The Playwright spec is the missing
blocker.

## Required for close

1. Author `apps/e2e/tests/uat/BP-UAT-001.spec.ts`. The spec should
   map to BP-UAT-001.md's steps (the existing README/template
   `BP-UAT-009.spec.ts` is the closest stylistic cousin):
   - **Step 002**: operator opens draft event in Backoffice → status
     badge shows DRAFT
   - **Step 003**: operator clicks "Publish & broadcast" → recipient
     count UI excludes the member with no consent
   - **Step 004**: operator confirms broadcast → API logs the
     recipient list excluding the non-consented member
   - The spec asserts on stable text + ARIA roles, not CSS
     selectors (per the design-system rules in `AGENTS.md` §11)
2. Wire the spec into `playwright.uat.config.ts`'s `testMatch`
   pattern (already globbed for `BP-UAT-*.spec.ts`, so no config
   change needed once the file is added).
3. Add a bats-style assertion in `scripts/tests/uat-seed.bats`
   (referenced from `FR-WORKFLOW-003.md`) confirming that
   `--reset BP-UAT-001` keeps producing the expected BP-UAT-001
   state across runs (idempotent reset).

## Recommended workflow to resolve

`wf-20260703-feat-065-bp-uat-001-spec` (or any future counter).
Suggested module path:

- **`test-designer`**: author `apps/e2e/tests/uat/BP-UAT-001.spec.ts`
  per BP-UAT-001.md's steps + the recipient-count assertion
  (this is what ISS-UAT-001-1 was really about — gating).
- **`code-developer`** (only if a UI assertion fails): backstop any
  missing `data-testid` or ARIA label on the recipient-count UI.
- **`test-runner`**: run the spec against the live local stack
  (api on :3000, web on :4321, Directus on :8200, Authentik on
  :9000), report the screenshot grid to `BusinessAnalyst`.
- **`business-analyst`**: triage results, flip BP-UAT-001 status
  from `Ready` to `Implemented` only when the spec passes against
  a freshly-seeded stack.
- **`quality-gate`**: confirm spec file exists + passes locally +
  registry entry updated.

## Verification deferred

Until the spec is added + run, **BP-UAT-001 remains
"process-not-verified"**: the fixture reset works (after
ISS-UAT-BRIDGE-001 is also fixed), but no end-to-end test asserts
that the operator-facing UI flow uses the consent rows to gate the
recipient list.

## Notes

- This issue is intentionally a child of `ISS-UAT-COV-001` rather
  than a duplicate. The COV-001 entry tracks the **broad** gap
  (18/19 BP-UAT scripts); this one tracks the **narrow** gap
  (BP-UAT-001 specifically, because uat-064 already touches
  BP-UAT-001 and a focused workflow can close it without needing
  to address all 18).
- The fix-064 + uat-064 work already brought us to "fixtures reset
  correctly"; the missing piece is "process verifies end-to-end".
