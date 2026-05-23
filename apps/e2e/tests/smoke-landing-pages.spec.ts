import { expect, test } from '@playwright/test';

// F-S5.9 — /welcome/[slug] campaign landing pages.
//
// We don't seed a known published slug on staging (operator-managed),
// so v1 smoke covers the 404 path (unknown slug) + the slug shape guard
// (path-traversal / weird input → 404 not 500).

test.describe('F-S5.9 — /welcome/[slug]', () => {
  test('unknown slug returns 404', async ({ request }) => {
    const res = await request.get('/welcome/this-slug-does-not-exist-2026', {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(404);
  });

  test('slug shape guard rejects weird input with 404', async ({ request }) => {
    // Uppercase + traversal-shaped — fetch helper rejects pre-DB lookup
    const res = await request.get('/welcome/UPPERCASE-INVALID', { maxRedirects: 0 });
    expect(res.status()).toBe(404);
  });
});
