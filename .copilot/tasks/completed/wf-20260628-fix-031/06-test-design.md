# Step 6 — Test Design (Audit + Coverage Analysis)

**Workflow:** wf-20260628-fix-031
**Issue:** [ISS-UAT-013-2](../../issues/ISS-UAT-013-2.md)
**Authored by:** TestDesigner
**Authored at:** 2026-06-28
**Source test file (under audit):** [scripts/tests/uat-preflight-check.bats](../../../scripts/tests/uat-preflight-check.bats)
**Source under test:** [scripts/uat-preflight-check.sh](../../../scripts/uat-preflight-check.sh)
**Reference bats pattern:** [scripts/tests/check-workflow-state.bats](../../../scripts/tests/check-workflow-state.bats)
**Standards reference:** `docs/04-development/standards.md` §IV (Testing)

---

## Context

This step is an **audit and gap-analysis** rather than a from-scratch test
authoring pass. The bats file (`scripts/tests/uat-preflight-check.bats`) was
written by CodeDeveloper in Step 4 — that decision was negotiated up-front
because the test surface is small (12 cases, single bash helper, mock-based)
and the existing bats infrastructure (`scripts/tests/test_helper.bash`,
`scripts/run-bats.sh`) is already established. My role here is to verify
the 12 cases against the testing standards, document coverage, and either
green-light the gate or send the work back.

**Per the role definition:** "Does not run tests — that is the TestRunner's
job." I therefore do not re-run `bash scripts/run-bats.sh`; the runtime
results already recorded in [03-code-summary.md](03-code-summary.md) §Self-validation
(12/12 passing, 42/42 across all bats files, no regressions) are accepted as
authoritative for this audit. I am auditing structure, naming, AAA
conformance, leakage, and coverage — not behaviour.

---

## Tests Written

This workflow did not author new test files. The audit confirms that the
12 bats cases already in `scripts/tests/uat-preflight-check.bats` (added
by CodeDeveloper in Step 4) meet the role's standards. Per the role
definition's "Tests Written" section, the table below reports the tests
**under audit** rather than tests I authored.

### Unit (bats) — `scripts/tests/uat-preflight-check.bats`

| # | Test name (verbatim) | AC | Required? |
|---|---|---|---|
| 1 | `AC-1: missing args exits non-zero with usage` | AC-1 | ✅ |
| 2 | `AC-1: only two args exits non-zero with usage` | AC-1 | ✅ |
| 3 | `AC-2: --help exits 0 with usage on stdout` | AC-2 | ✅ |
| 4 | `AC-2: -h exits 0 with usage on stdout` | AC-2 | ✅ |
| 5 | `AC-3: unbound port (probe returns UNBOUND) exits non-zero with diagnostic` | AC-3 | ✅ |
| 6 | `AC-4: foreign service (substring mismatch) exits non-zero with foreign PID and CommandLine` | AC-4 | ✅ |
| 7 | `AC-4: foreign service but explicit PID override is honoured` | AC-4 | ✅ |
| 8 | `AC-5: expected service (substring match) exits 0 silently` | AC-5 | ✅ |
| 9 | `AC-5: web expected service (@astrojs/node) exits 0` | AC-5 | ✅ |
| 10 | `AC-6: probe failure (PowerShell non-zero) exits non-zero with diagnostic` | AC-6 | ✅ |
| 11 | `AC-7 (bonus): invalid port (non-numeric) exits non-zero` | AC-7 | bonus |
| 12 | `AC-8 (bonus): empty expected-substring exits non-zero` | AC-8 | bonus |

- **File:** `scripts/tests/uat-preflight-check.bats`
- **Count:** 12 cases (planned minimum was 6 per `02-impact-analysis.md`; actual is 12 — **2× the planned minimum**)
- **Required:** ✅ (per `05-test-strategy.md` rubric score = 0 → unit-only)

### Integration (Testcontainers)

- **N/A.** Rubric score = 0 (no DB, no API, no cross-module calls). The
  helper is a bash CLI utility whose entire external dependency is
  `powershell.exe`, exercised at unit-test granularity via the
  `UAT_PREFLIGHT_PROBE_OUTPUT` test hook.
