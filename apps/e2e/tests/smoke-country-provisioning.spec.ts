import { expect, test } from '@playwright/test';

// F-S4.1 — country provisioning endpoints. SuperAdminGuard gates both.
// AuthGuard runs first → 401 without a token.

test.describe('F-S4.1 — /v1/admin/countries/:code/provisioning', () => {
  test('POST .../provisioning/run requires auth (401)', async ({ request }) => {
    const res = await request.post('/api/v1/admin/countries/uz/provisioning/run');
    expect(res.status()).toBe(401);
  });

  test('GET .../provisioning requires auth (401)', async ({ request }) => {
    const res = await request.get('/api/v1/admin/countries/uz/provisioning');
    expect(res.status()).toBe(401);
  });
});
