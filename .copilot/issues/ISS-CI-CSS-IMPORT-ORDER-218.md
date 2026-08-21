---
id: ISS-CI-CSS-IMPORT-ORDER-218
status: fixed
created: 2026-08-21
workflow: wf-20260821-fix-218
---

# PR #284 broke `ci-cd`'s build lint on main — @import ordering violation

## Summary

PR #284 (ISS-PROSE-TYPOGRAPHY-217, install `@tailwindcss/typography`)
merged to `main` and immediately broke the `ci-cd` workflow's `build`
job on `apps/web-next`'s `Lint` step. I incorrectly reported the merge
as clean — I had only watched the `ci` workflow (which happened to
pass on a later, unrelated archival commit) and never confirmed
`ci-cd` on the actual PR #284 commit itself. User caught this from the
GitHub Actions UI showing red ci-cd/supply-chain runs.

## Root cause

`@plugin "@tailwindcss/typography";` was inserted at line 2 of
`globals.css`, between the initial `@import "tailwindcss";` and the
three `@import "../../../../design-system/*.css";` lines that follow.
Per CSS spec, all `@import` rules must precede every other at-rule
(barring `@charset`/`@layer`) — Biome's
`lint/correctness/noInvalidPositionAtImportRule` correctly flagged the
3 design-system imports as now being in an invalid position, since a
non-import at-rule (`@plugin`) now sits before them.

```
build	Lint	./apps/web-next/src/styles/globals.css:12:2 lint/correctness/noInvalidPositionAtImportRule
build	Lint	./apps/web-next/src/styles/globals.css:13:2 lint/correctness/noInvalidPositionAtImportRule
build	Lint	./apps/web-next/src/styles/globals.css:14:2 lint/correctness/noInvalidPositionAtImportRule
```

## Fix

Moved `@plugin "@tailwindcss/typography";` to after all 4 `@import`
statements (tailwindcss + the 3 design-system files), so every
`@import` in the file is contiguous and first, per spec.

## Verification
- `npx biome check apps/web-next/src/styles/globals.css` — clean (was
  3 errors, now 0).
- `pnpm lint` in `apps/web-next` — exit 0 (2 pre-existing, unrelated
  warnings only, no errors).
- Rebuilt and re-inspected compiled CSS: `.prose`/`.prose-stone` rules
  and the token-bound `--tw-prose-*` overrides (from #284) both still
  generate correctly — moving `@plugin` past the imports has no
  functional effect on the plugin itself, only fixes the lint
  violation.
- `apps/web-next` unit suite: 1115/1115 pass, unchanged.

## Process note
I should have watched `ci-cd` (the workflow whose `build` job actually
runs this lint step) directly on PR #284's own merge commit, not
inferred from a different, later commit's `ci` result. Recorded as a
lesson for future PRs in this repo — see `workspace-state.md`.
