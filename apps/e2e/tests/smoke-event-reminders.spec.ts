import { expect, test } from '@playwright/test';

// F-S1.4 — pre-event reminders tick endpoint smoke.
// AuthGuard: InternalAuthGuard (header `x-internal-auth`). Unauthorized
// requests get 401.

test.describe('F-S1.4 — /v1/internal/event-reminders/tick', () => {
  test('POST without internal auth → 401', async ({ request }) => {
    const res = await request.post('/api/v1/internal/event-reminders/tick');
    expect(res.status()).toBe(401);
  });

  test('POST with wrong internal auth → 401', async ({ request }) => {
    const res = await request.post('/api/v1/internal/event-reminders/tick', {
      headers: { 'x-internal-auth': 'not-the-real-token' },
    });
    expect(res.status()).toBe(401);
  });
});
