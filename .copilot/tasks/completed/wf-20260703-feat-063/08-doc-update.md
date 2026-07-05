# Doc Update — wf-20260703-feat-063

**Agent:** DocWriter
**Step:** 9 (requirement-development workflow)
**Requirement ref:** `FR-WORKFLOW-003`

---

## Documents Updated

| Document | Section | Change Description |
|---|---|---|
| `docs/03-requirements/FR-WORKFLOW-003.md` | Frontmatter `status:` | Flipped `Proposed` → `Implemented`, per the DocWriter table's "New feature shipped" row. |
| `docs/03-requirements/FR-WORKFLOW-003.md` | Acceptance criteria (AC-1 through AC-7) | Checked all 7 boxes `[ ]` → `[x]`. Justified by `07-test-results.md`'s Coverage section, which independently re-ran (not copied from TestDesigner) the full bats suite and mapped each of the 7 ACs to at least one currently-passing, specifically-identified test (e.g. AC-4 → `ok 12`/`ok 13`; AC-5 → `ok 23`/`ok 24`; AC-6 → `bash -n` + `ok 22` + `ok 16` + full-suite green). TestRunner's Gate Result is `status: passed` with zero failed tests. |
| `docs/03-requirements/requirements-registry.md` | Row 63, Status column | Flipped `Proposed` → `Shipped`, matching the exact literal string used by every other shipped row in the same "FR implementation order" table (verified against row 62, `FR-WORKFLOW-001 | Shipped | —`, and rows 1–61 which use the same bare word with no qualifier). |

Both edits above are the required atomic pair per `.copilot/schemas/protocol.md`'s "Status-Consistency Check (FEAT-WORKFLOW-003)" section, table row `requirement-development`: `docs/03-requirements/FR-<CODE>.md` (status frontmatter) + `docs/03-requirements/requirements-registry.md` (Status column), terminal status `Implemented` / `Shipped`. Both are staged together and will ride the same commit/PR as the rest of this workflow's artifacts (via `scripts/workflow-finish.sh` Step C), satisfying the atomicity rule ("no separate post-merge status commit is permitted").

---

## Documents Not Updated

- **`docs/02-business-processes/uat/BP-UAT-001.md`** — already updated by CodeDeveloper (per `03-code-summary.md`'s Files Changed table: added `id` column to the "Seed Fixtures Required" table plus a lead-in sentence on reset-vs-recreate semantics). Confirmed by direct read: the `id` column and lead-in text are present and match the manifest's fixture ids (`uat-operator`, `uat-member-consented`, `uat-member-no-consent`, `uat-event-draft-uz`). No redundant edit needed.
- **`docs/02-business-processes/uat/BP-UAT-013.md`** — already updated by CodeDeveloper (added `id` column to the 4-column fixture table; the "Mail catcher" infra row's `id` cell is `—` as specified). Confirmed by direct read: table is in its final, consistent state (5 rows including the infra row, all matching the manifest or explicitly exempted). No redundant edit needed.
- **`docs/02-business-processes/uat/BP-UAT-template.md`** — already updated by CodeDeveloper (added `id` column to the canonical 2-column template example, plus the exemption note for infra rows). Confirmed by direct read: template section is final and consistent with the pattern applied to BP-UAT-001/013. No redundant edit needed.
- **`.copilot/agents/business-analyst.md`** — already updated by CodeDeveloper. Confirmed by direct read: both tables that needed the manifest/doc-drift row for AC-5 carry it — the Step 1 process checklist (2-col, `Check | Pass condition`, row: `manifest matches doc fixture table (if BP-UAT has a scripts/uat-fixtures/<NNN>.json) | PASS/FAIL/N/A — diff named on FAIL`) and the `01-uat-script-validation.md` output-file-format table (3-col, `Check | Result | Notes`, matching row present). No redundant edit needed.
- **`.copilot/workflows/uat-verification.md`** — already updated by CodeDeveloper. Confirmed by direct read: Step 2 pre-flight documents `pnpm uat:seed --reset <BP-UAT-NNN>` for BP-UATs with a manifest (BP-UAT-001, BP-UAT-013), keeps plain `pnpm uat:seed` as the fallback for the other 16, and the Gate section states a non-zero exit from `--reset` is `failed-escalate`. No redundant edit needed.
- **`docs/04-development/architecture/architecture.md`** — not updated. This FR introduces no new module or module-boundary change: it is entirely outside `apps/api/src/modules/*` (confirmed by both RequirementAnalyst's Architectural Feasibility analysis and CodeDeveloper's Architecture Rule Compliance section — no NestJS module touched, no cross-schema query, no new tenant-scoping precedent). The FR is DevEx/tooling-layer only (`scripts/uat-seed.sh`, manifests, docs).
- **`docs/api/` (OpenAPI supplement)** — not updated. No new or changed API endpoint; `--reset` is a CLI-invoked bash mode calling Directus's/Authentik's own already-used REST surfaces, not a new endpoint on this repo's API.
- **New ADR under `docs/adr/`** — not created. Per the task instructions and RequirementAnalyst's own Architectural Feasibility section: this is an incremental capability on existing UAT tooling (extending `uat-seed.sh`'s idempotency model), not an architecture decision. No new precedent, no new module boundary, no reversal of an existing decision.
- **`docs/04-development/standards.md`** — not updated. No new coding convention or pattern is introduced for the TypeScript/NestJS/React codebase this file governs; the new bash functions (`reset_localhost_guard`, `reset_domain_fixture`, etc.) follow the file's own pre-existing idioms (per CodeDeveloper's Key Design Decisions and Formatter Check sections), not a new convention worth codifying separately.
- **`docs/04-development/security/security.md`** — not updated. SecurityReviewer's `04-security-review.md` found no new invariant needed (per this task's own instructions, confirming that review's conclusion) — the reset mode reuses existing bearer-token/credential patterns verbatim and adds a defense-in-depth localhost guard, it does not introduce a new security rule that needs codifying at the standards level.
- **`docs/runbooks/<slug>.md`** — not created. No new operational scenario requiring a runbook; the reset invocation is already documented inline in `uat-verification.md` Step 2, which is itself the operational document for this scenario.
- **`packages/shared-types/README.md`** — not updated. No new shared-types schema; this FR has no TypeScript/Zod surface at all (bash + JSON manifests + Markdown only).

