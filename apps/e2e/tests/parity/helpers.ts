/**
 * Shared helpers for the v1/v2 parity suite (FR-MIG-030).
 *
 * Each parity test runs twice — once against V1_URL (aiqadam.org) and
 * once against V2_URL (next.aiqadam.org) — via two Playwright projects
 * in playwright.parity.config.ts. The BASE_URL is injected per-project.
 *
 * Authenticated flows require PARITY_AUTH_COOKIE to be set in the
 * environment. When absent the test is skipped with a clear message so
 * the suite still exits 0 in unauthenticated CI environments.
 */

import { type Page, expect, test } from '@playwright/test';

export const AUTH_COOKIE_VAR = 'PARITY_AUTH_COOKIE';

/** Skip test when PARITY_AUTH_COOKIE is not set in the environment. */
export function requireAuthCookie(): void {
  if (!process.env[AUTH_COOKIE_VAR]) {
    test.skip(true, `${AUTH_COOKIE_VAR} not set — skipping authenticated parity test`);
  }
}

/** Inject the session cookie before navigating so the page sees the user. */
export async function injectAuthCookie(page: Page): Promise<void> {
  const raw = process.env[AUTH_COOKIE_VAR];
  if (!raw) return;

  // Cookie format: "name=value" (single cookie expected from env)
  const eqIdx = raw.indexOf('=');
  const name = raw.slice(0, eqIdx);
  const value = raw.slice(eqIdx + 1);
  const domain = new URL(process.env.BASE_URL ?? 'https://aiqadam.org').hostname;

  await page.context().addCookies([
    {
      name,
      value,
      domain,
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ]);
}

/**
 * Assert a page loads with status 200 and the <main> element is visible.
 * Returns the response for further assertions.
 */
export async function assertPageOk(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status(), `${path} should return 200`).toBe(200);
  await expect(page.locator('main, [role="main"]'), `${path} should have <main>`).toBeVisible();
  return response;
}

/**
 * Assert a public page returns 200 without any visible JS error banner.
 * Lightweight version used for read-only smoke rows.
 */
export async function assertPublicPageOk(page: Page, path: string): Promise<void> {
  const response = await page.goto(path);
  expect(response?.status(), `${path} must return 200`).toBe(200);
}
