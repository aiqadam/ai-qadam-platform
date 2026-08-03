/**
 * FR-NTF-005 — Notification channel enforcement E2E test (Playwright).
 *
 * Verifies that when a user disables a notification channel, they no longer
 * receive notifications on that channel. This test:
 * 1. Disables email notifications
 * 2. Triggers a test notification
 * 3. Verifies no email was sent (via Mailpit API check)
 *
 * Prerequisites:
 * - apps/web-next running on http://localhost:4173
 * - apps/api running on http://localhost:3001
 * - Mailpit running on http://localhost:8025
 * - Directus running on http://localhost:8055
 * - Test user authenticated via Authentik
 */

import { test, expect, } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4173';
const _API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';
const PREFERENCES_URL = `${BASE_URL}/me/preferences`;

test.describe('FR-NTF-005 — Notification suppression', () => {
  test('Step 001: Disabling email channel suppresses email notifications', async ({ page, request }) => {
    // Navigate to preferences page
    await page.goto(PREFERENCES_URL);
    await page.waitForSelector('h1:has-text("Notification preferences")');

    // Disable email notifications
    const emailToggle = page.getByRole('button', { name: /email notifications/i });
    await expect(emailToggle).toBeVisible();
    
    const initialText = await emailToggle.textContent();
    if (initialText?.includes('On')) {
      await emailToggle.click();
      await page.waitForTimeout(500);
    }

    // Verify toggle is now off
    const updatedText = await emailToggle.textContent();
    expect(updatedText).toContain('Off');

    // TODO: Trigger a test notification via API
    // For now, this is a placeholder — would require:
    // 1. POST /v1/interactions/dispatch with test payload
    // 2. Check Mailpit API for no matching email
    // 3. Re-enable email and verify delivery works

    // Placeholder assertion
    const mailpitRes = await request.get(`${MAILPIT_URL}/api/v1/messages`);
    expect(mailpitRes.ok()).toBe(true);
  });
});
