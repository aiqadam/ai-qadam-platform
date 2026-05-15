import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

// Astro 5 + React 19 islands + Tailwind 4 (Vite plugin, no PostCSS config).
// Per ARCHITECTURE.md §"Frontend architecture":
//   Static generation for content-heavy pages, React islands only for
//   interactive sub-trees. SSR/client only for personalized surfaces.
export default defineConfig({
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
