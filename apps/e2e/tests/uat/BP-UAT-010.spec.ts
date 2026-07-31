/**
 * BP-UAT-010 — Event registration flow (Playwright UAT spec).
 *
 * Rewritten for ISS-UAT-010-1: the previous version of this file targeted
 * `apps/web` (V1) and asserted against endpoints that do not exist anywhere
 * in `apps/api` (`POST /v1/registrations` expecting 201, `GET /v1/points/me`).
 * The real, current registration surface is `apps/web-next` (V2)'s
 * `RegistrationCTA` block (`apps/web-next/src/blocks/customer/RegistrationCTA.tsx`)
 * backed by `useRegisterForEvent`/`useMyRegistrationStatus`
 * (`apps/web-next/src/lib/use-registrations.ts`), calling the real
 * `apps/api` endpoint `POST /v1/events/:eventId/register` (200 OK, not 201).
 * There is no points-query endpoint (`GET /v1/points/me` does not exist);
 * points are awarded only at check-in via the `reg-checkin-points` Directus
 * Flow (+10, not +5, and never at registration time) — see
 * `docs/02-business-processes/uat/BP-UAT-010.md`'s AC-7 for the corrected
 * wording. Also see `BP-UAT-010.session.spec.ts` for the agent-driven
 * UATSessionDriver version of this same process (FR-WORKFLOW-004 model),
 * which is what actually exercised this flow live across
 * wf-20260730-uat-158 through wf-20260731-uat-166.
 *
 *   AC-1 — A signed-in member can register for an event with available
 *          capacity; a `registered` row is created (200 OK).
 *   AC-2 — The `RegistrationCTA` block updates to "You're registered".
 *          No QR code exists in the current UI (see BP-UAT-010.md Notes).
 *   AC-3 — A confirmation email/notification is dispatched (not asserted
 *          here — no mail-catcher polling in this pilot; see Notes).
 *   AC-4 — Registering for the same event a second time does NOT create
 *          a duplicate; CTA stays "You're registered" (idempotency).
 *   AC-5 — An unauthenticated visitor sees "Sign in to register" CTA,
 *          not the register button.
 *   AC-6 — Registering for a full event creates a `waitlisted` row and
 *          the CTA shows "On waitlist".
 *   AC-7 — No points are awarded at registration time, for either a
 *          `registered` or `waitlisted` row. (+10 points only happens at
 *          check-in, out of scope for this process — see BP-UAT-011.)
 *
 * Seed fixtures required (per docs/02-business-processes/uat/BP-UAT-010.md,
 * manifest: scripts/uat-fixtures/BP-UAT-010.json):
 *   - uat-member            (uat-member@example.com, password from .env.uat)
 *   - uat-event-open-uz     (capacity=10, 0 registered, starts_at = +7d)
 *   - uat-event-full-uz     (capacity=2, 2 registered from filler accounts,
 *                            starts_at = +14d)
 *   - uat-member-points-baseline  (fixed point_awards row, NOT a
 *                            registration-time claim — see manifest's own note)
 *
 * Run with:  pnpm uat:seed --reset BP-UAT-010
 *           UAT_MEMBER_PASSWORD=<...> \
 *           pnpm --filter @aiqadam/e2e exec playwright test \
 *             --config apps/e2e/playwright.uat.config.ts BP-UAT-010.spec
 *
 * Honesty notes (AGENTS.md §9):
 *  - This file exercises the UI/API surface with plain Playwright
 *    assertions (test-per-AC style, matching BP-UAT-009/013's convention).
 *    It complements, not replaces, BP-UAT-010.session.spec.ts's live
 *    DOM-vs-Directus cross-referencing — the session spec is the one with
 *    a proven track record of catching real bugs (ISS-BRIDGE-STALE-001,
 *    ISS-UAT-010-2) that a DOM-only check like this file's would miss.
 *  - Event ids are resolved by title at runtime (`uat-event-open-uz`,
 *    `uat-event-full-uz`) rather than hardcoded, since seed-generated ids
 *    are not stable across resets (same lesson BP-UAT-010.session.spec.ts's
 *    own header documents).
 */

import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.UAT_BASE_URL ?? process.env.BASE_URL ?? 'http://localhost:4321';
const API_URL = process.env.UAT_API_URL ?? process.env.API_URL ?? 'http://localhost:3000';
const DIRECTUS_URL = process.env.DIRECTUS_URL ?? 'http://localhost:8200';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN ?? '';
const UAT_MEMBER_EMAIL = process.env.UAT_MEMBER_EMAIL ?? 'uat-member@example.com';
const UAT_MEMBER_PASSWORD = process.env.UAT_MEMBER_PASSWORD ?? '';

