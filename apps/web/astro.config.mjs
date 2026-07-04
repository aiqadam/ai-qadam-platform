import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

// Fix for ISS-UAT-009-6 (Step 1 of 2):
//   Force `NODE_ENV=development` whenever this config is loaded by
//   `astro dev`, regardless of the calling shell's env. Without this,
//   shells that inject `NODE_ENV=production` (CI runners, captured
//   PowerShell envs, pnpm >8.0 in workspace mode) make Vite's
//   optimizeDeps pre-bundler resolve `react/jsx-dev-runtime` to its
//   production variant (`exports.jsxDEV = void 0`) — which then crashes
//   every React island on every page load. We only force the env for
//   the `dev` command; `astro build` and `astro preview` are honoured.
//   We mutate `process.env` *before* any React module is required, so
//   the conditional dispatcher at `react/jsx-dev-runtime.js` evaluates
//   correctly even before Vite pre-bundles it.
const isDevCommand =
  process.argv.includes('dev') ||
  process.argv.some((arg) => String(arg).endsWith('astro') && process.argv.includes('dev'));
if (isDevCommand && process.env.NODE_ENV !== 'development') {
  const previous = String(process.env.NODE_ENV);
  process.env.NODE_ENV = 'development';
  // eslint-disable-next-line no-console
  console.log(`[astro.config] Forced NODE_ENV=development for astro dev (was: ${previous})`);
}

// Astro 5 + React 19 islands + Tailwind 4 + Node adapter for hybrid SSR.
//
// Output mode is the default 'static' — most public pages are pre-rendered
// at build time. Pages that need per-request data (admin pages reading
// cookies, dynamic /events/[id] with caller-aware registration state) opt
// in to SSR by exporting `export const prerender = false` from the .astro
// frontmatter. The Node adapter serves both layers from one process.
//
// Per ARCHITECTURE.md §"Frontend architecture": SSR/client-only for
// personalized surfaces; static for content-heavy pages.
export default defineConfig({
  // Per-tenant subdomains (uz/kz/tj.aiqadam.org) all serve the same
  // build. `site` is the canonical apex used by Layout.astro to build
  // OG / canonical URLs when Astro.url isn't a real request URL
  // (i.e. for prerendered pages). SSR pages override via the actual
  // request URL — see lib/cms.countryFromHost.
  site: 'https://aiqadam.org',
  output: 'static',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    server: {
      // Same-origin proxy: web at :4321/api/* → api at :3000/*. Keeps the
      // __Host- refresh cookie same-origin (browser sends it on XHR with
      // credentials: 'include' under SameSite=lax). Production mirrors this
      // via Caddy/Coolify on aiqadam.org → /api/* on the API container.
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: false,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
    // Fix for ISS-UAT-009-6 (Step 2 of 2):
    //   `optimizeDeps.force = true` invalidates the stale Vite pre-bundle
    //   on every dev start. Even with the top-level NODE_ENV=development
    //   override in this file, a previously-cached pre-bundle (from a
    //   session where the env was wrongly production) would survive until
    //   Vite chose to re-bundle. Forcing re-optimisation guarantees a
    //   clean pre-bundle that uses the development variant of
    //   `react/jsx-dev-runtime` for the duration of this dev session.
    //
    //   We do NOT add a `resolve.alias` to bypass the conditional
    //   dispatcher because the CJS-source-path approach breaks ESM
    //   interop (`require is not defined`). The dispatcher at
    //   `react/jsx-dev-runtime.js` is sufficient once NODE_ENV is fixed.
    //
    //   Production builds skip this because the top-level guard only
    //   mutates NODE_ENV for the `dev` command.
    optimizeDeps: {
      force: true,
    },
  },
  server: {
    port: 4321,
    host: 'localhost',
  },
});
