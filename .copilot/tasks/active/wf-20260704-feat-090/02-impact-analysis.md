# Impact Analysis — FEAT-UAT-COV-003

> Author: ImpactAnalyzer
> Workflow: `wf-20260704-feat-090` (requirement-development)
> Source handoff: `.copilot/tasks/active/wf-20260704-feat-090/handoff.yaml`
> Source requirement: `docs/03-requirements/FEAT-UAT-COV-003.md`
> Source validation: `.copilot/tasks/active/wf-20260704-feat-090/01-requirement-validation.md`
> Source issue: `.copilot/issues/ISS-UAT-COV-003.md`
> Branch: `feat/UAT-COV-003-bp-uat-001-spec` (base: `main`)

## Validated Requirement

**FEAT-UAT-COV-003** — Author `apps/e2e/tests/uat/BP-UAT-001.spec.ts` (a Playwright UAT spec mirroring the BP-UAT-009/010 idioms) plus one row in `scripts/tests/uat-seed.bats` confirming `pnpm uat:seed --reset BP-UAT-001` idempotency. Closes `ISS-UAT-COV-003` (narrow child of resolved `ISS-UAT-COV-001`); consumes the runtime contract from `FR-WORKFLOW-003` (Shipped — `--reset <BP-UAT-NNN>` mode).

5 mandated ACs (per [FEAT-UAT-COV-003.md](../../docs/03-requirements/FEAT-UAT-COV-003.md)):

