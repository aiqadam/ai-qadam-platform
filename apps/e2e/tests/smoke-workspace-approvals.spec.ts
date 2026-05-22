import { expect, test } from '@playwright/test';

// F-S3.7 — workspace cabinet #4 (operator approval queue) smoke.
// Anon visitor auto-redirects to Authentik (matches F-S3.2 / 3.3 / 3.4
// pattern). API endpoint is AuthGuard-gated; unauthenticated request
// gets 401.

test.describe('F-S3.7 — /workspace/approvals', () => {
  test('anon viewer auto-redirects toward Authentik login', async ({ page }) => {
    const response = await page.goto('/workspace/approvals', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    let url = '';
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      url = page.url();
      if (!/\/workspace\/approvals\/?$/.test(url)) break;
      await page.waitForTimeout(200);
    }
    expect(url, 'page should redirect off /workspace/approvals within 10s').not.toMatch(
      /\/workspace\/approvals\/?$/,
    );
    expect(url).toMatch(/auth\.aiqadam\.org|\/api\/v1\/auth\/login/);
  });

  test('API: GET /v1/workspace/approvals requires auth (401)', async ({ request }) => {
    const res = await request.get('/api/v1/workspace/approvals');
    expect(res.status()).toBe(401);
  });
});
