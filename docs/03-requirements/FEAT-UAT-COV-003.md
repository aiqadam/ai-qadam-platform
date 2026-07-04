---
code: FEAT-UAT-COV-003
name: "BP-UAT-001 Playwright spec + bats regression for `--reset BP-UAT-001` idempotency"
status: Proposed
module: Workflow (WORKFLOW)
phase: DevEx
workflow_ref: wf-20260704-feat-090
---

## Description

BP-UAT-001 ("Event publication broadcast") is the first business process in
the UAT registry that has a fully populated fixture manifest
(`scripts/uat-fixtures/BP-UAT-001.json`, merged via PR #87, commit `fb01386`)
but **no corresponding Playwright spec** at `apps/e2e/tests/uat/BP-UAT-001.spec.ts`.
The deferred process-verification step in `wf-20260703-uat-064` (Path A) ran
the seed-reset + three curl probes; the executable end-to-end walkthrough was
honestly recorded as out-of-scope for that workflow and registered as the
narrow-gap child issue [ISS-UAT-COV-003](../../copilot/issues/ISS-UAT-COV-003.md)
(parent: [ISS-UAT-COV-001](../../copilot/issues/ISS-UAT-COV-001.md), itself
resolved via `wf-20260703-fix-067-coverage-registry` which queued 17 follow-up
spec workflows; this requirement consumes position 1 of that batch).

The user is a delivery manager learning to code through this project (AGENTS.md §0).
This feature ships one executable spec + one regression assertion so a future
`UATRunner` pass can flip BP-UAT-001's `Status: Ready → Implemented` with
verifiable evidence rather than a deferred-process attestation.

## Users

- The UATRunner agent (autonomous re-verification of every BP-UAT script).
- The Orchestrator (closed-loop: 17 queued follow-up workflows in
  `.copilot/tasks/queued/uat-bp-uat-coverage-batch/`).
- The BusinessAnalyst (Step 4 triage: status flip is gated on the spec passing).
- Human operators running `pnpm uat:seed --reset BP-UAT-001 && playwright test BP-UAT-001` locally.

## Functional scope

1. **Playwright spec under `apps/e2e/tests/uat/BP-UAT-001.spec.ts`** — mirrors
   the existing stylistic cousin (`BP-UAT-009.spec.ts`) and the pilot spec
   (`BP-UAT-010.spec.ts`) for one-document readability across the suite.
2. **Step mapping** to `docs/02-business-processes/uat/BP-UAT-001.md`:
   Steps 002, 003, 004, 005, 006 + Neg 001 + Neg 002 are author-owned here.
   Step 001 (operator OIDC sign-in) is generic-auth and lives in
   `BP-UAT-009.spec.ts` — the new spec references it (DRY) rather than
   re-authoring the Authentik submit helper.
3. **Recipient-count assertion (AC-3 of this FR):** UI does not surface
   `recipient_count` directly (BP-UAT-001 Step 006 note), so the spec reads
   the recipient list via a `page.route` interceptor on the announcement
   endpoint or a `request.get` direct call to the operator's bearer-token
   `/v1/workspace/events/:id/announce-ledger` API, whichever is already
   in use by `BP-UAT-010.spec.ts`. The assertion verifies that
   `uat-member-no-consent` is NOT in the list.
4. **Idempotency contract** for the spec — runs cleanly twice against the
   same stack by relying on `pnpm uat:seed --reset BP-UAT-001` before run
   (FR-WORKFLOW-003 §7 / `uat-verification.md` Step 2). No state cleanup
   is performed in the spec itself.
5. **Locator rule:** ARIA roles and stable text only (no CSS selectors),
   per `AGENTS.md §11`. Pattern matches
   `BP-UAT-009.spec.ts`'s `getByRole` / `getByLabel` / `getByText` usage.
6. **bats regression assertion** added to `scripts/tests/uat-seed.bats`
   confirming `--reset BP-UAT-001` produces the expected initial state
   across reruns (idempotency), matching the pattern established in
   `FR-WORKFLOW-003` rows 1–11 of the same file.

## Acceptance criteria

- [ ] AC-1: A file `apps/e2e/tests/uat/BP-UAT-001.spec.ts` exists and is
      picked up by `playwright.uat.config.ts`. The config's `testDir` is
      `./tests/uat` with no explicit `testMatch` (defaults to
      `**/*.spec.ts`), so the file is auto-included on the next
      `pnpm --filter @aiqadam/e2e exec playwright test --config apps/e2e/playwright.uat.config.ts`
      run without a config edit. (Verified by reading the config —
      config-edit is NOT required.)
- [ ] AC-2: The spec maps to BP-UAT-001.md's Steps 002, 003, 004, 005, 006
      plus Neg 001 and Neg 002. Step 001 (operator OIDC sign-in) is
      referenced from `BP-UAT-009.spec.ts` rather than re-authored. Each
      test uses ARIA-role locators and stable text (e.g. `getByRole`,
      `getByLabel`, `getByText`); CSS-class selectors are not used.
- [ ] AC-3: The spec asserts the recipient-count AC from BP-UAT-001.md
      (specifically that `uat-member-no-consent@…` is NOT in the recipient
      list). The assertion reads the recipient list via either a
      `page.route` interceptor on the announcement fetch, or an
      authenticated `request.get` against the operator's
      `/v1/workspace/events/:id/announce-ledger` endpoint — whichever is
      consistent with `BP-UAT-010.spec.ts`'s `apiGet` helper at the time
      of authorship. If a new `assertDesignSystem` fixture becomes
      available at `apps/e2e/support/assert-design-system.ts` (noted as
      missing in `BP-UAT-009.spec.ts`'s honesty header), the spec uses it.
- [ ] AC-4: The spec is idempotent across reruns. Pre-run hook invokes
      `pnpm uat:seed --reset BP-UAT-001` so the 5 fixtures in
      `scripts/uat-fixtures/BP-UAT-001.json` are restored to declared
      initial state before every execution; the spec itself does not
      perform state cleanup. Two consecutive runs against the same stack
      both pass.
- [ ] AC-5: A bats regression assertion is added to
      `scripts/tests/uat-seed.bats` confirming `pnpm uat:seed --reset
      BP-UAT-001` is idempotent across runs in `UAT_SEED_DIRECTUS_MOCK=1`
      mock mode. The assertion mirrors the FR-WORKFLOW-003 row-7
      `member_email` FK-resolution pattern
      (`uat-member-consented-consent … resolved to member=uat-member-consented`)
      and additionally asserts that `uat-member-no-consent` is NOT
      materialised with a `member_consents` row (this is the BP-UAT-001
      fixture contract — the *absence* of a consent row IS the fixture's
      declared initial state).

## Non-functional requirements

- **Visual evidence:** Every step captures a screenshot to
  `apps/e2e/uat-results/BP-UAT-001/<step-label>.png` (pattern from
  `BP-UAT-009.spec.ts`'s `shot()` helper). `playwright.uat.config.ts`'s
  `screenshot: 'on'` + `video: 'retain-on-failure'` is inherited
  automatically.
- **Honesty disclosure:** Where the spec asserts an *actual* behaviour
  that diverges from the script's text (the `uat-runner.md`
  "do not silently rewrite" rule), the spec records the divergence as a
  `test.info().annotations` block rather than weakening the assertion.
  Pattern reference: `BP-UAT-009.spec.ts` Step 002/004 honesty notes.
- **No new dependencies** — the spec and the bats test use only libraries
  already present in the workspace (Playwright, bats-core).

## Out of scope (v1)

- Live execution of the spec against the local stack (the
  `UATRunner`/`TestRunner` step). That is the orchestrator's responsibility
  after this requirement ships the spec + bats assertion. The
  BusinessAnalyst will flip BP-UAT-001's `Status: Ready → Implemented`
  only when the spec passes against a freshly-seeded stack.
- `apps/e2e/support/assert-design-system.ts` fixture creation — if it
  does not exist at spec-authorship time, the spec omits the fixture call
  rather than introducing a new test-only file (mirrors `BP-UAT-009.spec.ts`
  pattern).
- Specs for BP-UAT-002 … BP-UAT-018 — those are siblings resolved by
  positions 2–17 of the queued `uat-bp-uat-coverage-batch/`.

## Cross-references

- Closes: [ISS-UAT-COV-003](../../copilot/issues/ISS-UAT-COV-003.md)
  (parent: [ISS-UAT-COV-001](../../copilot/issues/ISS-UAT-COV-001.md))
- Realises: Position 1 of
  `.copilot/tasks/queued/uat-bp-uat-coverage-batch/handoff.yaml`
- Consumes runtime contract from: [FR-WORKFLOW-003](FR-WORKFLOW-003.md) — the
  `--reset <BP-UAT-NNN>` reset mode that AC-4 + AC-5 depend on. FR-WORKFLOW-003
  is Shipped; this requirement does not modify it.
- Operational reference: `apps/e2e/playwright.uat.config.ts`, the
  `BP-UAT-009.spec.ts` stylistic cousin, the `BP-UAT-010.spec.ts` pilot spec.
- Domain reference: `docs/02-business-processes/uat/BP-UAT-001.md` Steps 001–006 + Neg 001, 002.
- Process reference: `docs/02-business-processes/operations/event-publication-broadcast.md`
  (the source runbook BP-UAT-001 verifies).

## Notes

- Honest deviation from existing convention: the `FEAT-` prefix is used in
  the requirements layer (this file) instead of `FR-` because the
  handoff specified `requirement_ref: FEAT-UAT-COV-003` and the path
  `docs/03-requirements/FEAT-UAT-COV-003.md`. The prior `FEAT-WORKFLOW-002`
  precedent file lives at `.copilot/issues/FEAT-WORKFLOW-002.md`
  (per `.copilot/issues/registry.md`), not under `docs/03-requirements/`.
  This requirement follows the handoff's explicit path; the
  RequirementAnalyst flagged the deviation in
  `.copilot/tasks/active/wf-20260704-feat-090/01-requirement-validation.md`
  for user audit but did not block on it.
- The bats assertion (AC-5) is hermetic — `UAT_SEED_DIRECTUS_MOCK=1`
  short-circuits the live Directus calls, mirroring FR-WORKFLOW-003's
  bats coverage strategy. Live-mode verification remains the
  UATRunner's responsibility after this requirement ships.