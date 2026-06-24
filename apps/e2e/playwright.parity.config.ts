/**
 * FR-MIG-030 — Playwright config for the v1/v2 parity suite.
 *
 * Two projects run the same spec files:
 *   - "v1-chromium" targets BASE_URL_V1 (aiqadam.org — legacy app)
 *   - "v2-chromium" targets BASE_URL_V2 (next.aiqadam.org — new app)
 *
 * Both projects must pass for the parity gate to be green.
 *
 * Usage:
 *   pnpm e2e:parity                  # full dual-sweep
 *   BASE_URL_V2=http://localhost:4322 pnpm e2e:parity   # dev override
 */

import { defineConfig, devices } from '@playwright/test';

const V1_URL = process.env.BASE_URL_V1 ?? 'https://aiqadam.org';
const V2_URL = process.env.BASE_URL_V2 ?? 'https://next.aiqadam.org';

const SHARED_USE = {
  trace: 'on-first-retry',
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',
  extraHTTPHeaders: {
    'x-aiqadam-parity': 'true',
    'x-aiqadam-smoke': 'true',
  },
} as const;

export default defineConfig({
  testDir: './tests/parity',
  timeout: 45_000,
  expect: { timeout: 8_000 },

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'parity-report' }], ['list']]
    : [['html', { open: 'never', outputFolder: 'parity-report' }], ['list']],

  projects: [
    {
      name: 'v1-chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...SHARED_USE,
        baseURL: V1_URL,
      },
    },
    {
      name: 'v2-chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...SHARED_USE,
        baseURL: V2_URL,
      },
    },
  ],
});
