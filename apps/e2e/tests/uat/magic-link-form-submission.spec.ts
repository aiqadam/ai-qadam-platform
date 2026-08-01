import { test, expect } from '@playwright/test';

// FR-AUTH-004 — happy-path smoke only, per 06-test-strategy.md's E2E Test
// Plan. Mirrors signup-form-submission.spec.ts's page.route() interception
// technique exactly: intercept the POST (deterministic, no live
// backend/rate-limit/Authentik dependency) and assert the DOM transitions
// to MagicLinkForm.tsx's SuccessPanel.
//
// Deliberately NOT covered here (explicit scope exclusion, not an
// oversight — see 06-test-strategy.md's E2E Test Plan "Deliberately NOT in
// this Playwright spec" section): the actual link-click-to-session-
// completion path (AC-2 through AC-5) and rate-limit 429 behavior (AC-6).
// Both require live Authentik/SMTP-catcher infrastructure this Playwright
// spec cannot substitute a mock for — covered instead by the
// Orchestrator's own live UAT verification.

test('filling a valid email and submitting transitions to the "Check your email" confirmation state', async ({
  page,
}) => {
  let capturedBody: string | null = null;
  await page.route('**/api/v1/auth/magic-link', async (route) => {
    capturedBody = route.request().postData();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto('/auth/sign-in-magic-link');

  const email = `magic-link-${Date.now()}@example.com`;
  await page.fill('input[type="email"]', email);

  await Promise.all([
    page.waitForResponse('**/api/v1/auth/magic-link'),
    page.click('button[type="submit"]'),
  ]);

  // SuccessPanel: MailCheck icon + "Check your email" text.
  await expect(page.getByText('Check your email')).toBeVisible();
  await expect(
    page.getByText('If that email has an account, a sign-in link is on its way.'),
  ).toBeVisible();

  // MagicLinkForm.tsx submits via apiClient (fetch-based JSON body, NOT a
  // native <form> — see that file's module doc for why), unlike
  // signup-form-submission.spec.ts's native-form precedent, so the
  // captured body is JSON, not a URL-encoded form-data string.
  expect(capturedBody).not.toBeNull();
  const parsedBody = JSON.parse(capturedBody ?? '{}') as { email: string };
  expect(parsedBody.email).toBe(email);
});
