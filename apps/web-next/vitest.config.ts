import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// apps/web-next/vitest.config.ts — Vitest 4.x with workspace vite 8.1.0.
//
// Vite 8.1.0's default bundler (rolldown 1.1.3) parses `.tsx` files with JSX
// DISABLED by default and emits `Failed to parse source for import analysis`
// (or, in storybook-static builds, `PARSE_ERROR: Unexpected JSX expression`).
// The repo's pattern is to install `@vitejs/plugin-react` and prepend
// `react({ jsxRuntime: 'automatic' })` as the FIRST plugin in the chain so
// Babel transpiles JSX before rolldown's parser sees it. Same fix used by
// apps/storybook (PR #109 / ISS-CI-OVERRIDE-ebd184b) and needed here because
// apps/web-next has `.tsx` test files (e.g. FilterChip.test.tsx).
//
// ISS-TEST-WEB-001 also bumps `vitest` itself to ^4.1.9 (see this package's
// package.json). Without this plugin wiring, that bump alone is insufficient
// because vitest 4.x still uses the same underlying vite 8.1.0 / rolldown
// pipeline.

export default defineConfig({
  plugins: [react({ jsxRuntime: 'automatic' })],
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    resolve: {
      conditions: ['browser'],
    },
  },
});
