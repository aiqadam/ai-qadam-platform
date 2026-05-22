import { expect, test } from '@playwright/test';

// F-S2.7 (ADR-0035) — operator invite cabinet smoke. Matches the
// pattern from smoke-workspace-approvals.spec.ts: anon visitor on the
// admin cabinet auto-redirects to Authentik; the API endpoints surface
// the right status codes for the right auth posture.

test.describe('F-S2.7 — /workspace/admin/users', () => {
  test('anon viewer of /workspace/admin/users/new redirects toward Authentik', async ({ page }) => {
    const response = await page.goto('/workspace/admin/users/new', {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(200);

    let url = '';
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      url = page.url();
      if (!/\/workspace\/admin\/users\/new\/?$/.test(url)) break;
      await page.waitForTimeout(200);
    }
    expect(url, 'page should redirect off /workspace/admin/users/new within 10s').not.toMatch(
      /\/workspace\/admin\/users\/new\/?$/,
    );
    expect(url).toMatch(/auth\.aiqadam\.org|\/api\/v1\/auth\/login/);
  });

  test('API: GET /v1/admin/invites requires auth (401)', async ({ request }) => {
    const res = await request.get('/api/v1/admin/invites');
    expect(res.status()).toBe(401);
  });

  test('API: POST /v1/admin/invites requires auth (401)', async ({ request }) => {
    const res = await request.post('/api/v1/admin/invites', {
      data: {
        email: 'someone@aiqadam.org',
        role_groups: ['aiqadam-staff'],
        delivery_channel: 'copy_paste',
      },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe('F-S2.7 — /onboard public flow', () => {
  test('GET /onboard renders the form shell', async ({ page }) => {
    const response = await page.goto('/onboard?token=fake-but-long-enough-to-pass-pre-check', {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(200);
    // The form bootstrap fires /v1/onboard/preview which returns 410 for
    // an invalid token — the UI surfaces "This link can't be used."
    await expect(page.getByText(/cant be used|can't be used/i)).toBeVisible({ timeout: 10_000 });
  });

  test('API: GET /v1/onboard/preview with no token returns 400', async ({ request }) => {
    const res = await request.get('/api/v1/onboard/preview');
    expect(res.status()).toBe(400);
  });

  test('API: GET /v1/onboard/preview with bad token returns 410', async ({ request }) => {
    const res = await request.get(
      '/api/v1/onboard/preview?token=this-is-not-a-real-token-just-long',
    );
    expect(res.status()).toBe(410);
  });

  test('API: POST /v1/onboard/accept with bad token returns 410', async ({ request }) => {
    const res = await request.post('/api/v1/onboard/accept', {
      data: {
        token: 'this-is-not-a-real-token-just-long-enough',
        password: 'a-strong-passw0rd!',
        aup_accepted: true,
      },
    });
    expect(res.status()).toBe(410);
  });
});
