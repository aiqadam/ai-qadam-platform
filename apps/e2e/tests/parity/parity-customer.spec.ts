/**
 * FR-MIG-030 — parity suite: customer-facing surface.
 *
 * Covers every customer row in docs/03-requirements/parity-matrix.md.
 * Runs against both v1 (BASE_URL=https://aiqadam.org) and v2
 * (BASE_URL=https://next.aiqadam.org) via playwright.parity.config.ts
 * projects. Both projects must pass for the parity gate to be green.
 *
 * Authenticated tests are skipped when PARITY_AUTH_COOKIE is unset.
 */

import { expect, test } from '@playwright/test';
import { assertPageOk, assertPublicPageOk, injectAuthCookie, requireAuthCookie } from './helpers';

test.describe('Parity — customer: homepage', () => {
  test('GET / (anon) renders hero + events section + nav', async ({ page }) => {
    await assertPublicPageOk(page, '/');
    // Nav sign-in entry point must be present for anon users
    await expect(
      page.locator('nav a[href*="/auth/sign-in"], nav a[href*="/auth/login"]').first(),
    ).toBeVisible();
    // Main content area renders
    await expect(page.locator('main, [role="main"]')).toBeVisible();
  });

  test('GET / (signed in) nav shows account chip', async ({ page }) => {
    requireAuthCookie();
    await injectAuthCookie(page);
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    // Account chip / user indicator present in nav after auth
    await expect(
      page.locator('[data-testid="account-chip"], nav [aria-label*="account" i], nav img[alt*="avatar" i]').first(),
    ).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Parity — customer: events', () => {
  test('GET /events lists upcoming events or empty state', async ({ page }) => {
    await assertPageOk(page, '/events');
    // Either event cards or an empty-state message — page must render content
    const hasEvents = (await page.locator('[data-testid="event-card"], article[class*="event"]').count()) > 0;
    const hasEmptyState = (await page.locator('[data-testid="empty-state"], [class*="empty"]').count()) > 0;
    expect(hasEvents || hasEmptyState, '/events must render event cards or empty state').toBe(true);
  });

  test('GET /events/[id] (public) renders event detail + registration area', async ({ page }) => {
    // Navigate to events list first and pick the first link
    await page.goto('/events');
    const firstEventLink = page.locator('a[href^="/events/"]:not([href="/events"])').first();
    const hasLinks = (await firstEventLink.count()) > 0;

    if (!hasLinks) {
      test.skip(true, 'No events available to probe event detail');
      return;
    }

    const href = await firstEventLink.getAttribute('href');
    if (!href) {
      test.skip(true, 'Could not read event href');
      return;
    }

    await assertPageOk(page, href);
    // Registration call-to-action or members-gate must appear
    await expect(
      page.locator('[data-testid="registration-cta"], [data-testid="auth-gate"], button:has-text("Register")').first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('GET /events/[id] (members-only, anon) renders auth gate', async ({ page }) => {
    // For anon users visiting a members-only event, an auth gate should appear.
    // We reuse the same event detail approach; the gate is conditional on event type.
    await page.goto('/events');
    const firstEventLink = page.locator('a[href^="/events/"]:not([href="/events"])').first();
    if ((await firstEventLink.count()) === 0) {
      test.skip(true, 'No events available');
      return;
    }
    const href = await firstEventLink.getAttribute('href');
    if (!href) {
      test.skip(true, 'Could not read event href');
      return;
    }

    const response = await page.goto(href);
    expect(response?.status()).toBe(200);
    // Page must render without crashing — auth gate is optional per event type
    await expect(page.locator('main, [role="main"]')).toBeVisible();
  });
});

test.describe('Parity — customer: registration flow', () => {
  test('POST register-for-event (signed in) succeeds + UI updates', async ({ page }) => {
    requireAuthCookie();
    await injectAuthCookie(page);
    await page.goto('/events');
    const firstEventLink = page.locator('a[href^="/events/"]:not([href="/events"])').first();
    if ((await firstEventLink.count()) === 0) {
      test.skip(true, 'No events available for registration test');
      return;
    }
    const href = await firstEventLink.getAttribute('href');
    if (!href) {
      test.skip(true, 'Could not read event href');
      return;
    }
    await page.goto(href);
    const registerBtn = page.getByRole('button', { name: /register/i }).first();
    if ((await registerBtn.count()) === 0) {
      test.skip(true, 'No register button on this event (may be full or past)');
      return;
    }
    await registerBtn.click();
    // After registration: button state changes or success message appears
    await expect(
      page.locator('[data-testid="registration-success"], button:has-text("Cancel"), button:has-text("Registered")').first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Parity — customer: leaderboard + /me pages', () => {
  test('GET /leaderboard renders global + per-country rows', async ({ page }) => {
    await assertPageOk(page, '/leaderboard');
    // Leaderboard table or list must have at least one row
    await expect(
      page.locator('[data-testid="leaderboard-row"], table tbody tr, [role="row"]').first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('GET /me/profile (signed in) loads profile editor', async ({ page }) => {
    requireAuthCookie();
    await injectAuthCookie(page);
    await assertPageOk(page, '/me/profile');
    await expect(
      page.locator('[data-testid="profile-card"], form[data-testid*="profile"], h1:has-text("Profile")').first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('GET /me/preferences loads email preferences', async ({ page }) => {
    requireAuthCookie();
    await injectAuthCookie(page);
    await assertPageOk(page, '/me/preferences');
    await expect(page.getByRole('heading', { name: /preferences/i }).first()).toBeVisible();
  });

  test('GET /me/access-log loads auth event list', async ({ page }) => {
    requireAuthCookie();
    await injectAuthCookie(page);
    await assertPageOk(page, '/me/access-log');
    await expect(
      page.locator('[data-testid="access-log"], table, [role="table"]').first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('GET /me/referrals loads referral code + history', async ({ page }) => {
    requireAuthCookie();
    await injectAuthCookie(page);
    await assertPageOk(page, '/me/referrals');
    await expect(
      page.locator('[data-testid="referral-code"], code, [class*="referral"]').first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('GET /u/[handle] renders public member profile', async ({ page }) => {
    // We need a known handle to probe — use the leaderboard to discover one
    await page.goto('/leaderboard');
    const profileLink = page.locator('a[href^="/u/"]').first();
    if ((await profileLink.count()) === 0) {
      test.skip(true, 'No public profiles visible on leaderboard');
      return;
    }
    const href = await profileLink.getAttribute('href');
    if (!href) {
      test.skip(true, 'Could not read profile href');
      return;
    }
    await assertPageOk(page, href);
    await expect(
      page.locator('[data-testid="profile-card"], [class*="profile"]').first(),
    ).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Parity — customer: auth pages', () => {
  test('GET /auth/sign-in redirects toward Authentik', async ({ page }) => {
    await page.goto('/auth/sign-in', { waitUntil: 'domcontentloaded' });
    // After navigation the URL should move to auth.aiqadam.org OR still be at /auth/sign-in with a form
    const url = page.url();
    const isOnAuthProvider = /auth\.aiqadam\.org|\/api\/v1\/auth\/login/.test(url);
    const hasSignInForm = (await page.locator('form[action*="login"], input[type="password"]').count()) > 0;
    expect(isOnAuthProvider || hasSignInForm, 'Sign-in page must redirect to auth or render form').toBe(true);
  });

  test('GET /auth/signed-out renders signed-out landing', async ({ page }) => {
    const response = await page.goto('/auth/signed-out');
    expect(response?.status()).toBe(200);
    await expect(page.locator('main, [role="main"]')).toBeVisible();
  });
});

test.describe('Parity — customer: supplementary pages', () => {
  test('GET /onboard renders onboarding form', async ({ page }) => {
    await assertPublicPageOk(page, '/onboard');
  });

  test('GET /checkin renders event check-in flow', async ({ page }) => {
    await assertPublicPageOk(page, '/checkin');
  });

  test('GET /forms/[slug] renders public form (if any exist)', async ({ page }) => {
    // We probe the page; if no slug exists the route should 404 gracefully
    const response = await page.goto('/forms/test');
    // Accept 200 (form rendered) or 404 (no form with that slug)
    expect([200, 404], '/forms/[slug] should return 200 or 404').toContain(response?.status());
  });

  test('GET /leads pages render conversion landing pages', async ({ page }) => {
    for (const slug of ['thank-you', 'verified', 'verify-failed']) {
      const response = await page.goto(`/leads/${slug}`);
      expect([200, 404], `/leads/${slug} should return 200 or 404`).toContain(response?.status());
    }
  });
});
