import { expect, test } from '@playwright/test';

// F-S1.5 — match-tick endpoint smoke.
// InternalAuthGuard pattern matches F-S1.4 reminders.

test.describe('F-S1.5 — /v1/internal/event-matches/tick', () => {
  test('POST without internal auth → 401', async ({ request }) => {
    const res = await request.post('/api/v1/internal/event-matches/tick');
    expect(res.status()).toBe(401);
  });

  test('POST with wrong internal auth → 401', async ({ request }) => {
    const res = await request.post('/api/v1/internal/event-matches/tick', {
      headers: { 'x-internal-auth': 'not-the-real-token' },
    });
    expect(res.status()).toBe(401);
  });
});
