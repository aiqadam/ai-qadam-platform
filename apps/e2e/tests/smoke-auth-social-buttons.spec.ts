import { expect, test } from '@playwright/test';

// FR-AUTH-003 — smoke tests for the social sign-in buttons and the
// oauth_denied error banner on /auth/sign-in.
//
// These are read-only assertions against the rendered HTML — no auth, no
// mutations. Safe to run against production or a local dev stack
// (BASE_URL env controls the target per playwright.config.ts).
//
// Covered ACs:
//   AC-1  Google "Continue with Google" button visible, href routes through
//         /api/v1/auth/login?provider=google
//   AC-2  GitHub "Continue with GitHub" button visible, href routes through
//         /api/v1/auth/login?provider=github
//   AC-5  oauth_denied error banner renders with correct copy
//   AC-7  Existing buttons ("Continue with password", "Sign in with email
//         link") still present — regression guard
//   AC-8  No error banner when ?error= is absent

test.describe('FR-AUTH-003 — social sign-in buttons + error banner', () => {
  test('Google sign-in button is visible with href containing provider=google (AC-1)', async ({
    page,
  }) => {
    const response = await page.goto('/auth/sign-in');
    expect(response?.status()).toBe(200);

    const googleBtn = page.getByRole('link', { name: 'Continue with Google' });
    await expect(googleBtn).toBeVisible();

    const href = await googleBtn.getAttribute('href');
    expect(href).toContain('provider=google');
    expect(href).toContain('/api/v1/auth/login');
  });

  test('GitHub sign-in button is visible with href containing provider=github (AC-2)', async ({
    page,
  }) => {
    await page.goto('/auth/sign-in');

    const githubBtn = page.getByRole('link', { name: 'Continue with GitHub' });
    await expect(githubBtn).toBeVisible();

    const href = await githubBtn.getAttribute('href');
    expect(href).toContain('provider=github');
    expect(href).toContain('/api/v1/auth/login');
  });

  test('oauth_denied error banner renders with correct message (AC-5)', async ({ page }) => {
    await page.goto('/auth/sign-in?error=oauth_denied');

    const banner = page.getByText('Sign-in was cancelled. Please try again.');
    await expect(banner).toBeVisible();
  });

  test('no error banner when ?error= is absent (AC-8)', async ({ page }) => {
    await page.goto('/auth/sign-in');

    const banner = page.getByText('Sign-in was cancelled. Please try again.');
    await expect(banner).toHaveCount(0);
  });

  test('existing buttons still present — regression guard (AC-7)', async ({ page }) => {
    await page.goto('/auth/sign-in');

    // Pre-FR-AUTH-003 buttons must not be removed by this change.
    await expect(page.getByRole('link', { name: 'Continue with password' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in with email link' })).toBeVisible();
  });

  test('all sign-in buttons visible at 375px mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/auth/sign-in');

    await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continue with GitHub' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continue with password' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in with email link' })).toBeVisible();
  });
});
