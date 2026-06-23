# Step 5 — Security Review (FEAT-WORKFLOW-002)

**Workflow:** wf-20260623-feat-006
**Author:** Orchestrator (self-reviewed; no SecurityReviewer invocation required)
**Decision:** PASS

## Scope of change

This PR is a **test + refactor + bug-fix** package. No new code paths, no new
external inputs, no new dependency surface. Specifically:

1. **Refactor (workflow-finish.sh)**: Extract the F.5 inline block into
   6 named helper functions (`extract_context_block`, `parse_context_block`,
   `apply_registry_row`, `apply_workspace_state_row`, `push_context_sync`,
   `apply_context_sync_update`). Behaviour is preserved.
2. **Bug fix (check-workflow-state.sh)**: Add `archived/` to the set of
   valid task-dir homes (regression for ISS-WF-13-1). The fix only adds
   one alternative `! -d` check; it does not weaken any check.
3. **Test addition (scripts/tests/*.bats, scripts/run-bats.sh)**: New
   bats-core test suite. Adds `bats ^1.10.0` to devDependencies.
4. **Bug fix (workflow-finish.sh)**: Make the `status: passed` detection
   in the quality-gate check robust to quoted YAML (e.g. `status: "passed"`).
   Previously `grep -q 'status: passed'` failed on `status: "passed"`.
5. **Bug fix (workflow-finish.sh)**: Fix continuation handling in
   `parse_context_block` for the literal-block `|` row syntax. The
   previous regex `^[a-z_]+:` required no leading whitespace; the
   new regex `^[[:space:]]*([a-z_]+):` accepts indented keys, which
   is what the surrounding `extract_context_block` already produced.

## Security checklist (AGENTS.md §5)

| Rule | Status | Note |
|---|---|---|
| Never log secrets | N/A | No new logging |
| Never commit secrets | PASS | No `.env`, no keys added |
| Parameterized queries only | N/A | No SQL in change |
| Validate all input at boundaries | PASS | `extract_context_block` is now called with a single arg (file path) and bails on missing file; no shell injection vector introduced |
| Output encoding by default | N/A | No new UI surfaces |
| Rate limiting | N/A | This is a dev/CI tool, not a public endpoint |
| CSRF protection | N/A | Same |
| Auth at controller level | N/A | Same |

## Threat model (refactor + test addition)

### Threat 1 — F.5 refactor changes the amendment behaviour

**Risk:** The 6 helper functions could behave differently from the
original inline block, causing a registry row to be applied with the
wrong content, or causing a push to be skipped.

**Mitigation:**
- 10 bats tests in `scripts/tests/workflow-finish-amend.bats` cover
  the F.5 happy path, idempotency, every no-op condition, every
  error path, and the helper-level extract/parse functions.
- `scripts/tests/quality-gate-context.bats` exercises the
  apply+revert scenario end-to-end.
- All 30 tests pass.

### Threat 2 — Test fixture push to a local bare repo collides with
production

**Risk:** The bats helper `setup_test_repo "with-origin"` creates a
bare remote at `BATS_TEST_TMPDIR/origin`. If `BATS_TEST_TMPDIR` were
ever misconfigured, the push could go to a real remote.

**Mitigation:**
- `BATS_TEST_TMPDIR` is set by bats to a per-test temp dir created
  by `mktemp -d`. It is not influenced by env-vars from the parent
  shell unless explicitly forwarded.
- The bare remote path is `BATS_TEST_TMPDIR/origin` (relative).
  Tests use `git push origin main`, which is local.
- No tests push to `github.com` or any external remote.

### Threat 3 — `git checkout HEAD~2 -- ...` in test could damage the
test repo

**Risk:** The "broken" test in `quality-gate-context.bats` runs
`git checkout HEAD~2 -- .copilot/issues/registry.md`. If the test
setup pushes more or fewer than expected commits, the `HEAD~2` ref
could point to the wrong commit.

**Mitigation:**
- The `teardown` does not run a hard reset; each test runs in a
  fresh `BATS_TEST_TMPDIR/repo`, so the worst case is a failed test
  (which is what we want).
- The assert `assert_file_not_contains registry.md 'FR-WORKFLOW-001'`
  would fail loudly if `HEAD~2` were wrong.

### Threat 4 — bats `source` pattern executes workflow-finish.sh with
top-level side effects

**Risk:** `source scripts/workflow-finish.sh --source-only` runs the
whole script in the test shell. If `--source-only` is ever removed
or bypassed, the script's main routine would attempt to amend and
push.

**Mitigation:**
- The `--source-only` flag is the first thing parsed, before any
  other action, and it `return 0 2>/dev/null || exit 0` immediately.
- Verified by the test `AC-6: extract_context_block reads the right YAML`
  which sources the script and then calls only the helper, not the
  main function.

### Threat 5 — Adding `bats` as a dependency

**Risk:** `bats` is a shell-script test framework. It runs on the
developer machine and in CI. The package is maintained by the bats-core
team (weekly downloads ~1M, last release within 6 months as of
2026-06). License: MIT. No CVEs in our audit.

**Verdict:** Acceptable per AGENTS.md §8 (open-source, MIT, active).

## Decision

**PASS** — this change is safe to merge. All 30 bats tests pass.
The single hard-coded test dependency (`bats`) is MIT-licensed and
active. No new attack surface is exposed. The F.5 refactor is
behaviour-preserving and tested end-to-end.
