/**
 * FR-MIG-030 — parity suite: operator surface.
 *
 * Covers every operator-cabinet row in docs/03-requirements/parity-matrix.md.
 * Operator cabinets redirect anon visitors to Authentik. Tests assert that:
 *   - Anon: redirect to auth (not a 500, not broken HTML)
 *   - Authed operator: cabinet renders its primary heading / DataTable
 *
 * Authenticated tests are skipped when PARITY_AUTH_COOKIE is unset.
 * PARITY_OPERATOR_COOKIE may be set separately if operator credentials differ
 * from member credentials — falls back to PARITY_AUTH_COOKIE if unset.
 */

import { type Page, expect, test } from '@playwright/test';

const OPERATOR_COOKIE_VAR = 'PARITY_OPERATOR_COOKIE';
const AUTH_COOKIE_VAR = 'PARITY_AUTH_COOKIE';

function getOperatorCookie(): string | undefined {
  return process.env[OPERATOR_COOKIE_VAR] ?? process.env[AUTH_COOKIE_VAR];
}

function requireOperatorCookie(): void {
  if (!getOperatorCookie()) {
    test.skip(true, `${OPERATOR_COOKIE_VAR} (or ${AUTH_COOKIE_VAR}) not set — skipping operator parity test`);
  }
}

