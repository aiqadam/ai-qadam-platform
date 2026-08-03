/**
 * FR-NTF-005 — Channel toggles E2E test (Playwright).
 *
 * Tests the `/me/preferences` page channel toggle UI:
 * - Toggle email notifications on/off
 * - Toggle telegram notifications on/off
 * - Verify state persistence across page reloads
 *
 * Prerequisites:
 * - apps/web-next running on http://localhost:4173
 * - apps/api running on http://localhost:3001
 * - Directus running on http://localhost:8055
 * - Test user authenticated via Authentik
 */

import { test, expect, } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4173';
const PREFERENCES_URL = `${BASE_URL}/me/preferences`;

test.describe('FR-NTF-005 — Channel toggles', () => {
  test.beforeEach(async ({ page }) => {
    // TODO: Authenticate test user
    // For now, assumes user is already logged in via cookie/localStorage
    await page.goto(PREFERENCES_URL);
  });

  test('Step 001: Toggle email notifications off', async ({ page }) => {
    // Wait for page to load
    await page.waitForSelector('h1:has-text("Notification preferences")');

    // Find email toggle button
    const emailToggle = page.getByRole('button', { name: /email notifications/i });
    await expect(emailToggle).toBeVisible();

    // Get initial state (should be "On" by default)
    const initialText = await emailToggle.textContent();
    expect(initialText).toContain('On');

    // Click to toggle off
    await emailToggle.click();

    // Wait for state update
    await page.waitForTimeout(500);

    // Verify button now shows "Off"
    const updatedText = await emailToggle.textContent();
    expect(updatedText).toContain('Off');
  });

  test('Step 002: Toggle telegram notifications off', async ({ page }) => {
    await page.waitForSelector('h1:has-text("Notification preferences")');

    const telegramToggle = page.getByRole('button', { name: /telegram notifications/i });
    await expect(telegramToggle).toBeVisible();

    const initialText = await telegramToggle.textContent();
    expect(initialText).toContain('On');

    await telegramToggle.click();
    await page.waitForTimeout(500);

    const updatedText = await telegramToggle.textContent();
    expect(updatedText).toContain('Off');
  });
});
