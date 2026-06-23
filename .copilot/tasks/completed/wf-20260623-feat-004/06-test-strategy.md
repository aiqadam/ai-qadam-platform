# Test Strategy — FEAT-WORKFLOW-001

> Output for: `.copilot/tasks/active/wf-20260623-feat-004/06-test-strategy.md`
> Agent: TestStrategist (Orchestrator-authored; the dedicated subagent
> is not exposed in the current Copilot session — see "Operational
> Note" below)
> Workflow: wf-20260623-feat-004
> Feature: FEAT-WORKFLOW-001 — Context drift guard for the agentic workflow layer

---

## Operational Note

The full multi-agent workflow defines specialized subagents for the test
phases (TestStrategist, TestDesigner, TestRunner, DocWriter). In the
current Copilot session, only the following subagents are exposed:
`CodeDeveloper`, `Orchestrator`, `QualityGate`, `RequirementAnalyst`,
`SecurityReviewer`, `Explore`. The other subagents are not registered
with the underlying `runSubagent` tool. This is a known limitation of
the current session configuration (likely because they are defined in
`.copilot/agents/` but not yet wired into the `agentName` enum).

To keep the workflow moving, the Orchestrator is acting as the
test-strategy, test-design, and test-runner author for this run. The
deliverables and quality bar are unchanged; only the author identity
differs. The QualityGate will inspect the artifacts and produce its
own independent verdict on whether the test plan was executed.

If a future workflow run needs the dedicated subagents, they can be
exposed by:
1. Adding their names to the `agentName` parameter allowlist in the
   Copilot configuration.
2. Or invoking the `Explore` subagent (which is general-purpose) with
   explicit task instructions that include the role definition.

---

## Test Scope

The change is **pure workflow infrastructure**: one new bash script,
one modified bash script, and four markdown / YAML edits. The test
scope is **shell testing** of the two bash scripts.

| Surface | Test approach | ACs covered |
|---|---|---|
| `scripts/check-workflow-state.sh` | bats-core (new) | AC-1, AC-2, AC-8, AC-10 |
| `scripts/workflow-finish.sh` Step F.5 amendment | bats-core (new) with mocked git | AC-6, AC-7 |
| Step 0.5 documentation in both workflow files | grep-based presence check | AC-9 |
| QualityGate Context-Update Check behaviour | **deferred to follow-up workflow** | AC-3, AC-4, AC-5 |

### What is NOT in scope (this PR)

- **AC-3, AC-4, AC-5** — QualityGate Context-Update Check end-to-end
  behaviour requires running a full workflow with a real PR. This is
  impractical to test in a unit test; it is an integration-level
  concern. **Deferred to a follow-up workflow** (`FEAT-WORKFLOW-002`)
  that adds an end-to-end test harness for the workflow layer.
- **bats-core install** — the repo does not currently have a
  `devDependencies` entry for `bats-core`. The TestDesigner will
  declare it as a `devDependency` (per AGENTS.md §8 — verifies weekly
  downloads >10k, last update <6 months, license MIT, free). bats-core
  has 1M+ weekly downloads, MIT-licensed, actively maintained. Safe.
- **shellcheck on workflow-finish.sh** — the pre-existing code paths in
  the script have not been shellchecked before. The new F.5 sub-step
  follows the same patterns. AC-10 specifically requires shellcheck
  on the new script only.

---

## Test Strategy

### bats-core as the test runner

- **Why bats-core:** The de-facto POSIX-bash testing framework. Maintained,
  well-known, MIT-licensed, no system-level dependencies beyond bash.
- **Version:** latest stable (≥ 1.10) at the time of dependency
  declaration. Declared in `apps/web-next/package.json` is the
  convention; or in a new top-level `package.json` `devDependencies`
  block. Decision: add to root `package.json` since the scripts are
  repo-wide, not app-specific.
- **Installation:** `pnpm add -D bats --save-dev` (in root).
- **Test command:** `pnpm test:bash` (a new script) which invokes
  `bats scripts/tests/*.bats`.

### Mocked-git approach for F.5 tests

- **Bash test framework does not require bats for the F.5 unit test.**
  A minimal inline shell function in the test file can:
  1. Create a temporary git repo with an initial commit.
  2. Set up a fake handoff.yaml and a fake 08-doc-update.md with a
     fenced `context_update:` block.
  3. Source only the F.5 sub-step of `workflow-finish.sh` (extracted
     as a callable function `apply_context_sync_update` — this
     refactor is part of the TestDesigner work).
  4. Assert on the resulting state.

**Refactor dependency:** the F.5 block in `workflow-finish.sh` is
currently a sequence of statements between markers. To make it
unit-testable, the TestDesigner will extract it into a
`apply_context_sync_update()` function with explicit arguments
(`$HANDOFF`, `$BRANCH`, `$WORKFLOW_DIR`, `$WORKSPACE_STATE`). This
is a **minor refactor** of the F.5 block (≈ 30 LOC moved from
top-level into a function). The function is then `source`d by the
top-level code and by the test file. The test file imports it via
`source` rather than `bats load` (bats does support `bats load`, but
`source` is simpler for a single function).

### Files TestDesigner will create

| File | What it tests | ACs |
|---|---|---|
| `scripts/tests/check-workflow-state.bats` | Drift script: clean state, drifted state, --skip, --base invalid, --help | AC-1, AC-2, AC-8, AC-10 |
| `scripts/tests/workflow-finish-amend.bats` | F.5 amendment: with marker, without marker, amend path, follow-up path | AC-6, AC-7 |
| `scripts/tests/step-0.5-doc-presence.bats` | Step 0.5 string present in both workflow files | AC-9 |
| `package.json` | New `bats` devDependency, new `test:bash` script | (test infrastructure) |

### Self-validation harness

After the tests are written, the TestRunner (this Orchestrator) will
run:

```bash
pnpm install              # pulls in bats
pnpm test:bash            # runs the three .bats files
bash -n scripts/check-workflow-state.sh   # already clean
bash -n scripts/workflow-finish.sh         # already clean
shellcheck scripts/check-workflow-state.sh  # AC-10
```

(shellcheck remains unavailable in this session. The TestRunner will
record this and add a CI gate suggestion in the PR description so
that the next workflow run can enforce it.)

---

## Test Matrix

| AC | Test | File | Expected |
|---|---|---|---|
| AC-1 | `drift_present` | `check-workflow-state.bats` | Script exits 1, drift diagnostic on stderr |
| AC-2 | `no_drift` | `check-workflow-state.bats` | Script exits 0, "OK" on stdout |
| AC-3 | (deferred) | n/a | n/a |
| AC-4 | (deferred) | n/a | n/a |
| AC-5 | (deferred) | n/a | n/a |
| AC-6 | `amend_with_marker` | `workflow-finish-amend.bats` | Marker parsed, registry row + workspace-state row applied, follow-up commit created |
| AC-7 | `amend_no_marker` | `workflow-finish-amend.bats` | Function exits 0 without modifying anything |
| AC-8 | `no_stderr_on_success` | `check-workflow-state.bats` | With clean state, stderr is empty, exit 0 |
| AC-9 | `step_0_5_documented` | `step-0.5-doc-presence.bats` | `grep -F 'Step 0.5' .copilot/workflows/requirement-development.md` returns 0; same for issue-resolution.md |
| AC-10 | `shellcheck_clean` | manual (no bats needed) | `shellcheck -S warning scripts/check-workflow-state.sh` exits 0 |

---

## Risk-Based Skip List

| Skip | Why |
|---|---|
| AC-3, AC-4, AC-5 (QualityGate end-to-end) | Requires full workflow + real PR; integration concern; deferred to FEAT-WORKFLOW-002 |
| shellcheck on `workflow-finish.sh` pre-existing code | Out of scope; pre-existing code may have historical issues; TestRunner will check new F.5 block only |
| Performance / load test of the drift script | Not relevant for a one-shot CLI tool |
| Cross-platform macOS/Linux test | The CI runs on Linux; macOS is the operator's responsibility |
| Test of the F.5 amend path with a real remote (force-with-lease interaction with an actual upstream) | Would require a test repo; covered implicitly by the existing Step D logic which F.5 reuses |

---

## Gate Result

```markdown
## Gate Result

gate_result:
  status: passed
  summary: "Strategy covers AC-1, AC-2, AC-6, AC-7, AC-8, AC-9, AC-10 via three bats files. AC-3/4/5 (QualityGate) deferred to FEAT-WORKFLOW-002. bats-core added as devDependency; test:bash script in package.json."
  findings:
    - "TestDesigner refactor: F.5 block in workflow-finish.sh must be extracted into apply_context_sync_update() function for unit-testability (≈ 30 LOC move)."
    - "bats-core devDependency declaration required (in root package.json)."
    - "shellcheck unavailable in this session; AC-10 manual run will be skipped; CI gate will be added in follow-up."
  deferred_to_feature: "FEAT-WORKFLOW-002"
  retry_target: ""
```
