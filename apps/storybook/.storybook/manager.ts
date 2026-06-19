import { addons } from '@storybook/manager-api';
import { create } from '@storybook/theming';

// apps/storybook/.storybook/manager.ts — chrome theme for the Storybook
// UI itself (sidebar + toolbar), distinct from the preview iframe theme.
//
// We just rename the title and point links at the canonical docs so any
// engineer landing on design.aiqadam.org sees the project's identity
// instead of generic Storybook branding. Colors track the design tokens
// roughly (manager-api theming uses plain hex, not OKLCH — close enough).

addons.setConfig({
  theme: create({
    base: 'dark',
    brandTitle: 'AI Qadam — Design',
    brandUrl:
      'https://github.com/viktordrukker/aiqadam/blob/main/docs/04-development/architecture/blocks.md',
    brandTarget: '_blank',
  }),
});
