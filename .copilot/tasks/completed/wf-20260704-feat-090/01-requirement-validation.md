# Requirement Validation — FEAT-UAT-COV-003

> Author: RequirementAnalyst
> Workflow: `wf-20260704-feat-090` (requirement-development)
> Source handoff: `.copilot/tasks/active/wf-20260704-feat-090/handoff.yaml`
> Source issue: `.copilot/issues/ISS-UAT-COV-003.md`
> Source script: `docs/02-business-processes/uat/BP-UAT-001.md`
> Source fixture manifest: `scripts/uat-fixtures/BP-UAT-001.json`

## Raw Input

The handoff asks me to:

1. Validate `FEAT-UAT-COV-003` against the existing feature base — no
   duplicate, no architectural conflict with `FR-WORKFLOW-002` (already
   Shipped, per `FR-WORKFLOW-001.md`'s "deferred to FEAT-WORKFLOW-002" note —
   though **no FR file exists at the path; the FEAT-WORKFLOW-002 file
   lives at `.copilot/issues/FEAT-WORKFLOW-002.md`** per the issue
   registry) or `FR-WORKFLOW-003` (Shipped).
2. Formalize the ACs (numbered AC-1…AC-5) into a new requirement file
   `docs/03-requirements/FEAT-UAT-COV-003.md`.
3. Write this validation artifact and a Gate Result block.

The handoff's "5 ACs to formalize" mandate is reproduced verbatim and
unmodified below; the rest of the formalization layers in cross-references,
honesty notes, and out-of-scope boundaries in the same shape as the
existing FR files (e.g. `FR-WORKFLOW-003.md`).

## Analysis

### Completeness Issues Found

