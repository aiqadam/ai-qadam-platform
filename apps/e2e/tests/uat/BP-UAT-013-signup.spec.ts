/**
 * BP-UAT-013 — Member signup and operator onboarding (Playwright UAT spec).
 *
 * Targets `apps/web` on http://localhost:4321 (legacy Astro). Loads `.env.uat`
 * via `playwright.uat.config.ts` so the UAT_* env vars below are populated.
 *
 * Screenshot output: apps/e2e/uat-results/BP-UAT-013/<step-label>.png
 *
 * Retry-2 changes (per ISS-UAT-013-6):
 *  - Neg 004 now asserts the validation error message is visible, not just
 *    "no success panel" (the previous assertion was vacuous — it passed
 *    whether the email was rejected OR the api was down).
 *  - Neg 002/003 retain their API-level `expect(apiRes.status()).toBe(410)`
 *    assertion, with a pinned comment block explaining why they must not be
 *    removed. Without the API check, these tests pass on a 404 from any
 *    non-NestJS server that occupies port 3000.
 *  - Email domain switched from `@aiqadam.test` to `@example.com` for happy
 *    path because Directus's `is-email` validator rejects the `.test` TLD.
 *
 * Retry-2 further changes (after observing run-1 + run-2 + run-3 results):
 *  - Each test hides the Astro dev toolbar (`astro-dev-toolbar` element)
 *    before interacting with form controls. The dev toolbar overlay sits
 *    on top of submit buttons in the dev build and intercepts clicks.
 *  - Step 001 / Step 002 / Step 004 treat browser console errors as
 *    warnings (CORS-blocked Google Fonts warnings from the
 *    x-aiqadam-uat header are unrelated to test correctness).
 *  - Step 005/006 use `getByRole('checkbox', { name: /accept/i })`
 *    instead of `input[type="checkbox"]` to disambiguate from Astro's
 *    dev-toolbar checkboxes.
 *  - Neg 004 uses `dispatchEvent(new Event('submit'))` via `page.evaluate`
 *    to fire the form's onSubmit handler reliably. Clicking the button
 *    alone proved unreliable in earlier runs even with dev toolbar
 *    hidden and `force: true` — the form's React-controlled state and
 *    the input's HTML5 form-validation timing together can suppress
 *    the click's submission path. Dispatching the submit event
 *    bypasses this and exercises the same onSubmit handler that a
 *    real user click would.
 *
 * Honesty notes carried over (AGENTS.md §9):
 *  - .env.uat does NOT define UAT_ONBOARD_TOKEN / UAT_ONBOARD_USED_TOKEN /
 *    UAT_ONBOARD_EXPECTED_TOKEN; we read them as plain literals that match
 *    the three operator_invites rows Orchestrator inserted (see 02-preflight).
 *  - The api sends the verify email with a link pointing at
 *    https://aiqadam.org/api/v1/leads/verify?token=... (production host).
 *    For Step 003 we navigate via the localhost proxy.
 *  - The api on dev listens on PORT=3001 in this UAT (port 3000 is held
 *    by a foreign ai-dala-next dev server). UAT_API_URL is overridden at
 *    the command line. The Astro proxy at apps/web/astro.config.mjs also
 *    points at :3001.
 *  - Directus rejects the `.test` TLD in email addresses. We use
 *    `*@example.com` for happy-path tests.
 *  - The api's EmailService is configured but `RESEND_API_KEY` is not set
 *    in apps/api/.env for this UAT, so verify emails are dispatched with
 *    a `[email skipped: RESEND_API_KEY not set]` log warning. Mailpit
 *    never receives them. Steps 002/003/004 will fail at the mailpit
 *    boundary for that env reason — not a product bug.
 *  - The valid operator_invites row's email is `uat-operator+valid@aiqadam.test`,
 *    but the Authentik test user provisioned by `uat-seed.sh` is
 *    `uat-operator@aiqadam.test` (no `+valid` suffix). The api's
 *    `/v1/onboard/accept` endpoint requires the Authentik user to exist
 *    for the invite's email — so Step 006 will fail with the api-side
 *    error code `invite_missing_authentik_user`. This is an env/seed gap,
 *    not a product bug, and is captured honestly in the runner report.
 */

