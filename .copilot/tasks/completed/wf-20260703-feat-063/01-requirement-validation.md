# Requirement Validation — wf-20260703-feat-063

**Agent:** RequirementAnalyst
**Step:** 1 (requirement-development workflow)
**Requirement ref:** `FR-WORKFLOW-003` (already drafted — this is validation, not authoring from scratch)

---

## Raw Input

The requirement arrived pre-formalized (not raw prose from a human). Three artifacts existed uncommitted on `main` when this workflow started (per `handoff.yaml` notes — no git history touches `FR-WORKFLOW-003.md`):

1. `docs/03-requirements/FR-WORKFLOW-003.md` — full FR doc: Description, Users, 7 Functional-scope items, 7 ACs, Out-of-scope section. Status `Proposed`.
2. `docs/03-requirements/requirements-registry.md` row 63 — `FR-WORKFLOW-003 | Proposed | Depends on WORKFLOW-002 (UAT infra, shipped)`.
3. A forward reference in `docs/04-development/testing/visual-testing.md`, Rollout item 5: "Implement `FR-WORKFLOW-003` … so BP-UAT scripts become re-entrant — a precondition for scheduled nightly re-verification."

Plain-language restatement of intent: `scripts/uat-seed.sh` currently only *creates if missing*. UAT scripts mutate the fixtures it creates (event status flips, invite tokens get consumed, registrations get created), so re-running a BP-UAT script — or running scripts out of order — fails for **state reasons**, not product reasons. The FR adds a `--reset <BP-UAT-NNN>` mode that restores fixtures to their declared initial state, driven by a JSON manifest per BP-UAT script, with a hard guard against ever running against anything but localhost.

---

## Analysis

### Completeness Issues Found

Two real gaps, both addressable as amendments rather than blockers — see amendment proposals at the end of this section.

1. **Functional-scope item 2 depends on a doc-schema change that doesn't exist yet, and the FR doesn't say who makes it.** The FR says each BP-UAT file's fixture table "gains a stable fixture `id` column." I read the current template (`docs/02-business-processes/uat/BP-UAT-template.md`) and a real instance (`BP-UAT-001.md`): both have a two-column `| Fixture | Description |` table today, **no `id` column**. So this FR silently implies:
   - An edit to `BP-UAT-template.md` (the fixture-table schema itself).
   - An edit to **all 18** existing `BP-UAT-NNN.md` files to add the `id` column (or at minimum the ones covered by the manifests actually written in v1).
   - A migration of `scripts/tests/bp-uat-template-rule.bats`-style doc-presence checks (not required by this FR, but the precedent exists and CodeDeveloper may reasonably wonder if one is expected).

   None of this is wrong — it's a reasonable scope for a "fixture manifest" feature — but the FR's Functional Scope reads as if the `id` column already exists and the manifest just needs to reference it. A developer implementing item 2 literally will hit "which files, exactly, and in what PR" as an open question. This is squarely CodeDeveloper's kind of decision (mechanical, low-risk), so I classify it as `needs-clarification`-lite: answerable with a reasonable default, not a blocker.

   **Proposed amendment (for Orchestrator to apply, not applied by me):** add one sentence to functional-scope item 2: *"v1 scope for the `id` column and manifest file: only the BP-UAT scripts exercised by the bats suite added under item 7 (recommend BP-UAT-001 and BP-UAT-013, since both already have well-documented, non-trivial fixture sets and one already has a plus-addressing precedent per item 4). Remaining BP-UAT files get the column in follow-up PRs as their manifests are authored — this FR does not require converting all 18 in one PR."* This keeps the FR's existing 5-file/400-LOC PR-size discipline (AGENTS.md §4 precedent set by FR-WORKFLOW-001) intact; converting 18 doc files plus a script change in one PR would blow that budget.

