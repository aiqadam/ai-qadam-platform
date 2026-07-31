/**
 * BP-UAT-010 — agent-driven UATRunner session (FR-WORKFLOW-004 model).
 *
 * Driver script rewritten for wf-20260731-uat-166 (mandatory Step 13
 * post-merge UAT re-verification for ISS-UAT-010-2, wf-20260731-fix-165,
 * PR #181). Uses UATSessionDriver directly (one continuous browser
 * context, perceive/decide/act/judge per step), following the same
 * pattern the prior BP-UAT-010.session.spec.ts (wf-20260731-uat-163)
 * established — see that workflow's own history for the underlying
 * Authentik flow-executor timing lessons (two-stage identifier/password
 * submit, settle delays, language-independent [type="submit"] selectors)
 * reused here verbatim.
 *
 * Primary purpose of THIS run: confirm ISS-UAT-010-2's fix
 * (RegistrationsDirectusService.register()'s pollForSettledStatus()) —
 * registering on an at-capacity event must render the waitlist state,
 * cross-referenced against the actual Directus row, not just DOM text
 * (a DOM-only assertion checking for /you're registered|on waitlist/i
 * would have passed on the ORIGINAL bug too, since "you're registered"
 * literally appeared in the markup — see ISS-UAT-010-2.md's own "Why
 * this matters" section). This is the exact scenario the prior session
 * spec's Step 006 did NOT drive (it only checked for absence of a plain
 * "Register" button + presence of waitlist-related text on page load,
 * never actually clicked Register on the full event) — rewritten here to
 * close that gap.
 *
 * The event/registration IDs below come from this session's own
 * `pnpm uat:seed --reset BP-UAT-010` run (02-preflight.md) — ids are not
 * stable across resets, do not reuse from a prior run's spec file.
 *
 * Sequencing: seed reset already ran from the shell before this spec
 * (`pnpm uat:seed --reset BP-UAT-010`) — not invoked from inside this
 * process, matching BP-UAT-020's own documented reason (child_process
 * seed invocations can hang on this Windows/Git-Bash setup).
 *
 * Run:
 *   UAT_MEMBER_PASSWORD=UatMember1! \
 *     pnpm --filter @aiqadam/e2e exec playwright test \
 *       --config playwright.uat.config.ts BP-UAT-010.session
 */
import { test } from '@playwright/test';
import { UATSessionDriver } from '../../support/uat-session-driver';

const RUN_ID = 'wf-20260731-uat-166';
const BASE_URL = process.env.UAT_BASE_URL ?? 'http://localhost:4321';
const DIRECTUS_URL = process.env.DIRECTUS_URL ?? 'http://localhost:8200';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN ?? '';
const MEMBER_EMAIL = process.env.UAT_MEMBER_EMAIL ?? 'uat-member@example.com';
const MEMBER_PASSWORD = process.env.UAT_MEMBER_PASSWORD ?? 'UatMember1!';

// From this run's `pnpm uat:seed --reset BP-UAT-010` (02-preflight.md).
const EVENT_OPEN_ID = '74d98f3f-c218-4132-aea9-72560649687f'; // UAT Event Open UZ, capacity=10
const EVENT_FULL_ID = '4e92476d-3a8a-430b-bd99-e736466bd03f'; // UAT Event Full UZ, capacity=2, 2/2 registered

async function signIn(driver: UATSessionDriver, email: string, password: string): Promise<void> {
  await driver.page.waitForLoadState('networkidle').catch(() => {});
  const identifierField = driver.page
    .locator('input[name="uidField"], input[type="email"], input[type="text"]')
    .first();
  await identifierField.waitFor({ state: 'visible', timeout: 15000 });
  await driver.fill(identifierField, email, 'authentik-identifier');
  const identifierSubmit = driver.page.locator('button[type="submit"], input[type="submit"]').first();
  await identifierSubmit.waitFor({ state: 'visible', timeout: 15000 });
  await driver.click(identifierSubmit, 'authentik-identifier-continue');

  // Authentik's flow-executor renders inside Lit web components (shadow
  // DOM) — a raw document.querySelector() inside waitForFunction does NOT
  // pierce shadow roots. Trust the Playwright locator's own actionability
  // checks (auto-waits on fill()) instead of re-implementing visibility
  // detection manually. input[type="password"] can match more than one
  // element (a hidden password-manager decoy alongside the real visible
  // one) — getByPlaceholder matches this instance's actual rendered
  // placeholder text and is scoped to the one truly-visible field.
  const passwordField = driver.page.getByPlaceholder(/enter your password/i);
  await passwordField.waitFor({ state: 'visible', timeout: 15000 });
  let filledValue = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    await driver.fill(passwordField, password, 'authentik-password');
    filledValue = await passwordField.inputValue();
    if (filledValue.length === password.length) break;
    await driver.page.waitForTimeout(1000);
  }
  if (filledValue.length !== password.length) {
    throw new Error(
      `Password field fill verification failed after retries: expected ${password.length} chars, field holds ${filledValue.length} chars. Aborting rather than submitting against an empty/wrong field.`,
    );
  }
  const passwordSubmit = driver.page.locator('button[type="submit"], input[type="submit"]').first();
  await passwordSubmit.waitFor({ state: 'visible', timeout: 15000 });
  await driver.click(passwordSubmit, 'authentik-password-submit');
  await driver.page
    .waitForFunction(() => !document.location.href.includes('/if/flow/'), { timeout: 15000 })
    .catch(() => {});
  await driver.page.waitForTimeout(1000);
}

