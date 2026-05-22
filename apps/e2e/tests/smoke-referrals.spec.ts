import { expect, test } from '@playwright/test';

// F-S3.9 — referral codes + attribution smoke.
//
// Submission paths (issue, mine, resolve→register-attribution) are
// covered by referrals-service unit tests + registrations-service tests.
// E2E asserts the surface-level contract: page renders, public endpoints
// behave as documented, gated endpoints 401 without auth.

test.describe('F-S3.9 — /me/referrals + referrals API', () => {
  test('anon viewer of /me/referrals auto-redirects toward Authentik login', async ({ page }) => {
    const response = await page.goto('/me/referrals', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    let url = '';
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      url = page.url();
      if (!/\/me\/referrals\/?$/.test(url)) break;
      await page.waitForTimeout(200);
    }
    expect(url, 'page should redirect off /me/referrals within 10s').not.toMatch(
      /\/me\/referrals\/?$/,
    );
    expect(url).toMatch(/auth\.aiqadam\.org|\/api\/v1\/auth\/login/);
  });

  test('API: POST /v1/referrals/issue requires auth (401)', async ({ request }) => {
    const res = await request.post('/api/v1/referrals/issue');
    expect(res.status()).toBe(401);
  });

  test('API: GET /v1/referrals/mine requires auth (401)', async ({ request }) => {
    const res = await request.get('/api/v1/referrals/mine');
    expect(res.status()).toBe(401);
  });

  test('API: POST /v1/referrals/resolve is public + returns ownerUserId:null for bogus code', async ({
    request,
  }) => {
    const res = await request.post('/api/v1/referrals/resolve', {
      data: { code: 'bogus1234' },
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { ownerUserId: string | null };
    expect(body.ownerUserId).toBeNull();
  });

  test('API: POST /v1/referrals/resolve 400 on empty body', async ({ request }) => {
    const res = await request.post('/api/v1/referrals/resolve', { data: {} });
    expect(res.status()).toBe(400);
  });
});
