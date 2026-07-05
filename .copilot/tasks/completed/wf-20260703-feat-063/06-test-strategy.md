# Test Strategy — wf-20260703-feat-063

**Agent:** TestStrategist
**Step:** 6 (requirement-development workflow)
**Requirement ref:** `FR-WORKFLOW-003`

---

## Requirement

**FR-WORKFLOW-003 — UAT fixture state reset — order-independent, re-entrant UAT runs.**

`scripts/uat-seed.sh` is create-if-missing only today; BP-UAT scripts mutate
the fixtures it seeds (event status flips, invite tokens consumed,
registrations created), so re-running a script — or running scripts out of
order — fails for state reasons, not product reasons. This FR adds a
`pnpm uat:seed --reset <BP-UAT-NNN>` mode (and `--reset all`) that deletes
and recreates every mutable domain fixture declared in a per-script JSON
manifest (`scripts/uat-fixtures/<BP-UAT-NNN>.json`) back to its documented
initial state. Identity fixtures (Authentik users) are reset in place
(group/consent state restored via the existing `FORCE_REGEN`-equivalent
path), never deleted. A hard localhost-only guard (exit 4, zero writes)
protects against ever running `--reset` against a non-local target. v1
scope is exactly `BP-UAT-001` and `BP-UAT-013`.