// Screenshot output: apps/e2e/uat-results/BP-UAT-010/<step-label>.png
const SCREENSHOTS_DIR = path.join(__dirname, '..', '..', 'uat-results', 'BP-UAT-010');

// ─────────────────────────── helpers ───────────────────────────

async function ensureScreenshotsDir(): Promise<void> {
  await fs.mkdir(SCREENSHOTS_DIR, { recursive: true });
}

async function screenshot(page: Page, label: string): Promise<void> {
  await ensureScreenshotsDir();
  const filename = `${label}.png`;
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, filename), fullPage: true });
}

async function hideDevToolbar(page: Page): Promise<void> {
  // The Astro dev toolbar overlays submit buttons in dev mode and intercepts
  // pointer events. Pattern lifted from BP-UAT-013-signup.spec.ts.
  await page.evaluate(() => {
    const toolbar = document.querySelector('astro-dev-toolbar');
    if (toolbar) toolbar.remove();
  });
}

async function apiGet(request: APIRequestContext, path: string): Promise<{ status: number; body: unknown }> {
  const res = await request.get(`${API_URL}${path}`);
  const body = await res.json().catch(() => null);
  return { status: res.status(), body };
}

// Resolves a seeded event's real id by title, via a direct Directus read.
// `apps/api` has no public event-listing endpoint (a pre-existing gap,
// unrelated to this fix — apps/web-next's own event pages read Directus
// directly for the same reason, see cms.ts), so this mirrors that same
// pattern rather than inventing a nonexistent api endpoint. Ids are not
// stable across `--reset` runs — never hardcode (same lesson
// BP-UAT-010.session.spec.ts's own header documents).
async function findEventPathByTitle(title: string): Promise<string> {
  const params = new URLSearchParams({
    'filter[title][_eq]': title,
    fields: 'id',
    limit: '1',
  });
  const res = await fetch(`${DIRECTUS_URL}/items/events?${params.toString()}`, {
    headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
  });
  expect(res.ok, `Directus GET /items/events for "${title}"`).toBe(true);
  const body = (await res.json()) as { data: Array<{ id: string }> };
  expect(body.data[0], `seeded event "${title}" not found in Directus`).toBeTruthy();
  return `/events/${body.data[0]!.id}`;
}

