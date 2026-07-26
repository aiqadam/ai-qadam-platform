import { defineConfig, devices } from '@playwright/test';

// Sprint 0.10 — smoke test infrastructure (Lane 2 of the 3-lane execution model).
// See docs/01-business/community-platform-roadmap.md §2.5 + §7.5 for the smoke catalog convention.
//
// Targeting strategy:
//   - default: BASE_URL=https://aiqadam.org (production probe)
//   - CI on PR: same — these are READ-ONLY smoke assertions against public surfaces;
//     no destructive operations are permitted in this suite (write/destructive tests
//     require docker-compose stack — added when Sprint 1+ ships writeable flows)
//   - local dev: override BASE_URL=http://localhost:4321 to test against pnpm dev
//
// This config's testDir (./tests) also covers tests/parity/ and tests/uat/,
// which are NOT smoke tests — they need their own config/env and a docker
// stack, and must not run via the plain `playwright test`. Use the scoped
// package.json scripts instead:
//   - pnpm test:e2e:smoke  → tests/smoke-*.spec.ts only (what CI runs) —
//     read-only, safe against production. See apps/e2e/README.md's
//     "What this is" section for the full file list and what's excluded.
//   - pnpm e2e:parity      → tests/parity/, its own playwright.parity.config.ts
//   - (tests/uat/ is driven by the uat-verification agentic workflow, not
//     a package.json script — needs a local docker-compose stack)
//
// CI integration: .github/workflows/smoke-pr.yml runs `pnpm test:e2e:smoke`
// on PR only. The Sprint 0.11 scheduled prod-probe variant
// (smoke-schedule.yml, 30-min cron) was removed 2026-07-26 — it predated
// the Coolify removal (PR #45) that gave ci-cd.yml's deploy jobs their own
// inline post-deploy health check, and it never actually ran due to a
// GitHub Actions trigger bug. See apps/e2e/README.md's "History" section.

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
