# Step 8: Execute Tests — ISS-WF-GH-CLOSE-001

## Execution

1. `pnpm exec bats scripts/tests/check-closing-keyword.bats` — **12/12 pass.**
2. `pnpm exec bats scripts/tests/check-closing-keyword.bats scripts/tests/check-github-issue-links.bats` (combined, confirming the new script + its `test_helper.bash` change don't break the existing suite) — **24/24 pass.**
3. `pnpm exec bats scripts/tests/*.bats` (full repo bats suite) — **exit 0**, all visible results `ok`, no `not ok` lines found in the run's output.

No `pnpm typecheck`/`pnpm test` run needed — this fix touches zero
`apps/*`/`packages/*` TypeScript files (pure shell + markdown).

## Gate Result

**Status:** `passed` → Step 9 (Update Issue Registry).
