# Test Design — wf-20260703-feat-063

**Agent:** TestDesigner
**Step:** 7 (requirement-development workflow)
**Requirement ref:** `FR-WORKFLOW-003`

---

## Tests Written

This is a bash/bats-core project (no NestJS/Jest/Testcontainers surface exists
for this change, confirmed independently by the test strategy) — the
Unit/Integration/E2E table below is filled per the strategy's own framing:
bats-under-mock-mode is this codebase's established equivalent to the "Unit"
tier for `scripts/uat-seed.sh`.

### Unit-equivalent (bats, mock mode + structural grep)

| File | Count/Focus | Required? |
|---|---|---|
| `scripts/tests/uat-seed.bats` (extended, no new file — additive per the strategy) | 16 new `@test` cases: rows 1, 2, 3, 3b, 4, 5, 6, 7, 8, 9, 10, 11 from the strategy's Unit Test Plan table (12 tests) + 1 standalone `bash -n` syntax-check test (AC-6 first clause) + 2 doc-presence structural tests (AC-5: business-analyst.md Step 1 checklist row + `01-uat-script-validation.md` output-table row) + 1 doc-presence structural test (AC-7: `uat-verification.md` Step 2 section) | Yes — all required, all written |

Total new tests: **16**. Pre-existing tests in this file: 9 (unchanged, still
pass). File total after this change: 25 `@test` blocks, all green.

### Integration (Testcontainers)

**N/A** — per the test strategy's own determination (re-verified, not just
accepted at face value): no Drizzle/Postgres schema or repository code
exists in this diff. Directus is the persistence layer actually exercised,
reached only via REST, already covered by mock-mode bats. No integration
test file was written; none is required.

### E2E (Playwright)

**N/A** — per the test strategy: no browser surface, no page, no new user
journey. The existing BP-UAT-001/BP-UAT-013 Playwright specs are unaffected
by this change (`--reset` is a pre-flight CLI step, never invoked by the
running application). No E2E spec file was written or edited; none is
required.

---

## Implementation Notes

### Test 6 (byte-identical regression) — baseline source decision

The strategy asked TestDesigner to judge whether `git show HEAD:scripts/uat-seed.sh`
is a valid reference point or whether a captured golden transcript should be
checked into fixtures instead. Verified directly before writing the test:

- `git log --oneline -- scripts/uat-seed.sh` shows the file's last committed
  change is `0669a66` (pre-this-workflow).
- `git diff HEAD --numstat -- scripts/uat-seed.sh` → `353 insertions, 0
  deletions` — the entire diff is additive; zero existing lines were
  changed. `git rev-parse HEAD` and `git merge-base HEAD origin/main`
  resolve to the same commit, confirming `HEAD` is exactly the commit this
  feature branch diverged from.
- Independently ran both the `HEAD` copy and the current script under
  `UAT_SEED_DIRECTUS_MOCK=1` with no flag and diffed the captured stdout —
  byte-identical, confirming CodeDeveloper's self-validation claim rather
  than accepting it at face value.

Chose `git show HEAD:scripts/uat-seed.sh` (copied into
`$BATS_TEST_TMPDIR` at test run time) over a checked-in golden transcript
file because: (a) it is exactly the comparison CodeDeveloper's own
self-validation performed manually, so the automated test encodes a
already-proven method rather than inventing a new one; (b) no golden-file
regression pattern exists elsewhere in this suite to extend consistently;
(c) it stays correct for this feature branch's entire lifecycle up to
merge (HEAD only moves forward past this commit after merge, at which
point the test becomes a harmless self-comparison, not a false failure).

### Test 8 (unresolvable member_email) — isolation technique

