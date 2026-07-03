// Focused regression test for ISS-UAT-009-4 — extracted from
// BP-UAT-009.spec.ts Step 005 to give a clean pass/fail signal
// independent of the pre-existing soft-assertion divergence in
// Step 005 (which is owned by ISS-UAT-009-2 and is being tracked
// separately).
//
// See .copilot/issues/ISS-UAT-009-4.md and
// .copilot/tasks/active/wf-20260704-fix-077/06-test-strategy.md.

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.UAT_BASE_URL ?? 'http://localhost:4321';

test('ISS-UAT-009-4 — /me AnonView renders site-wide AppFooter (layout-completeness)', async ({
  page,
  context,
}) => {
  test.info().annotations.push({
    type: 'iss-ref',
    description: 'ISS-UAT-009-4 — /me AnonView layout-completeness footer regression',
  });

  // Clean anonymous context.
  await context.clearCookies();

  // Land on /me anonymously (the same scenario that surfaced the
  // original bug — AnonView CTA + empty region below).
  await page.goto(`${BASE_URL}/me`, { waitUntil: 'domcontentloaded' });

  // (1) Site-wide <AppFooter /> renders on /me AnonView.
  //     Pre-fix: zero matches → toBeVisible times out.
  await expect(
    page.locator('footer'),
    'site-wide <AppFooter /> must render on /me AnonView',
  ).toBeVisible({ timeout: 10_000 });

  // (2) <footer> follows <main> in DOM order — anchors the bottom
  //     of the layout rather than floating above content.
  //     Pre-fix: no <footer> exists → returns false.
  const footerAfterMain = await page.evaluate(() => {
    const main = document.querySelector('main');
    const footer = document.querySelector('footer');
    if (!main || !footer) return false;
    // main.compareDocumentPosition(footer) returns flags for footer's
    // position relative to main. DOCUMENT_POSITION_FOLLOWING (4) means
    // footer follows main — i.e., footer is below main in the DOM.
    return (main.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  });
  expect(footerAfterMain, '<footer> must follow <main> in DOM order').toBe(true);

  // (3) Footer renders the canonical design-system tagline "AI Qadam".
  await expect(
    page.locator('footer p.font-display').filter({ hasText: /AI Qadam/i }).first(),
    'footer must render the "AI Qadam" tagline in font-display',
  ).toBeVisible();

  // (4) Footer renders the canonical copyright row.
  await expect(
    page.locator('footer').filter({ hasText: /© \d{4} AI Qadam · Community-as-platform/i }),
    'footer must render the canonical copyright row',
  ).toBeVisible();
});