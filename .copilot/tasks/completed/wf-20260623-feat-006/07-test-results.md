# Step 8 — Test Runner Results (FEAT-WORKFLOW-002)

**Workflow:** wf-20260623-feat-006
**Author:** Orchestrator
**Test command:** `bash scripts/run-bats.sh scripts/tests/`

## Result

```
check-workflow-state.bats
 ✓ AC-2: --base origin/main exits 0 on a clean repo
 ✓ AC-1: --base origin/main exits 1 when workspace-state.md references a missing workflow
 ✓ AC-1: archived/ is recognised as a valid task-dir home (ISS-WF-13-1 regression)
 ✓ AC-1: active/ is recognised as a valid task-dir home
 ✓ AC-1: completed/ is recognised as a valid task-dir home
 ✓ AC-1: missing FR file in requirements-registry.md triggers drift
 ✓ AC-2: --base origin/HEAD works (alt ref)
 ✓ AC-2: --help prints usage and exits 0
 ✓ AC-2: --skip exits 0 with WARNING on stderr
 ✓ AC-8: drift diagnostic is written to stderr, not stdout
 ✓ AC-2: success summary goes to stdout
 ✓ AC-2: invocation error (bad flag) exits 2
 ✓ AC-2: missing base ref (ref doesn't exist) — exits non-zero
quality-gate-context.bats
 ✓ AC-8: PR diff that updates registry row passes the context-update check
 ✓ AC-8: PR diff that does NOT update the registry fails the check
step-0.5-doc-presence.bats
 ✓ AC-9: 'Step 0.5' appears in scripts/check-workflow-state.sh
 ✓ AC-9: 'F.5' (Context Sync amendment step) appears in scripts/workflow-finish.sh
 ✓ AC-9: 'FEAT-WORKFLOW-001' appears in both scripts
 ✓ AC-9: 'context_update' (with the underscore) appears in workflow-finish.sh
 ✓ AC-9: check-workflow-state.sh documents its role in Step 0.5
workflow-finish-amend.bats
 ✓ AC-6: marker present + gate passed → registry row applied
 ✓ AC-6: marker present + gate passed → workspace-state row applied
 ✓ AC-7: marker absent (no context_update block) → no-op
 ✓ AC-7: gate not passed → no-op
 ✓ AC-7: expects_registry_update: false → no-op
 ✓ AC-6: idempotency — applying twice does not duplicate registry row
 ✓ AC-6: missing registry_file in context_update block → ERROR to stderr
 ✓ AC-6: extract_context_block reads the right YAML
 ✓ AC-6: parse_context_block populates CTX_* globals
 ✓ AC-6: workspace_state row is inserted into the named section, not at end

30 tests, 0 failures
```

## Exit code

`0` (zero failures).

## Coverage by acceptance criterion

| AC | Tests | Status |
|---|---|---|
| AC-1 (drift detected) | 5 tests in check-workflow-state.bats | ✅ |
| AC-2 (no drift / no-op) | 7 tests in check-workflow-state.bats | ✅ |
| AC-6 (F.5 amendment) | 7 tests in workflow-finish-amend.bats | ✅ |
| AC-7 (F.5 no-op conditions) | 3 tests in workflow-finish-amend.bats | ✅ |
| AC-8 (stderr/stdout split) | 2 tests (1 drift, 1 quality-gate) | ✅ |
| AC-9 (doc presence) | 5 tests in step-0.5-doc-presence.bats | ✅ |
| AC-10 (shellcheck) | **DEFERRED to PR B (FEAT-WORKFLOW-003)** | n/a |

## Suite exit code

`0` — the suite is green. PR A is ready for the QualityGate step.
