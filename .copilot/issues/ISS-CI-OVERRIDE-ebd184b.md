# ISS-CI-OVERRIDE-ebd184b — Auto-registered CI failure class: rolldown PARSE_ERROR on web-next JSX

| Severity | Module | Status | Workflow | Date |
|---|---|---|---|---|
| blocker | ci/infrastructure | resolved | wf-20260704-fix-093 | 2026-07-04 |

## Problem

The `storybook` CI job fails because rolldown 1.1.3 (the new default
in Node `modules/.pnpm/rolldown@1.1.3`) cannot parse JSX syntax in
`.tsx` files when invoked from `pnpm --filter @aiqadam/storybook build`.

12 occurrences across these files (all in `apps/web-next/`):

- `src/blocks/workspace/AsyncSelect.tsx` (line 61, col 39)
- `src/kit/Badge.tsx`
- `src/kit/Button.tsx`
- `src/kit/Card.tsx`
- `src/kit/Dialog.tsx`
- (... and 7 more)

The canonical error signature:

```
[PARSE_ERROR] Unexpected JSX expression
<file>:<line>:<col>
Help: JSX syntax is disabled and should be enabled via the parser options
```

The first time this class was observed was on PR #94 (workflow
`wf-20260703-impl-policy-071`) on 2026-07-03. PRSteward
auto-registered this issue per `AGENTS.md §6.3` step 3, ticked the
counter for this class to 1/5, and overrode the failure in PR #94's
audit trail.

## Goal

Restore the `storybook` CI job to a green state. The work consists
of:

1. Identify the rolldown 1.1.3 parser-options regression: compare to
   the previous bundler (likely Vite + esbuild) and confirm whether
   rolldown's default should be `parserOptions: { jsx: true }` for
   `.tsx` files, or whether storybook's bundler config has not been
   updated for rolldown 1.1.3.
2. Apply the fix in `apps/storybook` (or pin to an earlier rolldown
   via pnpm overrides if the upstream issue is unfixed).
3. Verify the storybook-static build succeeds locally
   (`pnpm --filter @aiqadam/storybook build`).
4. Open a PR (likely a `fix/` branch prefixed with the workflow ID).
5. Once green on PR #95+, the counter for this class resets to 0.

## Failure class

| Field | Value |
|---|---|
| `failure_class` (sha1 of canonical block) | `ebd184bfe1c7b3c4fde6d4d0685be02d595d8be7` |
| `failing_job` | `storybook` |
| `first_observed` | 2026-07-03 |
| `last_observed` | 2026-07-03 |
| `consecutive_count` | 1 |
| `last_overriding_workflow` | wf-20260703-impl-policy-071 |
| Counter file | `.copilot/meta/ci-override-counters.json` |

## Acceptance criteria

- [ ] **AC-1** Reproduction documented: the exact command that fails
      (`pnpm --filter @aiqadam/storybook build`) and the file(s)
      that trigger rolldown's PARSE_ERROR.
- [ ] **AC-2** Fix applied: rolldown is configured to enable JSX
      parsing on `.tsx` files, OR rolldown is pinned to a version
      that does. The choice is justified in the PR description.
- [ ] **AC-3** `pnpm --filter @aiqadam/storybook build` succeeds
      locally.
- [ ] **AC-4** A new PR is opened (counter resets to 0 in the
      registry row for this issue on its merge per `AGENTS.md §6.3`
      step 5).
- [ ] **AC-5** `biome check` and `tsc --noEmit` pass on the change.

## Registration audit trail

