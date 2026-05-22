import { expect, test } from '@playwright/test';

// F-S4.5 — country profile cabinet smoke.
//
// GET /v1/workspace/countries  — requires AuthGuard (401 without)
// PATCH /v1/admin/countries/uz — requires AuthGuard + SuperAdminGuard
//                                 (401 without, AuthGuard runs first)

test.describe('F-S4.5 — country profile endpoints', () => {
  test('GET /v1/workspace/countries requires auth (401)', async ({ request }) => {
    const res = await request.get('/api/v1/workspace/countries');
    expect(res.status()).toBe(401);
  });

  test('GET /v1/workspace/countries/:code requires auth (401)', async ({ request }) => {
    const res = await request.get('/api/v1/workspace/countries/uz');
    expect(res.status()).toBe(401);
  });

  test('PATCH /v1/admin/countries/:code requires auth (401)', async ({ request }) => {
    const res = await request.patch('/api/v1/admin/countries/uz', {
      data: { default_locale: 'ru' },
    });
    expect(res.status()).toBe(401);
  });
});
