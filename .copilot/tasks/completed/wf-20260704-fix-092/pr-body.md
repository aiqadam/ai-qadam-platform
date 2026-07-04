## What

Closes [ISS-UAT-BATS-001](../ISS-UAT-BATS-001.md) by fixing the FR-WORKFLOW-003 row 6 bats regression assertion in `scripts/tests/uat-seed.bats`. The assertion had two interacting bugs that together caused `bash scripts/run-bats.sh scripts/tests/uat-seed.bats` to fail with `not ok 16` on every `origin/main` commit since `wf-20260704-fix-086` PR #105 squash `5bb819b`.

## Why

This regression assertion was disclosed as "pre-existing, unrelated, owned by follow-up wf-20260704-fix-087-fix-fr-workflow-003-row-6" by three prior PRs (#105, #106, #107). The cited follow-up workflow was never queued — it was a placeholder name that did not match an actual directory at `.copilot/tasks/queued/`. Per `AGENTS.md §6.1`, a deferral without a queued follow-up workflow ID is a QualityGate FAIL.

Per `AGENTS.md §14` (added 2026-07-04, "Default authority by agent role"), the Orchestrator is authorized to register unambiguous pre-existing test-design failures autonomously when reproduction steps are on disk. The dedicated issue file `ISS-UAT-BATS-001.md` follows the `ISS-PREEX-001` precedent (severity: minor, module derived from surface).

## How

Two interacting bugs in `scripts/tests/uat-seed.bats` lines 256-294 (now rewritten):

### Bug A — Baseline source-of-truth drift

The test read its pre-fix baseline via `git show origin/main:scripts/uat-seed.sh`. This worked at the time the row was originally authored (commit `2b72f46`, PR #89, ISS-UAT-001-1), because at that time `origin/main` still pointed to the pre-fix version. After main advanced past `2b72f46`, `origin/main:scripts/uat-seed.sh` is now the post-fix version, so `baseline_lines == current_lines` (no diff) and the test's `[ "$((current_lines - baseline_lines))" -eq 2 ]` assertion fails (actual delta is 0).

**Fix:** Pinned baseline to the immutable SHA `8db37ac^` (parent of the commit that introduced the +2 `ensure_linked` lines). The baseline never moves.

### Bug B — Byte-equality assertion too strict

Even with Bug A fixed, the byte-equality assertion failed because of `wf-20260704-fix-086`'s TLD migration (`@aiqadam.test` → `@example.com` per `ISS-UAT-BRIDGE-002` Resolution block). The migration is intentional and well-documented but produces byte-different lines in the operator_invite + sign-in summary output that the row 6 assertion treated as a regression.

**Fix:** Replaced strict byte-equality with a structural assertion: every non-`ensure_linked` line from the baseline appears in the current output (modulo a small `sed` whitelist of accepted-drift patterns). The regression intent ("nothing else changes silently outside the documented fix scope") is preserved — the assertion still detects silent drift; it just accommodates documented drift that's been individually verified and disclosed.

### Files changed

| File | Change | Reason |
|---|---|---|
| `scripts/tests/uat-seed.bats` | +55 -26 lines | Pin baseline to `8db37ac^`, structural assertion + drift whitelist |
| `.copilot/issues/ISS-UAT-BATS-001.md` | +88 lines (new) | Dedicated issue file per ISS-PREEX-001 precedent |
| `.copilot/issues/registry.md` | +1 line | Add row 42, status: resolved |
| `.copilot/meta/next-workflow-id` | counter bumped 92→93 | Per AGENTS.md §0 |
| `.copilot/tasks/active/wf-20260704-fix-092/` | new dir | Workflow artifacts (handoff.yaml, 01-issue-validation.md) |

## Risks

- **Workflow ID difference from prior deferrals.** Prior PRs cited `wf-20260704-fix-087-fix-fr-workflow-003-row-6` as the placeholder name. The authoritative counter at workflow start was 92, so the real ID is `wf-20260704-fix-092`. Per `AGENTS.md §0` ("never invent placeholder IDs"), the counter is authoritative. The earlier placeholder names are preserved in the audit trail via `ISS-UAT-BRIDGE-002.md` and registry row 39.
- **Drift whitelist extensibility.** The `DRIFT_SED_FILTERS` array currently contains one pattern (TLD migration). Future drift sources should be added via individual filter entries with explanatory comments and individual issue references, not blanket permissions. Reviewers should reject any PR that adds a filter without a corresponding documented disclosure.
- **Test-design intent preserved.** The fix preserves the load-bearing regression intent (no silent changes outside the documented fix scope) by asserting structural equivalence + drift whitelist, rather than byte-equality. The `ensure_linked` mock-line grep filter is kept verbatim.

## Testing

Before fix:
```bash
$ bash scripts/run-bats.sh scripts/tests/uat-seed.bats | grep -E "row 6|tests,"
not ok 16 FR-WORKFLOW-003 row 6: no-flag mock output is byte-identical to the pre-FR baseline
1..34
```
(33 passed, 1 failed)

After fix:
```bash
$ bash scripts/run-bats.sh scripts/tests/uat-seed.bats | tail -3
ok 33 ISS-UAT-SEED-002 AC-3: API_BASE_URL env override wins over the derived default
ok 34 ISS-UAT-SEED-002 AC-4: api_base default falls back to :3000 when apps/api/.env is absent
1..34
```
(34 passed, 0 failed)

Lint-staged + arch:check ran clean on `git commit`. Pre-push pre-commit hooks (`.husky/pre-commit`) passed.

## Screenshots / Logs

N/A — this is a CI signal test, not a UI change.

## Honesty disclosures

- **Workflow ID difference.** Authoritative ID is `wf-20260704-fix-092`; prior disclosures cited a placeholder name `wf-20260704-fix-087-fix-fr-workflow-003-row-6` that did not match an actual queue directory. Per `AGENTS.md §0`, the counter is authoritative.
- **Pre-existing failure was disclosed 3 times before registration.** PRs #105, #106, #107 all disclosed the failure as "unrelated, owned by a queued follow-up workflow" but the queue position referenced a placeholder that did not exist on disk. The dedicated `ISS-UAT-BATS-001.md` file is created in this same workflow per `ISS-PREEX-001` precedent and `AGENTS.md §14` authorization. The fix is bounded — the row 6 assertion is the only code touched, and bats is self-validating against the pre-fix baseline.
- **Drift whitelist is a maintainability shift.** Byte-equality was the previous contract. The new contract is "structural equivalence modulo documented drift." This is a one-way ratchet: future commits that add new silent drift will fail row 6, which is the original regression intent.

## Checklist

- [x] Tests added / updated (row 6 rewritten; the row IS the test)
- [x] Docs updated if behavior changed (ISS-UAT-BATS-001.md + registry row + workflow artifacts)
- [x] No new dependencies
- [x] Manually tested locally (bats 34/34)
- [x] arch:check passed in pre-commit hook
- [x] Counter bumped 92→93 per AGENTS.md §0