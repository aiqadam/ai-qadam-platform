import { expect, test } from '@playwright/test';

// F-S1.4b — T-7 speaker brief tick endpoint smoke.
// AuthGuard: InternalAuthGuard (header `x-internal-auth`).

test.describe('F-S1.4b — /v1/internal/event-speaker-briefs/tick', () => {
  test('POST without internal auth → 401', async ({ request }) => {
    const res = await request.post('/api/v1/internal/event-speaker-briefs/tick');
    expect(res.status()).toBe(401);
  });

  test('POST with wrong internal auth → 401', async ({ request }) => {
    const res = await request.post('/api/v1/internal/event-speaker-briefs/tick', {
      headers: { 'x-internal-auth': 'not-the-real-token' },
    });
    expect(res.status()).toBe(401);
  });
});