2. **AC-5 depends on a BusinessAnalyst duty that isn't in `business-analyst.md` yet.** AC-5 says: "A BP-UAT whose doc fixture table and JSON manifest disagree fails BusinessAnalyst Step 1 validation with the diff named." I read `.copilot/agents/business-analyst.md` Step 1 (`Validate and Finalize UAT Script`) — its checklist table has 7 rows (process_ref, environment, seed_required, seed_fixture non-empty, steps complete, negative scenarios, ACs mapped). **There is no row for "fixture table matches `scripts/uat-fixtures/<BP-UAT-NNN>.json`."** Functional-scope item 2 mentions this check only in passing ("fixture drift … is a validation error in BusinessAnalyst Step 1") but Functional Scope item 6 ("Workflow integration") only lists the `uat-verification.md` Step 2 seed-invocation change — it does **not** list updating `business-analyst.md`'s Step 1 checklist table. Without that edit, AC-5 has no implementation home and CodeDeveloper would have to infer it.

   **Proposed amendment:** add a bullet to functional-scope item 6 (or a new item 6b): *"`.copilot/agents/business-analyst.md` Step 1 checklist gains an 8th row: `manifest matches doc fixture table (if BP-UAT has a scripts/uat-fixtures/<NNN>.json) | PASS/FAIL/N/A | diff named on FAIL`."* This directly satisfies AC-5 and removes the guessing.

Neither gap changes the shape of the feature or its ACs — they are "which file also needs a one-line edit" questions, well within reasonable-assumption territory. I am not flagging `needs-clarification` at the FR level; I'm flagging two specific line-item amendments the Orchestrator can fold in before or during CodeDeveloper's pass.

### Conflicts with Existing Features

Checked `docs/03-requirements/requirements-registry.md` (all 63 FR rows) and the FR files directory listing for `FR-WORKFLOW-*`.

- **No FR file conflicts.** Only `FR-WORKFLOW-001` (shipped — context-drift guard) and `FR-WORKFLOW-003` exist under the WORKFLOW module. No other FR touches `scripts/uat-seed.sh`, UAT fixture semantics, or BP-UAT doc schema.
- **`FR-WORKFLOW-002` does not exist as a file.** The registry row and this FR's own dependency line both cite "WORKFLOW-002 (UAT infra, shipped)" but there is no `FR-WORKFLOW-002.md` anywhere in `docs/03-requirements/`, and no other FR file mentions it. `FR-WORKFLOW-001.md`'s own "Out of scope" section instead refers to the *bats suite + shellcheck + end-to-end harness* follow-up as **"FEAT-WORKFLOW-002"** (note: `FEAT-`, not `FR-` — this matches the `FEAT-<MODULE>-<N>` identifier format the RequirementAnalyst agent definition specifies for informally-tracked follow-up work, as distinct from a fully formalized `FR-<MODULE>-<NNN>` doc). That follow-up work does appear to have shipped in substance — `scripts/tests/uat-seed.bats`, `check-workflow-state.bats`, etc. all exist and pass today, and recent commit history (`c244831`, `2adee31`, `0016656`, `7b04c4c`) shows active UAT-seed and workflow-close-out work landing on `main`. So the *substance* of the dependency is satisfied; the *identifier* in the registry and in this FR's dependency line is informal/inconsistent (`FR-WORKFLOW-002` vs `FEAT-WORKFLOW-002`, and no file exists under either name). This is a documentation-hygiene gap, not a blocking conflict — the actual prerequisite work is done. Recommend the Orchestrator normalize the dependency reference to `FEAT-WORKFLOW-002` (or retroactively author a stub `FR-WORKFLOW-002.md` if the project wants every shipped increment to have a formal FR file) as a low-priority doc fix, but this does **not** block FR-WORKFLOW-003 development.
- **No duplicate or contradicting requirement for "reset"/"re-entrant" UAT semantics.** Searched the registry and FR-MIG/FR-OPS rows for seed, fixture, or UAT-related language — nothing else claims this scope.
- **Registry row is internally consistent.** Row 63 status `Proposed`, depends-on cell matches the FR file's own dependency line (`WORKFLOW-002 (UAT infra, shipped)`), sort position (last row, highest number) is correct per the registry's documented sort order ("shipped work first … then documented execution sequence for what remains").

### Architectural Feasibility

Checked `docs/04-development/architecture/architecture.md` in full.

