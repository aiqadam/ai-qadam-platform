import { expect, test } from '@playwright/test';

// F-S1.5b — T+3 post-registration match cron tick endpoint smoke.

test.describe('F-S1.5b — /v1/internal/event-matches-post-reg/tick', () => {
  test('POST without internal auth → 401', async ({ request }) => {
    const res = await request.post('/api/v1/internal/event-matches-post-reg/tick');
    expect(res.status()).toBe(401);
  });

  test('POST with wrong internal auth → 401', async ({ request }) => {
    const res = await request.post('/api/v1/internal/event-matches-post-reg/tick', {
      headers: { 'x-internal-auth': 'not-the-real-token' },
    });
    expect(res.status()).toBe(401);
  });
});
