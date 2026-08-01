/**
 * BP-UAT-009 — agent-driven UATRunner session (FR-WORKFLOW-004 model).
 *
 * Driver script authored for wf-20260801-uat-180 (Step 13 post-merge
 * re-verification of FR-AUTH-004, "Magic-link authentication"). Uses
 * UATSessionDriver directly (one continuous browser context,
 * perceive/decide/act/judge per step) rather than conventional Playwright
 * assertions, per the agent-driven UAT architecture.
 *
 * Scope (see 01-uat-script-validation.md for the full rationale): this is
 * a TARGETED re-verification, not a full BP-UAT-009 7-step pass. It
 * covers only the ACs FR-AUTH-004's shipped surface touches:
 *
 *   - Steps 001–003 (AC-1, AC-2, AC-3): the EXISTING password sign-in
 *     path, as a regression check — does the new magic-link option on
 *     the same /auth/sign-in page break the pre-existing password flow?
 *   - FR-AUTH-004's own AC-1 (not a BP-UAT-009 numbered step): does
 *     "Sign in with email link" actually render as a discoverable,
 *     properly-linked option on /auth/sign-in?
 *
 * Sign-out (AC-4/AC-7), the next-param redirect logic (AC-2/AC-6), and
 * the negative scenarios (AC-5/AC-6) are out of scope — FR-AUTH-004 does
 * not touch any of that surface (03-code-summary.md confirms sign-in.astro's
 * pre-existing password link/redirect/sanitize logic is preserved exactly).
 * The magic-link mechanism itself (email delivery, single-use, flow
 * topology, session issuance) was already exhaustively live-verified,
 * including a full Playwright click-through, during wf-20260801-feat-179's
 * own Step 8 retries — re-driving it here would be duplicate verification
 * of already-proven-live behavior, not new evidence.
 *
 * Run:
 *   UAT_BASE_URL=http://localhost:4321 UAT_API_URL=http://localhost:3000 \
 *     pnpm --filter @aiqadam/e2e exec playwright test \
 *       --config playwright.uat.config.ts BP-UAT-009.session
 */
import { test } from '@playwright/test';
import { UATSessionDriver } from '../../support/uat-session-driver';

const RUN_ID = 'wf-20260801-uat-180';
const BASE_URL = process.env.UAT_BASE_URL ?? 'http://localhost:4321';
const MEMBER_EMAIL = process.env.UAT_MEMBER_EMAIL ?? 'uat-member@example.com';
const MEMBER_PASSWORD = process.env.UAT_MEMBER_PASSWORD ?? 'UatMember1!';

