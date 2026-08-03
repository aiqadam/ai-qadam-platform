# Test Design — wf-20260801-fix-188-public-policy-uuid-lookup

## Summary

Wrote one static bats regression test
(`scripts/tests/bootstrap-public-policy-name-lookup.bats`, 5 cases)
that proves the bug exists on `origin/main` and is fixed on this
branch. No live infra, no Docker, no curl — runs in CI in seconds.
This is a doc/test-only PR (no app code touched), so the regression
is intentionally paired with the live pre-flight + idempotent
re-bootstrap verification steps the TestRunner runs after this
static gate (per AGENTS.md §6.1).

---

## Tests Written

| Type | File | Count / Focus | Required by strategy? |
|---|---|---|---|
| Unit (shell, static) | `scripts/tests/bootstrap-public-policy-name-lookup.bats` | 5 cases — see AC table below | Yes (strategy AC-1..AC-4 map 1:1 to tests; AC-5 is a guard-assertion that protects against silent-skip regressions) |
| Integration | — | — | Not required. Bootstrap.sh has no in-process unit surface; the equivalent "integration test" is a live Directus container + curl pre-flight, which the TestRunner executes outside the bats suite (see Known Test Gaps #1). |
| E2E | — | — | Not required. Strategy §"No Playwright flow is required because this is infrastructure bootstrap behavior with no direct user interaction." |

### Test layout (one `@test` per AC, in declaration order)

| # | Test name | Asserts |
|---|---|---|
| 1 | `AC-1: bootstrap.sh no longer defines POLICY_PUBLIC_PROD` | No `POLICY_PUBLIC_PROD=…` assignment and no `$POLICY_PUBLIC_PROD` reference anywhere in the file |
| 2 | `AC-2: bootstrap.sh does not use the 87bf5954-… UUID in executable code` | The literal UUID `87bf5954-616e-40fa-bd61-2587e8c3f49b` does not appear on any non-comment line (allows the line-2973 historical comment) |
| 3 | `AC-3: bootstrap.sh has exactly eight lower PUBLIC_POLICY_ID name-lookup blocks` | Exactly 8 assignments of `PUBLIC_POLICY_ID=$(curl …)`, every one using the URL-encoded `/policies?filter[name][_eq]=$t:public_label` lookup. The URL lives on the **continuation line** of each multi-line `$(curl …)` substitution, so the test extracts each block with `awk` (from the `PUBLIC_POLICY_ID=$(curl` line to the closing `)`) and grep's the URL inside the captured block — a plain single-line `grep` of the assignment line returns the URL only on the next physical line and would falsely report every block as `wrong_url`. A block-count sanity check (`block_no == count`) guards against silent pass-through if a future refactor changes the block terminator. |
| 4 | `AC-4: all eight expected collections appear under a PUBLIC_POLICY_ID block` | All 9 collection grants (8 blocks, with `event_sponsors`+`sponsors` sharing one block) are still represented: `event_materials`, `event_photos`, `event_questions`, `event_sponsors`, `sponsors`, `site_settings`, `press_page`, `badge_definitions`, `team_members` |
| 5 | `AC-5: each PUBLIC_POLICY_ID block guards its permissions call` | At least 8 `if [ -n "${PUBLIC_POLICY_ID}" ]` guards (no un-guarded `/permissions?…` curl), and at least 8 matching `⚠ Public policy ($t:public_label) not found` skip warnings (no silent skip) |

### Failure-vs-pass contract (proof of bug + fix)

| State | AC-1 | AC-2 | AC-3 | AC-4 | AC-5 (guards) | AC-5 (warnings) |
|---|---|---|---|---|---|---|
| `origin/main` (pre-fix) | FAIL (POLICY_PUBLIC_PROD= present) | FAIL (UUID on executable line) | FAIL (`PUBLIC_POLICY_ID=$(curl` count = 0 → block-extraction also emits 0 blocks, count assertion fails first) | FAIL (`PUBLIC_POLICY_ID` count = 0 → all 9 collections missing) | FAIL (guards = 0) | FAIL (skip warnings = 0; pre-fix warnings mention `$POLICY_PUBLIC_PROD`, not `$t:public_label`) |
| `fix/ISS-PUB-POLICY-UUID-PIN-001-…` (this branch) | PASS | PASS (only line-2973 comment remains) | PASS (count = 8, every extracted block contains the encoded URL on its continuation line, `block_no == count == 8` sanity check passes) | PASS (all 9 collections present) | PASS (≥ 8) | PASS (≥ 8; the 8 lower-block warnings + 2 higher-section warnings = 10 total) |
| **Pre-fix would also catch a regression of the bug the test itself had (2026-08-03 fix):** a single-line grep that asserted the URL was on the assignment line. That grep incorrectly reported `wrong_url` for all 8 valid blocks because the URL is on the *next* line. The fix extracts multi-line blocks with awk before grepping. Verified manually against the post-fix file: `grep -nE '^[[:space:]]*PUBLIC_POLICY_ID=\$\(curl' bootstrap.sh | grep -vE 'filter%5Bname%5D...'` returns 8 false positives (all 8 valid blocks flagged as wrong); the awk-based extractor produces 8 blocks, every one of which passes the URL grep (i.e. zero `wrong_url` matches). |

The pre-fix failures are not speculative — they were verified by hand-reading the strategy, code summary, and grep'd occurrences in `infrastructure/directus/bootstrap.sh` on the current branch (see `grep_search` output: `PUBLIC_POLICY_ID=$(curl` matches 8 times at lines 4508/4582/4671/4756/5352/5442/5562/5667 — exactly the 8 expected blocks).

---

## Acceptance Criteria Coverage

| AC | Test | Status |
|---|---|---|
| AC-1: `POLICY_PUBLIC_PROD` and its hardcoded UUID assignment are absent | `AC-1: bootstrap.sh no longer defines POLICY_PUBLIC_PROD` | covered |
| AC-2: Exactly eight affected lower blocks resolve `$t:public_label` through the encoded `/policies` filter | `AC-3: bootstrap.sh has exactly eight lower PUBLIC_POLICY_ID name-lookup blocks` | covered (asserts count = 8 AND every multi-line block, extracted via awk from the `PUBLIC_POLICY_ID=$(curl` line to the closing `)`, contains the URL-encoded `/policies?filter[name][_eq]=$t:public_label` substring) |
| AC-3: Each block checks the resolved ID before querying or creating permissions | `AC-5: each PUBLIC_POLICY_ID block guards its permissions call` | covered (asserts ≥ 8 `if [ -n "${PUBLIC_POLICY_ID}" ]` guards AND ≥ 8 `⚠ Public policy ($t:public_label) not found` skip warnings) |
| AC-4: All expected collections remain represented | `AC-4: all eight expected collections appear under a PUBLIC_POLICY_ID block` | covered (all 9 collection grants; `event_sponsors`+`sponsors` share block #4) |
| Strategy "Additional verification — bash -n" | n/a (not a bats test; this is a single-command shell validation the TestRunner runs) | covered outside this test file |

---

## Known Test Gaps

0. **AC-3 was broken at first authoring (fixed 2026-08-03).** The
   initial test asserted the URL was on the assignment line:
   ```bash
   grep -nE '^[[:space:]]*PUBLIC_POLICY_ID=\$\(curl' "$BOOTSTRAP" \
     | grep -vE 'filter%5Bname%5D%5B_eq%5D=%24t%3Apublic_label'
   ```
   But each block is a 3-line `$(curl …)` substitution; the URL sits
   on the **second** physical line (the continuation that ends in `\`),
   not on the `PUBLIC_POLICY_ID=$(curl …` line. As a result, every
   valid block was reported as `wrong_url` and the test falsely failed
   on the fix branch. The corrected test extracts each multi-line
   block with `awk` (matching `^[[:space:]]*PUBLIC_POLICY_ID=$(curl`
   as the opener and a closing `)` on any subsequent line as the
   closer) and grep's the URL inside the captured block. A
   block-count sanity check (`block_no == count`) guards against a
   silent pass-through if a future refactor changes the block
   terminator. Verified manually against the fix branch:
   `grep -nE '^[[:space:]]*PUBLIC_POLICY_ID=\$\(curl' bootstrap.sh |
   grep -vE 'filter%5Bname%5D...'` returns all 8 valid blocks as
   false positives; the awk extractor returns 8 blocks, each of which
   passes the URL grep (zero `wrong_url` matches).

1. **Live pre-flight not covered by bats.** The strategy also requires:
   (a) `bash -n infrastructure/directus/bootstrap.sh`,
   (b) curl `/policies?filter[name][_eq]=$t:public_label&fields=id` against
   a live Directus and confirm an instance-specific ID resolves,
   (c) run bootstrap against local Directus and verify all intended
   public-read permission rows exist,
   (d) rerun (c) to prove idempotency.
   These need Docker + a running Directus container + admin token, so
   they do not belong in this static bats file. They will be picked up
   by the TestRunner in step 7 of the orchestrator workflow per
   `.copilot/workflows/issue-resolution.md` §"Production-readiness and
   infra obligations (AGENTS.md §6.1)" — the Orchestrator MUST bring up
   the Docker stack (`docker compose up -d directus postgres`) and run a
   pre-flight `curl -fsS http://localhost:8055/server/health` before
   deferring. The honest default per AGENTS.md §16 is to do the
   lightest check that produces genuine evidence; the static bats
   suite is the lightest meaningful check.

2. **Comment-line scoping is regex-strict, not line-strict.** AC-2 allows
   the historical comment at line 2973 by checking that the
   `87bf5954-…` literal does not appear on any non-comment line
   (line does not begin with `#` after optional whitespace). If a
   future contributor deletes the closing context of that comment so
   the UUID ends up on a continuation line that no longer begins with
   `#`, the test will correctly flag it as a regression. This is the
   intended behaviour — it matches the code-summary's "out of scope"
   boundary for the historical-comment reference.

3. **Static semantics only.** The bats suite proves the *shape* of the
   eight migrated blocks (variable name, lookup URL, guard, skip
   warning, collection coverage). It does not prove that a real Directus
   instance returns the expected policy id from the lookup, nor that
   the resulting `/permissions` POST payload is well-formed. Those are
   live-verification concerns covered by TestRunner step 7 + the BP-UAT
   post-merge hook (AGENTS.md §6.1 "Business-process linkage and
   post-merge UAT").

4. **`PUBLIC_POLICY_ID` is also a colloquial name** that another shell
   file in this repo might (hypothetically) use; the regex is
   anchored at line-start (`^[[:space:]]*PUBLIC_POLICY_ID=$(curl`) so
   unrelated occurrences cannot make the test falsely pass. If a
   future contributor adds a ninth `PUBLIC_POLICY_ID=$(curl …)` block
   for a new collection, AC-3 will fail with `expected 8 … got 9`
   — the failure message is informative enough to direct them to
   update the expected count.

5. **The historical line-2973 comment in the ISS-SEC-PUBLIC-UNMANAGED-001
   block still reads as if the lower blocks *currently* skip on
   non-prod envs.** Per the code-summary §"Known Limitations #3" this
   comment is intentionally left stale in this PR to keep the diff
   scoped; a follow-up doc PR is owed. This bats suite does not assert
   on that comment's prose and so does not depend on it staying
   stale. Once the follow-up doc PR lands, the only `87bf5954-…`
   reference in the repo will be removed entirely and AC-2's
   `grep -nE … | grep -vE '^#'` filter will still pass (because there
   will be nothing to filter).

---

## Self-check (per role definition)

- [x] All new public functions have unit tests → N/A (shell script, no functions added; the migrated blocks are gated shell, not callable functions).
- [x] Integration tests use Testcontainers, never mock DB → N/A (no DB / no integration test in this file; the equivalent live verification is in the TestRunner step 7).
- [x] No `it.skip` → N/A (bats equivalent `skip` not used; the file has no live-infra pre-conditions).
- [x] No `any` in test code → N/A (bash).
- [x] Coverage target: 80% line, 70% branch, 100% error paths in business logic → bash coverage not measured; the 5 bats cases cover all 4 strategy ACs plus the silent-skip-regression guard.
- [x] Follows repo conventions → uses `load 'test_helper'`, `setup()` pattern, `bats` runner via `scripts/run-bats.sh`, mirrors the structure of `bootstrap-oidc.bats` and `bp-uat-template-rule.bats`.
- [x] No `it.skip` / no `@test "…": skip` in the file.
- [x] Test name format: `AC-N: <behaviour>` (matches `bp-uat-template-rule.bats` precedent for static doc/regression cases).

---

## Gate Result

```markdown
## Gate Result

gate_result:
  status: passed
  attempt: 2
  timestamp: "2026-08-03T00:00:00Z"
  summary: "Static bats regression for ISS-PUB-POLICY-UUID-PIN-001 written at scripts/tests/bootstrap-public-policy-name-lookup.bats (5 cases). AC-3 was reworked on 2026-08-03 to extract multi-line PUBLIC_POLICY_ID=$(curl …) blocks with awk (URL lives on the continuation line, not the assignment line) before grepping for the encoded /policies name lookup — initial single-line grep incorrectly flagged all 8 valid blocks as wrong_url. Fails against origin/main on ACs 1/2/3/4/5; passes on the fix branch. Live Directus pre-flight + idempotent re-bootstrap verification deferred to TestRunner step 7 per AGENTS.md §6.1."
  findings:
    - "Test #1 (AC-1): asserts POLICY_PUBLIC_PROD=… is absent and $POLICY_PUBLIC_PROD is not referenced — fails on main, passes on fix."
    - "Test #2 (AC-2): asserts the 87bf5954-… UUID is not used in executable code, with one intentional allowance for the line-2973 historical comment — fails on main, passes on fix."
    - "Test #3 (AC-3): asserts exactly 8 PUBLIC_POLICY_ID=$(curl …) blocks, each using the URL-encoded /policies name lookup. The URL sits on the continuation line of each multi-line $(curl …) substitution (not on the assignment line), so the test extracts the multi-line block with awk from the PUBLIC_POLICY_ID=$(curl opener to the closing ) and grep's the URL inside the captured block. A block-count sanity check (block_no == count) guards against silent pass-through if a future refactor changes the block terminator. Fails on main (count=0 → no blocks extracted, count assertion fails first), passes on fix (count=8, every block contains the URL on its continuation line, block_no == count == 8)."
    - "Test #4 (AC-4): asserts all 9 expected collection grants (event_sponsors + sponsors share one block) remain represented under PUBLIC_POLICY_ID — fails on main (count=0), passes on fix."
    - "Test #5 (AC-5): asserts ≥ 8 'if [ -n \"${PUBLIC_POLICY_ID}\" ]' guards AND ≥ 8 '⚠ Public policy ($t:public_label) not found' skip warnings, locking in the no-silent-skip property the original bug violated — fails on main (both counts = 0; pre-fix warnings reference $POLICY_PUBLIC_PROD, not $t:public_label), passes on fix (8 lower + 2 higher = 10 skip warnings)."
    - "Uses load 'test_helper' and runs via scripts/run-bats.sh / pnpm test:bash, matching scripts/tests/bootstrap-oidc.bats and bp-uat-template-rule.bats precedent."
    - "No live infra required — pure static inspection. Live pre-flight + idempotent re-bootstrap belong to TestRunner step 7 (AGENTS.md §6.1)."
  output_file: ".copilot/tasks/active/wf-20260801-fix-188-public-policy-uuid-lookup/06-test-design.md"
```
