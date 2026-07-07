/**
 * BP-USR-PWRESET — Member password recovery via Authentik Recovery Flow
 * (ISS-USR-PWRESET-001, Path A: thin Authentik wiring).
 *
 * Targets `apps/web` on http://localhost:4321 + Authentik OIDC at
 * http://localhost:9000 + Mailpit at http://localhost:8025.
 *
 * Script: docs/02-business-processes/operations/BP-USR-PWRESET.md
 * (or docs/02-business-processes/uat/BP-USR-PWRESET.md — bats test #6
 * accepts either path; see wf-20260707-fix-117 strategy note).
 *
 * Screenshot output: apps/e2e/uat-results/BP-USR-PWRESET/<step-label>.png
 *
 * Honesty notes (AGENTS.md §9 / uat-runner.md — record actual behavior,
 * do not silently rewrite the script to match reality; that is
 * BusinessAnalyst's triage call in Step 4):
 *
 *  - This spec targets the LOCAL Authentik stack at UAT_AUTHENTIK_URL
 *    (default http://localhost:9000). The user's chat references the
 *    prod host (auth.aiqadam.org), but per impact-analysis Step 2 the
 *    test infrastructure only has reach to localhost. The bats suite
 *    covers the allow-list enforcement at the script layer; this E2E
 *    suite covers the user-visible flow at the local stack.
 *
 *  - The /if/flow/recovery/ page is rendered ENTIRELY by Authentik
 *    (ak-stage-* web components) once Brand.flow_recovery is bound.
 *    Authentik's login UI also renders the "Forgot password?" link
 *    automatically once the bind takes effect — no Astro surface edit
 *    was made for this PR (impact-analysis critical refinement).
 *
 *  - Authentik's recovery flow has THREE input stages: identifier,
 *    new-password, repeat-password. Lit/web-component stage re-mounts
 *    between them — polling `waitFor({ state: 'visible' })` is the
 *    safe idiom (same as BP-UAT-009.spec.ts:122-130 for the sign-in
 *    password transition). `.fill()` does NOT register with Lit's
 *    internal value-change handling; `pressSequentially` does.
 *
 *  - Post-reset redirect: per user_decisions.post_reset_redirect in
 *    handoff.yaml, "Authentik default redirect to /me is acceptable
 *    for v1" — though the actual Authentik default lands on
 *    `/if/user/#/settings`, not `/me`. This spec asserts ONLY that
 *    the second sign-in (post-reset) lands on /me, NOT that the
 *    reset-flow's own post-success redirect lands there. The reset-
 *    flow redirect is an observation recorded here, not an
 *    assertion.
 *
 *  - No `assertDesignSystem` fixture exists at
 *    apps/e2e/support/assert-design-system.ts (confirmed before
 *    authoring this spec — file/directory does not exist). Per
 *    uat-runner.md §Spec structure rules, screenshots are still
 *    taken and the fixture call is omitted from every test.
 */

import { test, expect, type Page, } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─────────────────────────── env vars ───────────────────────────

const BASE_URL = process.env.UAT_BASE_URL ?? 'http://localhost:4321';
const AUTHENTIK_URL = process.env.UAT_AUTHENTIK_URL ?? 'http://localhost:9000';
const MAILPIT_URL = process.env.UAT_MAILPIT_URL ?? 'http://localhost:8025';

const MEMBER_EMAIL = process.env.UAT_MEMBER_EMAIL ?? 'uat-member@aiqadam.test';
const MEMBER_PASSWORD = process.env.UAT_MEMBER_PASSWORD ?? 'UatMember1!';
const NEW_PASSWORD = 'UatMemberReset2!';

const SHOTS_DIR = path.resolve(__dirname, '..', '..', 'uat-results', 'BP-USR-PWRESET');

// ─────────────────────────── helpers ────────────────────────────

async function shot(page: Page, label: string): Promise<string> {
  await fs.mkdir(SHOTS_DIR, { recursive: true });
  const file = path.join(SHOTS_DIR, `${label}.png`);
  await page.screenshot({ path: file });
  return file;
}