- **Fits the existing stack cleanly.** `scripts/uat-seed.sh` is explicitly documented (in its own header, which I read directly) as intentionally bash, not TypeScript, because "the fixtures live in Directus (CMS) and Authentik (IdP) — both administered via REST + shell. There is no Drizzle/TypeScript surface to write to." The FR's out-of-scope section correctly declines to change this ("Migrating `uat-seed.sh` to TypeScript … explicitly declined in the script's header rationale; unchanged here"). Consistent.
- **No module-boundary violation.** The architecture doc's "Module boundaries" section (rules 1–6) governs `apps/api/src/modules/*` — NestJS service/repository boundaries. `scripts/uat-seed.sh` is outside that layer entirely (a dev/test tooling script operating directly against Directus's REST API and Authentik's admin API, the same pattern `bootstrap.sh` already uses). No NestJS module is touched, no cross-schema query is introduced — the FR touches only the CMS's REST surface (Directus `operator_invites`, `events`, `registrations`, `member_consents`, `event_announcements` collections) and Authentik's admin REST API, both accessed via the same `curl`/`jq` pattern already in the file. No violation of "Cross-schema queries are forbidden": the script talks to Directus's own API, never raw SQL across schemas.
- **Production guard aligns with an existing documented principle**, not a new one: `uat-verification.md`'s own Scope Constraints section already states "Never target production… This workflow… NEVER targets production." The FR's item 5 (`--reset` exits 4 on non-localhost) mechanizes an existing prose rule into a script-level check — consistent with this repo's established pattern of converting prose rules into enforced gates (see `visual-testing.md`'s explicit design lesson #1, "Gates define behavior; prose decorates it"). No inviolable rule is stressed; if anything the FR strengthens one.
- **Data-ownership table respected.** `directus` schema is Directus-owned, written only via "Directus admin UI" per the table — but `scripts/uat-seed.sh` already writes to Directus via its REST API (not raw SQL), which is the sanctioned access path documented elsewhere in the same architecture doc for API-mediated writes (the script uses the same idiom `bootstrap.sh` uses). No new precedent required.
- **No infra dependency the stack lacks.** Local dev already runs Directus (`localhost:8055` per the doc, though the running script defaults to `:8200` — a pre-existing discrepancy in the script's own default, not something this FR introduces or needs to resolve) and Authentik (`localhost:9000`) via Docker Compose, exactly what `--reset`'s guard and delete/recreate calls need.

**No architectural blockers.** `failed-escalate` is not warranted.

### Script-Level Sanity Check (`scripts/uat-seed.sh`)

Read the full 576-line script directly. Findings relevant to feasibility of the 7 functional-scope items:

- **Current idempotency model matches the FR's diagnosis exactly.** `ensure_test_user()` (line 170) is create-if-missing + `FORCE_REGEN` resets password/groups but never touches Directus rows. `ensure_operator_invite()` (line 306) has an explicit idempotency guard by `token_hash` lookup (line 340-348) that **short-circuits and does nothing** if a row already exists ("operator_invite … (exists, id=…)"). This is precisely the create-if-missing-only behavior the FR describes — confirms the problem statement is accurate, not exaggerated.
- **Item 3 ("identity fixtures reset, never recreated") is directly compatible with existing code.** `ensure_test_user`'s `FORCE_REGEN` branch (lines 177-207) already implements "keep pk, reset password + groups" — item 3 just needs to fold under the new `--reset` flag's semantics rather than a separate env var, or coexist with it. The FR should ideally clarify whether `--reset <BP-UAT-NNN>` *implies* `FORCE_REGEN=1` behavior for identity fixtures touched by that BP-UAT, or whether the two remain orthogonal flags. This is answerable by CodeDeveloper with a reasonable default (implies it) and is minor enough not to warrant a blocking amendment, but I note it for the record.
- **Item 5's "production guard via localhost URL check" is straightforward to add.** `DIRECTUS_URL` and `AK_URL` are already read as top-level variables (lines 433, 437) before any mutating call runs — a guard function checking both for a `localhost`/`127.0.0.1` substring, called at the top of the `--reset` branch before any delete/recreate call, fits the script's existing structure with no reordering needed.
- **Item 1's "manifest-driven delete-then-recreate"** has no existing structure to build on (the script has zero delete calls today) but nothing in the current structure blocks adding one. The `check_deps()` function (line 69) already gates on `jq` — manifest JSON parsing has no new dependency to introduce.
- **Item 7 (bats coverage)** — confirmed `scripts/tests/uat-seed.bats` exists today with **no** existing `--reset`/`FORCE_REGEN` interaction tests and no references to a `scripts/uat-fixtures/` directory (grepped both — zero matches), so there is no naming collision or conflicting prior test contract to reconcile. Clean ground.
- **Mock mode (`UAT_SEED_DIRECTUS_MOCK=1`)** already exists end-to-end in the script (every external call branches on it) — the FR's AC-6 ("bats suite green under mock mode") has a real, already-proven mechanism to extend rather than invent.

### 5-Criteria Completeness Assessment

| Criterion | Assessment |
|---|---|
| **Specific** | Yes. Each of the 7 functional-scope items names an exact flag (`--reset BP-UAT-NNN`, `--reset all`), an exact file location (`scripts/uat-fixtures/<BP-UAT-NNN>.json`), and exact exit-code behavior (exit 4 for the guard). Only the two amendments above (file list for item 2, agent-file edit for item 6) are underspecified — both closeable with a one-sentence addition, not a rewrite. |
| **Testable** | Yes, strongly. All 7 ACs are concrete and mechanically checkable: AC-1/2 (re-run passes), AC-3 (row-count diff on unrelated collections), AC-4 (exit 4, no writes), AC-5 (validation fails with diff named), AC-6 (`bash -n` + bats green + byte-identical no-flag output), AC-7 (doc updated with failure semantics named). None require subjective judgment. |
| **Non-conflicting** | Yes. No other FR or ADR claims this scope; no contradiction found in the registry or architecture doc (see Conflicts section above). The one loose thread (`FR-WORKFLOW-002` vs `FEAT-WORKFLOW-002` identifier mismatch) is a hygiene issue in already-shipped work, not a conflict with this FR's own content. |
| **Scoped to one module layer** | Yes. Everything lives in the DevEx/tooling layer: `scripts/uat-seed.sh`, `scripts/uat-fixtures/*.json`, `docs/02-business-processes/uat/*.md`, `.copilot/workflows/uat-verification.md`, `scripts/tests/*.bats`. No NestJS module, no frontend code, no schema migration. This is the cleanest possible module-scoping for an FR in this registry — it doesn't cross the `apps/api` module-boundary rules at all because it isn't inside `apps/api`. |
| **Referenced** | Yes, from three independent places: (1) `requirements-registry.md` row 63, (2) `visual-testing.md` Rollout item 5, (3) this FR's own "Users" section names its two consumers (UATRunner agent, Orchestrator's `uat-verification` Step 2 pre-flight). |

