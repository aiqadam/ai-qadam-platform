# Step 2 — Impact Analysis: FEAT-WORKFLOW-002 (PR A only)

> Output for: `.copilot/tasks/active/wf-20260623-feat-006/02-impact-analysis.md`
> Agent: ImpactAnalyzer (Orchestrator-authored)
> Workflow: wf-20260623-feat-006

---

## Files affected

| File | Change type | LOC delta (est.) | Reason |
|---|---|---|---|
| `package.json` | modify | +6 / -0 | Add `bats-core` devDep + `test:bash` script |
| `scripts/workflow-finish.sh` | modify | +50 / -180 | Extract F.5 inline block (lines ~220-415) into a callable function; add `--source-only` flag |
| `scripts/tests/check-workflow-state.bats` | create | +120 / -0 | AC-1, AC-2, AC-8, AC-10 (shellcheck skipped — covered in PR B) |
| `scripts/tests/workflow-finish-amend.bats` | create | +100 / -0 | AC-6 (marker present) + AC-7 (marker absent) |
| `scripts/tests/step-0.5-doc-presence.bats` | create | +40 / -0 | AC-9 (string presence in both workflow files) |
| `scripts/tests/quality-gate-context.bats` | create | +80 / -0 | AC-8 (mocked diff → check sub-check logic) |
| `scripts/tests/test_helper.bash` | create | +60 / -0 | Shared bats helper: git-repo setup, fixture creation |

**Estimated net LOC:** ~280 added, ~180 removed → net +100. Within the
400-LOC PR cap. ✅

## Risk analysis

### R-1: F.5 refactor changes runtime behavior

**Risk:** Extracting the F.5 block from inline into a function may
introduce subtle differences (variable scoping, subshell boundaries).

**Mitigation:**
- The `--source-only` flag makes the function callable in tests
  without re-running the entire script.
- The function takes all state via explicit args, not globals.
- The existing inline F.5 path is replaced by a single function call,
  so behavior is preserved if the function is a faithful extraction.
- A new `workflow-finish-amend.bats` test exercises both the
  marker-present and marker-absent paths with fixtures.

**Severity:** Medium. **Owner:** CodeDeveloper.

### R-2: bats-core install on dev machines

**Risk:** pnpm install of bats-core adds ~50MB; some devs may have it
globally and conflict.

**Mitigation:**
- bats-core is a pure Node package (no native bindings); pnpm
  install is hermetic and adds it to `node_modules/.bin/`.
- The `test:bash` script uses `pnpm exec bats` so it picks up the
  local install first, not the global one.
- `.gitignore` already covers `node_modules/`.

**Severity:** Low.

### R-3: PowerShell + bats on Windows

**Risk:** bats is a bash test framework. Windows dev machines need
git-bash or WSL to run it. The repo's terminal defaults to PowerShell
5.1.

**Mitigation:**
- The `test:bash` script in `package.json` invokes `bats` directly
  (no shell prefix), so pnpm uses the host shell. On Windows that
  is PowerShell by default, which can run `.bat`/`.cmd` wrappers
  but not `.sh`. The `bats-core` npm package ships with a
  `bin/bats` script that has a `.bat` shim for Windows.
- README in `scripts/tests/README.md` will document: "Run from git-bash
  or WSL on Windows."

**Severity:** Low (CI runners are Linux per `apps/api/Dockerfile`).

### R-4: Test fixtures commit the dev-machine's `archived/` dir shape

**Risk:** The bats test for the `archived/` orphan check (one of the
regressions for ISS-WF-13-1) needs a fixture `archived/` dir. If
committing the fixture as a real file, it would be ignored by
`.gitignore` (`.copilot/tasks/`).

**Mitigation:**
- bats fixtures are created in a `BATS_TEST_TMPDIR` (a per-test
  tmp dir under the system temp path) and never committed.
- The bats helper `test_helper.bash` initialises a fresh git repo
  in `BATS_TEST_TMPDIR` with the minimum state files to exercise
  the drift script.

**Severity:** Low.

## Cross-cutting decisions

### C-1: `apply_context_sync_update()` signature

```bash
apply_context_sync_update() {
  local handoff="$1"
  local workflow_dir="$2"
  local workspace_state="$3"
  local branch="$4"
  ...
}
```

All state via explicit args, no reliance on script-level globals. This
makes the function testable in isolation.

### C-2: `--source-only` flag

```bash
if [[ "${1:-}" == "--source-only" ]]; then
  return 0  # exit early; functions are now defined in caller
fi
```

This pattern is the conventional bash "library mode" used by
`git-sh-setup` and other tools. It allows `source <(script.sh
--source-only)` in tests.

### C-3: bats fixture strategy

Each test gets its own `BATS_TEST_TMPDIR` with:
- A fresh git repo (`git init`)
- A copy of `scripts/check-workflow-state.sh` (or the F.5
  function under test)
- A minimal `.copilot/context/workspace-state.md` and
  `.copilot/issues/registry.md` shape

The helper functions in `test_helper.bash` encapsulate this.

## Database migration impact

**None.** No schema change. Step 3 (DBMigrationAuthor) is skipped.

---

## Gate Result

```markdown
## Gate Result

gate_result:
  workflow_id: "wf-20260623-feat-006"
  workflow_type: "requirement-development"
  requirement_ref: "FEAT-WORKFLOW-002"
  decision: "passed"
  notes: "PR A scoped: F.5 refactor + bats test files. PR B (shellcheck) deferred. All risks mitigated."
  retry_count: 0
  timestamp: "2026-06-23T06:10:00Z"
```
