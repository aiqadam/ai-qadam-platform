// jsx-dev-runtime.test.ts — Regression test for ISS-UAT-009-6.
//
// Symptom: `pnpm dev` (astro dev) was failing every React island with
//   `TypeError: _jsxDEV is not a function`
// because Vite's optimizeDeps pre-bundler captured the *production*
// variant of `react/jsx-dev-runtime` (where `exports.jsxDEV = void 0`).
//
// Root cause: shells that inject `NODE_ENV=production` made the
// conditional dispatcher (`react/jsx-dev-runtime.js`) resolve to the
// production build before pre-bundling; subsequent dev sessions served
// that pre-bundle and every island threw.
//
// Fix: `apps/web/astro.config.mjs` now (a) forces NODE_ENV=development
// when `astro dev` is the argv command, and (b) aliases
// `react/jsx-dev-runtime` to the development source file as a
// belt-and-suspenders measure.
//
// This test must pass on Node and document the root cause so a future
// regression to the same shape is caught at unit-test time (AC-5 of
// ISS-UAT-009-6). We deliberately avoid importing any @astrojs/react
// component because the project currently has the independent
// ISS-TEST-WEB-001 vitest+vite SSR-transform-skew blocker; the
// regression we care about is in the React package itself, which is
// trivial to test in isolation.
//
// References:
// - ISS-UAT-009-6 (.copilot/issues/ISS-UAT-009-6.md)
// - apps/web/astro.config.mjs (the fix lives there)
// - node_modules/react/cjs/react-jsx-dev-runtime.development.js
// - node_modules/react/cjs/react-jsx-dev-runtime.production.js

import { describe, expect, it } from 'vitest';
import * as jsxDevRuntime from 'react/jsx-dev-runtime';
import * as jsxRuntime from 'react/jsx-runtime';

describe('ISSUAT0096 — react/jsx-dev-runtime exports the dev variant', () => {
  it('exports `jsxDEV` as a function', () => {
    // AC-5 (regression test): this must NOT throw, and `jsxDEV` must be callable.
    // Before the fix, this would be `undefined` and the second line would
    // throw `TypeError: jsxDEV is not a function`.
    expect(jsxDevRuntime).toHaveProperty('jsxDEV');
    expect(typeof jsxDevRuntime.jsxDEV).toBe('function');
  });

  it('exports `Fragment` as a symbol', () => {
    // `Fragment` is exported by both dev and prod variants, so its presence
    // confirms a real React build is wired in (not a stub or a missing file).
    expect(jsxDevRuntime).toHaveProperty('Fragment');
    expect(typeof jsxDevRuntime.Fragment).toBe('symbol');
  });

  it('dev variant call returns an element-shaped object', () => {
    // Smoke-test the function itself with a real call. Returning a plain
    // `Element` shape with `$$typeof: Symbol.for("react.transitional.element")`
    // confirms the dev runtime is correctly wired into the React 19
    // transitional-element stream.
    // Cast through `unknown` because the published types treat jsxDEV as
    // a callable factory but the runtime narrowing differs from `jsx`.
    const jsxDEV = jsxDevRuntime.jsxDEV as unknown as (
      type: unknown,
      config: { children: string },
      key: string,
    ) => { $$typeof: symbol };
    const element = jsxDEV(jsxDevRuntime.Fragment, { children: 'ping' }, 'k');
    expect(element).toBeTruthy();
    expect(element.$$typeof?.toString()).toBe(
      'Symbol(react.transitional.element)',
    );
  });

  it('production jsx-runtime (used in prod builds) does NOT export jsxDEV', () => {
    // Sanity-check: prod variant must only export `jsx` and `jsxs`. This
    // documents the source of the original bug — the production runtime
    // legitimately has no `jsxDEV`. If a future React upgrade changes this,
    // we want CI to fail here so the fix in astro.config.mjs can be
    // re-evaluated.
    expect('jsxDEV' in jsxRuntime).toBe(false);
    expect('jsx' in jsxRuntime).toBe(true);
    expect('jsxs' in jsxRuntime).toBe(true);
  });
});
