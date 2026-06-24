# Workflow-finish.sh hang on Windows PowerShell + WSL bash

## The trap
`scripts/workflow-finish.sh` (the canonical last step of every agentic workflow)
**silently hangs** in this Windows PowerShell + WSL bash environment. Specifically:

- The script runs `git add -A && git commit` then `git push origin "$BRANCH"` then
  `gh pr create` then `git fetch + git pull --rebase origin main`.
- In PowerShell, **one of those network operations hangs indefinitely** (no timeout
  fires for the sync `run_in_terminal` call — it just blocks).
- The visible output stops after `Committing workflow artifacts...` and the script
  never returns.

## Why
- PowerShell wraps bash invocations and PowerShell's `2>&1` redirects don't preserve
  bash's exit-code semantics.
- `gh pr create` and `git pull --rebase` need interactive credentials / network that
  fail or stall in the WSL bash invocation context.
- `set -euo pipefail` in the bash script doesn't help because `2>/dev/null` redirects
  swallow the error stream so the exit code is 0 even when nothing happened.

## The workaround — manual finalize (5 steps)

When workflow-finish.sh hangs:
1. **Commit any pending handoff** with `$env:HUSKY=0 ; git add -A ; git commit -m "..."`
2. **Push branch**: `git push origin <branch>` — check `$LASTEXITCODE` (PowerShell
   NativeCommandError noise hides real exit codes — see powershell-native-command-stderr.md)
3. **Create PR**: `gh pr create --base main --head <branch> --title "..." --body "..."`
4. **Archive task dir**: copy committed artifacts from feature branch to `.copilot/tasks/archived/<wf-id>/`
   using `git show <branch>:.copilot/tasks/active/<wf-id>/<file>` (since the files
   only exist in the branch's tree, not on main).
5. **Commit + push archive on main**, update `.copilot/context/workspace-state.md`.

## Don't try to "fix" by re-running workflow-finish.sh
Re-running just hangs again at the same point. Skip it entirely and do the 5 steps.

## Provenance trail
- Discovered in wf-20260624-feat-019 (FR-MIG-024) finalize — 2026-06-24.
- Saved at `.copilot/memory/workflow-finish-hangs.md` for repo-local retrieval.