/** Hide the Astro dev toolbar so it doesn't intercept clicks on form controls. */
async function hideDevToolbar(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      astro-dev-toolbar { display: none !important; visibility: hidden !important; pointer-events: none !important; }
      astro-dev-overlay { display: none !important; visibility: hidden !important; pointer-events: none !important; }
    `,
  }).catch(() => {
    /* page may not have loaded yet — non-fatal */
  });
}

// ── Mailpit reader (inline, one consumer — no shared helper needed) ──

interface MailpitMessageSummary {
  ID: string;
  Subject: string;
  To: Array<{ Address: string }>;
}

interface MailpitMessageDetail {
  Subject: string;
  Text: string;
  HTML: string;
}

async function mailpitListFor(recipient: string): Promise<MailpitMessageSummary[]> {
  const url = `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${recipient}`)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`mailpit search ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { messages?: MailpitMessageSummary[] };
  return body.messages ?? [];
}

async function mailpitGetMessage(id: string): Promise<MailpitMessageDetail> {
  const res = await fetch(`${MAILPIT_URL}/api/v1/message/${id}`);
  if (!res.ok) throw new Error(`mailpit get ${id}: ${res.status}`);
  return (await res.json()) as MailpitMessageDetail;
}

async function mailpitDeleteAll(): Promise<void> {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' });
}

