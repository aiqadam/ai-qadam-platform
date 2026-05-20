import { expect, test } from '@playwright/test';

// Sprint 2.1 — workspace shell smoke. Per ADR-0032 the workspace IS
// the operator surface, so any anon visit is an intent to sign in:
// the page auto-redirects to /api/v1/auth/login (no "Sign in" button
// click). Smoke asserts that redirect happens.

test.describe('S2.1 — workspace shell', () => {
  test('/workspace anon viewer auto-redirects toward Authentik login', async ({ page }) => {
    // Initial response is the static shell (200); the JS island then
    // calls /auth/refresh, sees no session, and replaces the URL with
    // /api/v1/auth/login → 302 → Authentik authorize URL → 302 →
    // Authentik's authentication-flow UI.
    const response = await page.goto('/workspace', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    // Poll page.url() until we're off /workspace. waitForURL with a
    // regex can race the multi-hop chain; sample the URL ourselves at
    // 200ms intervals up to 10s. Final URL ends up on auth.aiqadam.org
    // (Authentik's flow UI) — any URL outside /workspace proves the
    // auto-redirect fired.
    let url = '';
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      url = page.url();
      if (!/\/workspace\/?$/.test(url)) break;
      await page.waitForTimeout(200);
    }
    expect(url, 'page should redirect off /workspace within 10s').not.toMatch(/\/workspace\/?$/);
    expect(url).toMatch(/auth\.aiqadam\.org|\/api\/v1\/auth\/login/);
  });

  test('robots.txt disallows /workspace/', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('Disallow: /workspace/');
  });
});