- **Auto-registered by:** PRSteward (`AGENTS.md §6.3` "Auto-register
  procedure"), invocation on PR #94, run
  `https://github.com/tvolodi/aiqadam/actions/runs/28678310518/job/85056372943`.
- **GitHub issue counterpart:** Skipped — the `tvolodi/aiqadam`
  repository has GitHub Issues disabled (`gh issue create` returns
  "the repository has disabled issues"). The local file at
  `.copilot/issues/ISS-CI-OVERRIDE-ebd184b.md` is the canonical
  tracker. When/if issues are re-enabled, run
  `gh issue create ... --body-file .copilot/issues/ISS-CI-OVERRIDE-ebd184b.md`
  to back-fill.
- **Counter file:** the class was added to
  `.copilot/meta/ci-override-counters.json` with
  `consecutive_count: 1`, `owned_by_issue: ISS-CI-OVERRIDE-ebd184b`,
  `queued_workflow: wf-20260703-fix-072`.
- **Registry:** row appended to `.copilot/issues/registry.md` with
  the Workflow column pointing to
  `.copilot/tasks/queued/wf-20260703-fix-072-rolldown-jsx-parse/`.
- **PRSteward audit fields:**
  - `gate_results.step11.4-pr-steward.auto_registered: true`
  - PR #94 squash-commit trailer: `CI-Override: ebd184bfe1c7b3c4fde6d4d0685be02d595d8be7 via ISS-CI-OVERRIDE-ebd184b (count 1/5)`

---

## Resolution

- **Workflow:** `wf-20260704-fix-093`
- **PR:** [https://github.com/tvolodi/aiqadam/pull/109](https://github.com/tvolodi/aiqadam/pull/109)
- **Root cause:** `apps/storybook` uses `@storybook/react-vite@8.6.18`
  which is a thin pass-through Vite config — its `dist/node/index.js`
  is a 43-byte identity function and does not inject any Vite plugin
  to handle `.tsx` JSX. Vite 8.1.0 (resolved transitively because
  `@aiqadam/web-next` depends on `@astrojs/react@6.0.0` →
  `vite@^8.1.0`) uses **rolldown 1.1.3** as the default production
  bundler. rolldown's built-in parser disables JSX by default for
  `.tsx` files, so when Storybook's preview build hits any `.tsx`
  file from `apps/web-next/src/kit/*` or `apps/blocks/*`, rolldown
  fails with `PARSE_ERROR: Unexpected JSX expression`. Astro's own
  build (`pnpm --filter @aiqadam/web-next build`) succeeds with the
  same rolldown because Astro configures JSX handling internally;
  Storybook 8 does not.
- **Fix:** Two surgical edits in `apps/storybook/`:
  1. `apps/storybook/package.json` — added `@vitejs/plugin-react@^5.2.0`
     as a direct `devDependencies` entry (already in the workspace
     tree transitively via `@astrojs/react`; declaring it as a direct
     devDep documents intent and protects against future pnpm
     hoisting changes).
  2. `apps/storybook/.storybook/main.ts` — imported `react` from
     `@vitejs/plugin-react` and prepended `react({ jsxRuntime:
     'automatic' })` as the first plugin in `viteFinal`. The plugin
     runs Babel + `@babel/plugin-transform-react-jsx` on every
     `.tsx` file so that rolldown's parser never sees JSX.
- **Regression test:** `pnpm --filter @aiqadam/storybook build`.
  - Before: exits 1 with 12 `[PARSE_ERROR] Unexpected JSX expression`
    errors against `apps/web-next/src/blocks/workspace/AsyncSelect.tsx`
    and 11 other `.tsx` files in `apps/web-next/src/kit/*`.
  - After: exits 0. 226 modules transformed. Output
    `apps/storybook/storybook-static/` contains 31+ asset chunks
    including per-atom stories files (`Badge.stories`, `Button.stories`,
    `Card.stories`, `Dialog.stories`, `Select.stories`, `Tabs.stories`,
    `Toast.stories`, `Drawer.stories`, `Input.stories`, `Welcome`).
- **Verification:** `biome check` clean on the modified files. `tsc
  --noEmit` reports the same 2 errors as `origin/main` (pre-existing
  in `apps/storybook/stories/blocks/AsyncSelect.stories.tsx` and
  `apps/web-next/src/lib/api-client.ts`); zero new tsc errors
  introduced by this workflow.
- **Counter reset:** Per AGENTS.md §6.3 step 5, the counter for class
  `ebd184bfe1c7b3c4fde6d4d0685be02d595d8be7` resets to 0 when a PR
  that does not override the failure class is merged with green CI.
  This PR merges with a green storybook job → counter resets.
- **Merged:** `<pending>` — back-filled by Step 12.5.