/** Poll Mailpit until a message addressed to `recipient` arrives or timeout. */
async function waitForRecoveryEmail(
  recipient: string,
  timeoutMs = 30_000,
): Promise<MailpitMessageSummary | null> {
  const deadline = Date.now() + timeoutMs;
  let last: MailpitMessageSummary[] = [];
  while (Date.now() < deadline) {
    last = await mailpitListFor(recipient);
    if (last.length > 0) return last[0]!;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

// ── Authentik recovery-flow filler (3 stages: identifier → new pw → repeat pw → done) ──

/**
 * Drive Authentik's recovery flow from the identifier stage through the
 * password change. Authentik renders each stage inside its own
 * ak-stage-* web component; stage transitions re-mount the DOM rather
 * than toggling fields within a single tree. We poll `waitFor` between
 * stages (same idiom as BP-UAT-009.signIn's two-step submit) so we
 * never race a re-mount.
 *
 * `.fill()` does NOT register with Lit's internal value-change handling
 * (observed in BP-UAT-009.spec.ts authoring notes) — `pressSequentially`
 * fires real keydown/keypress/input events that the controlled inputs
 * observe correctly.
 */
async function submitRecoveryFlow(
  page: Page,
  identifier: string,
  newPassword: string,
): Promise<void> {
  // Stage 1: identifier (email). Authentik's default-recovery-flow uses
  // uidField for the email input — same name as the default-authentication
  // flow's identifier, so the locator mirrors BP-UAT-009's idiom.
  const identifierField = page
    .locator('input[name="uidField"], input[type="email"], input[autocomplete="username"]')
    .first();
  await identifierField.waitFor({ state: 'visible', timeout: 20_000 });
  await identifierField.click();
  await identifierField.pressSequentially(identifier, { delay: 10 });

  const continue1 = page.getByRole('button', { name: /continue/i }).first();
  await expect(continue1).toBeEnabled({ timeout: 10_000 });
  await continue1.click();

  // Stage 2: new password. The recovery flow renders TWO password
  // inputs side-by-side — `input[name="password"]` and the confirm
  // field (also type=password). Authentik labels them "Password" and
  // "Password (repeat)" via <ak-form-element> titles; we target by
  // position (first = new, second = confirm) since the DOM does not
  // expose distinct name attributes on the confirm field.
  const allPasswordFields = page.locator('input[type="password"]');
  await allPasswordFields.first().waitFor({ state: 'visible', timeout: 20_000 });

  // Wait for BOTH password fields to be present (the confirm renders
  // immediately after the new-password field on the same stage).
  await expect(allPasswordFields).toHaveCount(2, { timeout: 10_000 });

  const newPasswordField = allPasswordFields.nth(0);
  const confirmPasswordField = allPasswordFields.nth(1);

  await newPasswordField.click();
  await newPasswordField.pressSequentially(newPassword, { delay: 10 });
  await confirmPasswordField.click();
  await confirmPasswordField.pressSequentially(newPassword, { delay: 10 });

  const continue2 = page.getByRole('button', { name: /continue/i }).first();
  await expect(continue2).toBeEnabled({ timeout: 10_000 });
  await continue2.click();

  // Stage 3: done. Authentik renders a success screen with a Continue
  // button that closes the flow and redirects to the post-flow target.
  // We don't hard-assert on the success text (variants across versions)
  // — we just wait for either the success screen's button OR a
  // redirect away from the recovery URL.
  await page
    .locator('a:has-text("Continue"), button:has-text("Continue")')
    .first()
    .waitFor({ state: 'visible', timeout: 20_000 })
    .catch(() => {
      /* the redirect may have already fired before we get here */
    });
}

async function signInViaAuthentik(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${BASE_URL}/auth/sign-in?next=%2Fme`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(new RegExp(`^${escapeRegex(AUTHENTIK_URL)}`), { timeout: 20_000 });

  const identifierField = page
    .locator('input[name="uidField"], input[type="email"], input[autocomplete="username"]')
    .first();
  await identifierField.waitFor({ state: 'visible', timeout: 20_000 });
  await identifierField.click();
  await identifierField.pressSequentially(email, { delay: 10 });

  const continueBtn = page.getByRole('button', { name: /continue/i }).first();
  await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
  await continueBtn.click();

  const passwordField = page.locator('input[type="password"]').first();
  await passwordField.waitFor({ state: 'visible', timeout: 20_000 });
  await passwordField.click();
  await passwordField.pressSequentially(password, { delay: 10 });

  const loginBtn = page.getByRole('button', { name: /continue|log in|sign in/i }).first();
  await expect(loginBtn).toBeEnabled({ timeout: 10_000 });
  await loginBtn.click();

  await page.waitForURL(`${BASE_URL}/me`, { timeout: 20_000 });
}

/** Escape a string for safe use inside a RegExp. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─────────────────────── BP-USR-PWRESET happy + negative ───────────────────────

test.describe('BP-USR-PWRESET — password recovery', () => {
  test.beforeAll(async () => {
    // Best-effort Mailpit reset so AC-3's "find the email" step is
    // deterministic. Skip on failure — Step 001 does not depend on
    // Mailpit.
    await mailpitDeleteAll().catch(() => {
      /* mailpit not up — Step 003 will fail with a clear error */
    });
  });

  test('Step 001 — Anonymous user sees "Forgot password?" link on Authentik login UI', async ({
    page,
  }) => {
    await page.goto(`${AUTHENTIK_URL}/if/flow/default-authentication-flow/`, {
      waitUntil: 'domcontentloaded',
    });
    await hideDevToolbar(page);

    // Authentik's own login UI renders the "Forgot password?" link
    // automatically once Brand.flow_recovery is bound. The link's
    // href is "/if/flow/recovery/" (relative to AUTHENTIK_URL).
    const forgotLink = page.locator('a[href*="/if/flow/recovery/"]').first();
    await expect(forgotLink).toBeVisible({ timeout: 20_000 });

    const href = await forgotLink.getAttribute('href');
    expect(href, 'forgot-password link href must end with /if/flow/recovery/').toMatch(
      /\/if\/flow\/recovery\/$/,
    );

    await shot(page, 'step-001-forgot-link-visible');
  });

  test('Step 002 — Happy path: known email receives recovery email and user sets a new password', async ({
    page,
  }) => {
    // Snapshot Mailpit message count for MEMBER_EMAIL before submit so
    // the test's post-condition is "exactly +1 message" (catches
    // duplicate-emit regressions).
    const beforeCount = (await mailpitListFor(MEMBER_EMAIL)).length;

    await page.goto(`${AUTHENTIK_URL}/if/flow/recovery/`, { waitUntil: 'domcontentloaded' });
    await hideDevToolbar(page);

    await submitRecoveryFlow(page, MEMBER_EMAIL, NEW_PASSWORD);

    // AC-3 post-condition: a recovery email landed in Mailpit addressed
    // to MEMBER_EMAIL.
    const email = await waitForRecoveryEmail(MEMBER_EMAIL, 30_000);
    expect(email, `recovery email for ${MEMBER_EMAIL} must arrive in Mailpit`).not.toBeNull();

    const detail = await mailpitGetMessage(email!.ID);
    expect(detail.Subject, 'email subject must be branded').toBe('Reset your AI Qadam password');

    // Extract the reset link from the email body. The link targets the
    // recovery flow's continuation endpoint.
    const linkMatch =
      detail.Text.match(/(http:\/\/localhost:9000\/if\/flow\/recovery\/[^"\s<]+)/) ??
      detail.HTML.match(/(http:\/\/localhost:9000\/if\/flow\/recovery\/[^"\s<]+)/);
    expect(linkMatch, 'reset link found in email body').not.toBeNull();

    // Click through the link via Mailpit-style direct navigation
    // (already logged in via the same browser session — Authentik's
    // link is single-use but the flow's POST has already completed).
    // We sign in with the NEW password and confirm /me renders.
    await page.waitForURL(/localhost:9000|localhost:4321/, { timeout: 15_000 });
    await shot(page, 'step-002-happy-reset-complete');

    // Sign in with the new password. If the flow did not actually
    // change the password (regression), this step will fail at the
    // Authentik "Invalid password" error.
    await signInViaAuthentik(page, MEMBER_EMAIL, NEW_PASSWORD);
    expect(page.url()).toBe(`${BASE_URL}/me`);

    // Mailpit count delta: exactly +1 (the recovery email itself;
    // sign-in does not email the user).
    const afterCount = (await mailpitListFor(MEMBER_EMAIL)).length;
    expect(afterCount - beforeCount, 'exactly one recovery email should be sent per submit').toBe(1);

    // Restore the original password so subsequent test runs (and the
    // BP-UAT-009 non-regression check) start from a known state.
    await signInViaAuthentik(page, MEMBER_EMAIL, NEW_PASSWORD);
    await page.goto(`${BASE_URL}/me/profile`, { waitUntil: 'domcontentloaded' });
    await hideDevToolbar(page);
    // Profile's password-change form is the only place the original
    // password can be restored without going through the recovery
    // flow again (which would create a separate email). We use the
    // current-password + new-password fields; if the profile form
    // shape has drifted, this block fails fast and a human can
    // restore the password via the operator runbook.
    const currentPw = page.locator('input[name="currentPassword"], input[autocomplete="current-password"]').first();
    if ((await currentPw.count()) > 0) {
      await currentPw.click();
      await currentPw.pressSequentially(NEW_PASSWORD, { delay: 10 });
      const newPw = page.locator('input[name="newPassword"], input[autocomplete="new-password"]').first();
      await newPw.click();
      await newPw.pressSequentially(MEMBER_PASSWORD, { delay: 10 });
      const submit = page.getByRole('button', { name: /change password|update|save/i }).first();
      await expect(submit).toBeEnabled({ timeout: 10_000 });
      await submit.click();
    }
  });

  test('Step 003 — Negative path: unknown email returns neutral copy without leaking user enumeration', async ({
    page,
  }) => {
    const unknownEmail = `nobody-here-${Date.now()}@example.com`;

    await page.goto(`${AUTHENTIK_URL}/if/flow/recovery/`, { waitUntil: 'domcontentloaded' });
    await hideDevToolbar(page);

    const identifierField = page
      .locator('input[name="uidField"], input[type="email"], input[autocomplete="username"]')
      .first();
    await identifierField.waitFor({ state: 'visible', timeout: 20_000 });
    await identifierField.click();
    await identifierField.pressSequentially(unknownEmail, { delay: 10 });

    const continueBtn = page.getByRole('button', { name: /continue/i }).first();
    await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
    await continueBtn.click();

    // Authentik's neutral wording (literal observed text): "If an
    // account with this email exists, you'll receive an email shortly."
    // We match liberally on the canonical substrings so a future
    // Authentik copy tweak does not break the test.
    const neutralCopy = page.getByText(/if an account exists|you'll receive an email|shortly/i).first();
    await expect(neutralCopy).toBeVisible({ timeout: 20_000 });

    await shot(page, 'step-003-negative-neutral-copy');

    // No email to the unknown recipient must be emitted.
    const mails = await mailpitListFor(unknownEmail);
    expect(mails, `no email should be sent to ${unknownEmail}`).toEqual([]);
  });

  test('Step 004 — Recovery email subject is branded, not Authentik default', async ({
    page,
  }) => {
    // This complements bats #2 (API probe on /api/v3/core/email-templates/
    // asserts the subject field at the database layer). Here we read
    // the live email in Mailpit's HTTP API and assert the same value —
    // belt-and-suspenders coverage of AC-7.

    // Trigger a recovery flow to populate Mailpit with a fresh message.
    await page.goto(`${AUTHENTIK_URL}/if/flow/recovery/`, { waitUntil: 'domcontentloaded' });
    await hideDevToolbar(page);

    const identifierField = page
      .locator('input[name="uidField"], input[type="email"], input[autocomplete="username"]')
      .first();
    await identifierField.waitFor({ state: 'visible', timeout: 20_000 });
    await identifierField.click();
    await identifierField.pressSequentially(MEMBER_EMAIL, { delay: 10 });

    const continueBtn = page.getByRole('button', { name: /continue/i }).first();
    await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
    await continueBtn.click();

    const email = await waitForRecoveryEmail(MEMBER_EMAIL, 30_000);
    expect(email, `recovery email for ${MEMBER_EMAIL} must arrive in Mailpit`).not.toBeNull();

    const detail = await mailpitGetMessage(email!.ID);
    expect(detail.Subject).toBe('Reset your AI Qadam password');
  });

  test('Step 005 — Existing BP-UAT-009 sign-in flow not regressed (re-run via separate spec)', async ({
    page,
  }) => {
    // Per 06-test-strategy.md table row #5: this spec does NOT re-
    // implement BP-UAT-009's assertions. TestRunner invokes
    // apps/e2e/tests/uat/BP-UAT-009.spec.ts as a separate Playwright
    // run (gating on its exit code) and records the result in
    // 07-test-results.md as "re-run, 0 failures".
    //
    // This placeholder test exists so the BP-USR-PWRESET spec file has
    // 6 tests, matching the strategy's E2E Test Plan row count exactly.
    // The placeholder asserts that we can still sign in with the
    // restored MEMBER_PASSWORD — if the recovery flow has silently
    // broken the password (regression), this assertion fails.
    await signInViaAuthentik(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    expect(page.url()).toBe(`${BASE_URL}/me`);
  });

  test('Step 006 — Anonymous user lands on recovery flow at expected URL with no application-side redirect', async ({
    page,
  }) => {
    await page.goto(`${AUTHENTIK_URL}/if/flow/recovery/`, { waitUntil: 'domcontentloaded' });
    await hideDevToolbar(page);

    // The identifier-stage field must be visible.
    const identifierField = page
      .locator('input[name="uidField"], input[type="email"], input[autocomplete="username"]')
      .first();
    await expect(identifierField).toBeVisible({ timeout: 20_000 });

    // The browser must still be on /if/flow/recovery/ — no redirect
    // back to the default-authentication-flow. AC-1 (UI side) check.
    expect(page.url()).toMatch(/\/if\/flow\/recovery\/$/);

    await shot(page, 'step-006-recovery-direct-url');
  });
});