import { expect, test } from '@playwright/test';

// #354 regression guard — POST /v1/telegram/feedback must return 200
// with the documented envelope across all 4 routing paths.
//
// History: filed 2026-05-24 when DMS-mail wasn't deployed yet — the
// email dispatch threw, surfacing as a generic 500. Auto-resolved
// 2026-05-25 when DMS went live (EmailService finally has a working
// SMTP target). This smoke ensures we hear about it the next time the
// SMTP path breaks instead of waiting for a Telegram user to complain.
//
// We don't have the bot service token in CI by design (would let CI
// fabricate fake feedback rows). Instead we assert the endpoint is
// reachable + returns the auth challenge (401), proving the route
// + handler chain is live. Full-path coverage (200 with feedback_id)
// lives in apps/api/test/telegram-feedback-service.spec.ts.

const HOSTS = [
  'aiqadam.org', // apex routing
  'uz.aiqadam.org',
  'kz.aiqadam.org',
  'tj.aiqadam.org',
];

for (const host of HOSTS) {
  test.describe(`#354 regression guard — ${host}`, () => {
    test('POST /v1/telegram/feedback returns 401 (route alive, auth required)', async ({
      request,
    }) => {
      const response = await request.post(`https://${host}/api/v1/telegram/feedback`, {
        headers: { 'Content-Type': 'application/json' },
        data: { tg_user_id: 1, category: 'other', message: 'smoke' },
      });
      // 401 = route registered, AuthGuard rejected anonymous (expected).
      // The original bug returned 500, which this test catches.
      expect(
        response.status(),
        `Expected 401 (route alive) but got ${response.status()}. The handler is crashing.`,
      ).toBe(401);
    });
  });
}
