import { expect, test } from '@playwright/test';

// F-S3.3 — workspace cabinet #2 smoke. Anon visitor auto-redirects
// to Authentik (same pattern as the workspace shell + /workspace/members).

test.describe('F-S3.3 — /workspace/announce', () => {
  test('anon viewer auto-redirects toward Authentik login', async ({ page }) => {
    const response = await page.goto('/workspace/announce', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    let url = '';
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      url = page.url();
      if (!/\/workspace\/announce\/?$/.test(url)) break;
      await page.waitForTimeout(200);
    }
    expect(url, 'page should redirect off /workspace/announce within 10s').not.toMatch(
      /\/workspace\/announce\/?$/,
    );
    expect(url).toMatch(/auth\.aiqadam\.org|\/api\/v1\/auth\/login/);
  });

  test('API: POST /v1/workspace/announce/preview requires auth (401)', async ({ request }) => {
    const res = await request.post('/api/v1/workspace/announce/preview', {
      data: { cohortId: '11111111-1111-4000-8000-000000000001', subject: 's', body: 'b' },
    });
    expect(res.status()).toBe(401);
  });

  test('API: POST /v1/workspace/announce requires auth (401)', async ({ request }) => {
    const res = await request.post('/api/v1/workspace/announce', {
      data: {
        cohortId: '11111111-1111-4000-8000-000000000001',
        subject: 's',
        body: 'b',
        consentBasis: 'explicit_opt_in',
      },
    });
    expect(res.status()).toBe(401);
  });
});