- **AC-1** Spec file exists at `apps/e2e/tests/uat/BP-UAT-001.spec.ts` and is auto-discovered by `playwright.uat.config.ts` (no config edit).
- **AC-2** Spec maps to `BP-UAT-001.md` Steps 002–006 + Neg 001 + Neg 002; references `BP-UAT-009.spec.ts` for Step 001 sign-in rather than re-authoring. ARIA-role / stable-text locators only.
- **AC-3** Spec asserts `uat-member-no-consent@…` is **NOT** in the recipient list, via `page.route` interceptor OR authenticated `request.get` to `/v1/workspace/events/:id/announce-ledger` (whichever matches `BP-UAT-010.spec.ts`'s `apiGet` helper at authorship time).
- **AC-4** Spec is idempotent across reruns; pre-run hook invokes `pnpm uat:seed --reset BP-UAT-001`. Spec itself does NOT spawn the seed.
- **AC-5** A bats regression block is added to `scripts/tests/uat-seed.bats` confirming `--reset BP-UAT-001` is idempotent in `UAT_SEED_DIRECTUS_MOCK=1` mock mode, including the *negative* assertion that `uat-member-no-consent` does **NOT** acquire a `member_consents` row on reset.

## Affected Layers

This is a **test-only** change. No application code, schema, or shared-types change.

| Layer | In scope? | Notes |
|---|---|---|
| **API (NestJS)** | No | No new endpoints, no controller changes. The spec calls existing `/v1/workspace/events/:id/announce-ledger` (already shipped, verified via `BP-UAT-010.spec.ts`'s `apiGet` idiom). |
| **DB Changes Required** | **No** | No migration, no DDL. The fixture manifest `scripts/uat-fixtures/BP-UAT-001.json` was already merged via PR #87 / commit `fb01386` (verified — file present and complete). |
| **Shared Types** | No | No new Zod schemas or TS types needed. |
| **Frontend (`apps/web`)** | **No** | BP-UAT-001.md Step 006 explicitly notes the operator UI does **not** surface `recipient_count` in v1. The spec asserts via authenticated API direct call or `page.route` interceptor — no UI affordance is added. |
| **Bot (`apps/bot`)** | No | Out of scope. |
| **Workers (`apps/workers`)** | No | Out of scope. |
| **E2E Test Suite (`apps/e2e`)** | **Yes — additive only** | One new spec file + auto-discovery via existing config glob. |
| **bats Regression (`scripts/tests/uat-seed.bats`)** | **Yes — append-only** | One new `@test "BP-UAT-001 row 12: …"` block; existing row structure preserved. |
| **Issue Registry** | **Yes — atomic flip in Step 9** | `ISS-UAT-COV-003` row flips `open` → `resolved`; `Workflow:` column populated with `wf-20260704-feat-090`. |
| **Docs (frontmatter)** | **Deferred** | `BP-UAT-001.md` `status: Ready → Implemented` flip is **out of scope** for this PR — BusinessAnalyst's responsibility during the downstream UATRunner workflow. |

## API Surface Changes

None. The spec consumes pre-existing endpoints only.

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| `/v1/workspace/events/:id/announce-ledger` | GET | None — read-only consumer | No |
| `/v1/notifications?…` | GET | None — referenced only as the AC-3/AC-7 helper idiom from `BP-UAT-010.spec.ts` (optional) | No |

No new endpoints introduced. No DTO changes. No breaking changes.

## Cross-Module Calls

None introduced. The spec invokes only:

| Caller | Called | Via |
|---|---|---|
| `BP-UAT-001.spec.ts` | Authentik OIDC sign-in (Step 001) | **Delegates to `BP-UAT-009.spec.ts`** — does NOT re-author the Authentik submit helper. |
| `BP-UAT-001.spec.ts` | api `/v1/workspace/events/:id/announce-ledger` | `request.get` with operator bearer token, mirroring `BP-UAT-010.spec.ts`'s `apiGet` helper. |
| `BP-UAT-001.spec.ts` (pre-run) | `pnpm uat:seed --reset BP-UAT-001` | **UATRunner responsibility**, NOT the spec (per `uat-verification.md` Step 2). |

## Files to Create / Modify

| File | Action | Reason |
|---|---|---|
| `apps/e2e/tests/uat/BP-UAT-001.spec.ts` | **CREATE** | New Playwright spec satisfying AC-1, AC-2, AC-3, AC-4. Mirrors the `BP-UAT-009.spec.ts` / `BP-UAT-010.spec.ts` idioms: `shot()` / `screenshot()` helper, `hideDevToolbar()` helper, `apiGet()` helper for the recipient-list probe, ARIA-role + stable-text locators only (AGENTS.md §11). |
| `scripts/tests/uat-seed.bats` | **MODIFY (append one row)** | New `@test "BP-UAT-001 row 12: --reset BP-UAT-001 idempotent in mock mode; uat-member-no-consent has no member_consents row"` block satisfying AC-5. Mirrors the existing `FR-WORKFLOW-003 row 7` `member_email → sibling identity fixture` idiom and additionally asserts that `uat-member-no-consent` is **not** materialised with a `member_consents` row (per the JSON manifest's `note` field — "Reset must NOT create a consent row for this member"). |
| `.copilot/issues/ISS-UAT-COV-003.md` | **MODIFY (Step 9, atomic flip)** | `Status: open → resolved`; `Resolution:` section populated with PR link + squash SHA + honesty-disclosure bullet. |
| `.copilot/issues/registry.md` | **MODIFY (Step 9, atomic flip)** | The existing `ISS-UAT-COV-003` row (line 41, severity `enhancement`, module `uat/coverage`) flips `Status: open → resolved` and the `Workflow:` column (currently `—`) is populated with `wf-20260704-feat-090` and the squash SHA. |

## Files NOT to Touch (with reasons)

| File | Reason |
|---|---|
| `apps/e2e/playwright.uat.config.ts` | Already glob-matches `tests/uat/**/*.spec.ts` — `testDir: './tests/uat'`, no explicit `testMatch`. **Verified by direct read** of the config. Adding a new file at the standard path is sufficient. |
| `scripts/uat-fixtures/BP-UAT-001.json` | Already merged via PR #87 / commit `fb01386`. **Verified by direct read** — fixture array contains all 5 expected rows. |
| `scripts/uat-seed.sh` | The `--reset <BP-UAT-NNN>` path already exists from `FR-WORKFLOW-003` (Shipped). AC-4 + AC-5 *consume* that contract; they do NOT modify the script. |
| `apps/web/src/**` | BP-UAT-001.md Step 006 explicitly notes the operator UI does not surface `recipient_count` in v1. **No UI changes ship in this PR.** The spec asserts via the operator's bearer-token `apiGet` against `/v1/workspace/events/:id/announce-ledger`, not via a new UI affordance. |
| `docs/03-requirements/requirements-registry.md` | That registry indexes only `FR-*` files (per its README + the existing implementation-order table). `FEAT-UAT-COV-003` lives at `docs/03-requirements/FEAT-UAT-COV-003.md` (handoff-explicit path, validated in Step 1) and is **NOT** added to `requirements-registry.md`. |
| `docs/02-business-processes/uat/BP-UAT-001.md` | The `status: Ready → Implemented` frontmatter flip is **deferred** to the downstream UATRunner workflow (BusinessAnalyst's responsibility, per `BP-UAT-001.md`'s own acceptance criterion "verified end-to-end against a freshly-seeded stack"). **Document this deferral in the PR description's "Out of scope" section.** |
| `apps/e2e/support/assert-design-system.ts` | Does not exist today. Per `uat-runner.md` spec-structure rules (and the honesty-note pattern already used in `BP-UAT-009.spec.ts:23-26` and `BP-UAT-010.spec.ts:33-36`), the spec omits the fixture call rather than introducing a new test-only file. |
| `apps/api/**`, `packages/shared-types/**`, `apps/bot/**`, `apps/workers/**` | No code in these layers changes for a test-only additive change. |

## Risks / Blast Radius

| Risk | Severity | Mitigation |
|---|---|---|
| Spec auto-included by Playwright config — extends the e2e test surface area | **Low** | The UAT config's `UAT_MEMBER_PASSWORD`-gated `test.skip(...)` pattern (per `BP-UAT-010.spec.ts:122`) prevents the spec from running when env vars are missing. Plus the inherited `retries: 0` + `expect.soft` semantics keep failures visible but non-flaky. |
| bats assertion appends ~30 lines to `scripts/tests/uat-seed.bats` | **Low** | Append-only; no structural change to the existing FR-WORKFLOW-003 rows (1–11). The `setup()` / `teardown()` env-clearing blocks remain untouched. |
| No DB migration, no schema change, no new env var, no new dependency, no production code path | **None** | Verified — `package.json` / `pnpm-lock.yaml` not modified; no new tokens, no new CSS, no DDL. |
| The spec may diverge from `BP-UAT-001.md`'s *actual* runtime behaviour (e.g., the operator UI does not surface recipient_count) | **Low** | Pattern from `BP-UAT-009.spec.ts` / `BP-UAT-010.spec.ts`: record divergences as `test.info().annotations` honesty-blocks rather than weakening assertions. The UATRunner downstream workflow is the right place to adjudicate. |
| Naming-convention drift (FEAT- prefix in `docs/03-requirements/` vs. the `FEAT-WORKFLOW-002.md` precedent under `.copilot/issues/`) | **Low** | Already flagged in `01-requirement-validation.md` for user audit; the handoff's explicit path is honored. |
| Registry drift — `ISS-UAT-COV-003` row exists at `registry.md:41` and the squash-commit must update both the issue file and the registry in one atomic commit | **Low** | Step 9 (registry update) uses a single atomic commit touching both files; the `Workflow:` column is populated in the same pass. |

**No security review required** — no auth surface changes; no token handling; no new env vars. The spec delegates to the already-trusted `BP-UAT-009.spec.ts` Authentik helper.

**No architecture rule risk** — module boundaries untouched (test-layer-only additive change).

## Open Gaps to Surface to CodeDeveloper

1. **AC-3 helper choice.** The handoff says "whichever is consistent with `BP-UAT-010.spec.ts`'s `apiGet` helper at the time of authorship". Verify by reading `BP-UAT-010.spec.ts` (the `apiGet` function near the top) — the spec uses `request.get` against `API_URL + path` with the authenticated context (Playwright auto-cookies from `page.context()` set by the prior sign-in flow). The recipient-list assertion reads via this helper; no separate `bearer token` plumbing is needed.
2. **AC-4 pre-run hook is the UATRunner's job, NOT the spec's.** Per `docs/04-development/testing/uat-verification.md` Step 2, the live UATRunner invokes `pnpm uat:seed --reset BP-UAT-001` *before* `playwright test BP-UAT-001`. The spec file MUST NOT spawn the seed itself. Document this as a one-line comment in the spec's header.
3. **`hideDevToolbar` duplication.** Both `BP-UAT-009.spec.ts` and `BP-UAT-010.spec.ts` carry their own `hideDevToolbar` helper. The new spec should mirror this idiom (small, local copy) rather than introducing a shared helper file — keeping the "one spec, one document" readability contract from `uat-runner.md` §Spec structure rules.
4. **`shot()` / `screenshot()` naming.** `BP-UAT-009.spec.ts` uses `shot()`; `BP-UAT-010.spec.ts` uses `screenshot()`. Recommendation: `screenshot()` (matches the Playwright `page.screenshot` API directly and is clearer to a reader unfamiliar with the BP-UAT-009 short-form convention).
5. **`uat-member-no-consent` exclusion assertion.** The JSON manifest's `note` field for that fixture is the canonical contract. The bats assertion must match the *string literal* that `uat-seed.sh` would emit (or not emit) in mock mode — verify against the existing FR-WORKFLOW-003 row-7 mock-output format in `scripts/tests/uat-seed.bats`.
6. **No `assertDesignSystem` fixture.** If a new shared fixture lands at `apps/e2e/support/assert-design-system.ts` between authoring and live execution, the spec may adopt it (per the FR's Non-functional requirements → "Honesty disclosure"). Otherwise, omit it (matches the BP-UAT-009 / BP-UAT-010 honesty-note pattern).

## Verification Surface for Downstream TestRunner

| Verification | Command | Expected outcome |
|---|---|---|
| bats regression (hermetic, mock mode) | `UAT_SEED_DIRECTUS_MOCK=1 bats scripts/tests/uat-seed.bats` | All existing FR-WORKFLOW-003 rows (1–11) still pass; new BP-UAT-001 row 12 passes. Total ~12 passing `@test` blocks; no `skip`. |
| Playwright config auto-discovers the new spec | `pnpm --filter @aiqadam/e2e exec playwright test --config apps/e2e/playwright.uat.config.ts --list BP-UAT-001` | Lists ≥ 5 test cases (Steps 002, 003, 004, 005, 006 + Neg 001 + Neg 002 from AC-2). |
| Live UAT execution against the local stack | `pnpm uat:seed --reset BP-UAT-001 && pnpm --filter @aiqadam/e2e exec playwright test --config apps/e2e/playwright.uat.config.ts BP-UAT-001` | All BP-UAT-001 tests pass; screenshots land in `apps/e2e/uat-results/BP-UAT-001/<step-label>.png`. **Out of scope for this workflow** — owned by the downstream UATRunner. |

**Out of scope for `wf-20260704-feat-090`** (and to be recorded as such in the PR description's "Out of scope" section, per AGENTS.md §6.1 honesty-disclosure rule):

- Live UATRunner re-run of BP-UAT-001 against the local stack. That is a separate downstream workflow per `docs/04-development/testing/uat-verification.md` Step 2 (BusinessAnalyst owns the `Status: Ready → Implemented` frontmatter flip on `docs/02-business-processes/uat/BP-UAT-001.md` once that live execution passes).
- Sibling specs for BP-UAT-002 … BP-UAT-018 (queued at positions 2–17 of `.copilot/tasks/queued/uat-bp-uat-coverage-batch/`).
- `apps/e2e/support/assert-design-system.ts` fixture creation.

## Gate Result

```yaml
gate_result:
  status: passed
  agent: ImpactAnalyzer
  workflow_id: wf-20260704-feat-090
  decided_at: "2026-07-04T20:00:00Z"
  summary: >-
    FEAT-UAT-COV-003 impact is fully bounded: 1 new Playwright spec
    (apps/e2e/tests/uat/BP-UAT-001.spec.ts), 1 append-only row in
    scripts/tests/uat-seed.bats, 2 atomic registry flips in Step 9
    (ISS-UAT-COV-003.md + registry.md). No application code, schema,
    shared-types, frontend, bot, or worker change. No new dependencies,
    no new env vars, no migration. The Playwright config already
    auto-discovers the new file (verified by direct read). The fixture
    manifest is already on main (PR #87 / fb01386). The bats assertion
    follows the established FR-WORKFLOW-003 row 7 idiom. Live UATRunner
    execution and the BP-UAT-001.md frontmatter flip are explicitly
    deferred (and documented in PR description) per AGENTS.md §6.1.
  affected_layers:
    - "apps/e2e (additive: new spec file)"
    - "scripts/tests (additive: one new bats row)"
    - ".copilot/issues (atomic Step-9 flip, two files)"
  affected_files_create:
    - path: apps/e2e/tests/uat/BP-UAT-001.spec.ts
      reason: "AC-1/AC-2/AC-3/AC-4 — new Playwright spec mirroring BP-UAT-009/010 idioms"
  affected_files_modify:
    - path: scripts/tests/uat-seed.bats
      reason: "AC-5 — append one new @test block ('BP-UAT-001 row 12') mirroring FR-WORKFLOW-003 row 7 idiom; FR-WORKFLOW-003 rows 1-11 untouched"
    - path: .copilot/issues/ISS-UAT-COV-003.md
      reason: "Step 9 atomic flip — Status: open → resolved; Resolution section populated"
    - path: .copilot/issues/registry.md
      reason: "Step 9 atomic flip — ISS-UAT-COV-003 row (currently line 41): Status + Workflow columns updated in same commit as issue file"
  affected_files_explicitly_not_touched:
    - path: apps/e2e/playwright.uat.config.ts
      reason: "testDir='./tests/uat' with no explicit testMatch; new file at standard path is auto-discovered"
    - path: scripts/uat-fixtures/BP-UAT-001.json
      reason: "Already merged via PR #87 / commit fb01386"
    - path: scripts/uat-seed.sh
      reason: "AC-4 + AC-5 consume the FR-WORKFLOW-003 --reset contract; script must not change"
    - path: apps/web/src/**
      reason: "BP-UAT-001.md Step 006: operator UI does not surface recipient_count in v1; spec asserts via API"
    - path: docs/03-requirements/requirements-registry.md
      reason: "Indexes FR-* files only; FEAT- prefix files live elsewhere (handoff path honored)"
    - path: docs/02-business-processes/uat/BP-UAT-001.md
      reason: "status: Ready → Implemented flip deferred to downstream UATRunner workflow (BusinessAnalyst); recorded in PR 'Out of scope' section"
    - path: apps/e2e/support/assert-design-system.ts
      reason: "Does not exist; per uat-runner.md spec-structure rules the spec omits the fixture call rather than introducing a new test-only file"
  risks:
    - severity: low
      description: "Playwright config auto-discovers the new spec, extending the UAT test surface area"
      mitigation: "UAT_MEMBER_PASSWORD-gated test.skip() pattern from BP-UAT-010.spec.ts prevents execution when env vars are missing; retries:0 keeps failures visible"
    - severity: low
      description: "bats assertion appends ~30 lines to scripts/tests/uat-seed.bats"
      mitigation: "Append-only; existing FR-WORKFLOW-003 rows 1-11 untouched"
    - severity: low
      description: "Spec may diverge from BP-UAT-001.md's runtime behaviour (e.g., recipient_count UI surface)"
      mitigation: "Honesty-note pattern from BP-UAT-009/BP-UAT-010 spec headers; record divergences as test.info().annotations rather than weakening assertions"
    - severity: low
      description: "Naming-convention drift (FEAT- in docs/03-requirements/ vs FEAT-WORKFLOW-002 precedent in .copilot/issues/)"
      mitigation: "Already flagged in 01-requirement-validation.md for user audit; handoff path honored"
    - severity: low
      description: "Registry drift — atomic commit must update both issue file and registry row in one commit"
      mitigation: "Step 9 uses a single atomic commit touching both files"
  security_review_required: false
  architecture_rule_risks: []
  deferred_to_downstream:
    - "Live UATRunner re-run of BP-UAT-001 against the local stack (uat-verification.md Step 2; BusinessAnalyst owns)"
    - "docs/02-business-processes/uat/BP-UAT-001.md status: Ready → Implemented frontmatter flip (BusinessAnalyst, post-live-run)"
    - "Sibling specs for BP-UAT-002..BP-UAT-018 (queued positions 2-17 of .copilot/tasks/queued/uat-bp-uat-coverage-batch/)"
    - "apps/e2e/support/assert-design-system.ts fixture creation (out of v1 scope per Non-functional requirements)"
  verification_surface:
    hermetic:
      - command: "UAT_SEED_DIRECTUS_MOCK=1 bats scripts/tests/uat-seed.bats"
        expected: "All FR-WORKFLOW-003 rows 1-11 still pass; new BP-UAT-001 row 12 passes"
    config_discovery:
      - command: "pnpm --filter @aiqadam/e2e exec playwright test --config apps/e2e/playwright.uat.config.ts --list BP-UAT-001"
        expected: "Lists >= 5 test cases (Steps 002-006 + Neg 001 + Neg 002 from AC-2)"
    live_out_of_scope:
      - command: "pnpm uat:seed --reset BP-UAT-001 && pnpm --filter @aiqadam/e2e exec playwright test --config apps/e2e/playwright.uat.config.ts BP-UAT-001"
        expected: "All BP-UAT-001 tests pass; screenshots land in apps/e2e/uat-results/BP-UAT-001/<step-label>.png"
        owner: "downstream UATRunner workflow"
  findings:
    - "Architectural feasibility confirmed: playwright.uat.config.ts auto-discovers tests/uat/*.spec.ts with no config edit; bats assertion follows the FR-WORKFLOW-003 row 7 member_email-resolution idiom; no new dependencies required."
    - "AC-3 helper pattern (apiGet) verified at BP-UAT-010.spec.ts — the new spec uses request.get within the authenticated context (Playwright auto-cookies from the prior sign-in)."
    - "AC-4 pre-run seed is the UATRunner's responsibility, NOT the spec's — per uat-verification.md Step 2. Spec must NOT spawn the seed itself."
    - "Honesty disclosure required: BP-UAT-001.md frontmatter flip (status: Ready → Implemented) is deferred to the downstream UATRunner workflow. Recorded in PR description 'Out of scope' section per AGENTS.md §6.1."
    - "Naming observation (non-blocking): FEAT- prefix file lives at docs/03-requirements/FEAT-UAT-COV-003.md per handoff-explicit path; precedent FEAT-WORKFLOW-002.md lives at .copilot/issues/. DocWriter can re-locate if user prefers Option B."
  passed: true
```