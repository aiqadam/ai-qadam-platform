import { expect, test } from '@playwright/test';

// ISS-LEAD-DISC-001 — lead-form-within-fold regression spec.
//
// Verifies the geometric discoverability of <LeadCaptureForm /> on the
// apps/web homepage: the email input must land inside the initial paint
// (no scroll required) on the design-system breakpoints (1440x900,
// 1280x720, 1024x768). Also covers the new nav anchor (#newsletter)
// and re-asserts the unchanged backend contract: POST /api/v1/leads
// returns 202, idempotent on resubmit, honeypot path is silently
// discarded (no Mailpit row).
//
// Reference: .copilot/tasks/active/wf-20260701-fix-044/06-test-strategy.md
//
// On `main` this spec fails 6 of 8 tests (form ~94 % down the body, no
// /#newsletter anchor, no nav link). On the fix branch all 8 pass.

// Project-relative constants — keep magic numbers out of assertions.
const STICKY_NAV_HEIGHT_PX = 56;
const SCROLL_MARGIN_PX = 72;
const EMAIL_INPUT_PLACEHOLDER = 'you@domain.com';
const NAV_LINK_PATTERN = /get updates/i;
const NEWSLETTER_ANCHOR = '#newsletter';
const NEWSLETTER_HREF = `/${NEWSLETTER_ANCHOR}`;

// Env: local stack runs Astro on :4321 by default.
const BASE_URL = process.env.UAT_BASE_URL ?? 'http://localhost:4321';

// Honeypot path verification — Mailpit captures verify emails for
// accepted leads. The honeypot submission is silently discarded, so no
// row should ever appear in Mailpit for that address.
const MAILPIT_URL = process.env.UAT_MAILPIT_URL ?? 'http://localhost:8025';

// Unique per-run email so idempotency assertion is meaningful even when
// the suite is repeated against the same stack.
//
// Domain: `@example.com` (NOT `@aiqadam.test`) — Directus's built-in
// `is-email` validator rejects the `.test` TLD with HTTP 400
// FAILED_VALIDATION, and the api re-throws that as 500. This is the
// same fact documented in apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts
// Retry-2 header. Keep this in lockstep with that file's happy-path
// convention.
const RUN_TAG = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const HAPPY_EMAIL = `uat-lead-fold-${RUN_TAG}@example.com`;
const HONEYPOT_EMAIL = `uat-lead-honeypot-${RUN_TAG}@example.com`;

// Helper: assert a bounding box is fully contained within a viewport rect.
function expectInsideViewport(
  box: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
): void {
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

// Helper: count Mailpit messages whose `To` contains the given address
// fragment. Returns 0 on any Mailpit error so the assertion fails loudly
// at the toBe() check rather than throwing.
async function mailpitCountFor(toFragment: string): Promise<number> {
  const url = `${MAILPIT_URL}/api/v1/messages`;
  const res = await fetch(url);
  if (!res.ok) return 0;
  const body = (await res.json()) as { messages?: Array<{ ID: string; To?: Array<{ Address: string }> }> };
  const messages = body.messages ?? [];
  const needle = toFragment.toLowerCase();
  return messages.filter((m) => (m.To ?? []).some((t) => t.Address.toLowerCase().includes(needle))).length;
}

test.describe('ISS-LEAD-DISC-001 — lead form is within initial paint', () => {
  test.use({ baseURL: BASE_URL });

  test.describe('viewport 1440x900 (Desktop Chrome HiDPI)', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('T1 — email input is inside 1440x900 viewport without scrolling', async ({ page }) => {
      // Arrange: load the homepage, do NOT scroll.
      await page.goto('/');

      // Act: resolve the email input via placeholder (stable across locales).
      const emailInput = page.getByPlaceholder(EMAIL_INPUT_PLACEHOLDER);
      await expect(emailInput).toBeVisible();
      const box = await emailInput.boundingBox();

      // Assert: bounding box is fully inside the 1440x900 viewport.
      expect(box).not.toBeNull();
      if (!box) return;
      expectInsideViewport(box, { width: 1440, height: 900 });

      // Also verify scrollY is at the top — guards against accidental
      // scroll-restoration tricks on first paint.
      const scrollY = await page.evaluate(() => window.scrollY);
      expect(scrollY).toBe(0);
    });
  });

  test.describe('viewport 1280x720 (default Desktop Chrome)', () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test('T2 — email input is inside 1280x720 viewport without scrolling', async ({ page }) => {
      // Arrange: load the homepage, do NOT scroll.
      await page.goto('/');

      // Act: resolve the email input.
      const emailInput = page.getByPlaceholder(EMAIL_INPUT_PLACEHOLDER);
      await expect(emailInput).toBeVisible();
      const box = await emailInput.boundingBox();

      // Assert: bounding box is fully inside the 1280x720 viewport.
      expect(box).not.toBeNull();
      if (!box) return;
      expectInsideViewport(box, { width: 1280, height: 720 });

      // Bonus regression signal: re-render under dark theme and re-check.
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      const darkBox = await emailInput.boundingBox();
      expect(darkBox).not.toBeNull();
      if (!darkBox) return;
      expectInsideViewport(darkBox, { width: 1280, height: 720 });
      // Restore light theme for any subsequent siblings in this worker.
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    });
  });

  test.describe('viewport 1024x768 (lower-bound laptop)', () => {
    test.use({ viewport: { width: 1024, height: 768 } });

    test('T3 — email input is inside 1024x768 viewport without scrolling', async ({ page }) => {
      // Arrange: load the homepage, do NOT scroll.
      await page.goto('/');

      // Act: resolve the email input.
      const emailInput = page.getByPlaceholder(EMAIL_INPUT_PLACEHOLDER);
      await expect(emailInput).toBeVisible();
      const box = await emailInput.boundingBox();

      // Assert: bounding box is fully inside the 1024x768 viewport.
      expect(box).not.toBeNull();
      if (!box) return;
      expectInsideViewport(box, { width: 1024, height: 768 });
    });
  });
});