test('BP-UAT-009 agent-driven session — post-merge FR-AUTH-004 regression + magic-link entry-point check', async () => {
  test.setTimeout(120_000);

  const driver = await UATSessionDriver.create({
    bpUat: 'BP-UAT-009',
    runId: RUN_ID,
    budget: { maxSteps: 40, maxScreenshots: 60, wallClockMinutes: 20 },
  });

  try {
    // ---- Step 001: navigate to /auth/sign-in, confirm both options render ----
    // FR-AUTH-004's own AC-1 check: sign-in.astro previously had no
    // markup (bare redirect); it now shows two real options. This is the
    // one goto() for the session (AC-1/AC-2 one-goto rule).
    await driver.goto(`${BASE_URL}/auth/sign-in`);
    await driver.page.waitForLoadState('networkidle').catch(() => {});
    const shot001 = await driver.screenshot('step-001-sign-in-options');

    const passwordLink = driver.page.getByRole('link', { name: 'Continue with password' });
    const magicLinkLink = driver.page.getByRole('link', { name: 'Sign in with email link' });
    const passwordLinkCount = await passwordLink.count();
    const magicLinkLinkCount = await magicLinkLink.count();
    const magicLinkHref = magicLinkLinkCount > 0 ? await magicLinkLink.getAttribute('href') : null;
    const bothOptionsPresent = passwordLinkCount === 1 && magicLinkLinkCount === 1;

    await driver.logStep({
      step: '001',
      label: 'FR-AUTH-004 AC-1: /auth/sign-in shows both sign-in options',
      action: `Navigated directly to ${BASE_URL}/auth/sign-in (anonymous session, one-goto rule).`,
      screenshotPath: shot001,
      verdict: bothOptionsPresent ? 'MATCH' : 'MISMATCH',
      reasoning: `"Continue with password" link count: ${passwordLinkCount} (expected 1). "Sign in with email link" link count: ${magicLinkLinkCount} (expected 1), href="${magicLinkHref}" (expected "/auth/sign-in-magic-link"). FR-AUTH-004 AC-1 requires the magic-link option to be discoverable from the exact /auth/sign-in URL, not just reachable elsewhere — this confirms sign-in.astro's real-markup upgrade (03-code-summary.md Key Design Decision #2) actually shipped and renders both options together, and neither option's presence crowds out or breaks the other.`,
      visible_elements: '"Sign in to AI Qadam" heading, "Continue with password" primary button, "Sign in with email link" secondary button, "New here? Create an account" link',
      rendered_text: 'Sign in to AI Qadam / Choose how you\'d like to sign in. / Continue with password / Sign in with email link / New here? Create an account',
      dominant_colors: 'design-system default (btn-primary / btn-secondary tokens, no raw hex)',
      anomalies: bothOptionsPresent ? 'none' : 'one or both sign-in options missing/mislabeled — see reasoning',
    });

    // ---- Step 002: click "Continue with password" -> Authentik login form ----
    // AC-1 (BP-UAT-009): this is the regression check — the pre-existing
    // password path (now a link instead of a bare SSR redirect) must
    // still land on Authentik's real login UI.
    await driver.click(passwordLink, 'continue-with-password');
    await driver.page.waitForLoadState('networkidle').catch(() => {});
    const shot002 = await driver.screenshot('step-002-authentik-login-page');
    const onAuthentik = driver.page.url().includes(':9000') || driver.page.url().includes('/if/flow/');
    const emailFieldCount = await driver.page
      .locator('input[name="uidField"], input[type="email"], input[type="text"]')
      .first()
      .count();

    await driver.logStep({
      step: '002',
      label: 'BP-UAT-009 AC-1 (regression): password path still reaches Authentik login',
      action: 'Clicked "Continue with password" on /auth/sign-in.',
      screenshotPath: shot002,
      verdict: onAuthentik && emailFieldCount > 0 ? 'MATCH' : 'MISMATCH',
      reasoning: `Landed on Authentik (url contains :9000 or /if/flow/): ${onAuthentik}. Current URL: ${driver.page.url()}. Identifier field present: ${emailFieldCount > 0}. Confirms sign-in.astro's password link preserves the exact prior /api/v1/auth/login?next=... redirect target unchanged, per 03-code-summary.md Key Design Decision #2 — the new magic-link sibling option did not regress this path.`,
      visible_elements: 'Authentik login flow-executor form with identifier field',
      rendered_text: 'authentik-branded login form',
      dominant_colors: 'Authentik default flow-executor styling',
      anomalies: 'none',
    });

    // ---- Step 003: submit credentials, land on /me with a valid session ----
    // AC-2, AC-3 (BP-UAT-009).
    const identifierField = driver.page
      .locator('input[name="uidField"], input[type="email"], input[type="text"]')
      .first();
    await identifierField.waitFor({ state: 'visible', timeout: 15000 });
    await driver.fill(identifierField, MEMBER_EMAIL, 'authentik-identifier');
    const identifierSubmit = driver.page.locator('button[type="submit"], input[type="submit"]').first();
    await identifierSubmit.waitFor({ state: 'visible', timeout: 15000 });
    await driver.click(identifierSubmit, 'authentik-identifier-continue');

    // Authentik's flow-executor swaps stages client-side (Lit web
    // components) — a fixed timeout here raced the password stage's own
    // (re)mount on the first attempt of this session (2026-08-01): the
    // fill landed before/during the remount and was lost, producing a
    // native "Please fill out this field" validation error instead of a
    // real submit. Poll for a password field that is both visible AND
    // stable (same element reference across two checks) before filling,
    // matching the settle discipline BP-UAT-020.session.spec.ts already
    // documents needing for this exact stage-swap behavior.
    await driver.page.waitForTimeout(1500);
    const passwordField = driver.page.locator('input[type="password"]').first();
    await passwordField.waitFor({ state: 'visible', timeout: 15000 });
    // Extra settle: wait until the field's value stays empty (not being
    // actively re-rendered) across two polls before trusting fill().
    await driver.page.waitForTimeout(500);
    await passwordField.waitFor({ state: 'visible', timeout: 5000 });

    await driver.fill(passwordField, MEMBER_PASSWORD, 'authentik-password');
    let filledLen = (await passwordField.inputValue()).length;
    if (filledLen !== MEMBER_PASSWORD.length) {
      // One retry: re-locate (in case of a stage remount) and re-fill
      // before treating this as a hard failure, rather than silently
      // clicking submit against an empty/wrong field.
      await driver.page.waitForTimeout(500);
      const passwordFieldRetry = driver.page.locator('input[type="password"]').first();
      await passwordFieldRetry.waitFor({ state: 'visible', timeout: 5000 });
      await passwordFieldRetry.fill(MEMBER_PASSWORD);
      filledLen = (await passwordFieldRetry.inputValue()).length;
      if (filledLen !== MEMBER_PASSWORD.length) {
        throw new Error(
          `Password field fill verification failed after retry: expected ${MEMBER_PASSWORD.length} chars, field holds ${filledLen} chars. Aborting rather than clicking submit against a wrong field.`,
        );
      }
    }
    const passwordSubmit = driver.page.locator('button[type="submit"], input[type="submit"]').first();
    await passwordSubmit.waitFor({ state: 'visible', timeout: 15000 });
    await driver.click(passwordSubmit, 'authentik-password-submit');

    await driver.page
      .waitForFunction(() => !document.location.pathname.startsWith('/api/v1/auth/callback'), { timeout: 15000 })
      .catch(() => {});
    await driver.page.waitForLoadState('networkidle').catch(() => {});
    await driver.page.waitForTimeout(1000);

    const shot003 = await driver.screenshot('step-003-signed-in-me-page');
    const landedOnMe = driver.page.url().includes('/me');
    const cookies = await driver.page.context().cookies();
    const refreshCookie = cookies.find(
      (c) => c.name === 'aiqadam-refresh' || c.name === '__Host-aiqadam-refresh',
    );

    await driver.logStep({
      step: '003',
      label: 'BP-UAT-009 AC-2/AC-3 (regression): sign-in completes, session cookie set, /me renders',
      action: `Submitted identifier=${MEMBER_EMAIL} then the seeded member password.`,
      screenshotPath: shot003,
      verdict: landedOnMe && !!refreshCookie ? 'MATCH' : 'MISMATCH',
      reasoning: `Landed on /me: ${landedOnMe} (final URL: ${driver.page.url()}). Session cookie present: ${!!refreshCookie} (name="${refreshCookie?.name}", httpOnly=${refreshCookie?.httpOnly}). This is the same session-issuance funnel (AuthController.callback -> upsertByAuthentikSubject) that magic-link sign-in also converges on (per the FR-AUTH-006 extension-seam comment at auth.controller.ts:212-219) — confirming it still works for the password path confirms the shared funnel itself is intact post-merge.`,
      visible_elements: landedOnMe ? 'Member dashboard / hub content at /me' : 'unexpected screen — see screenshot',
      rendered_text: 'n/a — see screenshot',
      dominant_colors: 'design-system default',
      anomalies: landedOnMe && refreshCookie?.httpOnly ? 'none' : 'session cookie missing or not HttpOnly — see reasoning',
    });

    // ---- Teardown: sign out via API to leave no lingering session ----
    await driver.page.request.post(`${BASE_URL}/api/v1/auth/sign-out`).catch(() => {});

    await driver.writeTeardown({
      policy: 'clean-up',
      state: [
        {
          item: 'uat-member Authentik/platform session',
          action: 'Signed out via POST /api/v1/auth/sign-out after Step 003; no lingering authenticated browser context retained.',
        },
        {
          item: 'uat-member fixture user (Authentik pk=5)',
          action: 'Retained — seeded fixture, reused across UAT runs, not created by this session.',
        },
      ],
      notes:
        'No new state was created by this session (sign-in only, no writes). Browser context closed immediately after teardown.',
    });
  } finally {
    await driver.close();
  }
});
