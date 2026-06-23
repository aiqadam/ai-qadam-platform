# Step 6 — Test Strategy (FEAT-WORKFLOW-002)

**Workflow:** wf-20260623-feat-006
**Author:** Orchestrator

## Goal

Lock down the behaviour of the two workflow scripts introduced in
FEAT-WORKFLOW-001 (PR #13) and the F.5 amendment step, so that future
changes to `workflow-finish.sh` or `check-workflow-state.sh` cannot
silently break the agentic workflow pipeline.

## Test pyramid (this PR)

```
                  ┌──────────────────────────┐
                  │  E2E (Playwright)        │  — out of scope; this
                  │                          │    is a CI/tooling PR
                  ├──────────────────────────┤
                  │  Integration (bats)      │  — primary layer
                  │  30 tests across 4 files │
                  ├──────────────────────────┤
                  │  Unit (bats, function-   │  — extract_context_block,
                  │  level)                  │    parse_context_block
                  └──────────────────────────┘
```

PR A is **integration-heavy** (bats runs the real scripts against a
fresh per-test git repo). It is **not** a unit-test layer for the
bats helpers themselves — those unit tests are the test file
`workflow-finish-amend.bats` (extract + parse tests).

## Test matrix (per AC)

| AC | Test file | Test count | Approach |
|---|---|---|---|
| AC-1 (drift detected) | check-workflow-state.bats | 6 | Fresh git repo; insert row referencing missing workflow; assert exit 1 + diagnostic |
| AC-2 (drift clean) | check-workflow-state.bats | 7 | Fresh git repo with all state files; assert exit 0 + success summary |
| AC-6 (F.5 amendment) | workflow-finish-amend.bats | 8 | Fresh repo with workflow dir; call `apply_context_sync_update`; assert registry + ws changes |
| AC-7 (F.5 no-op) | workflow-finish-amend.bats | 3 | Missing gate / missing context_update / `expects_registry_update: false` |
| AC-8 (stderr/stdout) | check-workflow-state.bats, quality-gate-context.bats | 3 | Combine streams via `2>&1`, assert DRIFT/ERROR present in combined but not in stdout-only |
| AC-9 (doc presence) | step-0.5-doc-presence.bats | 5 | `grep -nE` for required keywords in script headers |

## What this test suite does NOT cover (deferred)

- **AC-10 shellcheck**: Out of scope for PR A. PR B
  (FEAT-WORKFLOW-003) will add a `lint:shell` script that runs
  `shellcheck` and treats warnings as errors. Splitting is required
  because shellcheck is GPL-licensed and the PR would exceed 400 LOC
  if included.
- **Performance / load tests**: The scripts are not on a hot path
  (they run once per workflow, which is a manual process). Skip.
- **Cross-shell portability**: We assume bash 4.x. CI is Ubuntu
  (bash 5.x). Local Windows dev uses Git Bash. bats itself runs on
  bash. We do NOT test dash / sh / zsh.
- **Network behaviour**: Both scripts run locally; no network. Skip.

## Non-test checks (CI gates that already exist or will be added)

| Gate | Source | Status |
|---|---|---|
| Typecheck | `pnpm -r typecheck` | Out of scope (no .ts changed) |
| Lint (Biome) | `pnpm -r lint` | Out of scope (no .ts changed) |
| Build | `pnpm build` | Out of scope (no app code changed) |
| `test:bash` | `pnpm test:bash` | **NEW** — runs `scripts/run-bats.sh scripts/tests/*.bats` |
| `lint:shell` | `pnpm lint:shell` | DEFERRED to PR B (FEAT-WORKFLOW-003) |

## Test fixture isolation

Every test runs in a fresh `BATS_TEST_TMPDIR/repo` (created via
`mktemp -d`). The fixture is:

```
BATS_TEST_TMPDIR/
  repo/                      # git init, all state files, scripts copied in
  origin/                    # bare git init (only for "with-origin" mode)
```

No fixture data is shared between tests. There is no `teardown` for
the test repo — bats deletes `BATS_TEST_TMPDIR` automatically.

## Decision

The 30-test integration suite is sufficient for PR A. Shellcheck,
Playwright, and load tests are explicitly out of scope and deferred.
