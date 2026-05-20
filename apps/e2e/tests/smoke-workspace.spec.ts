import { expect, test } from '@playwright/test';

// Sprint 2.1 — workspace shell smoke. Per ADR-0032 the workspace IS
// the operator surface, so any anon visit is an intent to sign in:
// the page auto-redirects to /api/v1/auth/login (no "Sign in" button
// click). Smoke asserts that redirect happens.

test.describe('S2.1 — workspace shell', () => {
  test('/workspace anon viewer auto-redirects toward Authentik login', async ({ page }) => {
    // Initial response is the static shell (200); the JS island then
    // calls /auth/refresh, sees no session, and replaces the URL with
    // /api/v1/auth/login → 302 → Authentik authorize URL.
    const response = await page.goto('/workspace');
    expect(response?.status()).toBe(200);

    // Wait for the redirect chain to settle off /workspace. The
    // destination is /api/v1/auth/login → 302 → Authentik authorize
    // URL with a state nonce; matching either suffices to prove the
    // auto-redirect fired. Don't assert deeper into Authentik's UI
    // (it's their surface, not ours; assertions there churn).
    await page.waitForURL(/auth\.aiqadam\.org|\/api\/v1\/auth\/login/, { timeout: 10_000 });
    expect(page.url()).not.toMatch(/\/workspace\/?$/);
  });

  test('robots.txt disallows /workspace/', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('Disallow: /workspace/');
  });
});
