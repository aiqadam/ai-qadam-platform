// smoke-content-pages.spec.ts — E2E tests for FR-CMS-007's four new
// public content pages: About Us (/about), Community Rules & Documents
// (/rules + /rules/[slug]), Events & History (/history), Partner With
// Us (/partners).
//
// Pattern: follows smoke-onboarding.spec.ts / smoke-public.spec.ts
// (test.describe blocks, `page` fixture for DOM assertions, `request`
// fixture for HTTP-status-only checks). Selectors live in
// support/content-pages.page.ts (Page Object Model) — no raw locators
// in test bodies here, per test-designer.md.
//
// Base URL: defaults to https://aiqadam.org (playwright.config.ts);
// override with BASE_URL=http://localhost:4321 for local dev. Assumes
// the Directus content_pages/content_documents collections are seeded
// (infrastructure/directus/bootstrap.sh + seed-content-documents.sh) —
// see 03-code-summary.md. Read-only — no writes.
//
// FR-CMS-007. Test strategy: 06-test-strategy.md.

import { expect, test } from '@playwright/test';
import {
  AboutPage,
  ContentPagesApi,
  HistoryPage,
  NavFooterFixture,
  PartnersPage,
  RulesDocumentPage,
  RulesLibraryPage,
  setLocale,
} from '../support/content-pages.page';

const BASE_URL = process.env.BASE_URL ?? 'https://aiqadam.org';

// ─── About Us (AC-1) ─────────────────────────────────────────────────────────

