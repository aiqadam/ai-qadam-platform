import { expect, test } from '@playwright/test';

// F-S1.1b ext — operator-driven OG cache-bust endpoint.

test.describe('F-S1.1b ext — POST /v1/workspace/events/:id/regenerate-social-card', () => {
  test('requires auth (401)', async ({ request }) => {
    const res = await request.post(
      '/api/v1/workspace/events/00000000-0000-4000-8000-000000000000/regenerate-social-card',
    );
    expect(res.status()).toBe(401);
  });
});