None at the validation layer. The handoff-supplied AC list (AC-1 through
AC-5) is specific, testable, scoped to one module layer (the e2e tests
suite + bats regression under `scripts/tests/`), and references the
authoritative source documents (BP-UAT-001.md + the JSON manifest that
already merged via PR #87 commit `fb01386`).

Two implicit assumptions were surfaced and resolved in the formal
requirement without escalation:

- **Locators.** The handoff mandates ARIA roles and stable text, not CSS
  selectors. Verified against `AGENTS.md §11` (design-system rules).
  This is already the pattern in `BP-UAT-009.spec.ts` and `BP-UAT-010.spec.ts`;
  no new test-design choice is required.
- **Recipient-count surface.** BP-UAT-001.md's Step 006 explicitly notes
  the operator UI does not surface `recipient_count`. The handoff
  prescribes a network-tap or API-direct call; that maps cleanly onto the
  `apiGet` helper and `page.route` interceptor patterns already in
  `BP-UAT-010.spec.ts`. No new API surface required.

### Conflicts with Existing Features

| Existing surface | Conflict? | Evidence |
|---|---|---|
| `FR-WORKFLOW-001` (Shipped — context drift guard) | None | Different concern (drift detection vs executable UAT spec). |
| `FR-WORKFLOW-003` (Shipped — `--reset` reset mode) | **None — downstream consumer.** | This requirement *requires* `pnpm uat:seed --reset BP-UAT-001` to be idempotent (AC-4 + AC-5); FR-WORKFLOW-003 already ships that contract. The bats assertion in AC-5 is a regression test *for* the FR-WORKFLOW-003 contract against the BP-UAT-001 fixture manifest specifically. |
| `FEAT-WORKFLOW-002` (resolved via PR #15, per `.copilot/issues/registry.md`) | None | Different surface (bats harness + shellcheck CI for the drift guard). No FR file exists; the issue file lives at `.copilot/issues/FEAT-WORKFLOW-002.md`. No conflict. |
| `ISS-UAT-COV-001` (resolved — coverage registry infra) | None — parent. | This requirement closes the narrow child `ISS-UAT-COV-003`; the broad parent already shipped the registry + queued 17 follow-up workflows. |
| `ISS-UAT-013-…` series (resolved) | None | Different BP-UAT (013 = signup; 001 = publication broadcast). |
| `BP-UAT-009.spec.ts` / `BP-UAT-010.spec.ts` / `BP-UAT-013-signup.spec.ts` | None — sibling. | New spec lives at the same path pattern (`tests/uat/BP-UAT-001.spec.ts`), uses the same helper idioms (`shot()`, `hideDevToolbar()`, `apiGet()`). |

No conflicts. No duplicates.

### Architectural Feasibility

Verified by reading the existing config and convention files:

| Verification | Evidence |
|---|---|
| `apps/e2e/playwright.uat.config.ts` `testDir: './tests/uat'` with no explicit `testMatch` — defaults to `**/*.spec.ts` so a new file at `tests/uat/BP-UAT-001.spec.ts` is auto-discovered. | file: `apps/e2e/playwright.uat.config.ts` (read in this session, lines 55-58) |
| `scripts/tests/uat-seed.bats` already has 11 FR-WORKFLOW-003-style assertions under `@test "FR-WORKFLOW-003 row N: …"` — adding a row-12 BP-UAT-001 idempotency assertion follows the established pattern. | file: `scripts/tests/uat-seed.bats` (read in this session; rows 7–11 of FR-WORKFLOW-003 at lines 200–260; mock-mode test methodology at lines 1–20) |
| `BP-UAT-001.md`'s declared fixtures match `scripts/uat-fixtures/BP-UAT-001.json`'s `fixtures[]` array 1:1 (`uat-operator`, `uat-member-consented`, `uat-member-no-consent`, `uat-event-draft-uz`) — manifest was promoted to JSON in PR #87 commit `fb01386` and the absence-of-consent rule for `uat-member-no-consent` is encoded in the manifest's `note` field. | file: `scripts/uat-fixtures/BP-UAT-001.json` (read in this session; `uat-member-no-consent` row's note explicitly states "Reset must NOT create a consent row for this member") |
| Stylistic cousins exist (`BP-UAT-009.spec.ts` + `BP-UAT-010.spec.ts`) — new spec authors against well-established idioms (ARIA roles, `hideDevToolbar`, `shot`, `apiGet`, honesty-note headers). | files read in this session |

No architectural blockers. No new dependencies required. No new tokens,
no new CSS, no DDL — this requirement is purely a new Playwright spec
file + one row in an existing bats file.

### Naming Observation (non-blocking, surfaced for user audit)

The requirement is being written to `docs/03-requirements/FEAT-UAT-COV-003.md`
with the `FEAT-` prefix because the handoff specified
`requirement_ref: FEAT-UAT-COV-003` and that explicit path. The
established `FEAT-*` precedent file at `.copilot/issues/FEAT-WORKFLOW-002.md`
lives under `.copilot/issues/`, **not** `docs/03-requirements/` — that
precedent uses the issue-prefix location, not the FR file location.

Two paths forward:

- **Option A (chosen for this artifact):** Honor the explicit handoff
  path; write the formal requirement to `docs/03-requirements/`. This
  aligns the file with the requirement-analyst role's prescribed
  `FEAT-<MODULE>-<NNN>.md` output format and mirrors FR-WORKFLOW-001/-003's
  location in the same directory.
- **Option B:** Move the file to `.copilot/issues/FEAT-UAT-COV-003.md`,
  matching the `FEAT-WORKFLOW-002.md` precedent. Would require a
  handoff.yaml edit by the Orchestrator (the `requirement_ref:` field
  would then point at the issues path).

I have chosen Option A because: (1) the handoff is explicit; (2) the
requirement-analyst role explicitly says the file format is
`FEAT-<MODULE>-<NNN>` and lists the requirements layer as the destination;
(3) the user's AGENTS.md §14 grants the user final authority over
naming; (4) DocWriter downstream can fix the path if the user prefers.

## Formalized Requirement

> [`FEAT-UAT-COV-003`](../../../../docs/03-requirements/FEAT-UAT-COV-003.md)
> — BP-UAT-001 Playwright spec + bats regression for `--reset BP-UAT-001`
> idempotency. Closes `ISS-UAT-COV-003`. Consumes runtime contract from
> `FR-WORKFLOW-003` (Shipped).

## Acceptance Criteria (draft)

Reproduced from the formalized requirement file (`01-requirement-validation.md`
→ `docs/03-requirements/FEAT-UAT-COV-003.md`):

- AC-1: Spec file exists at `apps/e2e/tests/uat/BP-UAT-001.spec.ts` and
  is auto-discovered by `playwright.uat.config.ts` (no config edit).
- AC-2: Spec maps to BP-UAT-001.md Steps 002–006 + Neg 001/002; references
  BP-UAT-009 for Step 001 sign-in rather than re-authoring it. All
  locators are ARIA-role or stable text — no CSS-class selectors.
- AC-3: Spec asserts the recipient-list absence of
  `uat-member-no-consent` via `page.route` interceptor or authenticated
  `/v1/workspace/events/:id/announce-ledger` API call (whichever is
  idiomatic with `BP-UAT-010.spec.ts`'s `apiGet` helper).
- AC-4: Spec is idempotent across reruns; pre-run hook invokes
  `pnpm uat:seed --reset BP-UAT-001` (no in-spec state cleanup).
- AC-5: bats assertion added to `scripts/tests/uat-seed.bats`
  confirming `--reset BP-UAT-001` is idempotent in mock mode, including
  the negative assertion that `uat-member-no-consent` does NOT acquire
  a `member_consents` row on reset.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "FEAT-UAT-COV-003 is consistent with existing features (no duplicate, no architectural conflict); all 5 mandated ACs are specific, testable, and scoped to one module layer; naming-convention deviation flagged for user audit and accepted by the handoff's explicit path."
  findings:
    - "No conflicts with FR-WORKFLOW-001 (Shipped — different concern)."
    - "No conflicts with FR-WORKFLOW-003 (Shipped — this requirement consumes the --reset BP-UAT-NNN contract and adds a BP-UAT-001-specific bats regression). FR-WORKFLOW-002 has no FR file at docs/03-requirements/ (FEAT-WORKFLOW-002 lives in .copilot/issues/) — unrelated surface."
    - "No conflicts with ISS-UAT-COV-001 (resolved — coverage-registry parent) or any other registered issue."
    - "Architectural feasibility: playwright.uat.config.ts auto-discovers tests/uat/*.spec.ts with no config change; bats assertion follows the existing FR-WORKFLOW-003 row pattern; no new dependencies required."
    - "Naming observation (non-blocking): handoff directed docs/03-requirements/FEAT-UAT-COV-003.md; FEAT-WORKFLOW-002 precedent lives in .copilot/issues/. Honored handoff path. DocWriter can re-locate if user prefers Option B."
    - "Honesty disclosure required for downstream agents: the bats assertion must be hermetic (UAT_SEED_DIRECTUS_MOCK=1) per FR-WORKFLOW-003 convention; live-mode verification is the UATRunner's responsibility after this requirement ships."
```

## Out-of-scope reminder (for downstream agents)

- **DocWriter**: do NOT add `FEAT-UAT-COV-003` to
  `docs/03-requirements/requirements-registry.md` in this PR — the FR
  registry indexes only `FR-*` files (per the README + the existing
  implementation-order table). If the user elects Option B (move the file
  to `.copilot/issues/`), the Orchestrator instead amends
  `.copilot/issues/registry.md`.
- **CodeDeveloper / TestDesigner**: do NOT modify the playwright config,
  the bats file's structural shape, or the fixture manifest. Only add
  the new spec file + one new `@test "BP-UAT-001 idempotency"` block.
- **TestRunner**: live-mode execution against the local stack remains a
  subsequent workflow (UATRunner in `uat-verification.md` Step 3); this
  requirement's verification is hermetic bats assertions in mock mode.
- **QualityGate**: AC-by-AC disposition is the QualityGate's job; this
  document only validates the requirement's consistency, not its runtime
  behavior.