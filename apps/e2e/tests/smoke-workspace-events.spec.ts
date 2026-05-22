import { expect, test } from '@playwright/test';

// F-S3.4 — workspace cabinet #3 smoke. Anon visitor auto-redirects to
// Authentik (mirrors F-S3.2 / F-S3.3 pattern). API endpoints are
// AuthGuard-gated; unauthenticated requests get 401.

test.describe('F-S3.4 — /workspace/events', () => {
  test('anon viewer auto-redirects toward Authentik login', async ({ page }) => {
    const response = await page.goto('/workspace/events', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    let url = '';
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      url = page.url();
      if (!/\/workspace\/events\/?$/.test(url)) break;
      await page.waitForTimeout(200);
    }
    expect(url, 'page should redirect off /workspace/events within 10s').not.toMatch(
      /\/workspace\/events\/?$/,
    );
    expect(url).toMatch(/auth\.aiqadam\.org|\/api\/v1\/auth\/login/);
  });

  test('API: GET /v1/workspace/events requires auth (401)', async ({ request }) => {
    const res = await request.get('/api/v1/workspace/events');
    expect(res.status()).toBe(401);
  });

  test('API: PATCH /v1/workspace/events/:id requires auth (401)', async ({ request }) => {
    const res = await request.patch(
      '/api/v1/workspace/events/11111111-1111-4000-8000-000000000001',
      { data: { title: 'hijacked' } },
    );
    expect(res.status()).toBe(401);
  });

  test('API: PUT /v1/workspace/events/:id/followups/:kind requires auth (401)', async ({
    request,
  }) => {
    const res = await request.put(
      '/api/v1/workspace/events/11111111-1111-4000-8000-000000000001/followups/retrospective',
      { data: { body_md: 'notes' } },
    );
    expect(res.status()).toBe(401);
  });
});
