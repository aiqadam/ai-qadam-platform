# Step 6 — Test Strategy

**Workflow:** wf-20260704-fix-093
**Date:** 2026-07-04

## Strategy

The "regression test" for this issue is the **build command itself**.
ISS-CI-OVERRIDE-ebd184b is a build-time failure: rolldown's parser
rejects `.tsx` files with JSX. The fix (injecting `@vitejs/plugin-react`)
must transform `.tsx` to plain JS before rolldown sees it.

The success condition is therefore:

- `pnpm --filter @aiqadam/storybook build` exits 0
- `biome check apps/storybook/` exits 0
- `pnpm --filter @aiqadam/storybook exec tsc --noEmit` exits 0

These three checks are the regression test. The first would have failed
before the fix (12 PARSE_ERROR occurrences); the latter two are
workspace-wide invariants that the fix must not break.

No unit tests are required because the failure is in build tooling,
not in application code. The fix does not change any runtime behavior;
it only routes `.tsx` files through Babel before rolldown parses them.

## What would have failed before

`pnpm --filter @aiqadam/storybook build` — would have produced 12
`[PARSE_ERROR] Unexpected JSX expression` errors and exited 1.

## What passes after

`pnpm --filter @aiqadam/storybook build` — produces
`apps/storybook/storybook-static/` with 226 modules transformed.

## Gate Result

gate_result:
  status: passed
  summary: "Build-command-as-regression-test strategy is sufficient for a build-tooling fix; no unit tests needed."
  findings:
    - "The failure mode is deterministic: rolldown errors out on the first .tsx file it parses without a transform plugin upstream."
    - "Re-running the same build command after the fix is the regression test."