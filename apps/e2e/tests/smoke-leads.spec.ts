import { expect, test } from '@playwright/test';

// F-S1.6 — public lead-capture surface smoke.
// Read-only assertions on the form's structural integrity. Submission
// is NOT exercised here (would create a real lead row in prod Directus
// every CI run). Submission path is covered by the api unit tests
// (apps/api/test/leads-service.spec.ts) and the verify-redirect path.

test.describe('F-S1.6 — lead capture smoke', () => {
  test('homepage embeds the lead form with email + submit button', async ({ page }) => {
    await page.goto('/');
    // Form is below the partners row; scroll to it.
    const submit = page.getByRole('button', { name: /send me a confirmation/i });
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeVisible();
    await expect(submit).toBeDisabled();

    // Email + city inputs present.
    await expect(page.getByPlaceholder('you@domain.com')).toBeVisible();
    await expect(page.getByPlaceholder(/Tashkent/i)).toBeVisible();
  });

  test('typing a valid email enables the submit button', async ({ page }) => {
    await page.goto('/');
    const submit = page.getByRole('button', { name: /send me a confirmation/i });
    await submit.scrollIntoViewIfNeeded();
    await page.getByPlaceholder('you@domain.com').fill('smoke@example.com');
    await expect(submit).toBeEnabled();
  });

  test('/events also embeds the lead form', async ({ page }) => {
    await page.goto('/events');
    const submit = page.getByRole('button', { name: /send me a confirmation/i });
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeVisible();
  });

  test('/leads/thank-you renders', async ({ page }) => {
    const response = await page.goto('/leads/thank-you');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: /check your inbox/i })).toBeVisible();
  });

  test('/leads/verified renders', async ({ page }) => {
    const response = await page.goto('/leads/verified');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: /you'?re on the list/i })).toBeVisible();
  });

  test('/leads/verify-failed renders', async ({ page }) => {
    const response = await page.goto('/leads/verify-failed');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: /that link didn'?t work/i })).toBeVisible();
  });

  test('GET /api/v1/leads/verify without token redirects to verify-failed', async ({ request }) => {
    const response = await request.get('/api/v1/leads/verify', { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    expect(response.headers().location).toContain('/leads/verify-failed');
  });
});
