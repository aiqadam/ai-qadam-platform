import { expect, test } from '@playwright/test';

// F-S1.6b — lead-nurture cron tick endpoint smoke.
// AuthGuard: InternalAuthGuard (header `x-internal-auth`).

test.describe('F-S1.6b — /v1/internal/lead-nurture/tick', () => {
  test('POST without internal auth → 401', async ({ request }) => {
    const res = await request.post('/api/v1/internal/lead-nurture/tick');
    expect(res.status()).toBe(401);
  });

  test('POST with wrong internal auth → 401', async ({ request }) => {
    const res = await request.post('/api/v1/internal/lead-nurture/tick', {
      headers: { 'x-internal-auth': 'not-the-real-token' },
    });
    expect(res.status()).toBe(401);
  });
});