**Verdict: 5/5 criteria met**, with two minor amendments recommended (not required) to close implementation ambiguity before CodeDeveloper starts. Neither amendment changes an AC, changes scope, or requires escalation.

### Owner-context check (AGENTS.md §0)

Re-read AGENTS.md §0: the owner is a delivery manager learning to code, not a senior engineer — this analysis avoids unexplained jargon and explains *why* each finding matters (e.g., spelling out exactly which existing files a "fixture table gains a column" implies touching, rather than leaving it as an implicit inference). Both amendment proposals above are written as complete, standalone sentences that could be pasted directly into the FR file without further translation.

---

## Formalized Requirement

**FR-WORKFLOW-003 — UAT fixture state reset — order-independent, re-entrant UAT runs**

This restates the existing FR file, which is already well-formed. No re-authoring needed; two amendments recommended (both additive, non-breaking):

- **Amendment A** (functional-scope item 2): scope the `id`-column/manifest rollout to the BP-UAT files actually covered by item 7's bats suite in v1 (recommend BP-UAT-001, BP-UAT-013), not all 18, to preserve the small-PR discipline this repo already enforces (see FR-WORKFLOW-001 Notes: "PR size … Exceeds AGENTS.md §4 small-PR cap of 400 [when atomic]… follow-up will be small").
- **Amendment B** (functional-scope item 6, or new 6b): explicitly add the `business-analyst.md` Step 1 checklist row for manifest/doc-table drift, since AC-5 has no other implementation home.

Cross-references (all verified to exist and say what this FR claims they say):
- `docs/03-requirements/requirements-registry.md` row 63 — present, consistent.
- `docs/04-development/testing/visual-testing.md` Rollout item 5 — present, consistent, correctly named as this FR's precondition role (nightly re-verification).
- Depends on: UAT infra shipped work, informally tracked as `FEAT-WORKFLOW-002` (not `FR-WORKFLOW-002` — no such file exists; recommend the Orchestrator normalize this reference as a low-priority follow-up, non-blocking).
- `scripts/uat-seed.sh` — read and confirmed compatible with all 7 functional-scope items; no restructuring required, only additive changes (new flag branch, new manifest-read helper, new guard function).
- `.copilot/agents/business-analyst.md` — confirmed AC-5 requires an edit here not currently listed in the FR's functional scope (Amendment B above).
- `docs/02-business-processes/uat/BP-UAT-template.md` and `BP-UAT-001.md` — confirmed current two-column fixture table format; FR item 2's `id` column is a real, not-yet-existing schema addition (Amendment A above).

