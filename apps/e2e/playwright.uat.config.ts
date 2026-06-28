/**
 * UAT Playwright config — human-less acceptance testing against a live local stack.
 *
 * Unlike the smoke suite (read-only, targets production), UAT:
 *   - targets localhost ONLY (never production)
 *   - performs write operations (sign-in, register for events, form submissions)
 *   - captures a screenshot after EVERY step (not only on failure)
 *   - saves results to apps/e2e/uat-results/<BP-UAT-NNN>/
 *   - is run by the UATRunner agent inside the uat-verification workflow
 *
 * Usage (with the local stack running):
 *   pnpm uat:seed                        # create test fixtures first
 *   pnpm --filter @aiqadam/e2e exec playwright test \
 *       --config apps/e2e/playwright.uat.config.ts
 *
 * Environment variables (set in apps/e2e/.env or via shell):
 *   UAT_BASE_URL           — defaults to http://localhost:4321
 *   UAT_OPERATOR_EMAIL     — defaults to uat-operator@aiqadam.test
 *   UAT_OPERATOR_PASSWORD  — required
 *   UAT_MEMBER_EMAIL       — defaults to uat-member@aiqadam.test
 *   UAT_MEMBER_PASSWORD    — required
 */

import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.UAT_BASE_URL ?? 'http://localhost:4321';

// ESM-safe __dirname equivalent (package.json has "type": "module").
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Screenshots and traces land here — one subdirectory per BP-UAT-NNN script.
const UAT_RESULTS_DIR = path.join(__dirname, 'uat-results');

export default defineConfig({
  testDir: './tests/uat',
  timeout: 60_000,
  expect: { timeout: 10_000 },

  // UAT runs sequentially — fixtures depend on ordered state, and
  // concurrent write operations would corrupt the test data.
  fullyParallel: false,
  workers: 1,

  // No retries — a flaky UAT run means the feature is unstable.
  forbidOnly: !!process.env.CI,
  retries: 0,

  reporter: [
    ['html', { open: 'never', outputFolder: path.join(UAT_RESULTS_DIR, 'html-report') }],
    ['list'],
    ['json', { outputFile: path.join(UAT_RESULTS_DIR, 'results.json') }],
  ],

  use: {
    baseURL: BASE_URL,

    // Screenshot every step — UATRunner agent uses these to verify UI state.
    // The spec files call page.screenshot({ path: ... }) after each step;
    // this setting is a safety net that also fires on failure.
    screenshot: 'on',
    video: 'retain-on-failure',
    trace: 'on',

    extraHTTPHeaders: {
      'x-aiqadam-uat': 'true',
    },

    // Viewport matches the design system breakpoint (lg — 1280px).
    viewport: { width: 1280, height: 800 },
  },

  // UAT runs desktop Chrome only — no cross-browser variation needed here.
  projects: [
    {
      name: 'uat-desktop-chrome',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
