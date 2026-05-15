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
  },
  server: {
    port: 4321,
    host: 'localhost',
  },
});