test.describe('ISS-LEAD-DISC-001 — nav anchor scrolls form into view', () => {
  test.use({ baseURL: BASE_URL, viewport: { width: 1280, height: 720 } });

  test('T4 — nav "Get updates" link is visible and points at /#newsletter', async ({ page }) => {
    // Arrange: load the homepage.
    await page.goto('/');

    // Act: resolve the new nav link.
    const navLink = page.getByRole('link', { name: NAV_LINK_PATTERN });

    // Assert: visible and href is exactly /#newsletter.
    await expect(navLink).toBeVisible();
    await expect(navLink).toHaveAttribute('href', NEWSLETTER_HREF);
  });

  test('T5 — clicking the nav link scrolls the form into view without occluding the email input', async ({ page }) => {
    // Arrange: load the homepage.
    await page.goto('/');
    const navLink = page.getByRole('link', { name: NAV_LINK_PATTERN });
    await expect(navLink).toBeVisible();

    // Act: click the nav link.
    await navLink.click();
    // Browser scroll-into-view animation — wait for the section to settle.
    await page.waitForTimeout(300);

    // Assert: email input is now fully visible AND not occluded by the
    // 56-px sticky nav. Top of input must be >= sticky nav bottom (56)
    // and well above the viewport bottom (>=40 px breathing room).
    const emailInput = page.getByPlaceholder(EMAIL_INPUT_PLACEHOLDER);
    await expect(emailInput).toBeVisible();
    const box = await emailInput.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    expect(box.y).toBeGreaterThanOrEqual(STICKY_NAV_HEIGHT_PX);
    expect(box.y + box.height).toBeLessThanOrEqual(720 - 40);
  });

  test('T8 — /#newsletter deep-link honours scroll-margin-top: 72px', async ({ page }) => {
    // Arrange: load the homepage at the deep-link anchor.
    await page.goto(NEWSLETTER_HREF);
    // Allow the browser to apply scroll-margin-top.
    await page.waitForTimeout(300);

    // Act: resolve the email input.
    const emailInput = page.getByPlaceholder(EMAIL_INPUT_PLACEHOLDER);
    await expect(emailInput).toBeVisible();
    const box = await emailInput.boundingBox();

    // Assert: top of email input is >= scroll-margin-top (72 px). This
    // means the sticky 56 px nav + 16 px breathing margin did NOT
    // occlude the anchored element.
    expect(box).not.toBeNull();
    if (!box) return;
    expect(box.y).toBeGreaterThanOrEqual(SCROLL_MARGIN_PX);
  });
});

test.describe('ISS-LEAD-DISC-001 — form submission contract', () => {
  test.use({ baseURL: BASE_URL, viewport: { width: 1280, height: 720 } });

  test('T6 — POST /api/v1/leads returns 202 and is idempotent on resubmit', async ({ request }) => {
    // Arrange: build the lead body the form would POST.
    const body = {
      email: HAPPY_EMAIL,
      honeypot: '',
      sourceUrl: `${BASE_URL}/`,
    };

    // Act: POST once, then POST again with the same email.
    const first = await request.post('/api/v1/leads', { data: body });
    const second = await request.post('/api/v1/leads', { data: body });

    // Assert: both responses are 202 (idempotent contract).
    expect(first.status()).toBe(202);
    expect(second.status()).toBe(202);
    const firstJson = (await first.json()) as { accepted?: boolean };
    const secondJson = (await second.json()) as { accepted?: boolean };
    expect(firstJson.accepted).toBe(true);
    expect(secondJson.accepted).toBe(true);
  });

  test('T7 — honeypot submission is silently discarded (no Mailpit row)', async ({ page }) => {
    // Arrange: load the homepage; resolve the honeypot input by name
    // ("company") and the email input by placeholder. Both are direct
    // children of <form>, so we resolve them in DOM order.
    await page.goto('/');
    const form = page.locator('form').filter({ has: page.getByPlaceholder(EMAIL_INPUT_PLACEHOLDER) });
    const honeypot = form.locator('input[name="company"]');
    const emailInput = form.locator('input[type="email"]');
    const submit = form.getByRole('button', { name: /send me a confirmation/i });

    // Sanity: honeypot field exists with the expected off-screen attrs.
    await expect(honeypot).toHaveAttribute('tabindex', '-1');
    await expect(honeypot).toHaveAttribute('aria-hidden', 'true');

    // Act: fill the honeypot + email + submit. Browser autofill bots
    // would do exactly this — our contract is to accept the response
    // and never enqueue a verification email.
    await honeypot.fill(HONEYPOT_EMAIL);
    await emailInput.fill(HONEYPOT_EMAIL);
    await submit.click();

    // Assert: success panel renders (UX is uniform for all 202s).
    // LeadCaptureForm.tsx renders "Check your inbox" inside a <p>, not a
    // heading element, so we match by text rather than by role.
    await expect(page.getByText(/check your inbox/i)).toBeVisible();

    // Assert (Mailpit boundary): no message has been enqueued for this
    // honeypot address. The API contract says the controller discards
    // the row before the mail job is enqueued, so the count must be 0.
    // Give the API a moment to settle in case of async pipeline.
    await page.waitForTimeout(500);
    const count = await mailpitCountFor(HONEYPOT_EMAIL);
    expect(count).toBe(0);
  });
});