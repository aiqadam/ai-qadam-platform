import { expect, test } from '@playwright/test';

// F-S1.2 + F-S1.3 — CSAT capture + operator surface smoke.
//
// Submission paths covered by csat-service unit tests. E2E asserts:
//   - the public /feedback/csat?t= page renders + shows the missing-token
//     copy when t is absent
//   - public POST handles invalid/empty token without server error
//   - operator GET is AuthGuard-gated

test.describe('F-S1.2 — public /feedback/csat', () => {
  test('renders missing-token state when ?t= is absent', async ({ page }) => {
    const response = await page.goto('/feedback/csat');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: /missing token/i })).toBeVisible();
  });

  test('API: POST without body → 400', async ({ request }) => {
    const res = await request.post('/api/v1/feedback/csat');
    expect([400, 401]).toContain(res.status());
  });

  test('API: POST with bogus token → 401 invalid_token', async ({ request }) => {
    const res = await request.post('/api/v1/feedback/csat', {
      data: { token: 'definitely-not-a-jwt', rating: 5 },
    });
    expect(res.status()).toBe(401);
  });

  test('API: POST with out-of-range rating → 400', async ({ request }) => {
    const res = await request.post('/api/v1/feedback/csat', {
      data: { token: 'a'.repeat(40), rating: 11 },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('F-S1.3 — operator GET /v1/workspace/events/:id/csat', () => {
  test('requires auth (401)', async ({ request }) => {
    const res = await request.get(
      '/api/v1/workspace/events/11111111-1111-4000-8000-000000000001/csat',
    );
    expect(res.status()).toBe(401);
  });
});
