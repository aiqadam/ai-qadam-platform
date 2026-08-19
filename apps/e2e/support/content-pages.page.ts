// content-pages.page.ts — Page Object Model for FR-CMS-007's four new
// public content pages: About (/about), Community Rules & Documents
// (/rules + /rules/[slug]), Events & History (/history), Partner With
// Us (/partners), plus the AppNav/AppFooter link-presence checks (AC-9).
//
// Per test-designer.md: "Use Page Object Model — no selectors in test
// bodies." This is the first POM module in apps/e2e/ (existing specs —
// smoke-onboarding.spec.ts, smoke-public.spec.ts, etc. — inline
// locators directly in test bodies); this file establishes the pattern
// for FR-CMS-007's new specs without refactoring pre-existing files
// (out of this task's scope).
//
// Locale resolution note (apps/web-next/src/lib/i18n.ts getLocale()):
// locale is NOT a query param or URL path segment — it resolves from
// the `aiqadam-locale` cookie first, then `Accept-Language` header,
// falling back to 'en'. setLocale() below sets the cookie via the
// Playwright BrowserContext, matching that contract exactly (more
// reliable than Accept-Language across Chromium/webkit differences).

import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';

export type ContentLocale = 'en' | 'ru';

const LOCALE_COOKIE = 'aiqadam-locale';

/**
 * Set the locale cookie on a BrowserContext before navigating — mirrors
 * getLocale()'s cookie-first resolution in apps/web-next/src/lib/i18n.ts.
 * `baseUrl` must match the context's configured baseURL host so the
 * cookie is attached on same-origin requests.
 */
export async function setLocale(
  context: BrowserContext,
  locale: ContentLocale,
  baseUrl: string,
): Promise<void> {
  const url = new URL(baseUrl);
  await context.addCookies([
    {
      name: LOCALE_COOKIE,
      value: locale,
      domain: url.hostname,
      path: '/',
    },
  ]);
}

/** Build an Accept-Language header value for the `request` fixture (no BrowserContext available there). */
export function acceptLanguageHeader(locale: ContentLocale): Record<string, string> {
  return { 'accept-language': locale === 'ru' ? 'ru-RU,ru;q=0.9' : 'en-US,en;q=0.9' };
}

// ─── About Us (/about) ──────────────────────────────────────────────────────

export class AboutPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/about', { waitUntil: 'domcontentloaded' });
  }

  heading() {
    return this.page.getByRole('heading', { level: 1 });
  }

  chapterModelHeading() {
    return this.page.getByText('The chapter model');
  }

  leadershipHeading() {
    return this.page.getByText('Leadership team');
  }

  closingTagline() {
    return this.page.getByText("In the end, AI Qadam isn't really about artificial intelligence.");
  }
}

// ─── Events & History (/history) ────────────────────────────────────────────

export class HistoryPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/history', { waitUntil: 'domcontentloaded' });
  }

  heading() {
    return this.page.getByRole('heading', { level: 1 });
  }

  foundingTimelineHeading() {
    return this.page.getByText('Founding timeline');
  }

  meetup1Heading() {
    return this.page.getByText('Meetup #1 recap');
  }

  meetup2Heading() {
    return this.page.getByText('Meetup #2 recap');
  }

  growthHeading() {
    return this.page.getByText('Growth trajectory');
  }

  roadmapHeading() {
    return this.page.getByText("What's next");
  }
}

// ─── Partner With Us (/partners) ────────────────────────────────────────────

export class PartnersPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/partners', { waitUntil: 'domcontentloaded' });
  }

  heading() {
    return this.page.getByRole('heading', { level: 1 });
  }

  tiersHeading() {
    return this.page.getByText('Ways to contribute');
  }

  currentPartnersHeading() {
    return this.page.getByText('Who already trusts us');
  }

  regulatorHeading() {
    return this.page.getByText('For regulators & state funds');
  }

  sponsorshipCtaLink() {
    return this.page.locator('a[href="mailto:partners@aiqadam.org"]');
  }
}

// ─── Community Rules & Documents library (/rules) ───────────────────────────

export class RulesLibraryPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/rules', { waitUntil: 'domcontentloaded' });
  }

  heading() {
    return this.page.getByRole('heading', { level: 1 });
  }

  documentEntries() {
    // Each document is an <li> card with an <h2> title + a "Read document" link.
    return this.page.locator('li:has(a[href^="/rules/"])');
  }

  documentLink(slug: string) {
    return this.page.locator(`a[href="/rules/${slug}"]`);
  }
}

// ─── Document detail (/rules/[slug]) ────────────────────────────────────────

export class RulesDocumentPage {
  constructor(private readonly page: Page) {}

  async goto(slug: string) {
    return this.page.goto(`/rules/${slug}`, { waitUntil: 'domcontentloaded' });
  }

  heading() {
    return this.page.getByRole('heading', { level: 1 });
  }

  supersededBadge() {
    return this.page.getByText(/superseded/i);
  }

  bodyText() {
    return this.page.locator('main');
  }
}

// ─── Nav / Footer link presence (AC-9) ───────────────────────────────────────

const CONTENT_ROUTES = ['/about', '/rules', '/history', '/partners'] as const;

export class NavFooterFixture {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/', { waitUntil: 'domcontentloaded' });
  }

  navLink(href: (typeof CONTENT_ROUTES)[number]) {
    return this.page.locator(`header nav a[href="${href}"]`);
  }

  footerLink(href: (typeof CONTENT_ROUTES)[number]) {
    return this.page.locator(`footer a[href="${href}"]`);
  }

  static readonly routes = CONTENT_ROUTES;
}

// ─── HTTP-level fixture (request context — no browser needed) ──────────────
// Used for AC-8 (Directus-unreachable fallback status checks) and AC-7
// (excluded-source-material text-absence regression guard), where we only
// need the response status/body, not DOM interaction.

export class ContentPagesApi {
  constructor(private readonly request: APIRequestContext) {}

  async get(path: string, locale?: ContentLocale) {
    return this.request.get(path, {
      maxRedirects: 0,
      headers: locale ? acceptLanguageHeader(locale) : undefined,
    });
  }

  static readonly allRoutes = ['/about', '/rules', '/history', '/partners'] as const;

  /** All 5 seeded content_documents detail routes (AC-2/AC-3/AC-4/AC-7). */
  static readonly ruleDocumentSlugs = [
    'manifesto',
    'charter-v0-1',
    'kazakhstan-mou',
    'global-board-polozhenie-v1',
    'soglashenie-v1',
  ] as const;
}
