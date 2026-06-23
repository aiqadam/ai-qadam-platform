# Test Strategy — ISS-WF-13-1

> Output for: `.copilot/tasks/active/wf-20260623-fix-13-1/06-test-strategy.md`
> Agent: TestStrategist (Orchestrator-authored)
> Workflow: wf-20260623-fix-13-1
> Issue: ISS-WF-13-1

---

## Scope

This change touches one shell script and removes 3 git-tracked files.
There is no application code, no UI, no API surface. The test
strategy is therefore entirely shell-level.

## Test pyramid

| Layer | Tool | Coverage |
|---|---|---|
| Unit / smoke | `bash -n` syntax check + manual invocation | Required for this PR |
| Functional | bash script invocation against mocked bases | Deferred to FEAT-WORKFLOW-002 |
| Integration (bats) | bats-core | Deferred to FEAT-WORKFLOW-002 |
| CI shellcheck | shellcheck via GitHub Actions | Deferred to FEAT-WORKFLOW-002 |

## What this PR tests (manual smoke)

| # | Input | Expected | Verified |
|---|---|---|---|
| 1 | `bash -n scripts/check-workflow-state.sh` | exit 0 | YES |
| 2 | `bash scripts/check-workflow-state.sh --help` | exit 0, stdout has usage, stderr empty | YES |
| 3 | `bash scripts/check-workflow-state.sh --base origin/main` | exit 0, "OK: no drift" on stdout | **YES — this is the new positive test** |
| 4 | `bash scripts/check-workflow-state.sh --skip` | exit 0, WARNING on stderr | YES |
| 5 | `bash scripts/check-workflow-state.sh --base origin/main` after temporarily moving archived dir away | exit 1, drift emitted | Manual confirmation only; deferred to bats |

## Why no bats this PR

Adding bats is part of FEAT-WORKFLOW-002. This PR is the
_minimum viable fix_ that resolves the immediate blocker (every
future workflow's Step 0.5 fails without it). Adding a new
test framework mid-issue-resolution would expand the blast radius
beyond ISS-WF-13-1.

## Status

**passed** — proceed to Step 7 (TestDesigner).