import { expect, test } from '@playwright/test';

// F-S1.1b + F-S1.1c — speaker pipeline + post-event cron smoke.
// AuthGuard on the operator endpoints; InternalAuthGuard on the cron.

test.describe('F-S1.1b — operator event_speakers CRUD', () => {
  const eventId = '11111111-1111-4000-8000-000000000001';

  test('GET /v1/workspace/events/:id/speakers requires auth (401)', async ({ request }) => {
    const res = await request.get(`/api/v1/workspace/events/${eventId}/speakers`);
    expect(res.status()).toBe(401);
  });

  test('POST /v1/workspace/events/:id/speakers requires auth (401)', async ({ request }) => {
    const res = await request.post(`/api/v1/workspace/events/${eventId}/speakers`, {
      data: { speakerId: '22222222-2222-4000-8000-000000000002' },
    });
    expect(res.status()).toBe(401);
  });

  test('PATCH /v1/workspace/events/:id/speakers/:esId requires auth (401)', async ({ request }) => {
    const res = await request.patch(
      `/api/v1/workspace/events/${eventId}/speakers/33333333-3333-4000-8000-000000000003`,
      { data: { status: 'confirmed' } },
    );
    expect(res.status()).toBe(401);
  });

  test('DELETE /v1/workspace/events/:id/speakers/:esId requires auth (401)', async ({
    request,
  }) => {
    const res = await request.delete(
      `/api/v1/workspace/events/${eventId}/speakers/33333333-3333-4000-8000-000000000003`,
    );
    expect(res.status()).toBe(401);
  });
});

test.describe('F-S1.1c — /v1/internal/post-event/tick', () => {
  test('POST without internal auth → 401', async ({ request }) => {
    const res = await request.post('/api/v1/internal/post-event/tick');
    expect(res.status()).toBe(401);
  });

  test('POST with wrong internal auth → 401', async ({ request }) => {
    const res = await request.post('/api/v1/internal/post-event/tick', {
      headers: { 'x-internal-auth': 'not-the-real-token' },
    });
    expect(res.status()).toBe(401);
  });
});