test.describe('FR-CMS-007 — /about', () => {
  test('renders with mission, principles/governance body, chapters, leadership, tagline (en)', async ({
    page,
  }) => {
    const about = new AboutPage(page);
    const response = await page.goto('/about', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    await expect(about.heading()).toBeVisible();
    await expect(about.chapterModelHeading()).toBeVisible();
    await expect(about.leadershipHeading()).toBeVisible();
    await expect(about.closingTagline()).toBeVisible();
  });

  test('renders in Russian when the locale cookie is set to ru', async ({ page, context }) => {
    await setLocale(context, 'ru', BASE_URL);
    const response = await page.goto('/about', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    await expect(page.getByText("Модель chapter'ов")).toBeVisible();
    await expect(page.getByText('Команда')).toBeVisible();
  });
});

// ─── Events & History (AC-5) ─────────────────────────────────────────────────

test.describe('FR-CMS-007 — /history', () => {
  test('renders founding timeline, both meetup recaps, growth + roadmap (en)', async ({
    page,
  }) => {
    const history = new HistoryPage(page);
    const response = await page.goto('/history', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    await expect(history.heading()).toBeVisible();
    await expect(history.foundingTimelineHeading()).toBeVisible();
    await expect(history.meetup1Heading()).toBeVisible();
    await expect(history.meetup2Heading()).toBeVisible();
    await expect(history.growthHeading()).toBeVisible();
    await expect(history.roadmapHeading()).toBeVisible();
  });

  test('renders in Russian when the locale cookie is set to ru', async ({ page, context }) => {
    await setLocale(context, 'ru', BASE_URL);
    const response = await page.goto('/history', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    await expect(page.getByText('Хронология основания')).toBeVisible();
    await expect(page.getByText('Митап №1')).toBeVisible();
    await expect(page.getByText('Митап №2')).toBeVisible();
  });
});

// ─── Partner With Us (AC-6) ──────────────────────────────────────────────────

test.describe('FR-CMS-007 — /partners', () => {
  test('renders tiers, current partners, regulator value prop, sponsorship CTA (en, complete)', async ({
    page,
  }) => {
    const partners = new PartnersPage(page);
    const response = await page.goto('/partners', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    await expect(partners.heading()).toBeVisible();
    await expect(partners.tiersHeading()).toBeVisible();
    await expect(partners.currentPartnersHeading()).toBeVisible();
    await expect(partners.regulatorHeading()).toBeVisible();
    await expect(partners.sponsorshipCtaLink()).toBeVisible();
    await expect(partners.sponsorshipCtaLink()).toHaveAttribute(
      'href',
      'mailto:partners@aiqadam.org',
    );
  });

  test('renders without a 500 and shows the regulator-sourced RU content, even though sponsorship-deck-ru is partial (AC-6)', async ({
    page,
    context,
  }) => {
    await setLocale(context, 'ru', BASE_URL);
    const response = await page.goto('/partners', { waitUntil: 'domcontentloaded' });

    // The known content gap (font-embedding defect in the RU sponsorship
    // deck) must never surface as a 500 — that's the AC-6 contract.
    expect(response?.status()).toBe(200);
    expect(response?.status()).not.toBe(500);

    // Structural RU strings (i18n locale JSON, not Directus body_md) must
    // still render — these are locale-complete regardless of the PDF gap.
    await expect(page.getByText('Партнёрство')).toBeVisible();
    await expect(page.getByText('Для регуляторов и госфондов')).toBeVisible();

    // No raw error/stack trace leaking into the response body.
    const body = await page.content();
    expect(body).not.toMatch(/internal server error|unhandled exception|stack trace/i);
  });
});

// ─── Community Rules & Documents library (AC-2) ──────────────────────────────

test.describe('FR-CMS-007 — /rules (library)', () => {
  test('lists exactly the 5 seeded documents, each linking to a distinct /rules/[slug]', async ({
    page,
  }) => {
    const rules = new RulesLibraryPage(page);
    const response = await page.goto('/rules', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    await expect(rules.heading()).toBeVisible();
    await expect(rules.documentEntries()).toHaveCount(5);

    for (const slug of ContentPagesApi.ruleDocumentSlugs) {
      await expect(rules.documentLink(slug)).toHaveCount(1);
    }
  });

  test('renders in Russian with no locale toggle (ru-only for this pass, AC-2)', async ({
    page,
  }) => {
    const response = await page.goto('/rules', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    // The page's own title/eyebrow are RU by default (no en fallback
    // offered here) — matches AC-2's explicit ru-only scope.
    await expect(page.getByText('Правила и документы сообщества').first()).toBeVisible();
  });
});

// ─── Document detail — terminology preserved verbatim (AC-3) ────────────────

test.describe('FR-CMS-007 — /rules/[slug] — terminology preserved verbatim (AC-3)', () => {
  test('global-board-polozhenie-v1 keeps "Founder Global" and does not contain "Хранитель"', async ({
    page,
  }) => {
    const doc = new RulesDocumentPage(page);
    const response = await doc.goto('global-board-polozhenie-v1');
    expect(response?.status()).toBe(200);

    const body = await doc.bodyText().innerText();
    expect(body).toContain('Founder Global');
    expect(body).not.toContain('Хранитель');
  });

  test('soglashenie-v1 keeps "Основатель" verbatim', async ({ page }) => {
    const doc = new RulesDocumentPage(page);
    const response = await doc.goto('soglashenie-v1');
    expect(response?.status()).toBe(200);

    const body = await doc.bodyText().innerText();
    expect(body).toContain('Основатель');
  });
});

// ─── Superseded-document labels (AC-4) ───────────────────────────────────────

test.describe('FR-CMS-007 — /rules/[slug] — superseded label (AC-4)', () => {
  test('global-board-polozhenie-v1 and soglashenie-v1 show a visible superseded label, full body intact', async ({
    page,
  }) => {
    const doc = new RulesDocumentPage(page);

    for (const slug of ['global-board-polozhenie-v1', 'soglashenie-v1'] as const) {
      const response = await doc.goto(slug);
      expect(response?.status()).toBe(200);
      await expect(doc.supersededBadge()).toBeVisible();

      // Full body still present (not truncated/redacted/redirected).
      const body = await doc.bodyText().innerText();
      expect(body.length).toBeGreaterThan(200);
    }
  });

  test('current documents (manifesto, charter-v0-1, kazakhstan-mou) carry no superseded label', async ({
    page,
  }) => {
    const doc = new RulesDocumentPage(page);

    for (const slug of ['manifesto', 'charter-v0-1', 'kazakhstan-mou'] as const) {
      const response = await doc.goto(slug);
      expect(response?.status()).toBe(200);
      await expect(doc.supersededBadge()).toHaveCount(0);
    }
  });
});

// ─── 404 handling ─────────────────────────────────────────────────────────────

test.describe('FR-CMS-007 — /rules/[slug] — unknown slug', () => {
  test('unknown document slug returns a real 404, not a redirect or 500', async ({ request }) => {
    const res = await request.get('/rules/not-a-real-document', { maxRedirects: 0 });
    expect(res.status()).toBe(404);
  });

  test('path-traversal-shaped slug returns 404, not 500', async ({ request }) => {
    const res = await request.get('/rules/../etc/passwd', { maxRedirects: 0 });
    expect(res.status()).toBe(404);
  });
});

// ─── Directus-unreachable fallback (AC-8) ────────────────────────────────────
//
// Precedent check (per TestDesigner task instructions): apps/e2e has NO
// existing mechanism to simulate Directus being down — confirmed by
// searching the whole suite (README.md's own "What this is NOT (yet)"
// section: this suite is read-only, defaults to the live production
// target, and has no docker-compose/container-orchestration hook
// reachable from a spec file). BP-UAT-010's spec files call Directus
// directly as a read oracle (DIRECTUS_URL env var) but never stop it.
//
// So this suite cannot literally stop the Directus container — that
// requires host-level orchestration (docker compose stop) outside
// Playwright's process, which is a TestRunner/CI-environment concern,
// not something a spec file can do in-process. What we CAN verify at
// this level, honestly: every route responds and never 500s under
// normal conditions (a weaker but real regression guard — if the
// "never throw into the page" contract broke, ALL FOUR routes would
// start 500ing, which this still catches). The stronger claim — "still
// 200s when Directus is truly unreachable" — is left as an explicit,
// named gap below (see 06-test-design.md's Known Test Gaps) rather
// than faked with a mechanism that doesn't actually simulate an outage.
test.describe('FR-CMS-007 — Directus reachability contract (AC-8, partial)', () => {
  test('all four content routes return non-500 under normal conditions', async ({ request }) => {
    for (const route of ContentPagesApi.allRoutes) {
      const res = await request.get(route, { maxRedirects: 0 });
      expect(res.status(), `${route} must not 500`).not.toBe(500);
      expect([200, 404]).toContain(res.status());
    }
  });
});

// ─── Nav / footer link presence (AC-9) ───────────────────────────────────────

test.describe('FR-CMS-007 — nav/footer link presence (AC-9)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('desktop nav contains links to all 4 new pages', async ({ page }) => {
    const fixture = new NavFooterFixture(page);
    await fixture.goto();

    for (const route of NavFooterFixture.routes) {
      await expect(fixture.navLink(route)).toHaveCount(1);
    }
  });

  test('footer "Site" column contains links to all 4 new pages', async ({ page }) => {
    const fixture = new NavFooterFixture(page);
    await fixture.goto();

    for (const route of NavFooterFixture.routes) {
      await expect(fixture.footerLink(route)).toHaveCount(1);
    }
  });
});

// ─── Excluded source material does not leak (AC-7 regression guard) ─────────

test.describe('FR-CMS-007 — excluded source material does not leak (AC-7)', () => {
  test('none of the 5 rule documents mention the excluded contract annex or internal BFT roadmap terms', async ({
    request,
  }) => {
    const forbidden = [
      'Приложение№1',
      'ABiTech',
      'InterKvadroSoft',
      'AI Qadam BFT',
    ];

    for (const slug of ContentPagesApi.ruleDocumentSlugs) {
      const res = await request.get(`/rules/${slug}`, { maxRedirects: 0 });
      expect(res.status()).toBe(200);
      const body = await res.text();
      for (const term of forbidden) {
        expect(body, `/rules/${slug} must not contain "${term}"`).not.toContain(term);
      }
    }
  });

  test('about/history/partners (en + ru) do not mention the excluded contract annex or internal BFT roadmap terms', async ({
    request,
  }) => {
    const forbidden = ['Приложение№1', 'ABiTech', 'InterKvadroSoft', 'AI Qadam BFT'];
    const routes = ['/about', '/history', '/partners'] as const;

    for (const route of routes) {
      for (const locale of ['en', 'ru'] as const) {
        const api = new ContentPagesApi(request);
        const res = await api.get(route, locale);
        expect(res.status()).toBe(200);
        const body = await res.text();
        for (const term of forbidden) {
          expect(body, `${route} (${locale}) must not contain "${term}"`).not.toContain(term);
        }
      }
    }
  });
});
