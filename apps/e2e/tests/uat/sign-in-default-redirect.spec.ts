import { test, expect } from '@playwright/test';

// ISS-USR-REDIRECT-001 — regression test. GitHub issue #89.
//
// FR-USR-001 AC-1: "A new user who completes sign-up via Authentik and
// returns to the platform lands at /me." Root cause: no code path ever
// set next=/me. Both the homepage "Sign in" CTA and the bare
// /auth/sign-in page defaulted `next` to the current path (`/` for a
// first-time homepage visitor) or to the literal `/`, so a first-time
// sign-in landed back on the homepage instead of /me.
//
// This test intercepts /api/v1/auth/login (no live Authentik round-trip
// needed — the bug is entirely in what `next` value the app constructs
// before ever reaching Authentik) and asserts the query string.

test('homepage "Sign in" CTA sends next=/me, not next=/', async ({ page }) => {
  await page.goto('/');
  const signInLink = page.locator('a[href*="/api/v1/auth/login"], a[href*="/auth/sign-in"]').first();
  const href = await signInLink.getAttribute('href');
  expect(href).not.toBeNull();
  const url = new URL(href as string, 'http://localhost');
  const next = url.searchParams.get('next');
  expect(next).toBe('/me');
});

test('bare /auth/sign-in with no ?next= redirects to /api/v1/auth/login?next=/me', async ({ request, baseURL }) => {
  // Server-side SSR 302 (Astro.redirect) — a plain HTTP request follows
  // the redirect chain without needing a browser page; this reads the
  // Location header directly rather than relying on page.route(), which
  // does not reliably observe a same-navigation server redirect chain.
  const res = await request.get(`${baseURL}/auth/sign-in`, { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  const location = res.headers().location;
  expect(location).not.toBeUndefined();
  const url = new URL(location as string, baseURL);
  expect(url.searchParams.get('next')).toBe('/me');
});

test('gated-page "Sign in" CTA still returns to the original page (no regression)', async ({ page }) => {
  await page.goto('/events');
  const signInLink = page.locator('a[href*="/api/v1/auth/login"], a[href*="/auth/sign-in"]').first();
  const href = await signInLink.getAttribute('href');
  expect(href).not.toBeNull();
  const url = new URL(href as string, 'http://localhost');
  const next = url.searchParams.get('next');
  // Must still carry real context — not clobbered to /me for a page that
  // isn't the homepage.
  expect(next).toContain('/events');
});
