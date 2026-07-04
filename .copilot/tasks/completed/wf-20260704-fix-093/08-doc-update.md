# Step 9 — Doc / Registry Update

**Workflow:** wf-20260704-fix-093
**Date:** 2026-07-04
**Issue:** [ISS-CI-OVERRIDE-ebd184b](../../issues/ISS-CI-OVERRIDE-ebd184b.md)

## Updates applied

### `.copilot/issues/ISS-CI-OVERRIDE-ebd184b.md`

Header table flips:
- `Status: open` → `Status: resolved`
- `Workflow: wf-20260703-fix-072` → `Workflow: wf-20260704-fix-093`
- `Date: 2026-07-03` → `Date: 2026-07-04`

Appended `## Resolution` section:
- **Workflow:** `wf-20260704-fix-093`
- **PR:** `<pending>` (back-filled by `workflow-finish.sh` after Step 11)
- **Root cause:** `apps/storybook` uses `@storybook/react-vite@8.6.18` which is a pass-through Vite config; it does not inject `@vitejs/plugin-react`. Vite 8.1.0 (resolved transitively via `@astrojs/react`) uses rolldown 1.1.3 as the default production bundler; rolldown's built-in parser disables JSX by default for `.tsx` files. Astro's own build path configures JSX handling internally, so `apps/web-next` builds fine; storybook does not.
- **Fix:** Added `@vitejs/plugin-react@^5.2.0` as a direct devDep of `apps/storybook`; injected `react({ jsxRuntime: 'automatic' })` as the first plugin in `viteFinal` so Babel-transpiled JSX never reaches rolldown's parser.
- **Regression test:** `pnpm --filter @aiqadam/storybook build` — exits 1 with 12 `PARSE_ERROR` before the fix; exits 0 with 226 modules transformed after.
- **Merged:** `<pending>` (back-filled by Step 12.5)

### `.copilot/issues/registry.md`

Row updated:
- `Status: open` → `Status: resolved`
- `Workflow: queued: wf-20260703-fix-072; followed by wf-20260704-fix-081` → `Workflow: wf-20260704-fix-093 (PR <pending>)`
- `Date: 2026-07-03` → `Date: 2026-07-04`

### `.copilot/context/workspace-state.md`

Will be updated by `workflow-finish.sh` (Step F.5 amendment) to record
the merge of `wf-20260704-fix-093`. Counter bumped 93 → 94.

### `.copilot/meta/ci-override-counters.json`

Will be reset by PRSteward's audit-trail logic on the PR merge per
AGENTS.md §6.3 step 5: counter for class
`ebd184bfe1c7b3c4fde6d4d0685be02d595d8be7` resets to 0 when a PR that
does **not** override the failure class is merged with green CI for
that class. The storybook CI job will be green on this PR → counter
resets.

## Documentation surface

- `apps/storybook/.storybook/main.ts` — comment block updated to
  explain why `@vitejs/plugin-react` is wired (was previously implicit;
  now explicit with rationale, citing this issue).
- No other doc files in scope. The storybook design-system entry
  (`docs/04-development/design-system/Design system for AI agents/`)
  describes what storybook is for; this workflow does not change that.

## Gate Result

gate_result:
  status: passed
  summary: "Registry + issue file updated; workspace-state.md will be updated by workflow-finish.sh's F.5 amendment step."
  findings:
    - "Issue resolution block follows the template in workflow Step 9."
    - "Counter reset will fire on merge per AGENTS.md §6.3 step 5."