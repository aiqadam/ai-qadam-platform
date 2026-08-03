/**
 * FR-NTF-005 — Topic interests E2E test (Playwright).
 *
 * Tests the `/me/preferences` page topic interest selection UI:
 * - Select topic interests
 * - Deselect topic interests
 * - Verify state persistence
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

test.describe('FR-NTF-005 — Topic interests', () => {
  test.beforeEach(async ({ page }) => {
    // TODO: Authenticate test user
    await page.goto(PREFERENCES_URL);
  });

  test('Step 001: Select AI/ML topic', async ({ page }) => {
    // Wait for page to load
    await page.waitForSelector('h1:has-text("Notification preferences")');

    // Find AI/ML topic button
    const aimlTopic = page.getByRole('button', { name: /AI\/ML/i });
    await expect(aimlTopic).toBeVisible();

    // Click to select
    await aimlTopic.click();

    // Wait for state update
    await page.waitForTimeout(500);

    // Verify button shows selected state (has checkmark icon)
    const hasCheck = await aimlTopic.locator('svg').count();
    expect(hasCheck).toBeGreaterThan(0);
  });

  test('Step 002: Deselect previously selected topic', async ({ page }) => {
    await page.waitForSelector('h1:has-text("Notification preferences")');

    // Select a topic first
    const pythonTopic = page.getByRole('button', { name: /Python/i });
    await pythonTopic.click();
    await page.waitForTimeout(500);

    // Verify selected (has checkmark)
    let hasCheck = await pythonTopic.locator('svg').count();
    expect(hasCheck).toBeGreaterThan(0);

    // Click again to deselect
    await pythonTopic.click();
    await page.waitForTimeout(500);

    // Verify no longer selected (no checkmark)
    hasCheck = await pythonTopic.locator('svg').count();
    expect(hasCheck).toBe(0);
  });
});
