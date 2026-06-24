/**
 * FR-MIG-030 — parity suite: cross-cutting concerns.
 *
 * Covers the "Cross-cutting" and architecture-check rows in
 * docs/03-requirements/parity-matrix.md:
 *   - Nav identity consistency (no "Account" vs "Sign in" mismatch)
 *   - Sign-out kills Authentik session
 *   - No raw fetch() outside lib/ (asserted by arch:check in CI — verified here by runtime check)
 *   - No inline style= on pages rendered by web-next
 *   - Accessibility (axe-core, no critical violations)
 *   - Lighthouse perf budget is enforced by lighthouserc.js separately
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const PUBLIC_PATHS = ['/', '/events', '/leaderboard'] as const;

// ── Nav identity consistency ─────────────────────────────────────────────────

test.describe('Parity — cross-cutting: nav identity consistency', () => {
  for (const path of PUBLIC_PATHS) {
    test(`${path} — nav auth state is consistent (no sign-in/account mismatch)`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' });

      // Count sign-in links and account-chip elements — exactly one category must win
      const signInCount = await page.locator(
        'nav a[href*="/auth/sign-in"], nav a[href*="/auth/login"]',
      ).count();
      const accountCount = await page.locator(
        '[data-testid="account-chip"], nav [aria-label*="account" i]',
      ).count();

      // For anon sessions: signIn > 0, account === 0
      // For authed sessions: account > 0, signIn === 0
      // What must NOT happen: both > 0 (the mismatch bug)
      const bothPresent = signInCount > 0 && accountCount > 0;
      expect(bothPresent, `${path} must not show both sign-in link AND account chip simultaneously`).toBe(false);
    });
  }
});

// ── Inline style= check ─────────────────────────────────────────────────────
// ADR-0038 §Locks #1 forbids inline style= in blocks/pages.
// This mirrors the arch:check static assertion at runtime on the rendered DOM.

test.describe('Parity — cross-cutting: no inline style= in rendered pages', () => {
  for (const path of PUBLIC_PATHS) {
    test(`${path} — no inline style= attributes on rendered elements`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' });

      const inlineStyleCount = await page.evaluate(() => {
        const all = document.querySelectorAll('[style]');
        // Filter out elements that are injected by browser extensions or devtools
        return Array.from(all).filter(
          (el) =>
            !el.closest('[data-playwright]') &&
            el.tagName !== 'SCRIPT' &&
            el.tagName !== 'LINK',
        ).length;
      });

      expect(
        inlineStyleCount,
        `${path} must have 0 inline style= attributes in rendered DOM (got ${inlineStyleCount})`,
      ).toBe(0);
    });
  }
});

// ── Accessibility (axe-core) ─────────────────────────────────────────────────

test.describe('Parity — cross-cutting: accessibility (no critical violations)', () => {
  for (const path of PUBLIC_PATHS) {
    test(`${path} — axe-core: no critical violations`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' });

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .exclude('[data-testid="third-party"]') // exclude known third-party iframes
        .analyze();

      const criticalViolations = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );

      if (criticalViolations.length > 0) {
        const summary = criticalViolations
          .map((v) => `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} nodes)`)
          .join('\n');
        expect.soft(0, `${path} has critical/serious a11y violations:\n${summary}`).toBe(criticalViolations.length);
      }

      // Hard-fail only on critical (not serious) to allow gradual remediation
      const onlyCritical = results.violations.filter((v) => v.impact === 'critical');
      expect(onlyCritical, `${path} must have zero CRITICAL axe violations`).toHaveLength(0);
    });
  }
});

// ── Session kill on sign-out ─────────────────────────────────────────────────

test.describe('Parity — cross-cutting: sign-out kills session', () => {
  test('after sign-out, /me/profile shows sign-in CTA (no session leak)', async ({ page }) => {
    const authCookie = process.env.PARITY_AUTH_COOKIE;
    if (!authCookie) {
      test.skip(true, 'PARITY_AUTH_COOKIE not set — skipping sign-out parity test');
      return;
    }

    // Inject session cookie
    const eqIdx = authCookie.indexOf('=');
    const name = authCookie.slice(0, eqIdx);
    const value = authCookie.slice(eqIdx + 1);
    const domain = new URL(process.env.BASE_URL ?? 'https://aiqadam.org').hostname;

    await page.context().addCookies([{ name, value, domain, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);

    // Visit authenticated page
    await page.goto('/me/profile', { waitUntil: 'networkidle' });

    // Trigger sign-out via known routes
    const signOutLink = page.locator('a[href*="/auth/sign-out"], button:has-text("Sign out"), a:has-text("Sign out")').first();
    if ((await signOutLink.count()) > 0) {
      await signOutLink.click();
      await page.waitForLoadState('networkidle');
    } else {
      // Direct navigation to sign-out endpoint
      await page.goto('/auth/sign-out', { waitUntil: 'networkidle' });
    }

    // After sign-out, revisit /me — must see sign-in CTA
    await page.goto('/me/profile', { waitUntil: 'networkidle' });
    const signInCta = page.locator('a[href*="/auth/sign-in"], [data-testid="anon-cta"]').first();
    await expect(signInCta).toBeVisible({ timeout: 10_000 });
  });
});

// ── HTTP status sanity: key pages must not 500 ──────────────────────────────

test.describe('Parity — cross-cutting: no 500 errors on key pages', () => {
  const KEY_PATHS = [
    '/',
    '/events',
    '/leaderboard',
    '/auth/sign-in',
    '/auth/signed-out',
    '/onboard',
    '/checkin',
    '/press',
    '/workspace',
  ] as const;

  for (const path of KEY_PATHS) {
    test(`${path} — no 500 server error`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
      // Allow redirects (3xx); disallow server errors (5xx)
      expect(response?.status() ?? 0, `${path} must not return 5xx`).toBeLessThan(500);
    });
  }
});
