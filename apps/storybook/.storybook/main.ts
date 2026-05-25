import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/react-vite';

// apps/storybook/.storybook/main.ts — ADR-0038 §Locks #6.
//
// Storybook 8 + Vite + React. The framework adapter (`@storybook/react-vite`)
// hands us a Vite config we extend so atoms imported from
// `apps/web-next/src/kit/*` resolve against the same `@/` alias used in
// web-next. That keeps stories importing the REAL atom files (no copies)
// and means any token / atom edit ripples into Storybook on next reload.
//
// Tailwind v4 is wired via @tailwindcss/vite — same approach as
// apps/web-next/astro.config.mjs — so the OKLCH tokens in
// design-system/tokens.css are the single source of truth for color.

const here = dirname(fileURLToPath(import.meta.url));
const webNextSrc = resolve(here, '..', '..', 'web-next', 'src');

const config: StorybookConfig = {
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  stories: [
    join(here, '..', 'stories', '**', '*.mdx'),
    join(here, '..', 'stories', '**', '*.stories.@(ts|tsx)'),
  ],
  addons: ['@storybook/addon-essentials', '@storybook/addon-themes'],
  typescript: {
    // Storybook ships its own typecheck; we let the workspace `tsc` handle
    // strict checks. Skipping in-Storybook means stories compile fast in dev.
    check: false,
    reactDocgen: 'react-docgen-typescript',
  },
  docs: {
    autodocs: 'tag',
  },
  async viteFinal(viteConfig) {
    const { default: tailwindcss } = await import('@tailwindcss/vite');
    return {
      ...viteConfig,
      plugins: [...(viteConfig.plugins ?? []), tailwindcss()],
      resolve: {
        ...viteConfig.resolve,
        alias: {
          ...(viteConfig.resolve?.alias ?? {}),
          // Match the `@/*` alias used in apps/web-next/tsconfig.json so
          // every atom (and its `@/lib/utils` import) resolves to the
          // real source file without a copy step.
          '@': webNextSrc,
        },
      },
    };
  },
};

export default config;
