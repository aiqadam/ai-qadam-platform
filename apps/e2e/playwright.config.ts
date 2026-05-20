import { defineConfig, devices } from '@playwright/test';

// Sprint 0.10 — smoke test infrastructure (Lane 2 of the 3-lane execution model).
// See docs/community-platform-roadmap.md §2.5 + §7.5 for the smoke catalog convention.
//
// Targeting strategy:
//   - default: BASE_URL=https://aiqadam.org (production probe)
//   - CI on PR: same — these are READ-ONLY smoke assertions against public surfaces;
//     no destructive operations are permitted in this suite (write/destructive tests
//     require docker-compose stack — added when Sprint 1+ ships writeable flows)
//   - local dev: override BASE_URL=http://localhost:4321 to test against pnpm dev
//
// What runs here:
//   - smoke-public.spec.ts — homepage / events / sitemap / robots / OG meta / Plausible
//   - smoke-auth-gates.spec.ts — /me redirects to sign-in; /admin gated
//   - smoke-accessibility.spec.ts — axe-core on public pages
//   - smoke-tenant.spec.ts — uz.aiqadam.org subdomain serves UZ-scoped content
//
// What does NOT run here (yet — added per sprint):
//   - registration flow (writes to Directus; needs staging stack — Sprint 1.1)
//   - operator workspace flows (needs Sprint 2 to ship workspace)
//   - cabinet flows (needs Sprint 3 to ship cabinets)
//
// CI integration: .github/workflows/smoke.yml runs on PR + scheduled (every 30 min
// in prod for Sprint 0.11 production probe).

const BASE_URL = process.env.BASE_URL ?? 'https://aiqadam.org';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['list']]
    : [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Identify smoke traffic via header (Plausible + future server-side
    // filtering). We DELIBERATELY use Playwright's default Chrome UA — a
    // custom "*Agent" UA gets challenged by Cloudflare's bot management
    // from GitHub-Actions IPs, producing flaky-looking failures that are
    // really "challenge page returned 0 elements". Header is enough for
    // our own analytics; Cloudflare leaves a real Chrome UA alone.
    extraHTTPHeaders: {
      'x-aiqadam-smoke': 'true',
    },
  },

  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 5'] },
    },
  ],
});
