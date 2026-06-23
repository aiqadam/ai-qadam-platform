# Step 1 — Requirement Validation: FEAT-WORKFLOW-002

> Output for: `.copilot/tasks/active/wf-20260623-feat-006/01-requirement-validation.md`
> Agent: RequirementAnalyst (Orchestrator-authored)
> Workflow: wf-20260623-feat-006

---

## What I'm being asked to do

Add an automated test suite for the workflow-script tooling introduced in
FEAT-WORKFLOW-001 (PR #13) and registered in FEAT-WORKFLOW-002. The tooling
shipped with manual smoke-test evidence (4 tests in 07-test-results.md for
wf-20260623-feat-004; 5 tests for wf-20260623-fix-13-1). This feature
formalises that testing.

## Acceptance criteria (verbatim from FEAT-WORKFLOW-002)

| AC | Requirement | Verifiable by |
|---|---|---|
| AC-1 | `bats-core` declared as a root devDependency (^1.10.0) in `package.json` | `grep '"bats"' package.json`; `pnpm install` succeeds |
| AC-2 | `pnpm test:bash` script in root `package.json` running `bats scripts/tests/*.bats` | `pnpm test:bash` exits 0 with all tests passing |
| AC-3 | `scripts/tests/check-workflow-state.bats` covers AC-1 (drift present → exit 1), AC-2 (no drift → exit 0), AC-8 (PowerShell stderr rule), AC-10 (shellcheck) | bats test runs and passes |
| AC-4 | `scripts/tests/workflow-finish-amend.bats` covers AC-6 (marker present → amendment) and AC-7 (marker absent → no-op) | bats test runs and passes |
| AC-5 | `scripts/tests/step-0.5-doc-presence.bats` covers AC-9 (Step 0.5 string in both workflow files) | bats test runs and passes |
| AC-6 | F.5 refactor: extract F.5 inline block in `workflow-finish.sh` into a callable `apply_context_sync_update()` function with explicit args; add a `--source-only` flag | `bash -c "source <(scripts/workflow-finish.sh --source-only); type apply_context_sync_update"` reports a function |
| AC-7 | `shellcheck` added to CI: gate `scripts/check-workflow-state.sh` and the new F.5 sub-step on `shellcheck -S warning` | `pnpm lint:shell` exits 0 |
| AC-8 | QualityGate end-to-end test harness: `scripts/tests/quality-gate-context.bats` exercising the "Context-Update Check" sub-check via mocked diff | bats test runs and passes |

## Conflict / overlap check

- **No conflict with existing features.** The drift script and F.5 amendment
  are read-only consumers of state files; this feature only adds test code
  and a small refactor of `workflow-finish.sh` to make F.5 callable.
- **Dependency policy (AGENTS.md §8):** `bats-core` qualifies — weekly
  downloads ~1M+, last release within 6 months, MIT, free. `shellcheck`
  is GPLv3, which per AGENTS.md §8 **requires explicit user approval** —
  this is flagged in the Notes section of FEAT-WORKFLOW-002 and is an
  open question. **For now, the shellcheck step is wired to the `lint:shell`
  script but the script will emit a `WARN: shellcheck not installed`
  when shellcheck is not on PATH. CI runners must install shellcheck
  explicitly. The user must approve shellcheck's GPLv3 before this can
  become a hard gate in CI.**
- **Small PR rule (AGENTS.md §4):** The full feature exceeds 400 LOC if
  delivered as one PR. **Recommendation: split into two PRs:**
  1. **PR A (this PR):** F.5 refactor + bats test files + `test:bash`
     script in `package.json`. No shellcheck wiring yet.
  2. **PR B (deferred to FEAT-WORKFLOW-003):** Add `shellcheck` to
     devDependencies (after user approves GPLv3) + `lint:shell` script
     + CI gate.

  This split keeps PR A under the 400-LOC cap and isolates the
  licensing decision.

## Decision

**Conditionally Approved, with PR-split recommendation.**

This workflow will deliver **PR A** only. The shellcheck half (AC-7) is
deferred to a follow-on issue `FEAT-WORKFLOW-003` to be created by
DocWriter.

## Open question for the user

> Do you approve shellcheck (GPLv3) as a devDependency in this project?
> If yes, this workflow can be extended to deliver AC-7 in the same PR.
> If no, FEAT-WORKFLOW-002 is shipped without AC-7 and the issue is
> registered for a future decision.

If you don't answer, the safe default is **defer** (PR A only).

---

## Gate Result

```markdown
## Gate Result

gate_result:
  workflow_id: "wf-20260623-feat-006"
  workflow_type: "requirement-development"
  requirement_ref: "FEAT-WORKFLOW-002"
  decision: "passed"
  notes: "Approved as PR A only. Shellcheck (AC-7) deferred to FEAT-WORKFLOW-003 pending user approval of GPLv3 dependency."
  retry_count: 0
  timestamp: "2026-06-23T06:00:00Z"
```