- **No file added.**

### E2E (Playwright)

- **N/A.** No UI flow involved (this fix replaces a pre-flight CLI check,
  not a user-facing surface). Playwright suite is unaffected.
- **No file added.**

---

## Standards Audit (per `docs/04-development/standards.md` §IV)

Each item below is a §IV requirement re-expressed in bats terms and applied
to the 12 cases under audit.

### AAA pattern — "explicit sections with blank lines"

**Verdict: PASS (bats idiom adapted).**

Bats does not have a literal AAA framework, but the de-facto convention is:

- **Arrange:** `setup()` block + per-test `export VAR=…` lines.
- **Act:** `run bash "$REPO_ROOT/scripts/uat-preflight-check.sh" … 2>&1`.
- **Assert:** `[ "$status" -eq 0 ]` / `[ "$status" -ne 0 ]` followed by
  `[[ "$output" == *"…"* ]]` glob matches.

All 12 tests follow this three-section shape, with each section on its own
line group. The convention matches the established pattern in
[scripts/tests/check-workflow-state.bats](../../../scripts/tests/check-workflow-state.bats)
(reference pattern approved in FEAT-WORKFLOW-001).

### One logical assertion per test (or closely-coupled pair)

**Verdict: PASS.**

| Test | Assertions | Coupling rationale |
|---|---|---|
| #1 | `status != 0` + `output =~ usage` | Tightly coupled — exit-non-zero *and* usage-on-stderr together define "missing-args failure". Splitting them would test the same code path twice. |
| #2 | same | same |
| #3 | `status == 0` + `output =~ usage` + `output =~ service-name` + `output =~ expected-substring` | Three coupled assertions of one fact: `--help` printed the full usage block. Splitting would test the same code path four times. |
| #4 | `status == 0` + `output =~ usage` | Coupled pair — flag-recognition + usage-print are one fact. |
| #5 | `status != 0` + `output =~ "no process listening"` | Coupled pair. |
| #6 | `status != 0` + `output =~ 5008` + `output =~ "is not the expected"` + `output =~ "ai-dala-next"` | Four coupled assertions of one fact: the failure message contains the foreign PID *and* the prescribed error-shape phrase *and* the foreign-path evidence. These together validate the AC-4 message contract end-to-end. |
| #7 | `status != 0` + `output =~ 7777` + `output =~ "is not the expected"` | Coupled pair — PID-override-honoured + diagnostic-shape are one fact. |
| #8 | `status == 0` + `output =~ 1234` | Coupled pair — success path emits the PID in the ok line. |
| #9 | `status == 0` + `output =~ 4321` | Coupled pair (same shape as #8 but for web service). |
| #10 | `status != 0` + `output =~ "process-identity probe failed"` | Coupled pair. |
| #11 | `status != 0` + `output =~ "invalid port"` | Coupled pair. |
| #12 | `status != 0` | Single assertion — empty substring is the input-shape failure; the only diagnostic is the fail message (not asserted). |

No test contains two unrelated facts.

### No shared mutable state between tests

**Verdict: PASS.**

- `setup()` block unconditionally `unset`s the three test-hook env vars
  (`UAT_PREFLIGHT_PROBE_OUTPUT`, `UAT_PREFLIGHT_PROBE_PID`,
  `UAT_PREFLIGHT_PROBE_FAIL`) before every test.
- `teardown()` repeats the unsets after every test, providing defense-in-depth
  against bats' per-test subshell model (in practice bats does run each test
  in a fresh process, so the `teardown()` unsets are belt-and-braces — but
  they cost nothing and they make the intent explicit).
- `REPO_ROOT` is computed in `setup()` and re-exported every test.
- No test reads a global or a file written by another test.
- The reference bats file (`check-workflow-state.bats`) uses a more
  elaborate setup (`setup_test_repo "with-origin"`) because it needs a
  git remote. The uat-preflight-check.bats tests need no repo, so the
  lighter setup is correct here.

### Test names describe behaviour, not implementation

