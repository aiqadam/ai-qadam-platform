import { expect, test } from '@playwright/test';

// R3 PR-3a (ADR-0034) — Telegram integration cabinet smoke. Same
// pattern as smoke-workspace-admin-invites: anon viewer redirects
// toward Authentik; the API endpoints surface the right status codes
// for the right auth posture.

test.describe('R3 PR-3a — /workspace/integrations/telegram', () => {
  test('anon viewer redirects toward Authentik', async ({ page }) => {
    const response = await page.goto('/workspace/integrations/telegram', {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(200);

    let url = '';
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      url = page.url();
      if (!/\/workspace\/integrations\/telegram\/?$/.test(url)) break;
      await page.waitForTimeout(200);
    }
    expect(url, 'page should redirect off /workspace/integrations/telegram within 10s').not.toMatch(
      /\/workspace\/integrations\/telegram\/?$/,
    );
    expect(url).toMatch(/auth\.aiqadam\.org|\/api\/v1\/auth\/login/);
  });

  test('page shell renders with cabinet heading + auto-refresh copy', async ({ page }) => {
    // Block the redirect script by stopping after DOM is ready — we
    // just want to verify the static shell shipped to the client.
    await page.route('**/api/v1/auth/refresh', (route) => route.abort());
    await page.goto('/workspace/integrations/telegram', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Telegram integration' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/Auto-refreshes every 5 seconds/i)).toBeVisible();
  });
});

test.describe('R3 PR-3a — /v1/telegram/admin/status auth posture', () => {
  test('API: GET /v1/telegram/admin/status requires auth (401)', async ({ request }) => {
    const res = await request.get('/api/v1/telegram/admin/status');
    expect(res.status()).toBe(401);
  });

  test('API: GET /v1/telegram/admin/status with bogus bearer returns 401', async ({ request }) => {
    const res = await request.get('/api/v1/telegram/admin/status', {
      headers: { Authorization: 'Bearer not-a-real-token' },
    });
    expect(res.status()).toBe(401);
  });
});
