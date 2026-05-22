import { expect, test } from '@playwright/test';

// F-S2.2-g smoke. Same shape as the other admin-cabinet smokes
// (workspace-admin-invites, workspace-approvals).

test.describe('F-S2.2-g — /workspace/admin/rbac-sync', () => {
  test('anon viewer redirects toward Authentik', async ({ page }) => {
    const response = await page.goto('/workspace/admin/rbac-sync', {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(200);

    let url = '';
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      url = page.url();
      if (!/\/workspace\/admin\/rbac-sync\/?$/.test(url)) break;
      await page.waitForTimeout(200);
    }
    expect(url).not.toMatch(/\/workspace\/admin\/rbac-sync\/?$/);
    expect(url).toMatch(/auth\.aiqadam\.org|\/api\/v1\/auth\/login/);
  });

  test('API: GET /v1/admin/rbac-sync/jobs requires auth (401)', async ({ request }) => {
    const res = await request.get('/api/v1/admin/rbac-sync/jobs');
    expect(res.status()).toBe(401);
  });

  test('API: POST /v1/admin/rbac-sync/jobs/:id/retry requires auth (401)', async ({ request }) => {
    const res = await request.post('/api/v1/admin/rbac-sync/jobs/fake-uuid/retry');
    expect(res.status()).toBe(401);
  });
});
