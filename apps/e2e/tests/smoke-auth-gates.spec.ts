import { expect, test } from '@playwright/test';

// Sprint 0.10 smoke catalog — authentication boundaries.
// Asserts that authenticated surfaces don't leak content to anonymous visitors.

test.describe('S0.10 — auth gates', () => {
  test('/me dashboard renders for anon (client island shows sign-in CTA)', async ({ page }) => {
    // The /me page itself is server-renderable; the React island bootstraps
    // and, on no auth, shows the AnonView with a sign-in CTA. We assert
    // the CTA is reachable, not that the page redirects.
    const response = await page.goto('/me');
    expect(response?.status()).toBe(200);

    // Either: anon CTA OR (if cookie persisted from a prior auth) authed dashboard.
    // For an agent on cold-load with no cookies, anon CTA should appear within 5s.
    const signInCta = page.locator('a[href*="/auth/sign-in"]').first();
    await expect(signInCta).toBeVisible({ timeout: 10_000 });
  });

  test('/me/preferences renders + page title present', async ({ page }) => {
    const response = await page.goto('/me/preferences');
    expect(response?.status()).toBe(200);

    // Page title present (the h1 specifically — page header, independent of auth-state island).
    await expect(page.getByRole('heading', { name: 'Preferences', exact: true })).toBeVisible();
  });

  test('/api/v1/auth/me requires auth (401 without token)', async ({ request }) => {
    const response = await request.get('/api/v1/auth/me');
    expect(response.status()).toBe(401);
  });

  test('/api/v1/internal/* requires internal token (401 without header)', async ({ request }) => {
    const response = await request.post('/api/v1/internal/interactions/dispatch', {
      data: {},
    });
    expect(response.status()).toBe(401);
  });
});
