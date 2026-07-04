# Step 2 — Impact Analysis

**Workflow:** wf-20260704-fix-093
**Issue:** [ISS-CI-OVERRIDE-ebd184b](../../issues/ISS-CI-OVERRIDE-ebd184b.md)
**Date:** 2026-07-04

## Root cause

`apps/storybook` declares `@storybook/react-vite` (Storybook 8.6.18) as its
framework, which is a **thin pass-through** — its `dist/node/index.js` is
literally `function defineMain(config){return config}` (43 bytes of
plugin code). It does **not** inject any Vite plugin to handle `.tsx`
JSX. Vite 8.1.0 (resolved transitively because `@aiqadam/web-next`
depends on `@astrojs/react` → `vite@8`) uses **rolldown 1.1.3** as the
default production bundler. rolldown's built-in parser disables JSX by
default for `.tsx` files, so when Storybook's preview build hits any
`.tsx` file from `apps/web-next/src/kit/*` or `apps/blocks/*`, rolldown
fails with `PARSE_ERROR: Unexpected JSX expression`.

`pnpm --filter @aiqadam/web-next build` succeeds with the same rolldown
because **Astro** injects its own JSX-handling plugin chain during build.
Storybook has no such wiring.

## Verification evidence (reproduction)

```text
$ pnpm --filter @aiqadam/storybook build
...
info => Building preview..
vite v8.1.0 building client environment for production...
✓ 101 modules transformed.
✗ Build failed in 1.54s
Build failed with 12 errors:
[PARSE_ERROR] Unexpected JSX expression
    ╭─[ ../web-next/src/blocks/workspace/AsyncSelect.tsx:61:39 ]
 61 │     if (asyncState === "loading") return <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;
    │                                          ┬  
    │                                          ╰── 
    │ Help: JSX syntax is disabled and should be enabled via the parser options
[... 11 more occurrences across Badge, Button, Card, Dialog, Input, ...]
    at aggregateBindingErrorsIntoJsError (.../rolldown@1.1.3/.../error-B68YLzl3.mjs:48:18)
    at async buildEnvironment (.../vite@8.1.0/.../node.js:32575:66)
    at async Object.build (.../vite@8.1.0/.../node.js:32997:19)
    at async build (.../@storybook/builder-vite@8.6.18/.../index.js:80:230)
```

## Why the fix is `@vitejs/plugin-react`

`@vitejs/plugin-react@5.2.0` is the canonical Vite plugin for React +
JSX. It declares `vite ^4.2.0 || ^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0`
in its peerDependencies (verified from
`node_modules/.pnpm/@vitejs+plugin-react@5.2.0_*/node_modules/@vitejs/plugin-react/package.json`).
When injected via `viteFinal`, it runs a Babel-based JSX transform on
`.tsx` files **before** rolldown's parser ever sees them, completely
sidestepping rolldown's JSX-disabled-by-default quirk.

This is also the documented Storybook 8 + Vite + React integration pattern
from the Storybook docs.

## Impact surface

| Layer | File | Change |
|---|---|---|
| Dependency | `apps/storybook/package.json` | Add `@vitejs/plugin-react@^5.2.0` to `devDependencies` (already in tree transitively, but a direct dep is required to declare the intent and to survive pnpm hoisting changes). |
| Config | `apps/storybook/.storybook/main.ts` | Import `react()` from `@vitejs/plugin-react` and prepend it to `viteConfig.plugins` with `enforce: 'pre'` so it runs before `@tailwindcss/vite` and Storybook's other plugins. |
| No DB / schema change | — | — |
| No API / contract change | — | — |
| No design-system change | — | — |

## Risks

1. **Storybook peer-dep warning.** `@storybook/react-vite@8.6.18` declares
   `vite ^4.0.0 || ^5.0.0 || ^6.0.0` in peerDependencies. The resolved
   vite is `8.1.0` (because `@astrojs/react` requires `^8`). pnpm will
   emit a peer-dep warning on `pnpm install`, but this is a **pre-existing
   condition** — the dependency tree was already this way before this
   workflow. The fix does not introduce the skew.
2. **Plugin order.** React plugin must run **before** any other transform
   plugin. Current `viteFinal` already collects plugins from
   `viteConfig.plugins` and prepends `@tailwindcss/vite`. We must
   prepend `@vitejs/plugin-react` **before** the Tailwind plugin, with
   `enforce: 'pre'` for safety.
3. **HMR/Fast Refresh in dev.** `@vitejs/plugin-react` enables React Fast
   Refresh by default; this is desired for `storybook dev` but irrelevant
   for `storybook build`. No downside.

## Alternatives considered

- **Pin `vite` to ^6.4.x via pnpm overrides.** This would remove rolldown
  from the tree but would force web-next to also pin Vite 6, breaking
  `@astrojs/react@6.0.0` which requires Vite 8. Rejected (cascading risk).
- **Configure `optimizeDeps.esbuildOptions.loader`.** This only affects
  pre-bundling (deps optimization), not the production bundler phase
  where rolldown parses the `.tsx` source. Would not fix the actual
  error.
- **Set `build.rolldownOptions.transform.jsx`.** rolldown's API does not
  expose a JSX-parser option directly to Vite consumers; the documented
  approach is to inject a transform plugin upstream. Rejected (no
  clean API path).

## Files this workflow will modify

- `apps/storybook/package.json` (add devDep)
- `apps/storybook/.storybook/main.ts` (inject plugin)
- `pnpm-lock.yaml` (regenerated by `pnpm install`)

No other files in scope.

## Acceptance criteria recap

From the issue file:

- AC-1: reproduction documented — ✅ done above.
- AC-2: fix applied (jsx transform via `@vitejs/plugin-react`).
- AC-3: `pnpm --filter @aiqadam/storybook build` succeeds locally.
- AC-4: a PR is opened; counter resets to 0 on merge.
- AC-5: `biome check` and `tsc --noEmit` pass on the change.

## Gate Result

gate_result:
  status: passed
  summary: "Root cause is rolldown PARSE_ERROR due to missing JSX transform plugin in storybook's vite config; fix is to inject @vitejs/plugin-react via viteFinal."
  findings:
    - "Vite 8 (transitive via @astrojs/react) uses rolldown 1.1.3; rolldown's parser disables JSX by default for .tsx files."
    - "@storybook/react-vite is a pass-through and does NOT auto-inject @vitejs/plugin-react (this is the consumer's responsibility in Storybook 8)."
    - "Astro's own build works because Astro configures JSX handling internally; storybook does not."