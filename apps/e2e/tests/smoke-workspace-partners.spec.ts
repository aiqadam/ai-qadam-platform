import { expect, test } from '@playwright/test';

// F-S3.5 smoke — partner cabinet list + detail.

test.describe('F-S3.5 — /workspace/partners', () => {
  test('anon viewer of list redirects toward Authentik', async ({ page }) => {
    const response = await page.goto('/workspace/partners', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    let url = '';
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      url = page.url();
      if (!/\/workspace\/partners\/?$/.test(url)) break;
      await page.waitForTimeout(200);
    }
    expect(url).not.toMatch(/\/workspace\/partners\/?$/);
    expect(url).toMatch(/auth\.aiqadam\.org|\/api\/v1\/auth\/login/);
  });

  test('API: GET /v1/workspace/partners requires auth (401)', async ({ request }) => {
    const res = await request.get('/api/v1/workspace/partners');
    expect(res.status()).toBe(401);
  });

  test('API: GET /v1/workspace/partners/:slug requires auth (401)', async ({ request }) => {
    const res = await request.get('/api/v1/workspace/partners/some-slug');
    expect(res.status()).toBe(401);
  });
});