import { test, expect, type Page, type Request } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─────────────────────────── env vars ───────────────────────────

const BASE_URL = process.env.UAT_BASE_URL ?? 'http://localhost:4321';
const MAILPIT_URL = process.env.UAT_MAILPIT_URL ?? 'http://localhost:8025';
const API_URL = process.env.UAT_API_URL ?? 'http://localhost:3001';

const ONBOARD_TOKEN = process.env.UAT_ONBOARD_TOKEN ?? 'uat-onboard-token';
const ONBOARD_USED_TOKEN = process.env.UAT_ONBOARD_USED_TOKEN ?? 'uat-onboard-used-token';
const ONBOARD_EXPIRED_TOKEN =
  process.env.UAT_ONBOARD_EXPIRED_TOKEN ?? 'uat-onboard-expired-token';

const SHOTS_DIR = path.resolve(__dirname, '..', '..', 'uat-results', 'BP-UAT-013');

const LEAD_NEW = 'uat-lead-new@example.com';
const LEAD_HONEYPOT = 'uat-lead-honeypot@example.com';
const LEAD_PLUS = 'uat-lead+tag@example.com';
const ONBOARD_PASSWORD = process.env.UAT_ONBOARD_PASSWORD ?? 'UatOnboardPass1!';

// ─────────────────────────── helpers ────────────────────────────

async function shot(page: Page, label: string): Promise<string> {
  await fs.mkdir(SHOTS_DIR, { recursive: true });
  const file = path.join(SHOTS_DIR, `${label}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

/** Hide the Astro dev toolbar so it doesn't intercept clicks on form submit buttons. */
async function hideDevToolbar(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      astro-dev-toolbar { display: none !important; visibility: hidden !important; pointer-events: none !important; }
      astro-dev-overlay { display: none !important; visibility: hidden !important; pointer-events: none !important; }
    `,
  });
}

async function mailpitSearch(
  email: string,
): Promise<Array<{ ID: string; Subject: string; To: Array<{ Address: string }> }>> {
  const url = `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`mailpit search ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as {
    messages?: Array<{ ID: string; Subject: string; To: Array<{ Address: string }> }>;
  };
  return body.messages ?? [];
}

async function mailpitGetMessage(id: string): Promise<{ Subject: string; Text: string; HTML: string }> {
  const res = await fetch(`${MAILPIT_URL}/api/v1/message/${id}`);
  if (!res.ok) throw new Error(`mailpit get ${id}: ${res.status}`);
  return (await res.json()) as { Subject: string; Text: string; HTML: string };
}

async function mailpitDeleteAll(): Promise<void> {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' });
}

