import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

// apps/web-next/ — ADR-0038 greenfield build. Deployed to next.aiqadam.org
// (engineer-only behind Authentik forward-auth) until cutover. See
// docs/04-development/frontend/web-migration-plan.md.
//
// Output mode is 'server' (full SSR). v2 leans on the SSR auth-bootstrap
// pattern that landed in v1 (PR #389) — the middleware always runs, so
// every page can read Astro.locals.auth. No prerendered customer pages
// in this phase (they come back in Phase 1 once the block catalogue is
// stable). Per ADR-0038 §Locks #2 + Lock #3, new pages MUST be created
// via `pnpm gen:page` and must NOT contain raw fetch() or inline style=.
export default defineConfig({
  site: 'https://next.aiqadam.org',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  // GH-41: Astro's checkOrigin middleware constructs the request URL using
  // the raw socket protocol (http, since Nginx→Astro is unencrypted), while
  // the browser Origin header carries the public https:// scheme. This makes
  // Astro's same-origin check fail for all POST form submissions on QA/prod.
  // Configuring allowedDomains enables #applyForwardedHeaders(), which reads
  // the X-Forwarded-Proto: https header Nginx already forwards and patches
  // url.origin to https:// before checkOrigin runs. CSRF protection stays ON.
  //
  // *.aiqadam.org covers every current and future tenant subdomain
  // (kz.aiqadam.org, uz.aiqadam.org, qa.aiqadam.org, next.aiqadam.org, …).
  // The apex aiqadam.org is listed separately — * only matches one label.
  security: {
    checkOrigin: true,
    allowedDomains: [
      { hostname: '*.aiqadam.org' },
      { hostname: 'aiqadam.org' },
    ],
  },
  vite: {
    plugins: [tailwindcss()],
    server: {
      // Same-origin proxy for local dev: web-next at :4322/api/* → api at
      // :3000/*. Port 4322 (web-next) avoids collision with apps/web's
      // 4321 — both apps may run side-by-side during the build window.
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: false,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  },
  server: {
    port: 4322,
    host: 'localhost',
  },
});
