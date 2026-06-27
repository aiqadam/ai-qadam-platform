import * as dotenv from 'dotenv';
import { defineConfig, devices } from '@playwright/test';

// UAT config — runs BP-UAT-NNN scripts against the local dev stack.
// Separate from playwright.config.ts (smoke, production-read-only).
//
// Pre-requisites before running:
//   1. BP-UAT-000 environment setup must pass
//   2. Create apps/e2e/.env.uat from the template in BP-UAT-000.md §H-5
//   3. Run: pnpm uat:seed (seeds test fixtures)
//
// Run: cd apps/e2e && pnpm playwright test --config playwright.uat.config.ts

dotenv.config({ path: '.env.uat' });

export default defineConfig({
  testDir: './uat',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['list']]
    : [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: process.env.UAT_BASE_URL ?? 'http://localhost:4321',
    trace: 'on',
    screenshot: 'on',
    video: 'on',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
