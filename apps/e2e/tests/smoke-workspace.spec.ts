import { expect, test } from '@playwright/test';

// Sprint 2.1 — workspace shell smoke. Placeholder RBAC: only "is logged
// in" is gated (per ADR-0021 still being Proposed). Anon viewers see a
// sign-in CTA, not a 401. Authed flow validated locally; smoke covers
// the anon path which is what production-probe sees.
//
// Per ADR-0032 the workspace is the single landing for operators —
// any change here is worth catching in smoke before deploy.

test.describe('S2.1 — workspace shell', () => {
  test('/workspace renders shell with sign-in CTA for anon viewer', async ({ page }) => {
    const response = await page.goto('/workspace');
    expect(response?.status()).toBe(200);

    // Sidebar visible
    await expect(page.locator('aside').getByText('Workspace', { exact: true })).toBeVisible();

    // Anon CTA visible
    await expect(page.getByRole('heading', { name: 'Workspace', exact: true })).toBeVisible();
    const signIn = page.getByRole('link', { name: 'Sign in' });
    await expect(signIn).toBeVisible();

    // Sign-in href points at the API login route with the workspace as next
    const href = await signIn.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href).toContain('/api/v1/auth/login');
    expect(href).toContain('next=');
  });

  test('robots.txt disallows /workspace/', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('Disallow: /workspace/');
  });
});
