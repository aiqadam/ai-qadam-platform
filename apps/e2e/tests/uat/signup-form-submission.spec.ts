import { test, expect } from '@playwright/test';

// ISS-USR-REG-003 — regression test.
//
// SignUpForm.tsx submits a NATIVE <form> (see that file's module doc for
// why: the server's 302 → Authentik redirect must be followed as a real
// browser navigation, not a fetch()). Root cause: `onSubmit` used to call
// `setPhase('submitting')` synchronously, which flips `disabled={true}` on
// every field via a React re-render. Disabled controls are excluded from
// the browser's form-data-set per the WHATWG form-submission algorithm —
// and that re-render could commit before the browser finished
// constructing the native submission's body, silently stripping every
// real field except the honeypot (the only field nothing ever disables).
// Reported live on QA as GitHub issue #58: user filled the form correctly
// and landed on a raw `{"fieldErrors":{"email":["Required"],...}}` page.
//
// This test intercepts the actual POST (no live backend call — fully
// deterministic, no rate-limit/environment dependency) and asserts the
// real DOM-serialized body Chromium sends contains every field the user
// typed, exercised via a genuine trusted click (not a JS-triggered
// `form.requestSubmit()`, which does not reproduce the bug — the race is
// specific to browser-native submission of a real user gesture).

test('submitting via a real button click sends every field, not just the honeypot', async ({ page }) => {
  let capturedBody: string | null = null;
  await page.route('**/api/v1/auth/register', async (route) => {
    capturedBody = route.request().postData();
    await route.fulfill({ status: 302, headers: { location: '/v1/auth/login' } });
  });

  await page.goto('/auth/sign-up');
  await page.fill('input[name="displayName"]', 'Regression Test');
  await page.fill('input[name="email"]', `regression-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', 'Reproduce-This-Bug-123');
  await page.selectOption('select[name="country"]', 'kz');

  await Promise.all([
    page.waitForResponse('**/api/v1/auth/register'),
    page.click('button[type="submit"]'),
  ]);

  expect(capturedBody).not.toBeNull();
  expect(capturedBody).toContain('displayName=Regression+Test');
  expect(capturedBody).toContain('password=Reproduce-This-Bug-123');
  expect(capturedBody).toContain('country=kz');
});