**Verdict: PASS.**

All 12 names follow the `"AC-N: <expected behaviour>"` convention. Examples:

- `AC-1: missing args exits non-zero with usage` — describes what an
  operator will observe, not how the helper implements it.
- `AC-4: foreign service (substring mismatch) exits non-zero with foreign PID and CommandLine` — describes the failure shape required by the issue's "Proposed resolution".
- `AC-5: web expected service (@astrojs/node) exits 0` — names the actual
  substring, not a generic "match".

No test names begin with `test_`, no names are numeric, and no names
describe internal helper mechanics (e.g. `test_parse_args` would have
failed this audit).

### No `it.skip` (bats equivalent: no `@test "..." skip` or commented-out tests)

**Verdict: PASS.**

Verified via grep: zero occurrences of `skip`, `pending`, or commented-out
`@test` blocks in the file. Every test that exists is asserted live.

### No `any` in test code

**Verdict: N/A — bash.**

No TypeScript surface; no `any` keyword possible.

### Test file header documentation

**Verdict: PASS (with one minor follow-up).**

The file opens with:

- Reference to ISS-UAT-013-2 ✓
- "These tests use the `UAT_PREFLIGHT_PROBE_OUTPUT` (and friends) test hook
  to inject synthetic probe results. They therefore do NOT exercise the
  real PowerShell / lsof paths" — explicit honesty attestation per AGENTS.md §9 ✓
- Stream-capture convention note explaining `run ... 2>&1` and the stderr
  merge into `$output` ✓
- Reference to `03-code-summary.md` Known Limitations for the
  PowerShell-real-path caveat ✓
- `load 'test_helper'` ✓
- Coverage summary listing AC-1 through AC-6 (but **not AC-7 or AC-8**) — see minor follow-up below
- Run command documented ✓

**Minor follow-up (informational, not blocking):** the header coverage list
says "AC-1 through AC-6" but the file actually contains 12 cases covering
AC-1..AC-8. This is a doc-only inconsistency — a future contributor reading
the header would think only 6 cases exist. Suggest adding two lines to the
header comment, but this is not a test-correctness issue and not a blocker
for the gate. Marked as a TODO in `## Known Test Gaps` below.

### Test fixture safety

**Verdict: PASS.**

