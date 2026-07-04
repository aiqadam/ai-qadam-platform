/**
 * BP-UAT-009 — Auth sign-in and sign-out (Playwright UAT spec).
 *
 * Targets `apps/web` on http://localhost:4321. Sign-in goes through
 * Authentik OIDC at http://localhost:9000 (real IdP, not mocked).
 *
 * Script: docs/02-business-processes/uat/BP-UAT-009.md
 * Screenshot output: apps/e2e/uat-results/BP-UAT-009/<step-label>.png
 *
 * Honesty notes (AGENTS.md §9 / uat-runner.md — record actual behavior,
 * do not silently rewrite the script to match reality; that is
 * BusinessAnalyst's triage call in Step 4):
 *
 *  - Step 005 in the script asserts that visiting `/me` with no session
 *    redirects (browser-level) to `/auth/sign-in`. Reading
 *    apps/web/src/components/MeDashboard.tsx, `/me` is SSR-rendered with
 *    `prerender = false` and returns 200 for anonymous visitors — the
 *    React island renders an `AnonView` ("Sign in to see your dashboard")
 *    with a CTA linking to `/auth/sign-in?next=...`, matching the
 *    documented behaviour in apps/e2e/tests/smoke-auth-gates.spec.ts
 *    ("/me dashboard renders for anon"). There is no server or
 *    client-side hard redirect. This test asserts the ACTUAL behavior
 *    (200 + AnonView + CTA) rather than forcing a redirect assertion
 *    that would fail by design. Flagged for BusinessAnalyst.
 *  - Negative 001 in the script targets `/workspace` (not `/me`).
 *    apps/web/src/components/Workspace.tsx DOES auto-redirect anon
 *    visitors client-side via `window.location.replace(signInUrl())`
 *    inside a `useEffect` once bootstrap resolves to 'anon' — so the
 *    browser does end up at `/auth/sign-in?next=/workspace` for that
 *    scenario, consistent with the script's expected rejection.
 *  - Step 003 (HttpOnly cookie verification): per the script's own
 *    Notes section, Playwright cannot read an HttpOnly cookie's VALUE
 *    via `document.cookie` (browser JS is deliberately blind to it).
 *    `context.cookies()` operates at the CDP/network layer, not page
 *    JS, so it CAN report whether a cookie is present and whether its
 *    `httpOnly` flag is set — that is what this test checks. A
 *    devtools-style screenshot is also captured for visual evidence, but
 *    the pass/fail assertion is the `context.cookies()` read, which is
 *    the strongest signal Playwright can give for this AC.
 *  - Legacy cookie name `__Host-aiqadam-refresh` is also accepted per
 *    the script's Notes; the cookie helper below checks both names.
 *  - No `assertDesignSystem` fixture exists yet at
 *    apps/e2e/support/assert-design-system.ts (checked before writing
 *    this spec — the file/directory does not exist). Per uat-runner.md
 *    §Spec structure rules, this is noted here and screenshots are
 *    still taken; the fixture call is omitted from every test.
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─────────────────────────── env vars ───────────────────────────

const BASE_URL = process.env.UAT_BASE_URL ?? process.env.BASE_URL ?? 'http://localhost:4321';
const AUTHENTIK_URL = process.env.UAT_AUTHENTIK_URL ?? 'http://localhost:9000';

const MEMBER_EMAIL = process.env.UAT_MEMBER_EMAIL ?? 'uat-member@aiqadam.test';
const MEMBER_PASSWORD = process.env.UAT_MEMBER_PASSWORD ?? 'UatMember1!';
const WRONG_PASSWORD = 'wrong-password';

const SHOTS_DIR = path.resolve(__dirname, '..', '..', 'uat-results', 'BP-UAT-009');

const REFRESH_COOKIE = 'aiqadam-refresh';
const LEGACY_REFRESH_COOKIE = '__Host-aiqadam-refresh';

// ─────────────────────────── helpers ────────────────────────────

async function shot(page: Page, label: string): Promise<string> {
  await fs.mkdir(SHOTS_DIR, { recursive: true });
  const file = path.join(SHOTS_DIR, `${label}.png`);
  await page.screenshot({ path: file });
  return file;
}

/** Hide the Astro dev toolbar so it doesn't intercept clicks on nav/form controls. */
async function hideDevToolbar(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      astro-dev-toolbar { display: none !important; visibility: hidden !important; pointer-events: none !important; }
      astro-dev-overlay { display: none !important; visibility: hidden !important; pointer-events: none !important; }
    `,
  }).catch(() => {
    /* page may not have loaded yet in some navigations — non-fatal */
  });
}

/** Find the aiqadam-refresh cookie (new or legacy name) in the browser context. */
async function findRefreshCookie(
  context: BrowserContext,
): Promise<{ name: string; value: string; httpOnly: boolean } | null> {
  const cookies = await context.cookies();
  const found = cookies.find((c) => c.name === REFRESH_COOKIE || c.name === LEGACY_REFRESH_COOKIE);
  if (!found) return null;
  return { name: found.name, value: found.value, httpOnly: found.httpOnly };
}

/**
 * Fill and submit Authentik's identification + password stages (may be
 * combined or two-step, depending on flow config). Authentik's flow
 * executor is a web-component (ak-stage-*) app — role-based locators are
 * used throughout rather than `button[type="submit"]`, because that CSS
 * selector matched an unrelated/ambiguous button in earlier runs and left
 * the flow stuck on the password stage (click landed on the wrong node).
 *
 * IMPORTANT: `.fill()` sets the input's DOM value directly and dispatches
 * a synthetic `input` event. Authentik's password field (Lit/web
 * component, patches its own value-change handling similar to React's
 * controlled inputs) did not register `.fill()`-set values — clicking
 * Continue afterwards showed native HTML5 "Please fill out this field"
 * validation despite `inputValue()` reading back the filled text
 * (confirmed by direct observation during spec authoring). Using
 * `pressSequentially()` — real per-character keydown/keypress/input
 * events — makes the field's internal state agree with the DOM value,
 * exactly like BP-UAT-013's `setReactInputValue` workaround for the
 * signup form's React inputs.
 */
async function submitAuthentikCredentials(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  const identifierField = page
    .locator('input[name="uidField"], input[type="email"], input[autocomplete="username"]')
    .first();
  await expect(identifierField).toBeVisible({ timeout: 20_000 });
  await identifierField.click();
  await identifierField.pressSequentially(email, { delay: 10 });

  const identifierSubmit = page.getByRole('button', { name: /continue|log in|next|sign in/i }).first();
  await expect(identifierSubmit).toBeEnabled({ timeout: 10_000 });
  await identifierSubmit.click();

  // Authentik's flow executor re-renders the whole stage component after
  // the identifier submit (identification stage -> password stage are two
  // distinct DOM trees, not a toggled field within the same tree). The
  // previous `isVisible()` snapshot-then-branch approach raced this
  // transition: it could read a stale/mid-transition password node that
  // then went stale or ended up detached/off-screen ("element is outside
  // of the viewport", observed during spec authoring). Poll with
  // `waitFor` for a definitively visible + attached password field
  // instead of branching on a single point-in-time check. If the flow is
  // actually single-page (password already present) this resolves
  // immediately; if it's two-step, it resolves once the new stage mounts.
  const passwordField = page.locator('input[name="password"], input[type="password"]').first();
  await passwordField.waitFor({ state: 'visible', timeout: 20_000 });
  await passwordField.scrollIntoViewIfNeeded();
  await passwordField.click();
  await passwordField.pressSequentially(password, { delay: 10 });

  const loginSubmit = page.getByRole('button', { name: /continue|log in|sign in/i }).first();
  await expect(loginSubmit).toBeEnabled({ timeout: 10_000 });
  await loginSubmit.click();
}

// ─────────────────────── BP-UAT-009 happy path ───────────────────────

test.describe('BP-UAT-009 — Auth sign-in and sign-out', () => {
  test('Step 001 — Navigate to sign-in from public homepage', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await hideDevToolbar(page);

    const signInCta = page.locator('a[href*="/auth/sign-in"]').first();
    await expect.soft(signInCta).toBeVisible({ timeout: 15_000 });

    await Promise.all([
      page.waitForURL(new RegExp(`^${AUTHENTIK_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), {
        timeout: 20_000,
      }),
      signInCta.click(),
    ]);

    expect(page.url().startsWith(AUTHENTIK_URL), 'browser redirected to Authentik login').toBe(
      true,
    );

    const identifierField = page
      .locator('input[name="uidField"], input[type="email"], input[autocomplete="username"]')
      .first();
    await expect(identifierField).toBeVisible({ timeout: 15_000 });

    await shot(page, 'step-001-authentik-login-page');

    // Hard assertion — exit state for this test.
    expect(page.url().startsWith(AUTHENTIK_URL)).toBe(true);
  });

  test('Step 002 — Submit credentials', async ({ page }) => {
    // Honesty note: the script's Step 001 action is "click Sign in from
    // the homepage nav", and Nav.astro builds that link as
    // `/auth/sign-in?next=<currentPath>` — from the homepage that is
    // `next=/`, which lands the post-login redirect at `/`, NOT `/me`.
    // Confirmed by direct observation: navigating to `/auth/sign-in` with
    // no `next` (which itself defaults to `next=/` per sign-in.astro)
    // and completing the OIDC round-trip landed the browser on `/`
    // (homepage, now showing "Account" in nav) rather than `/me`. To
    // exercise the AC-2/AC-3 assertions this step is actually meant to
    // verify (post-login session + cookie), we sign in with an explicit
    // `next=/me` here, matching what a user clicking "Sign in" FROM the
    // /me page (e.g. via MeDashboard's AnonView CTA) would experience.
    // Flagged for BusinessAnalyst: Step 001/002 as literally written
    // (homepage nav -> /me) does not match observed behavior.
    await page.goto(`${BASE_URL}/auth/sign-in?next=%2Fme`, { waitUntil: 'domcontentloaded' });

    await page.waitForURL(new RegExp(`^${AUTHENTIK_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), {
      timeout: 20_000,
    });

    await submitAuthentikCredentials(page, MEMBER_EMAIL, MEMBER_PASSWORD);

    await page.waitForURL(`${BASE_URL}/me`, { timeout: 20_000 });
    await hideDevToolbar(page);

    const dashboardHeading = page.getByText(/sign in to see your dashboard/i);
    const dashboardVisible = await dashboardHeading.isVisible().catch(() => false);
    expect.soft(dashboardVisible, '/me should show the authed dashboard, not AnonView').toBe(
      false,
    );

    await shot(page, 'step-002-signed-in-me-page');

    const cookie = await findRefreshCookie(page.context());
    expect.soft(cookie, 'aiqadam-refresh cookie should be set after sign-in').not.toBeNull();

    // Hard assertion — exit state for this test: landed at /me.
    expect(page.url()).toBe(`${BASE_URL}/me`);
  });

  test('Step 003 — Verify HttpOnly cookie', async ({ page, context }) => {
    // Re-establish session (each `test` gets a fresh context under
    // workers: 1 / fullyParallel: false, but Playwright still isolates
    // storage per test unless explicitly shared) by signing in again.
    await page.goto(`${BASE_URL}/auth/sign-in?next=%2Fme`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(new RegExp(`^${AUTHENTIK_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), {
      timeout: 20_000,
    });
    await submitAuthentikCredentials(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL(`${BASE_URL}/me`, { timeout: 20_000 });
    await hideDevToolbar(page);

    // document.cookie must NOT expose the HttpOnly cookie's value —
    // this is the client-side blindness the script's Notes describe.
    const documentCookieValue = await page.evaluate(() => document.cookie);
    expect
      .soft(
        documentCookieValue.includes('aiqadam-refresh='),
        'document.cookie must not expose the HttpOnly aiqadam-refresh cookie',
      )
      .toBe(false);

    // context.cookies() operates below page JS (CDP/network layer) and
    // CAN report presence + the httpOnly flag itself (not forbidden —
    // only the *value* is inaccessible to page JS, per the script note).
    const cookie = await findRefreshCookie(context);

    await shot(page, 'step-003-httponly-cookie');

    expect.soft(cookie, 'aiqadam-refresh (or legacy) cookie present').not.toBeNull();
    expect.soft(cookie?.httpOnly, 'aiqadam-refresh cookie has HttpOnly flag set').toBe(true);
    expect.soft(cookie?.value.length ?? 0, 'cookie value is not empty').toBeGreaterThan(0);

    // Hard assertion — exit state for this test.
    expect(cookie).not.toBeNull();
  });

  test('Step 004 — Sign out', async ({ page }) => {
    await page.goto(`${BASE_URL}/auth/sign-in?next=%2Fme`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(new RegExp(`^${AUTHENTIK_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), {
      timeout: 20_000,
    });
    await submitAuthentikCredentials(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL(`${BASE_URL}/me`, { timeout: 20_000 });
    await hideDevToolbar(page);

    // Open the account menu (avatar chip) then click Sign out.
    const accountMenuButton = page.getByRole('button', { name: /account menu|menu/i }).first();
    await expect(accountMenuButton).toBeVisible({ timeout: 15_000 });
    await accountMenuButton.click();

    const signOutItem = page.getByRole('menuitem', { name: /sign out/i });
    await expect(signOutItem).toBeVisible({ timeout: 10_000 });

    await signOutItem.click();

    // Script expects the browser to land on http://localhost:4321/auth/signed-out
    // automatically. Observed behavior: Authentik's RP-Initiated Logout
    // flow (default-provider-invalidation-flow, with a valid id_token_hint
    // and post_logout_redirect_uri visibly present in the URL — confirmed
    // via trace) renders an interstitial confirmation page ("You've logged
    // out of AI Qadam Platform (local).") with three manual links (Go back
    // to overview / Log out of authentik / Log back into AI Qadam Platform)
    // instead of auto-redirecting to post_logout_redirect_uri. The browser
    // does NOT reach /auth/signed-out without a further manual step.
    // Recorded here with a soft assertion (does not block later steps);
    // flagged for BusinessAnalyst as a real product/config finding, not a
    // test-authoring issue — the API's own comment in auth.controller.ts
    // documents that a no-hint logout triggers this confirmation page, but
    // this run DID carry an id_token_hint.
    const reachedSignedOut = await page
      .waitForURL(`${BASE_URL}/auth/signed-out`, { timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    expect
      .soft(reachedSignedOut, 'browser should auto-redirect to /auth/signed-out after sign-out')
      .toBe(true);

    await hideDevToolbar(page);
    await shot(page, 'step-004-signed-out-page');

    if (!reachedSignedOut) {
      // Authentik confirmation interstitial reached instead — record its
      // actual state for BusinessAnalyst and manually complete the flow so
      // subsequent steps (005) start from a genuinely signed-out session.
      const backLink = page.getByRole('link', { name: /go back to overview/i });
      const onConfirmationPage = await backLink.isVisible().catch(() => false);
      expect
        .soft(
          onConfirmationPage,
          'landed on Authentik logout confirmation interstitial instead of /auth/signed-out',
        )
        .toBe(true);
    }

    const cookie = await findRefreshCookie(page.context());
    expect.soft(cookie, 'aiqadam-refresh cookie should be cleared after sign-out').toBeNull();

    // Hard assertion — exit state for this test: the local platform
    // session must be gone (cookie cleared) regardless of whether
    // Authentik auto-redirected or stopped at its confirmation page.
    expect(cookie).toBeNull();
  });

  test('Step 005 — Protected page after sign-out (actual: /me renders AnonView, no hard redirect)', async ({
    page,
    context,
  }) => {
    // Ensure a clean anonymous context (no leftover cookies from a prior test).
    await context.clearCookies();

    const response = await page.goto(`${BASE_URL}/me`, { waitUntil: 'domcontentloaded' });
    await hideDevToolbar(page);

    // Script expectation: browser redirects to /auth/sign-in and the
    // /me dashboard content is NOT visible. Actual app behavior (per
    // MeDashboard.tsx AnonView + smoke-auth-gates.spec.ts): /me returns
    // 200 and renders an anon CTA in-page rather than a hard redirect.
    // We record both signals with soft assertions so BusinessAnalyst can
    // see the discrepancy, and hard-assert on what is actually true:
    // dashboard *content* (registrations/points) is not visible to anon.
    expect.soft(response?.status(), 'script expected a redirect (3xx); actual response status').toBe(
      302,
    );

    const redirectedToSignIn = page.url().startsWith(`${BASE_URL}/auth/sign-in`);
    expect
      .soft(redirectedToSignIn, 'script expected browser to land on /auth/sign-in')
      .toBe(true);

    const anonCta = page.getByText(/sign in to see your dashboard/i);
    await expect.soft(anonCta).toBeVisible({ timeout: 10_000 });

    await shot(page, 'step-005-redirect-after-signout');

    // ─── Regression: /me AnonView layout-completeness footer (ISS-UAT-009-4) ───
    //
    // Bug (pre-fix): apps/web/src/layouts/Layout.astro rendered Nav +
    // <slot /> + attribution script, but NO <AppFooter />. On short
    // pages like /me AnonView (single CTA card on a dark background),
    // this left a large unbalanced empty background-coloured region
    // below the CTA — the visual defect reported in
    // .copilot/issues/ISS-UAT-009-4.
    //
    // Fix (post-fix DOM shape): apps/web/src/components/AppFooter.astro
    // is rendered by Layout.astro after <slot />, providing the
    // layout-completeness bottom anchor (mirrors the apps/web-next
    // Layout parity).
    //
    // These assertions pin that post-fix shape; ALL FOUR would have
    // FAILED before the fix because the pre-fix DOM contained no
    // <footer> at all (page.locator('footer') matched zero elements,
    // and the compareDocumentPosition branch returned false via the
    // `if (!main || !footer) return false` short-circuit). See
    // .copilot/issues/ISS-UAT-009-4.md and the sister-workflow
    // regression pattern in .copilot/issues/ISS-UAT-009-3.md.
    //
    // Pattern mirror: wf-20260704-fix-076 added 5 DOM assertions to
    // Step 006 for the leaderboard self-row chip. This block adds 4
    // DOM assertions to Step 005 for the footer — same shape, same
    // placement (after screenshot, before the step's exit-state
    // hard assertion), same would-have-failed-before contract.
    await test.step('ISS-UAT-009-4: layout-completeness footer regression (pre-fix: no <footer>)', async () => {
      test.info().annotations.push({
        type: 'iss-ref',
        description: 'ISS-UAT-009-4 — /me AnonView layout-completeness footer',
      });

      // (1) Hard: there is now a rendered <footer> on the page.
      //     Pre-fix: apps/web/src/layouts/Layout.astro had no
      //     <AppFooter />, so this would have timed out / zero-matched.
      const footer = page.locator('footer');
      await expect(footer, 'site-wide <AppFooter /> must render on /me AnonView').toBeVisible({
        timeout: 10_000,
      });

      // (2) Hard: the footer is in document order AFTER <main>, so it
      //     acts as the layout-complete anchor (not floating above
      //     content). Pre-fix: <main> was the last block in the
      //     Layout, no footer existed, so this assertion would have
      //     failed (footerCount === 0 → returns false).
      //
      //     compareDocumentPosition semantics: `a.compareDocumentPosition(b)`
      //     returns flags describing b's position relative to a. To ask
      //     "does <footer> come after <main>?" we therefore call
      //     `main.compareDocumentPosition(footer)` and check
      //     DOCUMENT_POSITION_FOLLOWING (4) — i.e. "footer follows main".
      //     Calling it the other way (`footer.compareDocumentPosition(main)`)
      //     would check the inverse and always return false here.
      const footerAfterMain = await page.evaluate(() => {
        const main = document.querySelector('main');
        const footer = document.querySelector('footer');
        if (!main || !footer) return false;
        // 4 = DOCUMENT_POSITION_FOLLOWING — footer follows main in DOM order
        return (main.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      });
      expect(footerAfterMain, '<footer> must follow <main> in DOM order').toBe(true);

      // (3) Hard: footer renders the canonical design-system tagline.
      //     Pre-fix: no footer, the "AI Qadam" tagline inside
      //     .font-display never reached the DOM.
      await expect(
        page.locator('footer p.font-display').filter({ hasText: /AI Qadam/i }).first(),
        'footer must render the "AI Qadam" tagline in font-display',
      ).toBeVisible();

      // (4) Hard: footer renders the canonical copyright row.
      //     Pre-fix: no footer, this row never reached the DOM.
      await expect(
        page.locator('footer').filter({ hasText: /© \d{4} AI Qadam · Community-as-platform/i }),
        'footer must render the canonical copyright row',
      ).toBeVisible();
    });

    // Hard assertion — exit state: authenticated-only dashboard content
    // (points/registrations widgets) must not be visible to an anon
    // visitor, regardless of which UI path (redirect vs in-page CTA)
    // the app takes.
    const authedOnlyContent = page.getByText(/your registrations|check-in qr|leaderboard points/i);
    await expect(authedOnlyContent).toHaveCount(0);
  });

  test('Step 006 — Sign in with valid next param', async ({ page, context }) => {
    await context.clearCookies();

    await page.goto(`${BASE_URL}/auth/sign-in?next=%2Fleaderboard`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForURL(new RegExp(`^${AUTHENTIK_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), {
      timeout: 20_000,
    });

    await submitAuthentikCredentials(page, MEMBER_EMAIL, MEMBER_PASSWORD);

    await page.waitForURL(`${BASE_URL}/leaderboard`, { timeout: 20_000 }).catch(() => {
      /* fall through — screenshot + assertion below report actual landing URL */
    });
    await hideDevToolbar(page);

    // ─── Regression: leaderboard self-row chip DOM structure (ISS-UAT-009-3) ───
    //
    // Bug (pre-fix): the client-side `highlightMe` IIFE in
    // apps/web/src/pages/leaderboard.astro appended the `.me-chip` as a
    // child of the ellipsis-clipped `.name` / `.pname` text container,
    // so the chip's margin collapsed against the truncated display name
    // and the rendered text read "UAT MemberYou" with no separator.
    //
    // Fix (post-fix DOM shape): `.name` / `.pname` and `.me-chip` are
    // wrapped together inside an inline-flex `.me-name-wrap` sibling of
    // `.handle` / `.phandle`. The chip itself now carries the canonical
    // `.badge.mono` pattern from design-system/components.css.
    //
    // These assertions pin that post-fix shape; assertion (2) is the
    // one that would have FAILED before the fix (chip parent was `.name`,
    // not `.me-name-wrap`). See .copilot/issues/ISS-UAT-009-3.md.
    //
    // The chip is injected asynchronously by `highlightMe` after
    // auth-bootstrap resolves — not synchronously after navigation — so
    // we wait for it to appear with a soft no-op catch (the user may
    // not be in top-3 or seed may be missing; the AC-3 visual review
    // still applies, and the assertions below have their own guards).
    test.info().annotations.push({
      type: 'iss-ref',
      description: 'ISS-UAT-009-3 — leaderboard self-row chip DOM regression',
    });

    await test.step('ISS-UAT-009-3: self-row chip DOM regression (pre-fix: chip inside .name)', async () => {
      await page
        .locator('.lb-row.is-me .me-chip, .podium-card.is-me .me-chip')
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 })
        .catch(() => {
          /* soft no-op: user may not be in top-3 or seed missing; AC-3
             visual review still applies. The assertions below have
             their own guards. */
        });

      const myUserId = await page.evaluate(() => {
        const row = document.querySelector('.lb-row.is-me, .podium-card.is-me');
        return row?.getAttribute('data-user-id') ?? null;
      });

      if (myUserId !== null) {
        const rowSel = `[data-user-id="${myUserId.replace(/"/g, '\\"')}"]`;

        // (1) Hard: the row has exactly one .me-name-wrap and one .me-chip.
        const wrapCount = await page.locator(`${rowSel} .me-name-wrap`).count();
        expect(wrapCount, 'self-row must contain exactly one .me-name-wrap').toBe(1);
        const chipCount = await page.locator(`${rowSel} .me-chip`).count();
        expect(chipCount, 'self-row must contain exactly one .me-chip').toBe(1);

        // (2) Hard: the chip's parent is the wrap (not the ellipsis-clipped name).
        const chipParentClass = await page
          .locator(`${rowSel} .me-chip`)
          .first()
          .evaluate((el) => el.parentElement?.className ?? null);
        expect(chipParentClass, '.me-chip parent must be .me-name-wrap').toBe('me-name-wrap');

        // (3) Hard: chip carries the canonical badge pattern.
        const chipClass = await page
          .locator(`${rowSel} .me-chip`)
          .first()
          .evaluate((el) => el.className);
        expect(chipClass, '.me-chip must carry "badge mono me-chip"').toBe('badge mono me-chip');

        // (4) Hard: chip text is 'You'.
        const chipText = await page.locator(`${rowSel} .me-chip`).first().textContent();
        expect(chipText?.trim(), '.me-chip text must be "You"').toBe('You');
      }

      // (5) Hard: NO non-self row has a chip or a wrap (AC-3 regression guard).
      const otherRowsWithChip = await page
        .locator('.lb-row:not(.is-me) .me-chip, .podium-card:not(.is-me) .me-chip')
        .count();
      expect(otherRowsWithChip, 'non-self rows must NOT carry a .me-chip').toBe(0);
      const otherRowsWithWrap = await page
        .locator('.lb-row:not(.is-me) .me-name-wrap, .podium-card:not(.is-me) .me-name-wrap')
        .count();
      expect(otherRowsWithWrap, 'non-self rows must NOT carry a .me-name-wrap').toBe(0);
    });

    await shot(page, 'step-006-next-param-redirect');

    // Hard assertion — exit state for this test.
    expect(page.url()).toBe(`${BASE_URL}/leaderboard`);
  });
});