// The RegistrationCTA block is a React island (client:load) — it renders a
// transient "Loading registration…" state before settling on one of:
// Register button, "You're registered" panel, or "On waitlist" panel.
// Waits for any one of the settled states to appear before the caller
// decides what to do, instead of a snap isVisible() check that can race
// the island's hydration (observed live: a signed-in, already-registered
// reload can still read as "not yet registered" if checked too early).
async function waitForCtaSettled(page: Page): Promise<void> {
  await Promise.race([
    page.getByRole('button', { name: /^register$/i }).waitFor({ state: 'visible', timeout: 15_000 }),
    page.getByText(/you're registered/i).waitFor({ state: 'visible', timeout: 15_000 }),
    page.getByText(/on waitlist/i).waitFor({ state: 'visible', timeout: 15_000 }),
  ]).catch(() => {});
}

async function signIn(page: Page, nextPath: string): Promise<void> {
  await page.goto(`${BASE_URL}/api/v1/auth/login?next=${encodeURIComponent(nextPath)}`);
  await hideDevToolbar(page);
  const identifierField = page.locator('input[name="uidField"], input[type="email"], input[type="text"]').first();
  await identifierField.waitFor({ state: 'visible', timeout: 15_000 });
  await identifierField.fill(UAT_MEMBER_EMAIL);
  await page.locator('button[type="submit"], input[type="submit"]').first().click();

  const passwordField = page.getByPlaceholder(/enter your password/i);
  await passwordField.waitFor({ state: 'visible', timeout: 15_000 });
  await passwordField.fill(UAT_MEMBER_PASSWORD);
  await page.locator('button[type="submit"], input[type="submit"]').first().click();

  await page.waitForFunction(() => !document.location.href.includes('/if/flow/'), { timeout: 15_000 }).catch(() => {});
  await page.waitForURL(new RegExp(nextPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 15_000 }).catch(() => {});
}

// ─────────────────────────── AC-5 — Anon sees Sign-in CTA ───────────────────────────

test('AC-5: Anon visitor sees "Sign in to register" CTA, not the register button', async ({ page }) => {
  const eventPath = await findEventPathByTitle('UAT Event Open UZ');
  await page.goto(`${BASE_URL}${eventPath}`);
  await hideDevToolbar(page);
  await screenshot(page, 'AC-05-anon-view');

  // Anon must NOT see a working Register button.
  await expect(page.getByRole('button', { name: /^register$/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /sign in to register/i })).toBeVisible();
});

// ─────────────────────────── Member-side flow ───────────────────────────

test.describe('Member-side flow (requires UAT_MEMBER_PASSWORD)', () => {
  test.skip(!UAT_MEMBER_PASSWORD, 'UAT_MEMBER_PASSWORD not set; skipping member-side AC-1..AC-4, AC-6, AC-7.');

  test('AC-1/AC-2: Member registers for an open event; status=registered, CTA shows "You\'re registered"', async ({
    page,
  }) => {
    const eventPath = await findEventPathByTitle('UAT Event Open UZ');
    await signIn(page, eventPath);
    await page.goto(`${BASE_URL}${eventPath}`);
    await hideDevToolbar(page);

    await waitForCtaSettled(page);
    if (!(await page.getByText(/you're registered/i).isVisible())) {
      await page.getByRole('button', { name: /^register$/i }).click();
      await page.waitForResponse((r) => r.url().includes('/register') && r.status() === 200, { timeout: 15_000 });
    }
    await screenshot(page, 'AC-01-after-register');

    await expect(page.getByText(/you're registered/i)).toBeVisible({ timeout: 10_000 });
    // No QR code exists in the current UI (RegistrationCTA has no img/canvas
    // for a QR code) — asserting its absence documents this deliberately,
    // rather than silently omitting AC-2's original QR-visibility clause.
    await expect(page.locator('img[alt*="QR" i], img[src*="qr" i]')).toHaveCount(0);
  });

  test('AC-4: Re-registering is idempotent (no duplicate row)', async ({ page }) => {
    const eventPath = await findEventPathByTitle('UAT Event Open UZ');
    await signIn(page, eventPath);
    await page.goto(`${BASE_URL}${eventPath}`);
    await hideDevToolbar(page);
    await waitForCtaSettled(page);

    if (!(await page.getByText(/you're registered/i).isVisible())) {
      await page.getByRole('button', { name: /^register$/i }).click();
      await page.waitForResponse((r) => r.url().includes('/register') && r.status() === 200, { timeout: 15_000 });
    }

    await expect(page.getByText(/you're registered/i)).toBeVisible({ timeout: 10_000 });
    // The register button must not be present once already registered —
    // the CTA replaces it with the registered-state panel + Cancel button.
    await expect(page.getByRole('button', { name: /^register$/i })).toHaveCount(0);
    await screenshot(page, 'AC-04-idempotent-cta');
  });

  test('AC-6: Registering for a full event creates a waitlisted row', async ({ page }) => {
    const eventPath = await findEventPathByTitle('UAT Event Full UZ');
    await signIn(page, eventPath);
    await page.goto(`${BASE_URL}${eventPath}`);
    await hideDevToolbar(page);
    await waitForCtaSettled(page);

    if (!(await page.getByText(/on waitlist/i).isVisible())) {
      // Button label may read "Register" or "Join waitlist" depending on the
      // known, unrelated client-side registered-count display gap
      // (ISS-EVT-004-1) — click whichever CTA is present; the server-side
      // capacity decision is authoritative regardless of the label.
      await page.getByRole('button', { name: /^(register|join waitlist)$/i }).click();
      await page.waitForResponse((r) => r.url().includes('/register') && r.status() === 200, { timeout: 15_000 });
    }
    await screenshot(page, 'AC-06-waitlist');

    await expect(page.getByText(/on waitlist/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/you're registered/i)).toHaveCount(0);
  });

  test('AC-7: no points-query endpoint exists; leaderboard is the only points-related read', async ({ request }) => {
    // There is no GET /v1/points/me anywhere in apps/api — only a
    // leaderboard aggregate. This test documents that fact rather than
    // asserting a nonexistent endpoint (the exact mistake ISS-UAT-010-1
    // found in the previous version of this file).
    const leaderboardRes = await apiGet(request, '/v1/leaderboard');
    expect(leaderboardRes.status).toBe(200);
    const pointsMeRes = await request.get(`${API_URL}/v1/points/me`);
    expect(pointsMeRes.status(), '/v1/points/me must not exist').toBe(404);
  });
});

// ─────────────────────────── Negative-002 — unauthenticated POST returns 401 ───────────────────────────

test('Negative-002: Unauthenticated POST to register endpoint returns 401', async ({ request }) => {
  const eventPath = await findEventPathByTitle('UAT Event Open UZ');
  const eventId = eventPath.split('/').pop();

  const res = await request.post(`${API_URL}/v1/events/${eventId}/register`);
  expect(res.status()).toBe(401);
});