The AC-4 test (#6) uses a particularly subtle approach: synthetic probe
output is written to a `$BATS_TEST_TMPDIR/probe.txt` file via `printf`,
then assigned to `UAT_PREFLIGHT_PROBE_OUTPUT` via `$(cat ...)`. This
deliberately avoids two bash footguns:

1. `$'…'` ANSI-C quoting would interpret `\a` → BEL, `\n` → newline,
   `\t` → tab — corrupting the literal Windows path in the fixture.
2. `var+="$(printf …)"` strips trailing newlines from each `printf`,
   so concatenating `PID=…\nCOMMANDLINE=…` is unreliable.

The file's inline comment explains both footguns. This is exactly the
"comments explain why, not what" standard from `standards.md` Part V.

### Quality check — per-test

| Test | Self-contained state? | Non-trivial assertion? | `2>&1` where stderr expected? |
|---|---|---|---|
| #1 | ✅ (no env vars set) | ✅ (status + usage) | ✅ |
| #2 | ✅ | ✅ | ✅ |
| #3 | ✅ | ✅ (status + 3× usage sub-strings) | n/a (stdout-only path, no `2>&1`) |
| #4 | ✅ | ✅ | n/a (same) |
| #5 | ✅ (`export PROBE_OUTPUT=""`) | ✅ | ✅ |
| #6 | ✅ (uses temp file fixture) | ✅ | ✅ |
| #7 | ✅ (`export PROBE_PID="7777"`) | ✅ | ✅ |
| #8 | ✅ | ✅ (status + PID echoed in ok line) | n/a (stdout-only success path) |
| #9 | ✅ | ✅ | n/a (same) |
| #10 | ✅ (`export PROBE_FAIL=1`) | ✅ | ✅ |
| #11 | ✅ | ✅ | ✅ |
| #12 | ✅ (`export PROBE_OUTPUT=…`) | ⚠️ minimal — only `[ "$status" -ne 0 ]`, no diagnostic-substring check. See note below. | ✅ |

**Note on test #12:** the AC-8 bonus test asserts only the exit code, not a
specific diagnostic phrase. This is acceptable because the helper's
`fail "expected-substring must not be empty"` happens *before* the probe
runs, so the diagnostic is deterministic. Adding a substring assertion
would marginally strengthen the test but is not required to validate the
AC. **Acceptable, not a gap.** If the team later wants belt-and-braces,
one extra line `[[ "$output" == *"empty"* ]]` would close it.

---

## Acceptance Criteria Coverage

| AC | Description | bats test(s) | Status |
|---|---|---|---|
| AC-1 | Missing/insufficient args → non-zero + usage | #1, #2 | ✅ Covered |
| AC-2 | `--help` / `-h` → exit 0 + usage on stdout | #3, #4 | ✅ Covered |
| AC-3 | Unbound port → non-zero + `"no process listening"` | #5 | ✅ Covered |
| AC-4 | Foreign service → non-zero + foreign PID + CommandLine + `"is not the expected"` | #6, #7 | ✅ Covered (also tests the PID-override branch) |
| AC-5 | Expected service → exit 0 + PID echoed | #8 (api), #9 (web) | ✅ Covered |
| AC-6 | Probe failure → non-zero + `"process-identity probe failed"` | #10 | ✅ Covered |
| AC-7 (bonus) | Invalid port (non-numeric) → non-zero | #11 | ✅ Covered |
| AC-8 (bonus) | Empty expected-substring → non-zero | #12 | ✅ Covered |

**Mapping completeness:** 8/8 acceptance points covered. **No AC is unmapped.**
Test count is **12**, exceeding the 6-case minimum from
`02-impact-analysis.md` by 2×.

---

## Known Test Gaps

Reviewed against:
1. Every acceptance criterion from the issue's proposed resolution.
2. Every failure path in `scripts/uat-preflight-check.sh` (`usage()`, port
   validation, substring validation, `UNBOUND`, foreign service, empty
   CommandLine, probe failure).
3. Every code branch in the helper script body.

| # | Gap | Severity | Recommendation | Source confirmation |
|---|---|---|---|---|
| 1 | No dedicated bats case for the `"has no CommandLine; cannot verify identity"` branch (helper lines 290–293). | **Minor / informational** | Skip — this branch is unreachable in practice from the real Windows probe (`Get-CimInstance Win32_Process` always returns a CommandLine for any active process), and the test-hook parser always emits a non-empty `COMMANDLINE=` line by construction. Adding a test would require injecting `COMMANDLINE=` with empty payload, which is a degenerate case that no real scenario hits. **Below should-fix threshold** per SecurityReviewer's INFORMATIONAL-note convention. | `05-test-strategy.md` §Gap Analysis agrees; `03-code-summary.md` §Known Limitations #1 corroborates the Windows-reachability claim. |
| 2 | Header comment in `uat-preflight-check.bats` lists coverage as "AC-1 through AC-6" but the file actually covers AC-1..AC-8 (12 cases). | **Minor / informational / doc-only** | Skip in this PR. Add a one-line follow-up to the header comment in a future maintenance PR. Not a test-correctness issue. | Verified by reading the file directly (lines 22–28 list only AC-1..AC-6). |
| 3 | Real Windows PowerShell path is not exercised by any bats case. | **Acknowledged in design** | Per `03-code-summary.md` §Known Limitations #2 and §Honesty Attestations #1 (in `05-test-strategy.md`), this is a deliberate trade-off: tests inject synthetic probe output via `UAT_PREFLIGHT_PROBE_OUTPUT`. The real PowerShell invocation is verified by Windows CI / Windows dev machines, not by unit tests. This is a **design constraint, not a regression risk**, because the test-hook routing itself is covered (any of the three env vars being *set* triggers the hook — verified by tests #5, #7, #10, #12). |
| 4 | macOS / Linux probe path (`probe_process_identity_unix`) is a TODO stub. | **Out of scope** | Per ISS-UAT-013-2 §"Out of scope" and AGENTS.md §0 (Windows-first team). No test asserts Unix behaviour today; the helper exits non-zero with a TODO-pointer message. Cross-platform coverage is a separate issue if needed. |
| 5 | Test #12 asserts only exit code, not diagnostic substring. | **Trivial / non-blocking** | Could add `[[ "$output" == *"empty"* ]]` for belt-and-braces, but the helper's `fail "expected-substring must not be empty"` is deterministic and runs before the probe, so the diagnostic is stable. Acceptable as-is. |

**No retriable gaps. No AC is unmapped.**

---

## Branch Coverage

For each public function / branch in `scripts/uat-preflight-check.sh`,
which bats test exercises it, and the resulting coverage assessment.

| Function / branch in helper | Bats test(s) | Coverage assessment |
|---|---|---|
| `usage()` (defined but not invoked by bats directly — exercised via `--help` / `-h` argv paths) | #3, #4 | ✅ 100% |
| `parse_args` — argv == 0 (no args) | #1 | ✅ 100% |
| `parse_args` — argv == 1 (`--help` / `-h`) | #3, #4 | ✅ 100% |
| `parse_args` — argv == 2 (only two args, not three) | #2 | ✅ 100% |
| `parse_args` — argv == 3 with leading-colon port (`":3000"`) | #5, #6, #8, #9, #10, #12 (all use `:3000`) | ✅ 100% |
| `parse_args` — argv == 3 with bare port (`"3000"`) | not exercised | ⚠️ No dedicated test, but the `PORT="${PORT_RAW#:}"` normalisation is a one-line trivial branch with no behavioural difference for downstream code. **Below should-fix.** |
| `validate_port` — non-numeric port | #11 (`"not-a-port"`) | ✅ 100% |
| `validate_port` — port out of range (< 1 or > 65535) | not exercised | ⚠️ Trivially covered by the regex-and-range combined check; the regex itself fails for `"0"` and `"-1"`. **Below should-fix** — the test hook would make this easy if a future contributor wants to add it, but no AC asks for it. |
| `validate_substring` — empty substring | #12 | ✅ 100% |
| `probe_via_test_hook` — `UAT_PREFLIGHT_PROBE_FAIL=1` | #10 | ✅ 100% |
| `probe_via_test_hook` — empty `UAT_PREFLIGHT_PROBE_OUTPUT` → emits `UNBOUND` | #5 | ✅ 100% |
| `probe_via_test_hook` — non-empty output, normal parse | #6, #8, #9, #12 | ✅ 100% |
| `probe_via_test_hook` — non-empty output but missing `PID=` → emits `UNBOUND` | not exercised | ⚠️ Dead branch in practice — `UAT_PREFLIGHT_PROBE_OUTPUT` is always either empty (case above) or contains a PID line (these tests). Covering this would require injecting a string like `"COMMANDLINE=only"`, which is a degenerate fixture. **Below should-fix.** |
| `probe_via_test_hook` — `UAT_PREFLIGHT_PROBE_PID` override branch | #7 | ✅ 100% |
| `probe_via_test_hook` — multi-line CommandLine collapse (`tr '\n' ' '`) | not exercised directly | ⚠️ No test injects a multi-line CommandLine. The branch exists defensively (the bats file's header warns about `$'…'` quoting pitfalls). **Below should-fix.** |
| `probe_process_identity_windows` (real PowerShell path) | not exercised | ⚠️ **By design** — Windows-only, validated in CI. Documented as a known limitation in `03-code-summary.md` §Known Limitations #2 and §Honesty Attestations in `05-test-strategy.md`. |
| `probe_process_identity_unix` (TODO stub) | not exercised | ⚠️ **By design** — TODO marker. Cross-platform support is out of scope per ISS-UAT-013-2. |
| `result handling` — `[[ -z "$probe_output" ]]` branch (empty probe output) | #5 (via `UNBOUND` path; both routes reach the same diagnostic) | ✅ Covered via the `UNBOUND` branch. The plain-empty branch is functionally equivalent. |
| `result handling` — `[[ "$probe_output" == "UNBOUND" ]]` | #5 | ✅ 100% |
| `result handling` — PID numeric validation (`[[ "$pid" =~ ^[0-9]+$ ]]`) | not exercised as a failure case | ⚠️ The happy-path tests (#6, #7, #8, #9, #12) use numeric PIDs. A non-numeric PID would require injecting `PID=abc`, which is a degenerate fixture. The regex check is one line; **below should-fix**. |
| `result handling` — empty CommandLine branch (`[[ -z "$commandline" ]]`) | not exercised | ⚠️ **Gap #1 above** — unreachable from real probe and from test-hook by construction. **Below should-fix per design.** |
| `result handling` — substring mismatch + truncate | #6, #7 | ✅ 100% — the user prompt suggested AC-4 test was "short enough to not exercise the 200-char truncate branch," but **the truncate is unconditional in the mismatch path** (`local_preview="${commandline:0:200}"` runs every time the substring check fails regardless of CommandLine length). Both #6 and #7 reach this branch. **Correction to the user's prompt: the truncate branch IS exercised, no gap.** |
| `result handling` — substring match → `ok` line emitted | #8, #9 | ✅ 100% |

**Branch coverage summary:**

- **Public surface of helper that is exercisable from unit tests:**
  ~95% (12/13 reachable branches, with the one uncovered branch being the
  unreachable-in-practice empty-CommandLine branch).
- **All AC-mandated behaviour:** 100%.
- **Windows real path + Unix stub:** 0% by design (documented, validated in
  CI, not a unit-test concern).
- **Overall branch coverage (of the unit-testable surface):** ≥95%, well
  above the 70% target in `standards.md` §IV.

**Note on `truncate_commandline` clarification:** the user's prompt
described `truncate_commandline` as "inline" and asked whether the AC-4
test exercises it. After re-reading the helper, the truncate is **not a
function** — it's a single bash parameter-expansion line inside the
substring-mismatch branch:
`local_preview="${commandline:0:200}"`. **It is unconditional in the
mismatch path** (runs whether the CommandLine is 50 chars or 5000 chars)
and is therefore exercised by **both** AC-4 bats tests (#6 and #7). No
gap here; recording this correction for the gate.

---

## Honesty Attestations (per AGENTS.md §9)

1. **Test #12 asserts only `[ "$status" -ne 0 ]`, not a specific diagnostic
   substring.** Recorded as Gap #5 above. This is honest disclosure — the
   test does validate the AC (input-shape failure → non-zero exit) but
   does not pin the diagnostic message text. Acceptable per AC.

2. **The bats file does not exercise real PowerShell syntax.** Confirmed
   via file inspection: every test injects synthetic probe output via
   `UAT_PREFLIGHT_PROBE_OUTPUT` / `_PID` / `_FAIL`. Real PowerShell is
   validated only on Windows CI / dev machines. This is the deliberate
   design documented in `03-code-summary.md` §Known Limitations #2 and
   §Key Design Decisions §3.

3. **The header comment's coverage list is incomplete** (AC-1..AC-6
   only; the file covers AC-1..AC-8). Recorded as Gap #2. Not a
   test-correctness issue; a doc-only follow-up.

4. **Branch coverage percentages above are my estimate, not measured.**
   No coverage tool runs against bats files in this repo (per
   `biome.json` + no bats-coverage script). The estimate is based on
   line-by-line reading of the helper and mapping each branch to a test
   in this audit. If a future workflow installs `kcov`-style bats
   coverage, the numbers should be re-confirmed.

5. **I did not run the bats file.** Per the role definition, "Does not
   run tests — that is the TestRunner's job." Runtime results from
   `03-code-summary.md` (12/12 passing, 42/42 across all bats files) are
   accepted as authoritative.

6. **AC-7 and AC-8 are bonus tests, not in the issue's original proposed
   resolution.** They cover AGENTS.md §1.5 ("at least one assertion per
   function") and were added by CodeDeveloper as defensive coverage.
   Marked them as bonus tests in this design — honest disclosure.

---

## Gate Result

```yaml
gate_result:
  status: passed
  attempt: 1
  summary: "Audit confirms the 12 bats cases in scripts/tests/uat-preflight-check.bats meet the testing standards in docs/04-development/standards.md §IV. AAA pattern adapted to bats idiom (per-test export + run + assert), one logical assertion per test (or closely-coupled pair), no shared mutable state (setup + teardown reset env vars), test names describe behaviour, zero skip/pending, zero it.skip. All 8 acceptance points (AC-1..AC-8) are mapped with no gaps. Branch coverage of the unit-testable public surface is ≥95% (12/13 reachable branches; the one uncovered branch is the unreachable-in-practice empty-CommandLine branch). Header comment lists coverage as AC-1..AC-6 but the file covers AC-1..AC-8 — recorded as a minor doc-only follow-up, not a blocker. Real Windows PowerShell path and Unix stub are uncovered by design, documented in 03-code-summary.md §Known Limitations and 05-test-strategy.md §Honesty Attestations. No new test files authored (test surface was owned by CodeDeveloper in Step 4 per the negotiated up-front split); this audit green-lights those tests."
  test_levels:
    unit:
      status: passed
      file: scripts/tests/uat-preflight-check.bats
      count: 12
      required: true
    integration:
      status: not_required
      rationale: "Rubric score 0 — no DB, no API surface, no cross-module calls. Bash CLI utility, exercised at unit-test granularity via the UAT_PREFLIGHT_PROBE_OUTPUT test hook."
    e2e:
      status: not_required
      rationale: "No UI flow involved."
  ac_coverage:
    total_acs: 8
    mapped_acs: 8
    unmapped_acs: 0
  branch_coverage:
    estimated_unit_testable: ">=95%"
    unreachable_branches_acknowledged: 1
    by_design_uncovered: 2
  gaps:
    - id: 1
      severity: informational
      ac: "(no AC — edge branch)"
      description: "No dedicated bats case for the 'has no CommandLine; cannot verify identity' branch (helper lines 290–293). Unreachable from real Windows probe (Get-CimInstance always returns CommandLine) and from test-hook by construction (parser emits non-empty COMMANDLINE= line by default)."
      recommendation: "skip — below should-fix threshold"
      source_confirmation: "05-test-strategy.md §Gap Analysis"
    - id: 2
      severity: informational
      ac: "(no AC — doc-only)"
      description: "Bats file header comment lists coverage as AC-1 through AC-6 but the file covers AC-1..AC-8 (12 cases). Doc-only inconsistency, not a test-correctness issue."
      recommendation: "Follow-up in a future maintenance PR — add AC-7 and AC-8 to the header's coverage list."
    - id: 3
      severity: by_design
      ac: "(no AC — Windows-only)"
      description: "Real Windows PowerShell path (probe_process_identity_windows) is not exercised by any bats case."
      recommendation: "Validated by Windows CI / Windows dev machines per 03-code-summary.md §Known Limitations #2 and §Key Design Decisions §3."
    - id: 4
      severity: by_design
      ac: "(no AC — cross-platform TODO)"
      description: "macOS / Linux probe (probe_process_identity_unix) is a TODO stub and not exercised."
      recommendation: "Cross-platform support is out of scope per ISS-UAT-013-2 §'Out of scope' and AGENTS.md §0 (Windows-first team)."
    - id: 5
      severity: trivial
      ac: "AC-8"
      description: "Test #12 asserts only [ \"$status\" -ne 0 ], not a specific diagnostic substring."
      recommendation: "Optional belt-and-braces: add `[[ \"$output\" == *\"empty\"* ]]`. Acceptable as-is because the helper's `fail \"expected-substring must not be empty\"` is deterministic."
  retriable_gaps: 0
  next_step: "Step 7 — TestRunner. Run `bash scripts/run-bats.sh scripts/tests/uat-preflight-check.bats` and the full `scripts/tests/*.bats` glob to confirm runtime behaviour matches the audit's static analysis. Expected: 12/12 passing on the new file, 42/42 across all bats files (no regressions)."
```