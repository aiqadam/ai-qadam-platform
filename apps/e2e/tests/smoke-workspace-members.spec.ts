import { expect, test } from '@playwright/test';

// F-S3.2 — workspace cabinet #1 smoke. Per ADR-0033, /workspace/members
// IS the operator surface that replaces Directus admin. Anon visitor
// auto-redirects to Authentik (same shape as the workspace shell).

test.describe('F-S3.2 — /workspace/members', () => {
  test('anon viewer auto-redirects toward Authentik login', async ({ page }) => {
    const response = await page.goto('/workspace/members', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    // Same polling pattern as /workspace smoke (per #130 fix) — wait
    // until we leave /workspace/members for /api/v1/auth/login → Authentik.
    let url = '';
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      url = page.url();
      if (!/\/workspace\/members\/?$/.test(url)) break;
      await page.waitForTimeout(200);
    }
    expect(url, 'page should redirect off /workspace/members within 10s').not.toMatch(
      /\/workspace\/members\/?$/,
    );
    expect(url).toMatch(/auth\.aiqadam\.org|\/api\/v1\/auth\/login/);
  });

  test('API: GET /v1/workspace/members requires auth (401 without token)', async ({ request }) => {
    const res = await request.get('/api/v1/workspace/members');
    expect(res.status()).toBe(401);
  });

  test('API: GET /v1/workspace/cohorts requires auth (401 without token)', async ({ request }) => {
    const res = await request.get('/api/v1/workspace/cohorts');
    expect(res.status()).toBe(401);
  });
});
