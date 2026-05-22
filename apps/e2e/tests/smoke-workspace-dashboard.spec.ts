import { expect, test } from '@playwright/test';

// F-S2.4 + F-S2.6 smoke. Cabinet + cross-country API.

test.describe('F-S2.4 — /workspace/dashboard', () => {
  test('anon viewer redirects toward Authentik', async ({ page }) => {
    const response = await page.goto('/workspace/dashboard', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    let url = '';
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      url = page.url();
      if (!/\/workspace\/dashboard\/?$/.test(url)) break;
      await page.waitForTimeout(200);
    }
    expect(url).not.toMatch(/\/workspace\/dashboard\/?$/);
    expect(url).toMatch(/auth\.aiqadam\.org|\/api\/v1\/auth\/login/);
  });

  test('API: GET /v1/workspace/dashboard/country requires auth (401)', async ({ request }) => {
    const res = await request.get('/api/v1/workspace/dashboard/country?c=kz');
    expect(res.status()).toBe(401);
  });

  test('API: GET /v1/workspace/dashboard/cross-country requires auth (401)', async ({
    request,
  }) => {
    const res = await request.get('/api/v1/workspace/dashboard/cross-country');
    expect(res.status()).toBe(401);
  });
});