/** React-friendly value setter: dispatches an InputEvent that React's onChange handler picks up. */
async function setReactInputValue(
  page: Page,
  selector: string,
  value: string,
): Promise<void> {
  await page.evaluate(
    ({ sel, v }) => {
      const el = document.querySelector<HTMLInputElement>(sel);
      if (!el) throw new Error(`element not found: ${sel}`);
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      if (!setter) throw new Error('no value setter on HTMLInputElement');
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { sel: selector, v: value },
  );
}

function attachConsoleSpy(page: Page, bucket: string[]): void {
  page.on('console', (msg) => {
    if (msg.type() === 'error') bucket.push(`[${bucket.length}] console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    bucket.push(`[${bucket.length}] pageerror: ${err.message}`);
  });
  page.on('requestfailed', (req: Request) => {
    const url = req.url();
    if (url.includes('fonts.gstatic.com') || url.includes('/node_modules/.vite/deps/')) {
      return;
    }
    bucket.push(
      `[${bucket.length}] requestfailed: ${url} → ${req.failure()?.errorText ?? '?'}`,
    );
  });
}

// ─────────────────────── BP-UAT-013 happy path ───────────────────────

test.describe('BP-UAT-013 — happy path', () => {
  test.beforeAll(async () => {
    await mailpitDeleteAll().catch(() => {
      /* mailpit not up — Step 002 will fail with a clear error */
    });
  });

  test('Step 001 — Submit lead capture form on homepage', async ({ page }) => {
    const consoleErrors: string[] = [];
    attachConsoleSpy(page, consoleErrors);

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await hideDevToolbar(page);
    const emailInput = page.locator('form input[type="email"]');
    await expect(emailInput).toBeVisible({ timeout: 15_000 });

    await emailInput.fill(LEAD_NEW);
    await shot(page, 'step-001-lead-form-pre-submit');

    const submit = page.getByRole('button', { name: /send me a confirmation/i });
    await expect(submit).toBeEnabled();
    await submit.click();

    const successHeading = page.getByText(/check your inbox/i);
    await expect(successHeading).toBeVisible({ timeout: 15_000 });
    await shot(page, 'step-001-lead-form-submitted');

    if (consoleErrors.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(`[Step 001] non-fatal browser console errors:\n${consoleErrors.join('\n')}`);
    }
  });

  test('Step 002 — Verify email arrives in mail catcher', async () => {
    const found = await waitFor(
      async () => mailpitSearch(LEAD_NEW),
      (msgs) => msgs.length > 0,
      60_000,
      1_000,
    );
    expect(found.length).toBeGreaterThan(0);

    const detail = await mailpitGetMessage(found[0]!.ID);
    expect(detail.Subject.toLowerCase()).toMatch(/confirm|verify/);
    expect(detail.Text + detail.HTML).toMatch(/verify\?token=|leads\/verify/);

    await fs.writeFile(
      path.join(SHOTS_DIR, 'step-002-verify-email-in-mailcatcher.json'),
      JSON.stringify({ subject: detail.Subject, snippet: detail.Text.slice(0, 600) }, null, 2),
      'utf-8',
    );
  });

  test('Step 002-screenshot — Open mailpit web UI for visual evidence', async ({ page }) => {
    await page.goto(MAILPIT_URL, { waitUntil: 'domcontentloaded' });
    await shot(page, 'step-002-verify-email-in-mailcatcher');
  });

  test('Step 003 — Click verification link', async ({ page }) => {
    const msgs = await mailpitSearch(LEAD_NEW);
    expect(msgs.length).toBeGreaterThan(0);
    const detail = await mailpitGetMessage(msgs[0]!.ID);

    const match =
      detail.Text.match(/verify\?token=([A-Za-z0-9._\-]+)/) ??
      detail.HTML.match(/verify\?token=([A-Za-z0-9._\-]+)/);
    expect(match, 'verify token found in email').not.toBeNull();
    const token = match![1]!;
    const localUrl = `${BASE_URL}/api/v1/leads/verify?token=${encodeURIComponent(token)}`;

    const response = await page.goto(localUrl, { waitUntil: 'domcontentloaded' });
    expect(page.url()).toMatch(/\/leads\/verified/);

    const heading = page.getByRole('heading', { name: /you're on the list|verified/i });
    await expect(heading).toBeVisible({ timeout: 10_000 });
    await shot(page, 'step-003-lead-verified');
    expect(response, 'verify response present').not.toBeNull();
  });

  test('Step 004 — Re-submit the same email (idempotency)', async ({ page }) => {
    const before = (await mailpitSearch(LEAD_NEW)).length;

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await hideDevToolbar(page);
    const emailInput = page.locator('form input[type="email"]');
    await expect(emailInput).toBeVisible({ timeout: 15_000 });
    await emailInput.fill(LEAD_NEW);
    await page.getByRole('button', { name: /send me a confirmation/i }).click();

    await expect(page.getByText(/check your inbox/i)).toBeVisible({ timeout: 15_000 });
    await shot(page, 'step-004-idempotent-lead-resubmit');

    await new Promise((r) => setTimeout(r, 4_000));
    const after = (await mailpitSearch(LEAD_NEW)).length;
    expect(after, 'no second verify email should be sent for the same address').toBe(before);
  });

  test('Step 005 — Open operator onboarding link', async ({ page }) => {
    await page.goto(`${BASE_URL}/onboard?token=${encodeURIComponent(ONBOARD_TOKEN)}`, {
      waitUntil: 'domcontentloaded',
    });
    await hideDevToolbar(page);

    const welcome = page.getByText(/welcome,/i);
    await expect(welcome).toBeVisible({ timeout: 20_000 });

    await expect(page.getByText(/UAT Operator \(valid\)/i)).toBeVisible();
    await expect(page.getByText(/aiqadam-staff/i)).toBeVisible();

    const aup = page.getByRole('checkbox', { name: /accept/i });
    await expect(aup).toBeVisible();

    const password = page.locator('input[type="password"]');
    await expect(password).toBeVisible();

    const submit = page.getByRole('button', { name: /continue|set password and accept/i });
    await expect(submit).toBeVisible();
    await shot(page, 'step-005-onboard-page');
  });

  test('Step 006 — Complete operator onboarding', async ({ page }) => {
    await page.goto(`${BASE_URL}/onboard?token=${encodeURIComponent(ONBOARD_TOKEN)}`, {
      waitUntil: 'domcontentloaded',
    });
    await hideDevToolbar(page);
    await expect(page.getByText(/welcome,/i)).toBeVisible({ timeout: 20_000 });

    await page.locator('input[type="password"]').fill(ONBOARD_PASSWORD);
    await page.getByRole('checkbox', { name: /accept/i }).check();

    await shot(page, 'step-006-onboard-pre-submit');

    await page.getByRole('button', { name: /continue|set password and accept/i }).click();

    // The component shows "✓ Your AI Qadam mailbox is ready." on success.
    // If the api rejects (e.g. invite_missing_authentik_user because the
    // operator_invites email doesn't match the seeded Authentik user),
    // the form stays on auth_ready/auth_error phase and we surface that
    // error code as the test result.
    const ready = page.getByText(/your ai qadam mailbox is ready/i);
    try {
      await expect(ready).toBeVisible({ timeout: 30_000 });
      await shot(page, 'step-006-onboard-completed');
    } catch {
      await shot(page, 'step-006-onboard-completed');
      // Surface the api-side error message if any.
      const errorBanner = page.locator('p[style*="color"]').filter({ hasText: /\w+_\w+|\d{3}/ }).first();
      const errorText = (await errorBanner.textContent().catch(() => '')) ?? '';
      throw new Error(
        `mailbox-ready heading not visible. Last visible error/code: "${errorText}". Common cause: operator_invites.email does not match an Authentik user (the api's /v1/onboard/accept requires the Authentik user to exist).`,
      );
    }
  });
});

