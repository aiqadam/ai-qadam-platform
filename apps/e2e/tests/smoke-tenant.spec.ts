import { expect, test } from '@playwright/test';

// Sprint 0.10 smoke catalog — multi-tenant subdomain routing.
// Asserts that per-country subdomains resolve to that tenant's content.

const SUBDOMAINS = [
  { host: 'uz.aiqadam.org', expectedTenant: 'uz' },
  // Add kz / tj / kg as those countries activate (Sprint 4 country provisioning)
];

for (const { host, expectedTenant } of SUBDOMAINS) {
  test.describe(`S0.10 — tenant subdomain: ${host}`, () => {
    test(`${host} resolves + API returns tenant=${expectedTenant}`, async ({ request }) => {
      const response = await request.get(`https://${host}/api/health`);
      expect(response.status()).toBe(200);

      const json = await response.json();
      expect(json.tenant?.code).toBe(expectedTenant);
    });

    test(`${host} renders homepage`, async ({ page }) => {
      const response = await page.goto(`https://${host}/`);
      expect(response?.status()).toBe(200);
      await expect(page.locator('nav')).toBeVisible();
    });

    test(`${host} sitemap.xml references ${host} origin (not apex)`, async ({ request }) => {
      const response = await request.get(`https://${host}/sitemap.xml`);
      expect(response.status()).toBe(200);
      const body = await response.text();
      expect(body).toContain(`https://${host}/`);
    });
  });
}
