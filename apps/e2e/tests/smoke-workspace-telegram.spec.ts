import { expect, test } from '@playwright/test';

// F-R3.0 smoke — /workspace/integrations/telegram cabinet (read-only
// shell). Matches the pattern from smoke-workspace-audit + invites:
// anon visitor auto-redirects to Authentik; the API endpoints surface
// the right status codes for the right auth posture.
//
// Full operator flow (paste token → green tick → bot restart) requires
// a real Authentik super-admin session + a working bot in the loop;
// that's a manual exercise in R5. The smoke here covers the boundary:
// the page loads, the API gate fires correctly, the cabinet is wired
// into the sidebar.

test.describe('F-R3.0 — /workspace/integrations/telegram', () => {
  test('anon viewer of /workspace/integrations/telegram redirects toward Authentik', async ({
    page,
  }) => {
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

  test('API: GET /v1/telegram/admin/status requires auth (401)', async ({ request }) => {
    const res = await request.get('/api/v1/telegram/admin/status');
    expect(res.status()).toBe(401);
  });

  test('API: GET /v1/telegram/admin/recent-deliveries requires auth (401)', async ({ request }) => {
    const res = await request.get('/api/v1/telegram/admin/recent-deliveries');
    expect(res.status()).toBe(401);
  });

  test('API: POST /v1/telegram/admin/configure requires auth (401)', async ({ request }) => {
    // F-R3.1 — token form posts here. Anon caller must be rejected
    // before we even look at the body.
    const res = await request.post('/api/v1/telegram/admin/configure', {
      data: { token: '123456789:AABBCCDDeeFFggHHiiJJkkLLmmNNooPPqqRRssTTuu' },
    });
    expect(res.status()).toBe(401);
  });

  test('API: POST /v1/telegram/admin/rotate-token requires auth (401)', async ({ request }) => {
    const res = await request.post('/api/v1/telegram/admin/rotate-token', {
      data: { token: '123456789:AABBCCDDeeFFggHHiiJJkkLLmmNNooPPqqRRssTTuu' },
    });
    expect(res.status()).toBe(401);
  });

  test('sidebar on /workspace exposes the Integrations → Telegram link', async ({ page }) => {
    // Anon visitor on /workspace auto-redirects too; we just verify the
    // sidebar HTML carries the link target so a future RBAC change can't
    // silently drop the cabinet from navigation. We grab the response
    // body before the redirect fires.
    const response = await page.goto('/workspace', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    const html = await response?.text();
    expect(html ?? '').toContain('/workspace/integrations/telegram');
  });
});
