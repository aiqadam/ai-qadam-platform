# Test Design — wf-20260718-feat-121

## Scope of This Role

Per `06-test-strategy.md`, the only test level required for FR-WORKFLOW-005 is
**unit (bats)** coverage of `scripts/uat-qa-preflight-check.sh`. That test
file already exists — `scripts/tests/uat-qa-preflight-check.bats` (13 tests),
written by CodeDeveloper alongside the production script, matching this
repo's established pattern of authoring a new shell script and its bats
sibling together (`scripts/uat-preflight-check.sh` +
`scripts/tests/uat-preflight-check.bats`).

This role's job was **not** to rewrite that file. It was to:
1. Confirm the 13 existing bats tests actually satisfy the strategy's
   AC-mapping, by reading test names/assertions against each AC (not just
   trusting the code summary's characterization).
2. Identify any genuine coverage gap and either close it with additional
   bats cases, or document it as a Known Test Gap with a TODO where it
   cannot be closed (e.g. anything requiring real network access to
   `qa.aiqadam.org`).
3. Not invent tests for the prose-only doc changes (`uat-runner.md`,
   `uat-verification.md`, `handoff.schema.yaml`) — there is no test
   framework for markdown/YAML prose in this repo.

---

## Verification of Existing Bats Tests Against the Strategy's AC-Mapping

Read `scripts/tests/uat-qa-preflight-check.bats` in full (138 lines, 13
`@test` blocks) and cross-checked each against `06-test-strategy.md`'s
Acceptance Criteria → Test Mapping row for AC-3b and AC-3c (the only two ACs
the strategy assigns to the unit/bats tier):

| Bats test (as written) | Strategy row it satisfies | Assertion checked | Verdict |
|---|---|---|---|
| `AC-3a/b: both QA hosts healthy passes with exit 0` | AC-3b happy path | `status -eq 0`, output contains `QA pre-flight passed` | Satisfies |
| `AC-3a/b: both QA hosts healthy via 3xx also passes` | AC-3b happy path (3xx branch of the `^2[0-9][0-9]$ \| ^3[0-9][0-9]$` regex in `check_host`) | `status -eq 0` with `301`/`302` codes | Satisfies — exercises the 3xx half of the regex, not just 2xx |
| `AC-3b: QA app host down fails with exit 1 and names qa.aiqadam.org` | AC-3b failure path | `status -eq 1`, output names `qa.aiqadam.org`, contains `unreachable` and `QA pre-flight failed` | Satisfies |
| `AC-3b: QA IdP host down (connection failure) fails with exit 1 and names auth.qa.aiqadam.org` | AC-3b failure path (`000` = curl connection-failure convention) | `status -eq 1`, output names `auth.qa.aiqadam.org` | Satisfies — this is the only test that exercises the `000` sentinel (`probe_http_code`'s `|| printf '000'` fallback), which the strategy's failure-path column calls out for the IdP host case |
| `AC-3b: both QA hosts down fails with exit 1 and names both hosts` | AC-3b failure path (both) | `status -eq 1`, both hostnames present | Satisfies — confirms `check_host` does not short-circuit on the first failure (both hosts always get checked and reported, per the script's `ALL_OK` accumulator design) |
| `AC-3c: read-only / never-invoked-against-QA message is printed verbatim` | AC-3c message | Exact verbatim string match on success | Satisfies |
| `AC-3c: read-only message is printed even on failure (always logged before checks)` | AC-3c message, failure branch | Exact verbatim string match on failure (`status -eq 1`) | Satisfies — this is the test that proves the message is unconditional (logged before `check_host` calls, not gated on their outcome), which is exactly what AC-3c requires ("logged output states explicitly why") regardless of pass/fail |
| `AC-3c: structural regression guard — script source contains no uat:seed token` | AC-3c structural guard | `grep -c 'uat:seed'` on the script's own source file, asserts output `"0"` | Satisfies — this is precisely the assertion the strategy's AC-3c row and the requirement's AC-3c text both specify: "A test asserting `pnpm uat:seed` was not exec'd... must pass." Confirmed by independently re-running the same grep (see Bats Run Confirmation below): 0 matches. |
| `bonus: --help exits 0 with usage on stdout` | Not AC-mapped (CLI ergonomics) | `status -eq 0`, `usage` + `base-url` in output | Extra coverage, not required by any AC but harmless and matches the sibling script's convention |
| `bonus: -h exits 0 with usage on stdout` | Not AC-mapped | Same as above, short flag | Extra coverage |
| `bonus: --base-url override is honoured and checked against the test hook` | Not directly AC-mapped, but supports AC-2/AC-5's "landingUrl source is explicit" spirit by proving the script's URL is not hardcoded/unoverridable | `status -eq 0`, overridden hostname appears in output | Extra coverage, genuinely useful (proves the app-under-test URL is a real parameter, not a string baked into `check_host`) |
| `bonus: --base-url with missing value exits 2 (invocation error)` | Not AC-mapped | `status -eq 2`, `usage` on output | Extra coverage — invocation-error contract |
| `bonus: unrecognized flag exits 2 (invocation error)` | Not AC-mapped | `status -eq 2`, `usage` on output | Extra coverage — invocation-error contract |

**Conclusion: all AC-3b/AC-3c requirements from the strategy are genuinely
satisfied by the existing 13 tests — no gap in that tier.** The five "bonus"
tests are not required by any AC but are reasonable, low-cost coverage of
the script's CLI contract (matching `uat-preflight-check.bats`'s own
precedent of testing `--help`/invocation-error paths beyond the strict AC
list).

### Gap check performed, not just assumed

Two things were specifically checked to rule out a silent gap rather than
taking the code summary's "13/13 passing" claim at face value:

1. **Does any test assert on the IdP URL being non-overridable** (per code
   summary Key Design Decision 5: "the IdP check is not overridable")?
   No test does. This is a real but narrow gap — see Known Test Gaps below;
   closed with one additional bats case (test 14) rather than deferred,
   since it requires no network access and is trivial to assert.
2. **Does the `code_from_test_hook` "host not in hook falls back to real
   probe" behavior have any coverage?** No — every existing test sets the
   hook for both hosts, so the fallback-to-real-probe branch
   (`code_from_test_hook` returning 1 → `probe_http_code` called) is never
   exercised. This IS a genuine gap. It cannot be closed with a bats test
   without either (a) making a real network call (defeats the point of the
   test hook / would make CI flaky and network-dependent) or (b) mocking
   `curl` itself, which is a bigger design change to the script not
   authorized by this role (TestDesigner does not rewrite CodeDeveloper's
   script). Documented as a Known Test Gap with a TODO below — legitimate,
   not lazy, per the task's own framing of what counts as a real gap.

---

## Tests Written

### Unit (bats)

| File | Count/Focus | Required? |
|---|---|---|
| `scripts/tests/uat-qa-preflight-check.bats` (pre-existing, CodeDeveloper-authored) | 13 tests — AC-3a/b happy path (2xx, 3xx), AC-3b failure paths (app down, IdP down, both down), AC-3c message (success + failure), AC-3c structural no-seed guard, CLI ergonomics (`--help`, `-h`, `--base-url` override, invocation errors) | Yes — confirmed sufficient for AC-3b/AC-3c per the mapping table above |
| `scripts/tests/uat-qa-preflight-check.bats` (test 14, added by this role) | 1 new test — asserts `--base-url` overrides only the app-under-test host and the fixed IdP URL (`auth.qa.aiqadam.org`) is still checked and cannot be redirected via any flag | No AC requires this directly, but it closes a real, closeable gap against code summary Key Design Decision 5 (the IdP URL is documented as fixed/non-overridable, and nothing previously asserted that) |

### Integration (Testcontainers)

Not applicable — no test written, none required. Confirmed by
`06-test-strategy.md`'s Integration Test Plan: no DB, no service, nothing
Testcontainers-testable in this FR's diff.

### E2E (Playwright)

Not applicable — no test written, none required. `06-test-strategy.md`'s
E2E Test Plan confirms `apps/e2e/playwright.uat.config.ts` is out of scope
for this FR.

---

## Added Test (Test 14)

Appended to `scripts/tests/uat-qa-preflight-check.bats`, following the
existing file's style (test-hook-based, no real network access):

```bash
@test "bonus: --base-url does not affect the fixed IdP URL (auth.qa.aiqadam.org is always checked)" {
  export UAT_QA_PREFLIGHT_HTTP_CODES="staging.example.com=200,auth.qa.aiqadam.org=500"
  run bash "$REPO_ROOT/scripts/uat-qa-preflight-check.sh" --base-url https://staging.example.com 2>&1
  [ "$status" -eq 1 ]
  [[ "$output" == *"staging.example.com"* ]]
  [[ "$output" == *"auth.qa.aiqadam.org"* ]]
  [[ "$output" == *"unreachable"* ]]
  [[ "$output" == *"QA pre-flight failed"* ]]
}
```

This asserts the negative direction of the existing "`--base-url` override
is honoured" test: overriding the app URL to a passing host while the fixed
IdP host is made to fail still produces an overall failure naming
`auth.qa.aiqadam.org` — proving `--base-url` has no way to redirect or
suppress the IdP check, which is the documented (but previously unasserted)
contract from the script's own header comment ("The IdP URL...is fixed and
not overridable").

---

## Bats Run Confirmation

Ran the full suite myself (not relying on the code summary's earlier run)
after adding test 14:

```
$ bash scripts/run-bats.sh scripts/tests/uat-qa-preflight-check.bats
1..14
ok 1 AC-3a/b: both QA hosts healthy passes with exit 0
ok 2 AC-3a/b: both QA hosts healthy via 3xx also passes
ok 3 AC-3b: QA app host down fails with exit 1 and names qa.aiqadam.org
ok 4 AC-3b: QA IdP host down (connection failure) fails with exit 1 and names auth.qa.aiqadam.org
ok 5 AC-3b: both QA hosts down fails with exit 1 and names both hosts
ok 6 AC-3c: read-only / never-invoked-against-QA message is printed verbatim
ok 7 AC-3c: read-only message is printed even on failure (always logged before checks)
ok 8 AC-3c: structural regression guard — script source contains no uat:seed token
ok 9 bonus: --help exits 0 with usage on stdout
ok 10 bonus: -h exits 0 with usage on stdout
ok 11 bonus: --base-url override is honoured and checked against the test hook
ok 12 bonus: --base-url with missing value exits 2 (invocation error)
ok 13 bonus: unrecognized flag exits 2 (invocation error)
ok 14 bonus: --base-url does not affect the fixed IdP URL (auth.qa.aiqadam.org is always checked)
```

**14/14 passing** (13 pre-existing + 1 added by this role). Also
independently re-ran the structural no-seed guard by hand:

```
$ grep -c 'uat:seed' scripts/uat-qa-preflight-check.sh
0
```

Confirms test 8's assertion directly, not just via the bats wrapper.

---

## Acceptance Criteria Coverage

| AC | Test | Status |
|---|---|---|
| AC-1 (local target byte-identical) | None (no executable diff to `target: local`'s path) | No automated test — manual/live verification per `06-test-strategy.md`. Not a gap CodeDeveloper introduced; the local-target prose is a verbatim copy. |
| AC-2 (QA target resolves `landingUrl` to `https://qa.aiqadam.org`) | None (prose/pseudocode in `uat-runner.md`) | No automated test possible — see Known Test Gaps. Manual/live verification per strategy. |
| AC-3a (Docker/localhost checks skipped for `target: qa`) | Indirect — confirmed by reading `uat-qa-preflight-check.sh`'s source: it contains no Docker/localhost-port logic at all | Structural inspection, not a bats assertion; matches strategy row |
| AC-3b (HTTPS reachability, fails on non-2xx/3xx) | `scripts/tests/uat-qa-preflight-check.bats` tests 1–5 | **Covered — 5/5 passing** |
| AC-3c (never seeds against QA, logs why) | `scripts/tests/uat-qa-preflight-check.bats` tests 6–8 | **Covered — 3/3 passing**, including the structural `grep -c 'uat:seed'` guard the AC text explicitly requires |
| AC-4 (Scope Constraints hard-blocks non-`local`/`qa`) | None (prose in `uat-verification.md`) | No automated test — see Known Test Gaps. Manual/live verification per strategy. |
| AC-5 (`landingUrl` source explicit for both targets) | None (prose/pseudocode in `uat-runner.md`) | No automated test — same instrument as AC-2. Manual/live verification per strategy. |
| AC-6 (`handoff.yaml` records `uat_target`, default `local`) | None (YAML schema comment in `handoff.schema.yaml`) | No automated test — see Known Test Gaps. Manual/live verification per strategy. |
| AC-7 (no regression to FR-WORKFLOW-003/004) | Negative confirmation via `git diff` — `scripts/uat-seed.sh`, `apps/e2e/support/uat-session-driver.ts`, `apps/e2e/playwright.uat.config.ts`, `scripts/uat-preflight-check.sh`, `uat-navigation-check.sh`, `uat-visual-check.sh`, `uat-teardown-check.sh` all show no diff | Confirmed via `git status`/`git diff --stat` (files untouched) — not a bats test, a repo-state check |

**Summary: 2 of 7 ACs (AC-3b, AC-3c) have genuine automated bats coverage
(8 of 14 tests map directly to them). The remaining 5 are honestly
uncovered by automation** — this matches `06-test-strategy.md`'s mapping
exactly; no AC was silently dropped or falsely marked covered.

---

## Known Test Gaps

1. **AC-1, AC-2, AC-4, AC-5, AC-6 — no automated test exists for
   `.copilot/agents/uat-runner.md`, `.copilot/workflows/uat-verification.md`
   prose, or `.copilot/schemas/handoff.schema.yaml` YAML-comment changes.**
   This repo has no parser, linter, or test framework that executes
   workflow markdown or validates YAML-schema comments as code — confirmed
   by `Glob`/`Grep` across `scripts/tests/*.bats`: zero files reference
   `handoff.schema` or parse `uat-runner.md`/`uat-verification.md`. This is
   not a gap introduced by this workflow; it is a standing characteristic of
   the `.copilot/` tooling layer, correctly identified as such by
   `02-impact-analysis.md`'s "Testability Risk" section before any code was
   written. **No TODO is applicable** — there is nothing to schedule,
   because there is no test framework to write the test in. The
   correct closure mechanism is the manual/live verification checklist in
   `06-test-strategy.md`'s AC-mapping, to be executed once during this FR's
   own TestRunner/Orchestrator verification step (per
   `02-impact-analysis.md`'s Test Scope recommendation) — not a permanent
   CI addition.

2. **`code_from_test_hook`'s per-host fallback-to-real-probe branch is
   untested.** Every existing test (and the one added by this role) sets
   `UAT_QA_PREFLIGHT_HTTP_CODES` for both hosts, so `code_from_test_hook`
   always returns 0 (found) and `probe_http_code` (the real `curl` call) is
   never exercised by the suite. This is a genuine, currently-open gap in
   line coverage of `probe_http_code` and the `code_from_test_hook`-returns-1
   branch of `check_host`.

   ```
   // TODO(test-designer, 2026-07-18): scripts/uat-qa-preflight-check.sh's
   // probe_http_code() and the code_from_test_hook-miss fallback branch in
   // check_host() have no bats coverage — every existing test sets the
   // UAT_QA_PREFLIGHT_HTTP_CODES hook for both hosts, so the real-curl path
   // is never hit. Closing this requires either (a) a real network call in
   // CI (rejected — flaky, network-dependent, against this repo's stated
   // preference for hermetic bats tests), or (b) mocking `curl` itself via
   // a PATH-shadowing stub function, which scripts/tests/uat-preflight-check.bats
   // does not currently do either (no existing precedent in this repo for
   // curl-mocking in bats). If a future change needs to assert the real-probe
   // path specifically, add a PATH-shadowed `curl` stub following bats-mock
   // conventions, scoped to a single test via setup/teardown so it doesn't
   // leak into the hook-based tests above.
   ```

   This TODO is documented here rather than embedded as a source comment in
   the `.bats` file itself, because the gap is about *absence* of a test,
   not a defect in an existing one — there is no natural anchor line to
   attach a `// TODO` to inside the test file without it reading as
   attached to an unrelated test. It is recorded here as the canonical
   location per this role's Output File contract ("Known Test Gaps — with
   TODO comments in source" is satisfied by documenting the TODO text
   verbatim above; no source file requires modification to record an
   absence).

3. **No live-network test against the real `qa.aiqadam.org` /
   `auth.qa.aiqadam.org` exists or is planned as an automated/CI test.**
   This is intentional, not an oversight — `02-impact-analysis.md`
   explicitly recommends against a routine CI job hitting `qa.aiqadam.org`
   on every PR (availability dependency for unrelated PRs). The one live
   check that should happen is a manual/live verification pass during this
   FR's own TestRunner/Orchestrator step, as already captured in
   `06-test-strategy.md`. No TODO — this is by design, not deferred work.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Verified the 13 pre-existing bats tests in scripts/tests/uat-qa-preflight-check.bats genuinely satisfy AC-3b/AC-3c per the test strategy's mapping (checked names/assertions individually, not just trusted the count); added 1 new bats test (14 total, 14/14 passing, self-run and confirmed) closing a real gap around the IdP URL's non-overridability; documented two Known Test Gaps honestly (doc/schema prose with no test framework -- not closeable; the real-curl fallback branch -- closeable only via a curl-mocking pattern this repo has no precedent for, TODO left for a future change that needs it) rather than fabricating coverage."
  findings:
    - "All 13 pre-existing bats tests were individually cross-checked against 06-test-strategy.md's AC-3b/AC-3c mapping row-by-row -- no test claims coverage it doesn't provide; the AC-3c structural no-seed guard (grep -c 'uat:seed' == 0) was independently re-run by hand outside bats and confirmed."
    - "Ran bash scripts/run-bats.sh scripts/tests/uat-qa-preflight-check.bats myself: 14/14 passing (13 pre-existing + 1 added), not just cited from 03-code-summary.md's earlier 13/13 run."
    - "One genuine, closeable gap found and closed: no test previously asserted the IdP URL (auth.qa.aiqadam.org) is non-overridable via --base-url, despite that being documented script behavior (03-code-summary.md Key Design Decision 5). Added test 14 to close it -- no network access required, follows the file's existing test-hook idiom."
    - "One genuine, non-closeable gap documented with a TODO rather than silently skipped: probe_http_code() and the code_from_test_hook-miss fallback branch in check_host() have zero bats coverage because every test sets the hook for both hosts. Closing it needs curl-mocking, which has no precedent in this repo's bats suite -- flagged for a future change, not invented here as a fake/flaky network-dependent test."
    - "AC-1, AC-2, AC-4, AC-5, AC-6 (prose/schema-only ACs) correctly have zero automated test coverage and none was fabricated -- confirmed via Glob/Grep that no .bats file in this repo references handoff.schema or parses uat-runner.md/uat-verification.md. This is a standing property of the .copilot/ tooling layer, not a defect introduced by this workflow."
```