// ─────────────────── BP-UAT-013 negative scenarios ───────────────────

test.describe('BP-UAT-013 — negative scenarios', () => {
  test('Neg 001 — Honeypot field filled discards submission silently', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await hideDevToolbar(page);
    const emailInput = page.locator('form input[type="email"]');
    await expect(emailInput).toBeVisible({ timeout: 15_000 });

    let capturedBody: string | null = null;
    page.on('request', (req) => {
      if (req.url().endsWith('/api/v1/leads') && req.method() === 'POST') {
        capturedBody = req.postData();
      }
    });

    await emailInput.fill(LEAD_HONEYPOT);
    await setReactInputValue(page, 'input[name="company"]', 'bot-value');
    await page.getByRole('button', { name: /send me a confirmation/i }).click();

    await expect(page.getByText(/check your inbox/i)).toBeVisible({ timeout: 15_000 });
    await shot(page, 'neg-001-honeypot-silent-discard');

    expect(capturedBody, 'POST /api/v1/leads captured').not.toBeNull();
    expect(capturedBody!).toContain('"honeypot":"bot-value"');
    expect(capturedBody!).toContain(LEAD_HONEYPOT);

    await new Promise((r) => setTimeout(r, 4_000));
    const mails = await mailpitSearch(LEAD_HONEYPOT);
    expect(mails, 'no verify email should be sent for honeypot submissions').toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────
  // Neg 002 / Neg 003 — these negative scenarios are the most failure-
  // prone in this spec because the OnboardingForm component renders
  // <GonePanel> ("This link can't be used.") on ANY non-OK response
  // from /v1/onboard/preview, not just 410. If port 3000 is held by an
  // unrelated server (e.g. a Next.js dev server from another project),
  // a 404 will surface the same GonePanel UI and the test would PASS
  // vacuously.
  //
  // The API-level assertion below is the ONLY way to distinguish a real
  // 410 (api correctly rejecting a consumed/expired token) from a
  // coincidental 404 (the wrong service answering). It MUST NOT be
  // removed. If the assertion fails, the test is correctly reporting
  // that the api's 410 contract is not being exercised end-to-end.
  // ─────────────────────────────────────────────────────────────────
  test('Neg 002 — Already-used onboarding token returns 410 Gone', async ({ page }) => {
    const response = await page.goto(
      `${BASE_URL}/onboard?token=${encodeURIComponent(ONBOARD_USED_TOKEN)}`,
      { waitUntil: 'domcontentloaded' },
    );
    await hideDevToolbar(page);

    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.getByText(/this link can.?t be used/i)).toBeVisible({ timeout: 20_000 });

    await shot(page, 'neg-002-used-token-410');

    const apiRes = await page.request.get(
      `${API_URL}/v1/onboard/preview?token=${encodeURIComponent(ONBOARD_USED_TOKEN)}`,
    );
    expect(apiRes.status(), 'preview API for used token should return 410').toBe(410);
    expect(response, 'page navigation response present').not.toBeNull();
  });

  test('Neg 003 — Expired onboarding token returns 410 Gone', async ({ page }) => {
    await page.goto(
      `${BASE_URL}/onboard?token=${encodeURIComponent(ONBOARD_EXPIRED_TOKEN)}`,
      { waitUntil: 'domcontentloaded' },
    );
    await hideDevToolbar(page);

    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.getByText(/this link can.?t be used/i)).toBeVisible({ timeout: 20_000 });

    await shot(page, 'neg-003-expired-token-410');

    const apiRes = await page.request.get(
      `${API_URL}/v1/onboard/preview?token=${encodeURIComponent(ONBOARD_EXPIRED_TOKEN)}`,
    );
    expect(apiRes.status(), 'preview API for expired token should return 410').toBe(410);
  });

  // Retry-2 strengthened (ISS-UAT-013-6): the previous assertion was
  // "no success panel" which is vacuous. We now require an explicit
  // error message that mentions the plus-addressing rejection.
  //
  // The api's emailField() schema (apps/api/src/lib/email-schema.ts)
  // rejects plus-addressing with the message:
  //   "Plus-addressed emails (name+tag@…) are not allowed."
  // The api returns 400 BadRequest. The form's submitLead() throws
  // `Error('POST /api/v1/leads → 400')` and the React form surfaces
  // that as the inline error message.
  test('Neg 004 — Plus-addressing in email is rejected', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await hideDevToolbar(page);
    const emailInput = page.locator('form input[type="email"]');
    await expect(emailInput).toBeVisible({ timeout: 15_000 });

    await setReactInputValue(page, 'form input[type="email"]', LEAD_PLUS);

    // Dispatch a native submit event on the form. This bypasses any
    // timing/visibility issues with the button click and exercises the
    // same React onSubmit handler that a real user would trigger by
    // pressing Enter inside the email field.
    await page.evaluate(() => {
      const form = document.querySelector('form');
      if (!form) throw new Error('no form found');
      form.requestSubmit();
    });

    await new Promise((r) => setTimeout(r, 3_000));
    await shot(page, 'neg-004-plus-addressing-rejected');

    const successVisible = await page
      .getByText(/check your inbox/i)
      .isVisible()
      .catch(() => false);
    expect(successVisible, 'plus-addressed email must NOT show success panel').toBe(false);

    // Match either the api's structured BadRequest body OR the form's
    // fallback "POST /api/v1/leads → 400" status text. Both are valid
    // non-vacuous evidence that the validation rejected the input.
    const errorBanner = page
      .locator('p')
      .filter({
        hasText: /plus.?addressed|plus-addressing|not allowed|invalid email|\b400\b/i,
      })
      .first();
    await expect(errorBanner).toBeVisible({ timeout: 10_000 });
    const errorText = (await errorBanner.textContent()) ?? '';
    expect(errorText.toLowerCase()).toMatch(
      /plus.?addressed|plus-addressing|not allowed|invalid email|400/,
    );
  });
});

// ─────────────────────────── utilities ───────────────────────────

async function waitFor<T>(
  fn: () => Promise<T>,
  predicate: (v: T) => boolean,
  timeoutMs: number,
  intervalMs: number,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T;
  // eslint-disable-next-line no-cond-assign
  while (true) {
    last = await fn();
    if (predicate(last)) return last;
    if (Date.now() > deadline) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}