---

## Context Update Block — Reasoning

Read `scripts/workflow-finish.sh`'s `parse_context_block()` (lines 84–129) and `apply_registry_row()` (lines 131–153) directly before finalizing this block.

**`apply_registry_row()` is additive-only, not a targeted row edit.** Its body is exactly:
```bash
echo "" >> "$registry_file"
echo "$row" >> "$registry_file"
```
preceded by an idempotency guard that greps the file for `\[${new_fr_id}\]` (the FR/FEAT id extracted from the row's own text via `grep -oE '(FR|FEAT)-[A-Z0-9]+-[0-9]+'`) and skips the append entirely if that bracketed-link substring already exists anywhere in the file.

Row 63 of `docs/03-requirements/requirements-registry.md` already reads:
`| 63 | [FR-WORKFLOW-003](FR-WORKFLOW-003.md) | ... | Shipped | ... |`
— i.e. the literal substring `[FR-WORKFLOW-003]` is already present, because I (DocWriter) edited that row directly, in place, in this same step (see Documents Updated above). This was true even before my edit (the row existed with `Proposed`), so the idempotency guard would have already skipped an append attempt either way.

**Decision: omit `registry_row` from the `context_update:` block (leave it empty).** Reasoning:
1. The registry row edit is genuinely already done — a direct, in-place status-column flip, not a new row that needs appending. `apply_registry_row()` has no "find and edit row N" mode; it only appends new rows to the end of the file. Populating `registry_row` with FR-WORKFLOW-003 content would either (a) be silently skipped by the idempotency guard (harmless but pointless — the guard matches on `[FR-WORKFLOW-003]` which is already present), or (b) in a hypothetical future where the guard's regex or matching logic changes, risk appending a **second, duplicate row 64** for the same FR at the bottom of the table, corrupting the registry's "one row per FR" invariant and its documented implementation-order sort.
2. Per `apply_context_sync_update()` (lines 235–309): if `CTX_REGISTRY_FILE` or `CTX_REGISTRY_ROW` is empty, it logs `"ERROR: context_update block missing registry_file or registry_row."` and returns 1 — a hard failure of Step F.5, not a silent no-op. So I cannot simply omit `registry_file`/`registry_row` as a pair from the block without breaking Step F.5 entirely (it would abort with an error rather than skipping gracefully).
3. **Resolution:** provide `registry_file` (required, non-empty, so the pre-check passes) but set `registry_row` to a value that is a guaranteed no-op through the idempotency guard rather than truly empty — i.e. reference the already-present `[FR-WORKFLOW-003]` id so `apply_registry_row()`'s own grep matches and it prints `"Idempotency: registry row for FR-WORKFLOW-003 already present — skipping append."` and returns 0 without touching the file. This uses the script's own designed idempotency mechanism rather than fighting it, and is the safe choice: it cannot duplicate the row, and it satisfies the non-empty-field precondition so Step F.5 doesn't hard-fail.

The `workspace_state_row` fields are populated normally — `apply_workspace_state_row()` (lines 155–191) is a genuine append-under-section operation (splices the row in just before the next `## ` heading, or creates the section if absent) with no equivalent risk, since no row for `wf-20260703-feat-063` exists yet in `workspace-state.md`.

```yaml
context_update:
  registry_file: docs/03-requirements/requirements-registry.md
  registry_row: |
    <!-- no-op marker: row 63 already contains [FR-WORKFLOW-003](FR-WORKFLOW-003.md) with Status=Shipped, edited in place by DocWriter in this same step. This line exists only so apply_registry_row()'s own idempotency guard (grep for the bracketed FR id) matches and skips the append — see "Context Update Block — Reasoning" above for why registry_row is deliberately not left blank. --> | [FR-WORKFLOW-003](FR-WORKFLOW-003.md) | UAT fixture state reset — order-independent, re-entrant UAT runs | Shipped | WORKFLOW-002 (UAT infra, shipped) |
  workspace_state_section: "Completed Workflows (recent)"
  workspace_state_row: "| wf-20260703-feat-063 | requirement-development | FR-WORKFLOW-003 UAT fixture state reset — order-independent, re-entrant UAT runs | feature/FR-WORKFLOW-003-uat-fixture-reset | <PR-pending> | 2026-07-03 |"
```

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "FR-WORKFLOW-003.md status frontmatter flipped Proposed -> Implemented and all 7 ACs checked (each backed by a specific, independently-re-run passing test per 07-test-results.md's Coverage section); requirements-registry.md row 63 Status flipped Proposed -> Shipped, matching the exact convention of every other shipped row (verified against row 62, FR-WORKFLOW-001). Both edits satisfy the Status-Consistency Check atomic pair for requirement-development workflows and will be staged/committed together with the rest of this workflow's artifacts. All 5 doc/agent-definition files CodeDeveloper touched (BP-UAT-001.md, BP-UAT-013.md, BP-UAT-template.md, business-analyst.md, uat-verification.md) were independently re-read and confirmed already in final, consistent state -- no redundant edits made. No architecture.md, ADR, standards.md, security.md, runbook, or shared-types update warranted, per direct confirmation of the FR's DevEx-only, no-new-module, no-new-invariant scope. context_update: block included with registry_row deliberately set to a no-op value (idempotency-guard-matching row text) rather than genuinely empty, since apply_context_sync_update() hard-fails (return 1) on an empty registry_row field, and apply_registry_row() has no in-place-edit mode -- only append -- so populating it with real new-row content would risk a duplicate row 64 for the same FR."
  findings:
    - "requirements-registry.md's 'Shipped' convention (row 62, FR-WORKFLOW-001, and all shipped rows 1-61) uses the bare word 'Shipped' with no qualifier in the Status column -- row 63 now matches exactly."
    - "All 7 ACs checked based on TestRunner's (not TestDesigner's) independently-re-run Coverage section in 07-test-results.md, which names a specific passing bats assertion id (e.g. ok 10, ok 12/13, ok 16, ok 22, ok 23/24, ok 25) or direct command result (bash -n exit 0) for each AC -- not a blanket assumption from the code summary alone."
    - "apply_registry_row() (scripts/workflow-finish.sh lines 131-153) is confirmed append-only with an idempotency guard keyed on a bracketed FR/FEAT id substring already present anywhere in the file -- it has no mechanism to edit an existing row in place. Since DocWriter already made the in-place edit directly, the context_update block's registry_row is set to a value that trips the same idempotency guard (rather than left blank, which would hard-fail Step F.5's precondition check) so Step F.5 is a documented, intentional no-op on the registry file specifically, while still populating a genuinely new workspace_state_row for wf-20260703-feat-063 (no prior entry exists for this workflow id)."
    - "Verified via direct read that FR-WORKFLOW-003.md's dependency line and the registry row 63's Depends-on cell both still read 'WORKFLOW-002 (UAT infra, shipped)' -- an already-flagged (RequirementAnalyst step) documentation-hygiene naming inconsistency (should arguably be FEAT-WORKFLOW-002, since no FR-WORKFLOW-002.md file exists) that is explicitly out of scope for this DocWriter step and not blocking; left unchanged per RequirementAnalyst's own non-blocking recommendation."
```
