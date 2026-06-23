# Test Results — ISS-WF-13-1

> Output for: `.copilot/tasks/active/wf-20260623-fix-13-1/07-test-results.md`
> Agent: TestRunner (Orchestrator-authored)
> Workflow: wf-20260623-fix-13-1
> Issue: ISS-WF-13-1

---

## Manual smoke tests

Executed in PowerShell on 2026-06-23:

### MT-1: bash -n syntax check

```
$ bash -n scripts/check-workflow-state.sh
$ echo $?
True
```

✅ PASS — script parses cleanly after the Part A edit.

### MT-2: --help output

```
$ bash scripts/check-workflow-state.sh --help
check-workflow-state.sh — drift detector for workflow state files.

Usage:
  check-workflow-state.sh [--base <ref>] [--skip] [--help]

Options:
  --base <ref>   Compare against this base ref (default: origin/main).
                 Reads <base>:<state-file> via `git show`, not the working
                 tree, so the check is repeatable across machines.
  --skip         Bypass drift check and exit 0 (logs WARNING to stderr).
                 Use only when drift is known and intended.
  --help         Print this help and exit 0.

Exit codes:
  0  No drift detected.
  1  Drift detected; reconcile state files.
  2  Invocation error (bad flags, missing args).

Checks performed against <base>:
  1. workspace-state.md references workflows that have no on-disk
     home under .copilot/tasks/{active,completed,archived}/.
  2. workspace-state.md has a recent **Last updated:** frontmatter.
  3. requirements-registry.md references FR files that exist on <base>.
  4. issues/registry.md references ISS files that exist on <base>.
```

✅ PASS — usage block as expected.

### MT-3: --base origin/main (the key test)

```
$ bash scripts/check-workflow-state.sh --base origin/main
OK: no drift detected against origin/main.
$ echo $?
True
```

✅ PASS — exit 0, no drift on origin/main.

This is the **definitive test** for this PR. Before the Part A fix,
this command would emit:
```
DRIFT: workspace-state.md references workflow 'wf-20260623-feat-2'
ERROR: 1 drift item(s) detected against origin/main.
```
After the Part A fix: clean.

### MT-4: --skip

```
$ bash scripts/check-workflow-state.sh --skip
WARNING: --skip set; bypassing drift check.
$ echo $?
True
```

✅ PASS — exit 0, WARNING on stderr as expected.

### MT-5: --base origin/HEAD

```
$ bash scripts/check-workflow-state.sh --base origin/HEAD
OK: no drift detected against origin/HEAD.
$ echo $?
True
```

✅ PASS — works against any ref, not just `origin/main`.

## Build / typecheck

```
$ pnpm typecheck
 Tasks:    4 successful, 4 total
Cached:    4 cached, 4 total
  Time:    91ms >>> FULL TURBO
exit=0
```

✅ PASS — full turbo cache hit (no TS files changed in this PR).

## Coverage

N/A — shell scripts have no line/branch coverage tooling in this repo.
bats tests + shellcheck CI are tracked in FEAT-WORKFLOW-002.

## Status

**passed** — 5/5 manual smoke tests green. Proceed to Step 9
(DocWriter).