# ISS-UAT-BATS-001 — Pre-existing bats regression assertion bug: FR-WORKFLOW-003 row 6 fails on origin/main HEAD

| Field | Value |
|---|---|
| ID | ISS-UAT-BATS-001 |
| Severity | minor |
| Module | uat/test-design (bats regression assertion in `scripts/tests/uat-seed.bats`) |
| Status | **resolved** |
| Reported | 2026-07-04 |
| Reporter | Orchestrator (wf-20260704-fix-092, Step 0 — registry update) |
| Workflow | wf-20260704-fix-092 |
| Resolved | 2026-07-04 |
| Related | [ISS-UAT-BRIDGE-002](ISS-UAT-BRIDGE-002.md) (first workflow to disclose this failure; AC-4/AC-10 deferred to this workflow), [ISS-UAT-001-1](ISS-UAT-001-1.md) (the upstream fix whose output row 6 was originally written to verify), [ISS-UAT-SEED-002](ISS-UAT-SEED-002.md), [ISS-UAT-COV-003](ISS-UAT-COV-003.md) (later workflows that disclosed the same pre-existing failure as "unrelated, owned by wf-20260704-fix-087") |

## Symptom

`bash scripts/run-bats.sh scripts/tests/uat-seed.bats` exits 1 with:

```text
not ok 16 FR-WORKFLOW-003 row 6: no-flag mock output is byte-identical to the pre-FR baseline
# (in test file scripts/tests/uat-seed.bats, line 285)
```