Module: `WORKFLOW`. Identifier already assigned (`FR-WORKFLOW-003`) — no new identifier needed.

---

## Acceptance Criteria (draft)

The FR's own 7 ACs are complete, specific, and testable as written (see 5-criteria table above). Restated in Given/When/Then form for TestDesigner, with the two amendments folded in as AC-5's implementation note:

- **AC-1:** Given a BP-UAT script has been run once against a seeded stack, when the operator runs `pnpm uat:seed --reset <BP-UAT-NNN>` and re-executes the same BP-UAT script, then it passes with no manual cleanup step.
- **AC-2:** Given BP-UAT-001 has mutated its fixtures (event published) and BP-UAT-002 assumes fresh operator-panel fixtures, when `--reset` is run for BP-UAT-002 before it executes, then BP-UAT-002 passes regardless of BP-UAT-001 having run first.
- **AC-3:** Given `--reset BP-UAT-NNN` is invoked, when it completes, then a row-count diff on all Directus collections shows changes only in that script's declared manifest fixtures — zero row-count delta on unrelated collections and on rows created by other BP-UAT scripts.
- **AC-4:** Given `DIRECTUS_URL`/`AK_URL` resolve to a non-localhost host, when `--reset` is invoked, then the process exits 4 before any HTTP write call is issued (verifiable by a mock-mode assertion that zero POST/PATCH/DELETE calls were attempted).
- **AC-5:** Given a BP-UAT doc's fixture table and its `scripts/uat-fixtures/<NNN>.json` manifest disagree (fixture present in one but not the other, or field mismatch), when BusinessAnalyst Step 1 validation runs (per the amended checklist row proposed above), then it fails with the specific diff (fixture id + which side it's missing from / what differs) named in the output.
- **AC-6:** Given the reset code path is added, when `bash -n scripts/uat-seed.sh` is run, then it exits 0; when the bats suite runs under `UAT_SEED_DIRECTUS_MOCK=1`, then all reset-path tests pass; when the script is invoked with no `--reset` flag at all, then its mock-mode output is byte-identical to pre-change output (regression guard for existing callers).
- **AC-7:** Given the reset mode ships, when `.copilot/workflows/uat-verification.md` Step 2 is read, then it documents the `--reset <BP-UAT-NNN>` invocation and states that a non-zero exit is `failed-escalate`.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "FR-WORKFLOW-003 is specific, testable, non-conflicting, cleanly scoped to the DevEx/UAT-tooling layer, and referenced from 3 independent locations. No architectural blocker. Two additive, non-blocking amendments recommended for the Orchestrator to fold in before CodeDeveloper starts (functional-scope item 2's file-list scope; item 6's missing business-analyst.md edit for AC-5). No FR-file conflict found; the cited 'WORKFLOW-002' dependency has a naming inconsistency (file doesn't exist under FR- or the substance appears already shipped as informally-tracked FEAT-WORKFLOW-002) that is a documentation-hygiene issue, not a blocker."
  findings:
    - "Amendment A (non-blocking): functional-scope item 2 should state v1 scope is BP-UAT-001 and BP-UAT-013 only (or whichever the bats suite in item 7 actually covers), not all 18 BP-UAT files, to respect the repo's small-PR precedent (AGENTS.md §4, FR-WORKFLOW-001 Notes)."
    - "Amendment B (non-blocking): functional-scope item 6 should explicitly add an 8th checklist row to .copilot/agents/business-analyst.md Step 1 for manifest/doc-table drift — AC-5 currently has no stated implementation home in the FR's own scope list."
    - "Documentation hygiene (non-blocking, not part of this FR): requirements-registry.md row 63 and FR-WORKFLOW-003.md's own dependency line both cite 'WORKFLOW-002 (UAT infra, shipped)' but no docs/03-requirements/FR-WORKFLOW-002.md file exists. FR-WORKFLOW-001.md's own Out-of-scope section names the equivalent follow-up 'FEAT-WORKFLOW-002' (informal identifier, not a full FR doc). The underlying work (bats suite, check-workflow-state.bats, etc.) is verifiably shipped on main. Recommend normalizing the identifier at some point; does not block this workflow."
    - "Minor open question for CodeDeveloper (answerable with a reasonable default, not blocking): whether --reset <BP-UAT-NNN> should imply FORCE_REGEN=1-equivalent behavior for identity fixtures in scope, or remain a fully separate flag. Recommended default: --reset implies it for fixtures declared in that BP-UAT's manifest only."
```
