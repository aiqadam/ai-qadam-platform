import { withThemeByDataAttribute } from '@storybook/addon-themes';
import type { Preview } from '@storybook/react';
import './preview.css';

// apps/storybook/.storybook/preview.tsx — ADR-0038 §Locks #6.
//
// Global decorators + parameters for every story.
//   * Imports `preview.css` which in turn pulls in design-system/tokens.css
//     + components.css + portal.css via the apps/web-next/ globals (same
//     three @import lines). Result: atoms render against the exact theme
//     they will in apps/web-next/, no drift.
//   * `withThemeByDataAttribute` toggles `data-theme` between "light" and
//     "dark" on <html>. The OKLCH tokens swap automatically per
//     design-system/tokens.css — no story-level color overrides needed.
//   * `backgrounds` is disabled in favor of the token-driven body bg
//     so contrast is realistic.

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: { disable: true },
    layout: 'padded',
  },
  decorators: [
    withThemeByDataAttribute({
      themes: { light: 'light', dark: 'dark' },
      defaultTheme: 'dark',
      attributeName: 'data-theme',
      // Apply at the <html> level so design-system/tokens.css selectors
      // (`[data-theme="dark"]`) match — the same pattern apps/web-next/
      // uses in Layout.astro.
      parentSelector: 'html',
    }),
  ],
};

export default preview;