async function injectOperatorCookie(page: Page): Promise<void> {
  const raw = getOperatorCookie();
  if (!raw) return;

  const eqIdx = raw.indexOf('=');
  const name = raw.slice(0, eqIdx);
  const value = raw.slice(eqIdx + 1);

  await page.context().addCookies([
    {
      name,
      value,
      domain: new URL(process.env.BASE_URL ?? 'https://aiqadam.org').hostname,
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ]);
}

/** Assert anon visitor is redirected toward auth rather than getting a 500. */
async function assertWorkspaceRedirectsAnon(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  // After JS executes, the URL should move away from the cabinet OR the page
  // should show a sign-in prompt — never a 500 or blank screen.
  let url = '';
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    url = page.url();
    if (!/^(https?:\/\/[^/]+)?\/workspace\//.test(url)) break;
    if ((await page.locator('[data-testid="auth-gate"], a[href*="/auth/sign-in"]').count()) > 0) break;
    await page.waitForTimeout(200);
  }
  // Acceptable outcomes: redirected to auth OR auth gate shown inline
  const redirectedToAuth = /auth\.aiqadam\.org|\/api\/v1\/auth\/login/.test(url);
  const gateShown = (await page.locator('[data-testid="auth-gate"], a[href*="/auth/sign-in"]').count()) > 0;
  expect(
    redirectedToAuth || gateShown,
    `${path} must redirect anon to auth (got url: ${url})`,
  ).toBe(true);
}

// ── Anon redirect checks ─────────────────────────────────────────────────────

test.describe('Parity — operator: anon redirects', () => {
  const WORKSPACE_PATHS = [
    '/workspace',
    '/workspace/events',
    '/workspace/members',
    '/workspace/announce',
    '/workspace/approvals',
    '/workspace/partners',
  ] as const;

  for (const path of WORKSPACE_PATHS) {
    test(`${path} redirects anon to auth`, async ({ page }) => {
      await assertWorkspaceRedirectsAnon(page, path);
    });
  }
});

// ── Authenticated operator cabinet checks ────────────────────────────────────

test.describe('Parity — operator: dashboard (authed)', () => {
  test('/workspace dashboard renders KPI tiles', async ({ page }) => {
    requireOperatorCookie();
    await injectOperatorCookie(page);
    const response = await page.goto('/workspace');
    expect(response?.status()).toBe(200);
    await expect(page.locator('main, [role="main"]')).toBeVisible();
    // At least one KPI tile — counts, numbers, or data cells
    await expect(
      page.locator('[data-testid*="kpi"], [class*="kpi"], [data-testid="stat-card"]').first(),
    ).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Parity — operator: events cabinet (authed)', () => {
  test('/workspace/events list renders DataTable', async ({ page }) => {
    requireOperatorCookie();
    await injectOperatorCookie(page);
    const response = await page.goto('/workspace/events');
    expect(response?.status()).toBe(200);
    await expect(page.locator('table, [role="grid"], [data-testid="data-table"]').first()).toBeVisible({ timeout: 8_000 });
  });

  test('/workspace/events/[id] control panel renders form', async ({ page }) => {
    requireOperatorCookie();
    await injectOperatorCookie(page);
    await page.goto('/workspace/events');
    const firstRow = page.locator('a[href^="/workspace/events/"]:not([href="/workspace/events"])').first();
    if ((await firstRow.count()) === 0) {
      test.skip(true, 'No events in operator events list');
      return;
    }
    const href = await firstRow.getAttribute('href');
    if (!href) {
      test.skip(true, 'Could not read event href');
      return;
    }
    const response = await page.goto(href);
    expect(response?.status()).toBe(200);
    await expect(page.locator('form, [data-testid="event-form"]').first()).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Parity — operator: members cabinet (authed)', () => {
  test('/workspace/members searchable directory renders', async ({ page }) => {
    requireOperatorCookie();
    await injectOperatorCookie(page);
    const response = await page.goto('/workspace/members');
    expect(response?.status()).toBe(200);
    await expect(page.locator('table, [role="grid"], [data-testid="data-table"]').first()).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Parity — operator: announce + approvals (authed)', () => {
  test('/workspace/announce renders composer', async ({ page }) => {
    requireOperatorCookie();
    await injectOperatorCookie(page);
    const response = await page.goto('/workspace/announce');
    expect(response?.status()).toBe(200);
    await expect(page.locator('main, [role="main"]')).toBeVisible();
    await expect(
      page.locator('form, [data-testid="announce-form"], textarea').first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('/workspace/approvals renders pending list', async ({ page }) => {
    requireOperatorCookie();
    await injectOperatorCookie(page);
    const response = await page.goto('/workspace/approvals');
    expect(response?.status()).toBe(200);
    await expect(page.locator('main, [role="main"]')).toBeVisible();
  });
});

test.describe('Parity — operator: partners cabinet (authed)', () => {
  test('/workspace/partners renders partner rows', async ({ page }) => {
    requireOperatorCookie();
    await injectOperatorCookie(page);
    const response = await page.goto('/workspace/partners');
    expect(response?.status()).toBe(200);
    await expect(page.locator('main, [role="main"]')).toBeVisible();
  });
});

test.describe('Parity — operator: admin cabinets (authed)', () => {
  test('/workspace/admin/countries renders provisioning table', async ({ page }) => {
    requireOperatorCookie();
    await injectOperatorCookie(page);
    const response = await page.goto('/workspace/admin/countries');
    expect(response?.status()).toBe(200);
    await expect(page.locator('main, [role="main"]')).toBeVisible();
    await expect(
      page.locator('table, [role="grid"], [data-testid="data-table"]').first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('/workspace/admin/rbac-sync renders sync controls', async ({ page }) => {
    requireOperatorCookie();
    await injectOperatorCookie(page);
    const response = await page.goto('/workspace/admin/rbac-sync');
    expect(response?.status()).toBe(200);
    await expect(page.locator('main, [role="main"]')).toBeVisible();
  });
});

test.describe('Parity — operator: integrations cabinet (authed)', () => {
  test('/workspace/integrations/telegram root renders', async ({ page }) => {
    requireOperatorCookie();
    await injectOperatorCookie(page);
    const response = await page.goto('/workspace/integrations/telegram');
    expect(response?.status()).toBe(200);
    await expect(page.locator('main, [role="main"]')).toBeVisible();
  });

  test('/workspace/integrations/telegram/segments renders segment builder', async ({ page }) => {
    requireOperatorCookie();
    await injectOperatorCookie(page);
    const response = await page.goto('/workspace/integrations/telegram/segments');
    expect(response?.status()).toBe(200);
    await expect(page.locator('main, [role="main"]')).toBeVisible();
  });

  test('/workspace/integrations/telegram/broadcasts renders list', async ({ page }) => {
    requireOperatorCookie();
    await injectOperatorCookie(page);
    const response = await page.goto('/workspace/integrations/telegram/broadcasts');
    expect(response?.status()).toBe(200);
    await expect(page.locator('main, [role="main"]')).toBeVisible();
  });
});

test.describe('Parity — operator: forms cabinet (authed)', () => {
  test('/workspace/forms list renders', async ({ page }) => {
    requireOperatorCookie();
    await injectOperatorCookie(page);
    const response = await page.goto('/workspace/forms');
    expect(response?.status()).toBe(200);
    await expect(page.locator('main, [role="main"]')).toBeVisible();
  });
});

// ── New Phase-3 cabinets (must exist before cutover) ────────────────────────

test.describe('Parity — operator: Phase-3 cabinets (authed)', () => {
  const PHASE3_PATHS = [
    '/workspace/site-settings',
    '/workspace/sponsors',
    '/workspace/press',
    '/workspace/badges',
    '/workspace/country-leads',
  ] as const;

  for (const path of PHASE3_PATHS) {
    test(`${path} exists and renders (Phase 3 cabinet)`, async ({ page }) => {
      requireOperatorCookie();
      await injectOperatorCookie(page);
      const response = await page.goto(path);
      // Accept 200 only — these cabinets must exist before cutover
      expect(response?.status(), `${path} must return 200 (Phase 3 cabinet must exist)`).toBe(200);
      await expect(page.locator('main, [role="main"]')).toBeVisible({ timeout: 8_000 });
    });
  }
});
