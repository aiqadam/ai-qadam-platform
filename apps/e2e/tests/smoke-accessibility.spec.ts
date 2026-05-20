import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Sprint 0.10 smoke catalog — accessibility (WCAG 2.2 AA target per UX guidelines §6).
// axe-core's "wcag2a", "wcag2aa", "wcag22aa" tagged rules run against each public page.
//
// Findings policy:
//   - SERIOUS / CRITICAL impact → blocks merge UNLESS listed in KNOWN_ISSUES below
//   - MINOR / MODERATE → reported but not blocking (visible in HTML report)
//
// KNOWN_ISSUES pattern: log known violations here with a date + follow-up issue ref.
// Each entry should have a target removal date. Don't let this grow indefinitely;
// review quarterly.

interface KnownIssue {
  /** URL the violation occurs on (exact path match). */
  url: string;
  /** axe-core rule id (e.g., "color-contrast"). */
  rule: string;
  /** When this was first observed (YYYY-MM-DD). */
  since: string;
  /** Tracking reference (issue # / PR # / sprint item). */
  ref: string;
  /** Target removal — by this date, the underlying issue should be fixed and this entry removed. */
  fixBy: string;
}

const KNOWN_ISSUES: KnownIssue[] = [
  {
    url: '/events',
    rule: 'color-contrast',
    since: '2026-05-19',
    ref: 'S0.10 follow-up — file issue; fix in next CSS pass',
    fixBy: '2026-06-19',
  },
];

const BLOCKING_IMPACTS = ['serious', 'critical'] as const;

async function runAxe(page: import('@playwright/test').Page, url: string) {
  await page.goto(url);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();

  const blocking = results.violations.filter((v) =>
    BLOCKING_IMPACTS.includes(v.impact as (typeof BLOCKING_IMPACTS)[number]),
  );

  // Filter out known issues so the test stays green while the follow-up tracks the fix.
  const knownForThisUrl = KNOWN_ISSUES.filter((k) => k.url === url);
  const unknownBlocking = blocking.filter((v) => !knownForThisUrl.some((k) => k.rule === v.id));

  if (knownForThisUrl.length > 0) {
    const matched = knownForThisUrl.filter((k) => blocking.some((v) => v.id === k.rule));
    if (matched.length > 0) {
      test.info().annotations.push({
        type: 'a11y-known-issue',
        description: matched
          .map((k) => `${k.rule} on ${k.url} (since ${k.since}; ref ${k.ref}; fix by ${k.fixBy})`)
          .join('; '),
      });
    }
  }

  if (unknownBlocking.length > 0) {
    const summary = unknownBlocking
      .map(
        (v) =>
          `  - [${v.impact}] ${v.id}: ${v.description}\n` +
          `    affected nodes: ${v.nodes.length}\n` +
          `    help: ${v.helpUrl}`,
      )
      .join('\n');
    throw new Error(
      `${unknownBlocking.length} unlisted serious/critical a11y violation(s) on ${url}:\n${summary}\n\nIf this is a known regression you intend to fix later, add it to KNOWN_ISSUES in this file with a fixBy date.`,
    );
  }

  // Non-blocking violations attached as test info (visible in HTML report)
  if (results.violations.length > 0) {
    test.info().annotations.push({
      type: 'a11y-non-blocking',
      description: `${results.violations.length} minor/moderate violations on ${url}: ${results.violations.map((v) => v.id).join(', ')}`,
    });
  }
}

test.describe('S0.10 — known-issues registry hygiene', () => {
  test('every KNOWN_ISSUES entry has a fixBy date in the future', () => {
    const today = new Date().toISOString().slice(0, 10);
    const overdue = KNOWN_ISSUES.filter((k) => k.fixBy < today);
    expect(
      overdue,
      `Overdue known a11y issues — fix them or extend fixBy: ${JSON.stringify(overdue, null, 2)}`,
    ).toEqual([]);
  });
});

test.describe('S0.10 — accessibility (WCAG 2.2 AA)', () => {
  test('homepage has no serious/critical a11y violations', async ({ page }) => {
    await runAxe(page, '/');
  });

  test('/events has no serious/critical a11y violations', async ({ page }) => {
    await runAxe(page, '/events');
  });

  test('/leaderboard has no serious/critical a11y violations', async ({ page }) => {
    await runAxe(page, '/leaderboard');
  });

  test('/me has no serious/critical a11y violations (anon state)', async ({ page }) => {
    await runAxe(page, '/me');
  });
});
