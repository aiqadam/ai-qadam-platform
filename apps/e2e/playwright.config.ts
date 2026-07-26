import { defineConfig, devices } from '@playwright/test';

// Sprint 0.10 — smoke test infrastructure (Lane 2 of the 3-lane execution model).
// See docs/01-business/community-platform-roadmap.md §2.5 + §7.5 for the smoke catalog convention.
//
// NOT WIRED INTO CI (as of 2026-07-26). This suite is available tooling —
// run it manually if useful — but nothing runs it automatically. The last
// CI hook (smoke-pr.yml, pull_request trigger) was removed because it
// tested each PR's own test code against whatever was currently deployed
// to prod, which — under this repo's manual prod-deploy model — can lag
// main by days, making a red result ambiguous (broken PR vs. stale prod,
// no way to tell which). QA/UAT verification (tests/uat/, the
// uat-verification agentic workflow, manual testing) is the correct tool
// for "does this PR's change work." Full history + rationale in
// apps/e2e/README.md's "History" section — read it before re-wiring this
// into any pipeline.
//
// Targeting strategy if you DO run this manually:
//   - default: BASE_URL=https://aiqadam.org (production)
//   - local dev: override BASE_URL=http://localhost:4321
//   - Most files are read-only, but NOT ALL — several (e.g.
//     smoke-onboarding.spec.ts) assume a dedicated seeded test user or an
//     isolated stack. Read a file before running it against prod, QA, or
//     any environment with test data you don't want disturbed.
//
// This config's testDir (./tests) also covers tests/parity/ and tests/uat/,
// which are NOT smoke tests — they need their own config/env and a docker
// stack, and must not run via the plain `playwright test`. Use the scoped
// package.json scripts instead:
//   - pnpm test:e2e:smoke  → tests/smoke-*.spec.ts only
//   - pnpm e2e:parity      → tests/parity/, its own playwright.parity.config.ts
//   - (tests/uat/ is driven by the uat-verification agentic workflow, not
//     a package.json script — needs a local docker-compose stack)

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