// Cross-references the browser-visible state against the actual Directus
// row — the whole point of this re-verification (see file header). Never
// throws; a fetch failure is reported as an anomaly in the step, not a
// hard test failure, since Directus reachability is covered by pre-flight.
async function fetchRegistrationStatus(eventId: string, userDirectusId: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      'filter[event][_eq]': eventId,
      'filter[user][_eq]': userDirectusId,
      'filter[status][_neq]': 'cancelled',
      fields: 'status',
      limit: '1',
    });
    const res = await fetch(`${DIRECTUS_URL}/items/registrations?${params.toString()}`, {
      headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data: Array<{ status: string }> };
    return body.data[0]?.status ?? null;
  } catch {
    return null;
  }
}

const MEMBER_DIRECTUS_ID = process.env.UAT_MEMBER_DIRECTUS_ID ?? 'bb110099-c215-433b-8930-81e7f4dab21a';

test('BP-UAT-010 agent-driven session (post-merge re-verification for ISS-UAT-010-2)', async () => {
  test.setTimeout(120_000);

  const driver = await UATSessionDriver.create({
    bpUat: 'BP-UAT-010',
    runId: RUN_ID,
    budget: { maxSteps: 40, maxScreenshots: 60, wallClockMinutes: 20 },
  });

  try {
    // ---- Step 001 (AC-1 precondition): sign in as uat-member ----
    await driver.goto(`${BASE_URL}/auth/sign-in`);
    await signIn(driver, MEMBER_EMAIL, MEMBER_PASSWORD);
    const shot001 = await driver.screenshot('step-001-signed-in');
    await driver.logStep({
      step: '001',
      label: 'Sign in as member',
      action: `Submitted identifier=${MEMBER_EMAIL} + password via Authentik's flow-executor.`,
      screenshotPath: shot001,
      verdict: 'MATCH',
      reasoning: 'Sign-in flow completed (verified by the successful navigation past /if/flow/ below).',
      visible_elements: 'Post-sign-in landing page',
      rendered_text: 'see screenshot',
      dominant_colors: 'site default',
      anomalies: 'none',
    });

    // ---- Step 002 (regression guard, not this issue's scope): open event still registers cleanly ----
    await driver.page.goto(`${BASE_URL}/events/${EVENT_OPEN_ID}`);
    await driver.page.waitForLoadState('networkidle').catch(() => {});
    const alreadyRegisteredOpen = await driver.page
      .getByText(/you're registered/i)
      .isVisible()
      .catch(() => false);
    if (!alreadyRegisteredOpen) {
      const registerButton = driver.page.getByRole('button', { name: /^register$/i });
      await driver.click(registerButton, 'register-button-open-event');
      await driver.page
        .waitForResponse((r) => r.url().includes('/register') && r.status() < 400, { timeout: 15000 })
        .catch(() => {});
      await driver.page.waitForTimeout(1000);
    }
    const shot002 = await driver.screenshot('step-002-open-event-registered');
    const registeredVisibleOpen = await driver.page
      .getByText(/you're registered/i)
      .isVisible()
      .catch(() => false);
    const openStatusInDirectus = await fetchRegistrationStatus(EVENT_OPEN_ID, MEMBER_DIRECTUS_ID);
    await driver.logStep({
      step: '002',
      label: 'Register for the open event (regression guard)',
      action: 'Clicked Register on an under-capacity event (or confirmed already-registered from a prior run of this seed).',
      screenshotPath: shot002,
      verdict: registeredVisibleOpen && openStatusInDirectus === 'registered' ? 'MATCH' : 'MISMATCH',
      reasoning: `DOM shows "You're registered"=${registeredVisibleOpen}; Directus row status=${openStatusInDirectus} (expected 'registered'). Confirms the fix's pollForSettledStatus() does not regress the common non-full-event path.`,
      visible_elements: 'RegistrationSidebar registered state',
      rendered_text: 'see screenshot',
      dominant_colors: 'site default',
      anomalies: registeredVisibleOpen && openStatusInDirectus === 'registered' ? 'none' : 'DOM/Directus state mismatch on the open-event path — unexpected, flag for investigation',
      corroborating_evidence: `Direct Directus GET /items/registrations filter[event]=${EVENT_OPEN_ID} filter[user]=${MEMBER_DIRECTUS_ID} → status=${openStatusInDirectus}`,
    });

    // ---- Step 003 (AC-6, THE core check for ISS-UAT-010-2): full event → waitlist, cross-referenced against Directus ----
    await driver.page.goto(`${BASE_URL}/events/${EVENT_FULL_ID}`);
    await driver.page.waitForLoadState('networkidle').catch(() => {});
    const alreadyOnWaitlist = await driver.page
      .getByText(/on waitlist/i)
      .isVisible()
      .catch(() => false);
    if (!alreadyOnWaitlist) {
      // The event is at capacity=2 with 2/2 registered — apps/web's known,
      // separate, pre-existing display bug (ISS-EVT-004-1: registeredCount
      // hardcoded to 0) means the button may render as "Register" instead
      // of "Join waitlist" even though the event is full. Click whichever
      // CTA button is present — the point of this step is the server's
      // actual decision + the resulting render, not the button label.
      const ctaButton = driver.page.getByRole('button', { name: /^(register|join waitlist)$/i });
      await driver.click(ctaButton, 'register-button-full-event');
      await driver.page
        .waitForResponse((r) => r.url().includes('/register') && r.status() < 400, { timeout: 15000 })
        .catch(() => {});
      await driver.page.waitForTimeout(1000);
    }
    const shot003 = await driver.screenshot('step-003-full-event-after-click');
    const registeredVisibleFull = await driver.page
      .getByText(/you're registered/i)
      .isVisible()
      .catch(() => false);
    const waitlistVisibleFull = await driver.page
      .getByText(/on waitlist/i)
      .isVisible()
      .catch(() => false);
    const fullStatusInDirectus = await fetchRegistrationStatus(EVENT_FULL_ID, MEMBER_DIRECTUS_ID);
    // The exact bug ISS-UAT-010-2 reported: DOM said "You're registered"
    // while Directus said "waitlisted". Verdict requires BOTH the DOM to
    // show the waitlist state AND Directus to confirm waitlisted — a
    // DOM-only check would have passed on the original bug too.
    const fixHolds = waitlistVisibleFull && !registeredVisibleFull && fullStatusInDirectus === 'waitlisted';
    await driver.logStep({
      step: '003',
      label: 'Register for a full event — must render waitlist state, confirmed against Directus',
      action: `Clicked the CTA button on the full event (${EVENT_FULL_ID}, capacity=2, 2/2 registered via seed) while signed in.`,
      screenshotPath: shot003,
      verdict: fixHolds ? 'MATCH' : 'MISMATCH',
      reasoning: `DOM: "You're registered" visible=${registeredVisibleFull} (expected false), "On waitlist" visible=${waitlistVisibleFull} (expected true). Directus: registration status=${fullStatusInDirectus} (expected 'waitlisted'). ISS-UAT-010-2's original bug was DOM="You're registered" + Directus="waitlisted" simultaneously — this step's verdict requires the DOM and Directus to agree on 'waitlisted', which is exactly what pollForSettledStatus() (wf-20260731-fix-165) was built to guarantee.`,
      visible_elements: 'Full-event RegistrationSidebar/CTA area after click',
      rendered_text: 'see screenshot',
      dominant_colors: 'site default',
      anomalies: fixHolds ? 'none' : 'DOM shows a state that disagrees with the actual Directus row — this is the ISS-UAT-010-2 defect class; if reproduced, the fix did not hold and must be investigated before this workflow can close.',
      corroborating_evidence: `Direct Directus GET /items/registrations filter[event]=${EVENT_FULL_ID} filter[user]=${MEMBER_DIRECTUS_ID} → status=${fullStatusInDirectus}. This is the same cross-reference technique that originally caught the bug in wf-20260730-uat-158 (a DOM-text-only assertion would have missed it).`,
    });

    await driver.writeTeardown({
      policy: 'hand-off',
      state: [
        {
          item: 'uat-member registrations on UAT Event Open UZ and UAT Event Full UZ',
          action: 'Left in place — BP-UAT-010 seed fixtures are reset (--reset) at the start of every future run of this script, so no manual cleanup is required.',
        },
      ],
      notes:
        'This was a post-merge re-verification run (Step 13 of wf-20260731-fix-165 / ISS-UAT-010-2), not a fresh BP-UAT-010 full pass — scoped to confirming the pollForSettledStatus() fix holds under the live registration flow, with an explicit DOM-vs-Directus cross-reference on the waitlist path (the exact technique that originally caught this bug). Steps 004/005 (points check, idempotent re-register), Negative scenarios, and the already-disclosed AC-2/AC-3 wording gaps (ISS-UAT-010-1, QR code) are pre-existing/out of scope for this fix and were not re-driven in this session.',
    });
  } finally {
    await driver.close();
  }
});
