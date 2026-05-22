import { expect, test } from '@playwright/test';

// F-S3.6b — /me/profile interests + employments smoke.
// F-S3.6 v1 (#171) didn't add e2e; this covers both sections together.

test.describe('F-S3.6b — /me/profile interests + employments', () => {
  test('anon viewer redirects toward Authentik login', async ({ page }) => {
    const response = await page.goto('/me/profile', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    // The Anon view renders inline rather than redirecting; assert the
    // call-to-action that gates the cabinet behind sign-in.
    await expect(
      page.getByRole('heading', { name: /sign in to manage your profile/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('API: GET /v1/me/profile requires auth (401)', async ({ request }) => {
    const res = await request.get('/api/v1/me/profile');
    expect(res.status()).toBe(401);
  });

  test('API: POST /v1/me/profile/interests requires auth (401)', async ({ request }) => {
    const res = await request.post('/api/v1/me/profile/interests', {
      data: { topic_tag: 'computer-vision', intent: 'learn' },
    });
    expect(res.status()).toBe(401);
  });

  test('API: POST /v1/me/profile/employments requires auth (401)', async ({ request }) => {
    const res = await request.post('/api/v1/me/profile/employments', {
      data: { employer_name: 'Acme Inc' },
    });
    expect(res.status()).toBe(401);
  });

  test('API: DELETE /v1/me/profile/interests/:id requires auth (401)', async ({ request }) => {
    const res = await request.delete(
      '/api/v1/me/profile/interests/11111111-1111-4000-8000-000000000001',
    );
    expect(res.status()).toBe(401);
  });

  test('API: DELETE /v1/me/profile/employments/:id requires auth (401)', async ({ request }) => {
    const res = await request.delete(
      '/api/v1/me/profile/employments/11111111-1111-4000-8000-000000000001',
    );
    expect(res.status()).toBe(401);
  });
});