33/34 bats tests pass; the single failure (row 16 = bats row 6) is reproducible on `origin/main` HEAD as of commit `c3ba4a3` (and on every main commit since `wf-20260704-fix-086` PR #105 squash `5bb819b` merged on 2026-07-04).

The failure was disclosed as "pre-existing, unrelated, owned by follow-up `wf-20260704-fix-087-fix-fr-workflow-003-row-6`" by three separate workflows:

1. `wf-20260704-fix-086` (PR #105 squash `5bb819b`) — first disclosure. AC-4/AC-10 deferred to `wf-20260704-fix-087-fix-fr-workflow-003-row-6`, queue position 1. See `ISS-UAT-BRIDGE-002.md` Resolution block + registry row 39.
2. `wf-20260704-fix-089` (PR #106 squash `3e524bd`) — re-disclosed as "pre-existing on origin/main".
3. `wf-20260704-feat-090` (PR #107 squash `c013f6e`) — re-disclosed; verified by `git stash` + rerun on baseline.

## Root Cause (two interacting bugs in `scripts/tests/uat-seed.bats` lines 256-294)

### Bug A — baseline source-of-truth drift

The test reads its pre-fix baseline via `git show origin/main:scripts/uat-seed.sh`. This worked at the time `wf-20260703-fix-064` (PR #89 squash `2b72f46`) introduced the row 6 assertion, because at that time `origin/main` still pointed to the pre-fix version of `scripts/uat-seed.sh`. After `2b72f46` (and the subsequent `wf-20260704-fix-085` PR #104 squash `9fd57aa` + `wf-20260704-fix-086` PR #105 squash `5bb819b`) landed on main, `origin/main:scripts/uat-seed.sh` is now the **post-fix** version, so:

- `baseline_lines == current_lines` (no diff, because we're comparing the same script to itself)
- The test asserts `current_lines - baseline_lines == 2` (the documented ISS-UAT-001-1 +2-line `ensure_linked` addition)
- Assertion fails because the actual delta is `0`

The fallback `git show 8db37ac^:scripts/uat-seed.sh` would work, but it's not reached because `git rev-parse --verify origin/main` succeeds first.

### Bug B — byte-equality assertion is too strict

Even with Bug A fixed (baseline pinned to `8db37ac^`), the second assertion (`non_ensure_lines = current_non_ensure_lines`, byte-equal) fails because of `wf-20260704-fix-086`'s TLD migration (`@aiqadam.test` → `@example.com` per `ISS-UAT-BRIDGE-002` Resolution block + AC-2/3 of that issue). The migration is intentional and well-documented but produces 6 byte-different lines in the operator_invite + sign-in summary output that the row 6 assertion currently treats as a regression.

### Reproduction

```bash
$ bash scripts/run-bats.sh scripts/tests/uat-seed.bats | grep -E "row 6|tests,"
not ok 16 FR-WORKFLOW-003 row 6: no-flag mock output is byte-identical to the pre-FR baseline

$ git stash && bash scripts/run-bats.sh scripts/tests/uat-seed.bats | grep -E "row 6"
not ok 16 FR-WORKFLOW-003 row 6: no-flag mock output is byte-identical to the pre-FR baseline
$ git stash pop
```

Verified pre-existing on `origin/main` HEAD across 3 independent workflows (`wf-20260704-fix-086`, `wf-20260704-fix-089`, `wf-20260704-feat-090`).

### Why this matters

- 3 separate PRs (#105, #106, #107) disclosed this as "pre-existing" in their resolutions, but no owning issue file existed until this PR. Per `AGENTS.md §6.1`, a deferral without a queued follow-up workflow ID is a QualityGate FAIL — the cited follow-up `wf-20260704-fix-087-fix-fr-workflow-003-row-6` was a placeholder name that did not match an actual queue directory at `.copilot/tasks/queued/`.
- `ISS-PREEX-001` is the established precedent for filing a dedicated `ISS-*.md` for pre-existing failures (severity: `minor`, module derived from surface). This issue follows that pattern.
- `AGENTS.md §14` (added 2026-07-04) explicitly authorizes `Orchestrator` to register unambiguous pre-existing test-design failures autonomously when reproduction steps are on disk.

## Fix

Rewrite row 6 in `scripts/tests/uat-seed.bats` (lines 256-294) to:

1. **Always pin the baseline to `8db37ac^:scripts/uat-seed.sh`** — the parent of the commit that introduced `ensure_linked` mock lines. Drop the `origin/main` fallback path. `8db37ac^` is an immutable SHA and the baseline never moves.
2. **Replace strict byte-equality with a structural assertion**: every non-`ensure_linked` line from the pre-fix baseline must appear in the post-fix output, but with allowance for well-documented intentional drift patterns. Specifically: a small whitelist of `sed` patterns documenting accepted drift sources (currently: the `@aiqadam.test → @example.com` TLD migration from `wf-20260704-fix-086`).

The fix preserves the regression intent (no silent changes outside the documented fix scope) while accommodating legitimate drift that's already been individually verified and disclosed.

## Resolution

- **Workflow:** `wf-20260704-fix-092`
- **PR:** https://github.com/tvolodi/aiqadam/pull/108 (squash merge `69f2b3f`)
- **Root cause:** Row 6 in `scripts/tests/uat-seed.bats` had two interacting bugs — (a) baseline source-of-truth drift (`origin/main:` no longer pre-fix after main advanced past `2b72f46`), and (b) byte-equality assertion too strict for `wf-20260704-fix-086`'s documented `@aiqadam.test → @example.com` TLD migration.
- **Fix:** Pinned baseline to `8db37ac^:scripts/uat-seed.sh` (immutable SHA); replaced strict byte-equality with a structural assertion + `sed` whitelist for documented drift sources. bats row 6 now passes.
- **Regression test:** `scripts/tests/uat-seed.bats` row 6 itself — this fix IS the regression test. The row is now self-validating against the pre-fix baseline and will catch any future regression in the same code path.
- **Verification:** `bash scripts/run-bats.sh scripts/tests/uat-seed.bats` → 34 passed, 0 failed (was 33 passed / 1 failed pre-fix).

## Honesty disclosures

- **Workflow ID difference from prior deferrals:** Prior workflows cited `wf-20260704-fix-087-fix-fr-workflow-003-row-6` as the placeholder name. The actual counter at workflow start was `92`, so the authoritative ID is `wf-20260704-fix-092`. The placeholder name was a forward-reference, not a reserved ID; per `AGENTS.md §0` ("never invent placeholder IDs"), the counter is authoritative. The earlier placeholder names are preserved in the audit trail via `ISS-UAT-BRIDGE-002.md` and registry row 39.
- **Test-design intent preserved:** The fix preserves the load-bearing regression intent ("the ISS-UAT-001-1 fix only adds `ensure_linked` lines, nothing else changes silently") by asserting structural equivalence + drift whitelist, rather than byte-equality. The `ensure_linked` mock-line grep filter is kept verbatim.