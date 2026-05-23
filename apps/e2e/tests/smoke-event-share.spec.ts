import { expect, test } from '@playwright/test';

// F-S5.2 — share buttons on event detail page.
//
// Walks the public events list → first event detail → verifies the 3
// share buttons render with correct UTM + channel-typed share URLs.
// Skips when staging has no published events (which can happen post
// post-event cron + pre next publish).

test.describe('F-S5.2 — event share buttons', () => {
  test('event detail renders 3 channel share links with UTM + correct share host', async ({
    page,
  }) => {
    await page.goto('/events');
    const firstEventLink = page.locator('a[href^="/events/"]').first();
    if ((await firstEventLink.count()) === 0) {
      test.skip(true, 'no published events on staging — skipping share-button smoke');
      return;
    }
    await firstEventLink.click();
    await page.waitForURL(/\/events\/[^/]+/);

    const tg = page.locator('a[data-share-channel="telegram"]');
    const x = page.locator('a[data-share-channel="x"]');
    const li = page.locator('a[data-share-channel="linkedin"]');

    await expect(tg).toBeVisible();
    await expect(x).toBeVisible();
    await expect(li).toBeVisible();

    const tgHref = (await tg.getAttribute('href')) ?? '';
    const xHref = (await x.getAttribute('href')) ?? '';
    const liHref = (await li.getAttribute('href')) ?? '';

    expect(tgHref).toContain('t.me/share/url');
    expect(xHref).toContain('x.com/intent/post');
    expect(liHref).toContain('linkedin.com/sharing/share-offsite/');

    // Anonymous viewer → utm_source should be anon-share (member-share
    // only when signed in + the /v1/referrals/mine call returned a code).
    // The shared URL is URL-encoded inside the share endpoint's `url`
    // query param, so decode + verify.
    const decoded = decodeURIComponent(new URL(tgHref).searchParams.get('url') ?? '');
    expect(decoded).toContain('utm_source=anon-share');
    expect(decoded).toContain('utm_medium=telegram_share');
    expect(decoded).toMatch(/utm_campaign=event-[\w-]+/);
  });
});
