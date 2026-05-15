import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

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
  },
  server: {
    port: 4321,
    host: 'localhost',
  },
});
