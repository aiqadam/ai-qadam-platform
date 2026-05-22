import { expect, test } from '@playwright/test';

// F-S2.5-c smoke. Two cabinets: admin (super-admin gated) + member
// access log (auth gated).

test.describe('F-S2.5-c — /workspace/admin/audit', () => {
  test('anon viewer redirects toward Authentik', async ({ page }) => {
    const response = await page.goto('/workspace/admin/audit', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    let url = '';
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      url = page.url();
      if (!/\/workspace\/admin\/audit\/?$/.test(url)) break;
      await page.waitForTimeout(200);
    }
    expect(url).not.toMatch(/\/workspace\/admin\/audit\/?$/);
    expect(url).toMatch(/auth\.aiqadam\.org|\/api\/v1\/auth\/login/);
  });

  test('API: GET /v1/admin/audit/events requires auth (401)', async ({ request }) => {
    const res = await request.get('/api/v1/admin/audit/events');
    expect(res.status()).toBe(401);
  });
});

test.describe('F-S2.5-c — /me/access-log', () => {
  test('API: GET /v1/me/access-log requires auth (401)', async ({ request }) => {
    const res = await request.get('/api/v1/me/access-log');
    expect(res.status()).toBe(401);
  });
});