// ─────────────────── BP-UAT-009 negative scenarios ───────────────────

test.describe('BP-UAT-009 — negative scenarios', () => {
  test('Neg 001 — Protected page (/workspace) without session redirects to sign-in', async ({
    page,
    context,
  }) => {
    await context.clearCookies();

    await page.goto(`${BASE_URL}/workspace`, { waitUntil: 'domcontentloaded' });
    await hideDevToolbar(page);

    // Workspace.tsx client-side redirects anon visitors via
    // window.location.replace(signInUrl()) inside a useEffect once
    // bootstrap resolves to 'anon' — so we wait for that navigation.
    // The intent of this rewrite (see ISS-UAT-009-5 / wf-20260704-fix-080):
    // capture the waitForURL outcome as a boolean instead of swallowing
    // the timeout with `.catch(() => {})`. Mirrors the Step 004 idiom at
    // line 302–310. Timeout is 20s, matching the sibling client-side
    // redirect budget used by Steps 002/003/006.
    const reachedSignIn = await page
      .waitForURL(new RegExp(`^${BASE_URL}/(auth/sign-in|api/v1/auth/login)`), {
        timeout: 20_000,
      })
      .then(() => true)
      .catch(() => false);

    await shot(page, 'neg-001-protected-page-redirect');

    expect
      .soft(
        reachedSignIn,
        'browser should auto-redirect to /auth/sign-in or /api/v1/auth/login after entering /workspace while signed-out',
      )
      .toBe(true);

    // Defensive second check: if the waitForURL regex above did not match
    // (e.g. the redirect landed on an Authentik shell URL or somewhere
    // we did not enumerate), still surface the actual landing page so the
    // test report flags it for triage. Independent of reachedSignIn so a
    // future regex expansion does not silently pass.
    const landedOnSignIn =
      page.url().startsWith(`${BASE_URL}/auth/sign-in`) ||
      page.url().startsWith(AUTHENTIK_URL) ||
      page.url().includes('/api/v1/auth/login');
    expect
      .soft(landedOnSignIn, 'final URL must be a sign-in surface (app, Authentik, or api login)')
      .toBe(true);

    const workspaceContent = page.getByText(/operator workspace|single landing/i);
    await expect(workspaceContent).toHaveCount(0);

    // Hard assertion — workspace content must never be visible to anon.
    expect(await page.getByRole('heading', { name: /workspace/i }).count()).toBe(0);
  });

  test('Neg 002 — Open-redirect via absolute next is blocked', async ({ page, context }) => {
    await context.clearCookies();

    const maliciousNext = encodeURIComponent('https://evil.example.com');
    await page.goto(`${BASE_URL}/auth/sign-in?next=${maliciousNext}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForURL(new RegExp(`^${AUTHENTIK_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), {
      timeout: 20_000,
    });

    await submitAuthentikCredentials(page, MEMBER_EMAIL, MEMBER_PASSWORD);

    await page.waitForURL(/localhost:4321/, { timeout: 20_000 }).catch(() => {
      /* fall through — assertion below reports actual landing URL */
    });
    await hideDevToolbar(page);

    await shot(page, 'neg-002-open-redirect-blocked');

    const landedOffPlatform = page.url().startsWith('https://evil.example.com');
    expect.soft(landedOffPlatform, 'must NOT land on the attacker-controlled origin').toBe(false);

    // Hard assertion — the open-redirect must be blocked no matter what
    // safe URL the app chose to fall back to.
    expect(page.url().startsWith('https://evil.example.com')).toBe(false);
  });

  test('Neg 003 — Wrong password shows Authentik error', async ({ page, context }) => {
    await context.clearCookies();

    await page.goto(`${BASE_URL}/auth/sign-in`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(new RegExp(`^${AUTHENTIK_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), {
      timeout: 20_000,
    });

    await submitAuthentikCredentials(page, MEMBER_EMAIL, WRONG_PASSWORD);

    // Authentik's error text ("Invalid password") renders inside the
    // ak-stage-* web component's shadow DOM. Playwright's locator engine
    // pierces shadow roots by default (unlike `body.textContent()`, which
    // only reads the light DOM and — confirmed by direct observation —
    // misses the error text entirely, producing a false negative here).
    const errorMessage = page.getByText(/invalid|incorrect|failed|wrong/i).first();
    await expect(errorMessage).toBeVisible({ timeout: 10_000 });

    await shot(page, 'neg-003-wrong-password-error');

    const stillOnAuthentik = page.url().startsWith(AUTHENTIK_URL);
    expect.soft(stillOnAuthentik, 'must remain on Authentik login, not proceed to /me').toBe(true);

    const cookie = await findRefreshCookie(context);
    expect.soft(cookie, 'no aiqadam-refresh cookie should be set on failed login').toBeNull();

    const errorVisible = await errorMessage.isVisible().catch(() => false);
    expect
      .soft(errorVisible, 'Authentik should display a login error message')
      .toBe(true);

    // Hard assertion — exit state: no session was established.
    expect(cookie).toBeNull();
  });
});
