import { expect, test } from '@playwright/test';

// Sprint 0.10 smoke catalog — public surfaces. Read-only assertions.
// See docs/community-platform-roadmap.md §7.5 for the catalog.
//
// Catalog convention: every [CC] sprint item adds its scenarios HERE
// (public surfaces) or in a sibling spec file (authenticated / cabinet /
// workspace). When CI fails, the failing scenario's name + screenshot
// pinpoints the regression.

test.describe('S0.10 — public smoke', () => {
  test('homepage loads + has nav + has Plausible script', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);

    // Nav present
    await expect(page.locator('nav a[href="/events"]')).toBeVisible();
    await expect(page.locator('nav a[href="/leaderboard"]')).toBeVisible();

    // Plausible tracker present (cookieless self-hosted)
    const plausibleScript = page.locator('script[src*="analytics.aiqadam.org/js/script.js"]');
    await expect(plausibleScript).toHaveAttribute('data-domain', 'aiqadam.org');

    // OG + Twitter meta present (M5.1)
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
      'content',
      'AI Qadam',
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image',
    );

    // Canonical present
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  });

  test('/events loads + lists events or shows empty state', async ({ page }) => {
    const response = await page.goto('/events');
    expect(response?.status()).toBe(200);

    // Either there's an events list OR a "no events" empty state — but the page renders
    await expect(page.locator('main, [role="main"]')).toBeVisible();
  });

  test('/leaderboard loads', async ({ page }) => {
    const response = await page.goto('/leaderboard');
    expect(response?.status()).toBe(200);
  });

  test('sitemap.xml is valid XML and references the homepage', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('xml');

    const body = await response.text();
    expect(body).toContain('<?xml version="1.0"');
    expect(body).toContain('<urlset');
    expect(body).toMatch(/<loc>https?:\/\/[^<]*\/<\/loc>/);
  });

  test('robots.txt has Sitemap reference + disallows /me + /admin', async ({ request }) => {
    const response = await request.get('/robots.txt');
    expect(response.status()).toBe(200);

    const body = await response.text();
    expect(body).toContain('User-agent: *');
    expect(body).toMatch(/Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/);
    expect(body).toContain('Disallow: /me');
    expect(body).toContain('Disallow: /admin/');
    expect(body).toContain('Disallow: /api/');
  });

  test('API health endpoint returns 200 with tenant context', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json.status).toBe('ok');
    expect(json.service).toBe('api');
    expect(json.tenant).toBeTruthy();
    expect(json.tenant.code).toMatch(/^(uz|kz|tj|demo)$/);
  });

  test('favicon present', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('link[rel="icon"]')).toHaveCount(1);
  });
});