`FIXTURES_DIR` and `REPO_ROOT` inside `uat-seed.sh` are both derived from
`BASH_SOURCE`, not overridable by environment variable — so a bad manifest
cannot be injected via env var alone. Verified this by grepping the script
(`FIXTURES_DIR="$REPO_ROOT/scripts/uat-fixtures"`, `REPO_ROOT` from
`dirname "${BASH_SOURCE[0]}"`). Resolved by copying `uat-seed.sh` plus a
`scripts/uat-fixtures/` directory into `$BATS_TEST_TMPDIR/scratch-repo`,
then corrupting the scratch copy's `BP-UAT-001.json` via `jq` (setting
`uat-member-consented-consent`'s `payload.member_email` to
`nonexistent@aiqadam.test`) before invoking the copied script. The real
repo's `scripts/uat-fixtures/BP-UAT-001.json` is never touched — verified
by running the test and then confirming (via `git status`) the real
manifest file shows no modification. This matches the suite's existing
isolation idiom (`test_helper.bash`'s `setup_test_repo`,
`uat-seed-retries.bats`'s per-test temp dirs) rather than mutating shared
repo fixtures in place.

### AC-5 / AC-7 structural tests — exact substrings verified against the docs directly

Read `.copilot/agents/business-analyst.md` and
`.copilot/workflows/uat-verification.md` directly (not just the code
summary's claims) before writing the greps:

- `business-analyst.md` line 45 (Step 1 checklist, 2-col) and line 108
  (`01-uat-script-validation.md` output-format table, 3-col) both carry the
  manifest-drift row, with slightly different literal wording per column
  count (`PASS/FAIL/N/A — diff named on FAIL` vs. `PASS / FAIL / N/A` +
  `diff named on FAIL` in separate columns) — the two structural tests use
  distinct greps calibrated to each table's actual shape rather than one
  generic pattern that might pass against the wrong table.
- `uat-verification.md`'s "### Step 2: Pre-Flight" section (lines 85-135)
  contains both `reset <BP-UAT-NNN>` (line 117) and `failed-escalate`
  (lines 122, 133) — confirmed both substrings fall inside the Step 2
  section (before the next `### Step 3:` header) using the same
  `awk`-slice-then-grep pattern `bp-uat-template-rule.bats` already
  established for scoping a grep to one doc section.

---

## Acceptance Criteria Coverage

| AC | Test | Status |
|---|---|---|
| AC-1 (re-run same BP-UAT twice, no manual cleanup) | Row 1 (`FR-WORKFLOW-003 row 1`) + Row 2 (`FR-WORKFLOW-003 row 2`) | Covered (bats, mock) |
| AC-2 (BP-UAT-001 then BP-UAT-002, no cross-script leakage) | Row 5 (`FR-WORKFLOW-003 row 5`, `--reset all` iteration) + Row 9 (`FR-WORKFLOW-003 row 9`, BP-UAT-013 non-interaction) — mechanism-level coverage; `BP-UAT-002` itself has no manifest in v1 scope, per the strategy's explicit note | Covered (bats, mock) — scope boundary documented, not a gap |
| AC-3 (`--reset` touches only its own manifest's fixtures) | Row 1 (exact 4-line count) + Row 9 (no cross-collection bleed) | Covered (bats, mock) |
| AC-4 (non-localhost target exits 4, no writes) | Row 3 (`DIRECTUS_URL` non-local) + Row 3b (`AK_URL` non-local, independent check) | Covered (bats, mock) |
| AC-5 (doc/manifest drift fails BusinessAnalyst Step 1 validation) | `FR-WORKFLOW-003 AC-5` (two tests: Step 1 checklist row + output-table row) | Covered (structural doc-presence grep, not runtime bats — per strategy's explicit scoping) |
| AC-6 (`bash -n` passes; bats green; no-flag output byte-identical) | `FR-WORKFLOW-003 AC-6` (`bash -n`) + Row 6 (byte-identical regression) + full suite green (45/45, see Gate Result) | Covered |
| AC-7 (`uat-verification.md` documents reset invocation + `failed-escalate`) | `FR-WORKFLOW-003 AC-7` | Covered (structural doc-presence grep, not runtime bats — per strategy's explicit scoping) |

All 7 ACs mapped to a concrete, passing, automated test. No AC left
unmapped.

---

## Known Test Gaps

None within this FR's own test-authoring scope. Everything the test
strategy planned was written and passes. Two pre-existing, out-of-scope
items carried forward unchanged from the strategy (not new gaps introduced
by TestDesigner):

- **Live-Directus/Authentik execution of `--reset`** is not exercised by
  any bats test (only `UAT_SEED_DIRECTUS_MOCK=1` paths) — per the FR's own
  AC-6 scope (`bash -n` + bats-under-mock + byte-identical regression, not
  live-stack verification). Real HTTP status codes and FK constraint
  enforcement on `member_consents.member` will be exercised the next time
  `uat-verification` Step 2 runs with the new `--reset` invocation
  (AC-7's scope, documentation-only in this FR).
- **`BP-UAT-002`-specific reset behavior** has no test because `BP-UAT-002`
  has no manifest in this FR's v1 scope (only `BP-UAT-001`/`BP-UAT-013`
  do). AC-2's literal text names `BP-UAT-002`; this strategy/test-design
  maps AC-2 to the underlying no-cross-script-leakage mechanism instead
  (Row 5 + Row 9), consistent with the FR's own stated v1 scope. Deferred
  to a follow-up FR that authors a `BP-UAT-002.json` manifest.

No `skip` was used in any new test (verified: the one `skip` substring
match in the file is a pre-existing comment in an unrelated existing test,
not a new test-authoring shortcut). Both happy and failure paths are
covered for every new function (`reset_localhost_guard`,
`manifest_path_for`/`require_manifest`/`list_known_manifests`,
`reset_domain_fixture` including its `member_email` resolution branch,
`run_reset_for_bp`, `run_reset_all`, and the CLI dispatch block). All new
tests are independent — no shared mutable state: each test either invokes
the real `scripts/uat-seed.sh` under mock mode with its own distinct
env-var overrides, or (test row 8 only) operates on an isolated
`$BATS_TEST_TMPDIR`-scoped copy of the script and fixtures directory,
leaving the real `scripts/uat-fixtures/*.json` files untouched.

---

## Test Run Results

Ran via `bash scripts/run-bats.sh <files>` (this repo's canonical runner,
confirmed against `package.json`'s `test:bash` script:
`bash scripts/run-bats.sh scripts/tests/*.bats`):

```
bash scripts/run-bats.sh scripts/tests/uat-seed.bats
  scripts/tests/uat-seed-iss-001.bats
  scripts/tests/uat-seed-retries.bats
  scripts/tests/bp-uat-template-rule.bats
```

- **45 tests total, 45 passed (0 failed), 3 skipped.**
- The 3 skips are pre-existing, Python-availability-related
  (`uat-seed-retries.bats`'s TC-1/TC-2/TC-3 stub-server tests — `python3`
  not on `PATH` in this environment), unrelated to this change and
  unaffected by it (TC-4, the mock short-circuit, still passes).
- `scripts/tests/uat-seed.bats` alone: 25/25 passed (9 pre-existing + 16
  new), 0 skipped, 0 failed.
- `scripts/tests/uat-seed-iss-001.bats`: 12/12 passed, unchanged.
- `scripts/tests/bp-uat-template-rule.bats`: 5/5 passed, unchanged.
- **Zero regressions** in any pre-existing test across all four files.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Wrote all 11 bats test cases named in the test strategy's Unit Test Plan table (rows 1, 2, 3, 3b, 4, 5, 6, 7, 8, 9, 10, 11 — note 3b and 10/11 bring the total row count to 12, matching the strategy's 11-named-row-plus-3b framing) plus the 2 recommended structural grep tests for AC-5 (business-analyst.md Step 1 checklist + 01-uat-script-validation.md output table) and AC-7 (uat-verification.md Step 2 section), plus 1 additional standalone bash -n syntax-check test to make AC-6's first clause an automated assertion rather than a manual note (explicitly flagged as needed in the strategy's AC-6 mapping row) — 16 new @test cases in total, all added to the existing scripts/tests/uat-seed.bats file (no new file needed, per the strategy's explicit 'additive coverage of the same script' framing). Verified two non-trivial implementation judgment calls directly against the repo rather than assuming the strategy's suggestions would just work: (1) git show HEAD:scripts/uat-seed.sh is confirmed the correct byte-identical-regression baseline (HEAD == merge-base with origin/main, diff is 353 insertions/0 deletions, independently re-ran both scripts under mock mode and confirmed identical stdout); (2) FIXTURES_DIR/REPO_ROOT are BASH_SOURCE-derived and not env-var-overridable, so the unresolvable-member_email test (row 8) copies uat-seed.sh plus scripts/uat-fixtures/ into $BATS_TEST_TMPDIR and corrupts the scratch copy via jq, leaving the real repo's manifest untouched. Ran the full existing suite (uat-seed.bats, uat-seed-iss-001.bats, uat-seed-retries.bats, bp-uat-template-rule.bats) after adding the new tests: 45/45 non-skipped tests pass, 3 pre-existing Python-availability skips unrelated to this change, zero regressions. All 7 FR acceptance criteria have a concrete, passing, automated test (AC-1 through AC-4 and AC-6 via bats-under-mock-mode; AC-5 and AC-7 via structural doc-presence grep tests, matching bp-uat-template-rule.bats's established pattern, per the strategy's own explicit scoping of those two ACs as doc/process facts rather than script runtime behavior)."
  findings:
    - "git show HEAD:scripts/uat-seed.sh was confirmed (not assumed) to be the correct pre-FR baseline for the byte-identical regression test: git rev-parse HEAD and git merge-base HEAD origin/main resolve to the same commit (0669a66's SHA), and git diff HEAD --numstat -- scripts/uat-seed.sh shows 353 insertions/0 deletions (purely additive diff, no existing line touched). Ran both the HEAD copy and the current script under UAT_SEED_DIRECTUS_MOCK=1 with no flag and diffed the captured stdout directly before trusting this as the test's mechanism — confirmed byte-identical independently of CodeDeveloper's self-validation claim."
    - "FIXTURES_DIR and REPO_ROOT in uat-seed.sh are derived from BASH_SOURCE, not overridable by environment variable — discovered this by reading the script directly rather than assuming an env-var override would work for the unresolvable-member_email test (row 8). Resolved via an isolated-copy technique (copy uat-seed.sh + scripts/uat-fixtures/ into $BATS_TEST_TMPDIR, corrupt the scratch copy's BP-UAT-001.json via jq) so the real repo's manifest file is never mutated, matching this suite's existing per-test-tmpdir isolation idiom (test_helper.bash, uat-seed-retries.bats) rather than introducing a new isolation pattern."
    - "list_known_manifests()'s actual output has no space after the comma (verified by running --reset BP-UAT-999 directly: 'Known manifests: BP-UAT-001,BP-UAT-013.', not 'BP-UAT-001, BP-UAT-013.' as a literal reading of the IFS=', ' code might suggest — bash's ${arr[*]} join only uses IFS's first character). Row 4's test asserts on 'BP-UAT-001' and 'BP-UAT-013' as separate substring checks rather than asserting a literal comma-space-joined string, avoiding a test that would have been wrong about the actual output shape."
    - "AC-5's two doc tables use different column counts and slightly different literal wording for the same conceptual row (2-col checklist: 'PASS/FAIL/N/A — diff named on FAIL' as one cell; 3-col output-format table: 'PASS / FAIL / N/A' and 'diff named on FAIL' as two separate cells) — verified both by reading business-analyst.md directly at the cited line numbers (45 and 108) before writing two distinct greps calibrated to each table's actual shape, rather than one generic pattern that might silently match the wrong table or produce a false pass."
    - "No test gaps within this FR's own scope. Two items remain explicitly out of scope, carried forward from the test strategy (not new gaps introduced here): live-Directus/Authentik execution of --reset (deferred to the next live uat-verification Step 2 run, per AC-6's own mock-mode-only scope) and BP-UAT-002-specific reset behavior (no manifest exists for it in this FR's v1 scope; AC-2 is instead covered via the underlying no-cross-script-leakage mechanism, consistent with the strategy's own documented scope boundary)."
```