**Confirmed by direct code read (not just the code summary's claims)** at
`scripts/uat-seed.sh`: `reset_localhost_guard()` (L487), `manifest_path_for()`
/`require_manifest()`/`list_known_manifests()` (L511-538),
`reset_identity_fixture()` (L543), `reset_domain_fixture()` (L592,
including the new `directus_user_pk_by_email()` FK-resolution call at L634
and its `fail()` at L636), `resolve_payload_offsets()` (L683),
`run_reset_for_bp()` (L707), `run_reset_all()` (L736), and the CLI dispatch
block (L777-799) which places `reset_localhost_guard` as the first
statement inside `if [[ -n "$RESET_TARGET" ]]`.

This is bash/jq DevEx tooling only — no NestJS module, no Drizzle/Postgres
schema, no API endpoint, no React/frontend surface is touched (confirmed
independently in `02-impact-analysis.md` and `04-security-review.md`, both
already gated `passed`). The Test Tier Decision Rubric below is applied in
spirit, not literally, per this workflow's explicit instruction, since it
is written for backend/frontend features.

---

## Rubric Score

| Criterion | Points | Applied? | Reasoning |
|---|---|---|---|
| Touches tenant-scoped data | +2 | **Yes, +2 (judgment call)** | The reset path writes `country`-scoped Directus rows (`events`, `member_consents` for `uz`; `operator_invites` with explicit `country: null`). This is real tenant-scoped data, but it is written through a bash script issuing direct Directus REST calls, not through the NestJS/Drizzle ORM layer the rubric's tenant-isolation concern (cross-tenant leakage via a shared query path) actually targets. SecurityReviewer's `04-security-review.md` INV-1 already rated this N/A for that reason, while separately confirming country fields are never silently dropped. Scoring it here reflects genuine data-fidelity risk (get `country`/`status` wrong on `uat-event-draft-uz` and a BP-UAT step fails on a country/status mismatch, not a product bug — flagged explicitly in the impact analysis), not an ORM/tenant-isolation risk. |
| New API endpoint | +2 | **No, 0** | Confirmed N/A — no `apps/api` controller/endpoint is added, edited, or needs to exist for this feature. The `--reset` mode's HTTP calls are direct `curl` calls into Directus's/Authentik's own REST surfaces, the same idiom every pre-existing function in this script already uses. |
| Business rule with edge cases (capacity, waitlist, dates) | +2 | **Partial, +1** | Not a product business rule, but there is a real edge-case surface analogous in shape: unknown BP-UAT id (no manifest), non-localhost guard trip, delete-then-create ordering, and the new unresolvable-`member_email` failure case. Scored partial credit for edge-case density, not for domain business logic. |
| Cross-module service call | +1 | **No, 0** | Confirmed N/A — no NestJS module calls another NestJS module. `scripts/uat-seed.sh` calling Directus/Authentik REST is not a "module" call in the architecture doc's sense (both impact analysis and security review confirm this independently). |
| New database query | +1 | **Yes, +1 (judgment call)** | `directus_user_pk_by_email()` (`GET /users?filter[email][_eq]=...`) and `reset_domain_fixture()`'s filtered GET/DELETE/POST against `${DIRECTUS_URL}/items/<collection>` are functionally new query-shaped operations against Directus's collections, even though they are REST calls, not Drizzle/SQL. Scored to reflect that new query logic (a filter, a lookup, an FK resolution) was authored and needs correctness coverage — not because a new Postgres query was added (none was; Directus owns its own schema per `architecture.md`'s Data Ownership table). |
| Pure function / utility | 0 | N/A | Superseded by the rows above. |
| UI-only change (no logic) | 0 | N/A | Not applicable — no UI is touched. |

**Total: 4 points** (2 + 1 + 0 + 1), by the rubric's literal arithmetic.

**Why this score is not read literally as "Integration tests required (Testcontainers)":**
The rubric's ≥4 → Testcontainers threshold assumes the "tenant-scoped data"
and "new database query" points came from NestJS/Drizzle code sitting in
front of a real Postgres instance that Testcontainers can spin up and
tear down. Here, both scoring judgment calls are explicitly about
**Directus's own REST-owned collections**, reached only via `curl`+`jq` —
there is no Drizzle schema, no repository class, no Postgres table this
codebase owns to spin up in a Testcontainer. Standing up a Testcontainers
Postgres for this change would test nothing real: the actual persistence
layer under test is Directus itself (a separate service this repo doesn't
own the schema of), and the existing `UAT_SEED_DIRECTUS_MOCK=1` mock-mode
harness is this codebase's own already-established substitute for
"integration-shaped" coverage of `uat-seed.sh` — see `scripts/tests/uat-seed.bats`,
which has tested this exact script's STEP 1-4 logic this way since
before this FR existed, with no Testcontainers involved. Per this
workflow's explicit framing: bats-under-mock-mode is the equivalent test
tier for this change, not a lesser substitute. This determination was made
using judgment applied to the change's actual risk profile, not by
mechanically enforcing the ≥4 threshold against a stack this change doesn't
have.

---

## Required Test Levels

- [x] **Unit-equivalent: bats (mock mode)** — required, and sufficient. This
      is the load-bearing test tier for this change. Every new function
      (`reset_localhost_guard`, `manifest_path_for`/`require_manifest`/`list_known_manifests`,
      `reset_identity_fixture`, `reset_domain_fixture`, `resolve_payload_offsets`,
      `directus_user_pk_by_email`, `run_reset_for_bp`, `run_reset_all`, and the
      CLI dispatch block) is exercised under `UAT_SEED_DIRECTUS_MOCK=1`,
      matching `scripts/tests/uat-seed.bats`'s own established two-pattern
      style (full mock-mode run + static-analysis grep).
- [ ] **Integration (Testcontainers)** — **N/A.** No Drizzle/Postgres schema
      or repository code exists in this diff to integration-test. Directus
      is the persistence layer actually exercised, and it is reached only
      via REST, already covered by mock-mode bats plus the next live
      `uat-verification` Step 2 run (per AC-7, out of this FR's own
      test-authoring scope). See Integration Test Plan section below for
      the full reasoning.
- [ ] **E2E (Playwright)** — **N/A.** No browser surface, no page, no user
      journey is introduced by this FR. The existing BP-UAT-001/BP-UAT-013
      Playwright specs (`apps/e2e/tests/uat/*.spec.ts`) are unaffected — they
      exercise the same fixtures regardless of how those fixtures got
      seeded/reset. See E2E Test Plan section below for the full reasoning.

---

## Unit Test Plan (bats test plan)

Framework: bats-core, extending `scripts/tests/uat-seed.bats` (loads
`test_helper`, resolves `REPO_ROOT` once in `setup()`, `teardown()` unsets
`UAT_SEED_DIRECTUS_MOCK` defensively — same file, same conventions, no new
test file needed since this is additive coverage of the same script).

All new tests run under `UAT_SEED_DIRECTUS_MOCK=1 DIRECTUS_TOKEN=mock-token`,
matching the existing suite's pattern exactly. The 6 cases named by the
impact analysis's "Test Scope" section are rows 1-6; rows 7-9 are added by
this strategy to cover the `member_email` → Directus user id FK resolution
introduced in CodeDeveloper's follow-up pass (`03-code-summary.md`'s
"Follow-up fix" section).

| Target | Happy Path | Failure Paths |
|---|---|---|
| **1. Manifest parsing** (`run_reset_for_bp` reading `scripts/uat-fixtures/BP-UAT-013.json`) | `--reset BP-UAT-013` in mock mode reads the manifest and logs one mock line per fixture (parallel to the existing `ensure_operator_invite` mock-line convention); assert exactly 4 fixture lines, matching the manifest's 4 `operator_invites` rows | N/A here — malformed-manifest / missing-manifest is covered by row 4 below |
| **2. Delete-then-create ordering** (`reset_domain_fixture` mock branch, L601-620) | mock-mode output for a domain fixture shows a `(mock, delete collection=... lookup=...)` line immediately followed by a `(mock, create collection=...)` line for the same fixture id, matching functional-scope item 1's "delete and recreate" semantics | N/A (ordering is structural, not input-dependent) |
| **3. Localhost guard — non-localhost `DIRECTUS_URL`** (`reset_localhost_guard`, L487-505) | N/A (guard-trip IS the case under test) | `DIRECTUS_URL=https://prod.aiqadam.org ... --reset BP-UAT-001` exits **4**; assert **zero** mock/fixture output lines were emitted (AC-4's "no writes performed" — the load-bearing assertion per the impact analysis and security review, not just the exit code) |
| **3b. Localhost guard — non-localhost `AK_URL`, `DIRECTUS_URL` local** (`reset_localhost_guard`, L494-498) | N/A | `DIRECTUS_URL=http://localhost:8200 AK_URL=https://prod-ak.aiqadam.org ... --reset BP-UAT-001` exits **4**; assert zero mock/fixture lines — confirms `AK_URL` is checked independently, not short-circuited once `DIRECTUS_URL` passes (security review traced this at L494-498; this test pins it as an executable regression, not just a code-read claim) |
| **4. Unknown BP-UAT id** (`require_manifest`, L516-523) | N/A | `--reset BP-UAT-999` (no manifest file) exits **non-zero** (1, via the `fail()` idiom); assert output contains the actionable FATAL message naming the expected path and `list_known_manifests()`'s output (`BP-UAT-001, BP-UAT-013`) |
| **5. `--reset all` iteration** (`run_reset_all`, L736-746) | `--reset all` in mock mode processes every manifest under `scripts/uat-fixtures/*.json` (currently 2) in filename order; assert both `BP-UAT-001` and `BP-UAT-013` fixture lines appear, and exit is 0 | N/A here — empty-`FIXTURES_DIR` case is out of scope for v1 (directory always has ≥1 manifest once this FR ships) |
| **6. Regression: byte-identical no-flag output** (CLI dispatch, L781: `if [[ -n "$RESET_TARGET" ]]` not entered when no `--reset` flag given) | Invoking the script with **no** `--reset` flag at all under mock mode produces output byte-identical to the pre-FR baseline (`git show HEAD~N:scripts/uat-seed.sh`'s mock output, or a captured golden transcript) — regression guard for every existing caller of `uat-seed.sh` | N/A (this test's entire purpose is the happy/no-op path) |
| **7. `member_email` FK resolution — success** (`reset_domain_fixture`'s mock branch, L601-616; mirrors `directus_user_pk_by_email` at L634 for live mode) | `--reset BP-UAT-001` in mock mode: for the `uat-member-consented-consent` fixture (which declares `payload.member_email: "uat-member-c@aiqadam.test"`), assert the output line reads `member_email=uat-member-c@aiqadam.test resolved to member=uat-member-consented` (mock-mode resolves against the sibling `uat-member-consented` identity fixture's declared `email`, per L607-610) | See row 8 |
| **8. `member_email` FK resolution — unresolvable email fails loudly** (`reset_domain_fixture`, L611-613 mock / L635-636 live) | N/A | Using a scratch/temp copy of the `BP-UAT-001.json` manifest with `uat-member-consented-consent`'s `payload.member_email` set to an email with no matching identity fixture (e.g. `nonexistent@aiqadam.test`): `--reset BP-UAT-001` under mock mode exits **non-zero** (1, via `fail()`) with a message naming the fixture id and the unresolved email, explicitly stating it "did not resolve to any identity fixture in this manifest (mock mode)"; assert the two identity fixtures ordered before it in the manifest (`uat-operator`, `uat-member-consented`) still logged successfully — confirms the failure is isolated to the one bad domain fixture, not a global short-circuit (matches CodeDeveloper's self-validation trace in `03-code-summary.md`) |
| **9. `BP-UAT-013` unaffected by the `member_email` change (regression)** | `--reset BP-UAT-013` mock-mode output is unchanged in shape from before the fix (no `member_email` key exists in any `BP-UAT-013.json` fixture) — assert none of the 4 `operator_invites` mock lines contain `member_email=`/`resolved to member=` substrings, confirming `resolve_payload_offsets`'s unconditional `del(.member_email)` (L698) and the `reset_domain_fixture` conditional (L599, `// empty`) don't introduce a false-positive resolution attempt on a manifest that never declared the hint | N/A |
| **10. Structural: `--reset` requires an argument** (CLi parsing, L77-80) | N/A | `--reset` with no following argument exits **2** with a usage message (`Usage: uat-seed.sh --reset <BP-UAT-NNN>|all`) — static/runtime structural regression, same idiom as the existing suite's `grep`-based structural tests |
| **11. Structural: unknown flag rejected** (CLI parsing, L82-86) | N/A | `--bogus-flag` exits **2** with the usage message — guards against silent flag-typo acceptance |

All of these are runnable without a live Docker stack (pure mock-mode +
static grep), matching the existing `uat-seed.bats` suite's zero-live-stack
scope exactly.

---

## Integration Test Plan

**N/A.** No Testcontainers-based integration test is planned for this FR.

Reasoning (matches the impact analysis's own scoping, re-verified
independently against the actual code rather than accepted at face value):

- There is no Drizzle schema, repository class, or Postgres table this
  repo owns that is touched by this change. `operator_invites`, `events`,
  `member_consents` are Directus-owned collections (confirmed in
  `architecture.md`'s Data Ownership table and re-confirmed by
  `04-security-review.md`'s INV-5 trace) reached exclusively via Directus's
  own REST API (`${DIRECTUS_URL}/items/<collection>`), the same idiom every
  pre-existing function in `uat-seed.sh` already uses.
- Testcontainers in this codebase spins up Postgres/Redis for testing
  NestJS services against a real schema this repo controls. There is no
  such schema here to spin up — standing up a Testcontainers Postgres
  instance would not exercise any code path this FR adds; the actual
  external dependency (Directus) is not a Testcontainers-supported target
  in this repo's existing tooling and mocking it at the REST layer (which
  is exactly what `UAT_SEED_DIRECTUS_MOCK=1` already does) is a closer,
  cheaper, and already-proven analog.
  `docs/04-development/standards.md` Part IV states integration tests are
  for "Service + DB, API endpoints" — neither exists in this diff.
- The FR's own AC-6 explicitly scopes verification to `bash -n` + bats
  suite under mock mode + byte-identical regression — it does not request
  live-Directus verification as part of this FR's test-authoring
  obligation. Live-Directus behavior (real HTTP status codes, real FK
  constraint enforcement on `member_consents.member`) is exercised
  naturally the next time the `uat-verification` workflow runs Step 2 with
  the new `--reset` invocation (functional-scope item 6 / AC-7), which is
  documentation-only in this FR's own scope, not a test this FR must author.
- CodeDeveloper's self-validation (`03-code-summary.md`) already manually
  traced every mock-mode path plus the guard-trip and regression-diff
  cases; this strategy's bats plan (above) is exactly that trace,
  encoded as automated, repeatable assertions — no additional
  Testcontainers layer would add coverage this FR needs.

---

## E2E Test Plan

**N/A.** No Playwright E2E test is planned or required for this FR.

Reasoning:

- This FR has no browser surface, no page, no React component, and
  introduces no new user-facing journey. `scripts/uat-seed.sh --reset` is
  invoked by a human operator or the Orchestrator as a **pre-flight CLI
  step**, never by the running application or a browser session.
- The existing BP-UAT-001 and BP-UAT-013 Playwright specs
  (`apps/e2e/tests/uat/*.spec.ts`) are unaffected by this change — they
  exercise the same seeded/reset fixtures regardless of which mechanism
  produced them. No spec file edit is implied or required (confirmed
  independently by the impact analysis's Test Scope section).
- `docs/04-development/standards.md` Part IV scopes E2E to "critical
  happy paths... login, event registration, check-in" — user-facing
  product flows. A dev-tooling CLI reset flag has no analog in that list;
  applying the rubric's ≥6 → Playwright threshold here would mean writing
  a browser test for a bash script, which has no UI to drive.
- Live-stack verification of the reset path's real-world effect on the
  BP-UAT-001/013 Playwright specs happens naturally the next time
  `uat-verification` Step 2 runs with the new `--reset` invocation — that
  is this FR's AC-7 (documentation of the invocation and its failure
  semantics), not a new E2E spec this FR must author.

---

## Acceptance Criteria → Test Mapping

| AC | Test Level | Test Description |
|---|---|---|
| **AC-1** — Running the same BP-UAT twice in a row (seed `--reset` between runs) passes both times with no manual cleanup. | bats (mock) | Row 1 (manifest parsing / per-fixture mock lines for `--reset BP-UAT-013`) + Row 2 (delete-then-create ordering) together demonstrate the reset mechanism restores declared initial state on every invocation, not just the first. Full end-to-end confirmation of "passes both times" against a live stack happens at the next live `uat-verification` Step 2 run (AC-7's scope), consistent with this FR's own AC-6 test-authoring boundary (mock-mode + regression, not live-stack). |
| **AC-2** — Running BP-UAT-001 (mutates the draft event) then BP-UAT-002 (assumes operator-panel fixtures) passes — cross-script state leakage eliminated for the reset fixtures. | bats (mock), + explicit N/A note | Row 5 (`--reset all` iteration) confirms both in-scope manifests (`BP-UAT-001`, `BP-UAT-013`) are processed independently with no shared mutable state between them (each fixture id is looked up and recreated by its own manifest's `lookup_field`/`lookup_value`, scoped to its own collection). **Note:** AC-2's literal text names `BP-UAT-002`, which has no manifest in this FR's v1 scope (only `BP-UAT-001`/`BP-UAT-013` do, per the FR's own functional-scope item 2 and the impact analysis's confirmed v1 scope) — the *mechanism* AC-2 requires (no cross-script leakage) is what row 5 and row 9 test for the two in-scope scripts; `BP-UAT-002`-specific verification is deferred until `BP-UAT-002` gets a manifest in a follow-up FR, which is consistent with the FR's own v1 scope statement, not a gap in this strategy. |
| **AC-3** — `--reset BP-UAT-NNN` touches only fixtures in that script's manifest — rows created by other BP-UATs and non-UAT data are untouched (row-count diff on unrelated collections). | bats (mock) | Row 1 + Row 9 together: Row 1 confirms `--reset BP-UAT-013` emits exactly 4 fixture lines (matching its manifest's 4 rows, no more); Row 9 confirms `--reset BP-UAT-013` never touches `member_email`/`member_consents` machinery at all (`BP-UAT-013.json` has zero `member_email` keys) — i.e., BP-UAT-013's reset cannot bleed into BP-UAT-001's `events`/`member_consents` collections structurally, not just by observation. `reset_domain_fixture`'s `lookup_field`/`lookup_value` scoping (L644-648, filtered GET before DELETE) is what bounds the blast radius to exactly the manifest's declared rows — pinned by Row 1's exact-count assertion. |
| **AC-4** — `--reset` against a non-localhost target exits 4 with no writes performed. | bats (mock) | Row 3 (`DIRECTUS_URL` non-local) + Row 3b (`AK_URL` non-local, `DIRECTUS_URL` local) — both assert exit code 4 **and** zero mock/fixture output lines emitted, matching the impact analysis's and security review's shared conclusion that "no writes performed" is the load-bearing assertion, not just the exit code. |
| **AC-5** — A BP-UAT whose doc fixture table and JSON manifest disagree fails BusinessAnalyst Step 1 validation with the diff named. | **Out of `uat-seed.bats`'s scope — process/doc-review check, not a script-level test.** | This AC is satisfied by the `.copilot/agents/business-analyst.md` Step 1 checklist's 8th row (added by CodeDeveloper per `03-code-summary.md`: "manifest matches doc fixture table... diff named on FAIL") — a human/BusinessAnalyst-agent authoring-time validation step, not runtime behavior of `uat-seed.sh` that bats can exercise. No bats test is planned for AC-5; TestDesigner should instead verify (as a structural/doc-presence check, same style as the existing suite's `bp-uat-template-rule.bats`) that the checklist row's exact text exists in both `business-analyst.md`'s Step 1 table and its `01-uat-script-validation.md` output-format table (CodeDeveloper's summary notes both tables needed the row for internal consistency). Recommend TestDesigner add ONE structural grep test asserting the row's presence in both files, mirroring `bp-uat-template-rule.bats`'s existing pattern of grepping doc files for required substrings — this keeps AC-5 covered by an automated check without inventing a live BusinessAnalyst-validation-run test harness this FR doesn't need. |
| **AC-6** — `bash -n scripts/uat-seed.sh` passes; bats suite green under mock mode; existing no-flag seed behavior byte-identical in mock runs. | bats (mock) + static | Row 6 (byte-identical no-flag regression) directly covers the third clause. `bash -n scripts/uat-seed.sh` (first clause) should be added as a standalone bats test (or a `pnpm test:bash` pre-step) asserting exit 0 — CodeDeveloper's self-validation already confirms this passes; TestDesigner should encode it as an automated assertion, not leave it as a manual note. The second clause ("bats suite green") is satisfied by rows 1-11 all passing plus the full pre-existing suite (`uat-seed.bats`, `uat-seed-iss-001.bats`, `uat-seed-retries.bats`, `bp-uat-template-rule.bats`) continuing to pass with no regressions (CodeDeveloper reports 29/29 non-skipped assertions green after both passes). |
| **AC-7** — `uat-verification.md` Step 2 documents the reset invocation and its failure semantics (`failed-escalate` on non-zero exit). | **Out of `uat-seed.bats`'s scope — doc-presence check.** | Satisfied by CodeDeveloper's edit to `.copilot/workflows/uat-verification.md` Step 2 (confirmed present in `03-code-summary.md`'s file list: documents `pnpm uat:seed --reset <BP-UAT-NNN>` and states non-zero exit is `failed-escalate`). No bats test is planned for AC-7 (it is a workflow-documentation fact, not `uat-seed.sh` runtime behavior); recommend TestDesigner add a lightweight structural grep (`grep -q 'reset <BP-UAT-NNN>' .copilot/workflows/uat-verification.md` and a similar check for `failed-escalate`) as a low-cost regression guard against the doc drifting silently in a future edit, consistent with the existing suite's structural-check pattern (e.g. the AC-2/AC-4 structural tests already in `uat-seed.bats`). |

**Coverage check:** all 7 ACs have at least one planned, concrete test or
an explicitly justified non-bats verification path (AC-5, AC-7 are
doc/process facts, not script runtime behavior — both get a recommended
structural grep test rather than being left unmapped). No AC is left
without a stated test plan.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Test strategy complete for FR-WORKFLOW-003. Rubric scored 4/7 applicable points (tenant-scoped data +2 and new database query +1 applied as judgment calls reflecting real data-fidelity/query-authoring risk despite routing through Directus REST rather than this repo's own Drizzle/Postgres layer; new API endpoint and cross-module service call both scored 0/N/A, confirmed no NestJS surface exists). Rather than mechanically applying the rubric's >=4 Testcontainers threshold, determined bats-under-mock-mode is this codebase's own established equivalent test tier for scripts/uat-seed.sh, matching scripts/tests/uat-seed.bats's pre-existing scope and reasoning explicitly stated in both Integration and E2E sections (no Drizzle schema, no browser surface exists to test at those tiers). 11 bats test cases planned: the impact analysis's original 6 (manifest parsing, delete-then-create ordering, localhost guard, unknown BP-UAT id, --reset all iteration, byte-identical regression) plus 5 added by this strategy (AK_URL-independent guard check, member_email FK resolution success/failure/non-regression on BP-UAT-013, and two CLI-parsing structural tests) to cover the CodeDeveloper follow-up pass's directus_user_pk_by_email() work. All 7 FR ACs mapped to a concrete test: AC-1/2/3/4/6 get direct bats coverage; AC-5/AC-7 are doc/process facts (BusinessAnalyst checklist row, uat-verification.md Step 2 text) with a recommended low-cost structural grep test each, matching the existing suite's own structural-check pattern, rather than left unmapped."
  findings:
    - "Rubric applied in spirit per the workflow's own framing: the 'tenant-scoped data' and 'new database query' points are real (country-scoped Directus rows; new filtered-GET/DELETE/POST and email-lookup REST calls) but route through Directus's REST API, not this repo's Drizzle/Postgres layer that Testcontainers exists to test — so the >=4 threshold's literal 'spin up Testcontainers' consequence would test nothing this FR actually changes. bats-under-mock-mode (already the pattern scripts/tests/uat-seed.bats established for this same script's pre-existing logic) is the judged equivalent, not a downgrade."
    - "AC-2's literal text names BP-UAT-002, which has no manifest in this FR's v1 scope (only BP-UAT-001/BP-UAT-013 do, per the FR's own functional-scope item 2). Mapped AC-2 to the mechanism test (no cross-script fixture leakage, verified via --reset all iteration + BP-UAT-013's confirmed non-interaction with member_consents/events) rather than a literal BP-UAT-002 test, since BP-UAT-002 has no manifest to reset yet — flagging this as an inherent v1-scope boundary, not a gap introduced by this test strategy."
    - "AC-5 and AC-7 are process/documentation facts (a BusinessAnalyst checklist row; a workflow doc's Step 2 text), not runtime behavior of uat-seed.sh, so no bats test can directly exercise them. Recommended a structural grep test for each (matching bp-uat-template-rule.bats's existing doc-presence-check pattern) so both ACs still get an automated regression guard rather than being left as manual-only verification."
    - "5 new test cases (rows 3b, 7, 8, 9, 10, 11) added beyond the impact analysis's original 6 to specifically cover the member_email -> Directus user id FK resolution added in CodeDeveloper's follow-up pass (directus_user_pk_by_email(), the mock-mode sibling-fixture-lookup path, and the fail()-loudly unresolvable-email case) plus CLI-argument-parsing edge cases (missing --reset value, unknown flag) that were not yet covered by any existing or previously-planned test."
```
