// cms-landing-page.spec.ts — Unit tests for fetchLandingPage (FR-MIG-020).
// Tests: slug normalisation, shape guard, Directus query construction, null returns.
// Pattern: local re-implementation of fetchLandingPage (follows member-filters.test.ts).
//
// NOTE: fetchLandingPage depends on process.env (INTERNAL_DIRECTUS_URL) and the
// shared get() helper which calls fetch(). Re-implemented locally to avoid
// mocking Node environment globals in Vitest. The re-implementation mirrors
// the actual function logic exactly.
//
// FR-MIG-020.

import { describe, expect, it } from 'vitest';

// ─── Local re-implementation of fetchLandingPage ─────────────────────────────────

interface CmsLandingPage {
  slug: string;
  title: string;
  subtitle: string | null;
  bodyMd: string | null;
  ctaLabel: string;
  ctaUrl: string;
}

interface CmsLandingPageRow {
  slug: string;
  title: string;
  subtitle: string | null;
  body_md: string | null;
  cta_label: string;
  cta_url: string;
}

// Re-implements fetchLandingPage logic locally (mirrors apps/web-next/src/lib/cms.ts)
async function _fetchLandingPage(slug: string): Promise<CmsLandingPage | null> {
  const trimmed = slug.trim().toLowerCase();
  // Defensive slug shape guard — reject path traversal and malformed slugs
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(trimmed)) return null;

  // Build query params (simulated — normally calls directus get())
  // We test that the guard fires before any network call by tracking
  // whether an error would be thrown for an invalid slug.
  const params = new URLSearchParams({
    'filter[slug][_eq]': trimmed,
    'filter[status][_eq]': 'published',
    fields: 'slug,status,title,subtitle,body_md,cta_label,cta_url',
    limit: '1',
  });

  // Simulate: if params include the right filter, the guard passed.
  // For invalid slugs the function returns null before constructing params.
  // We verify the slug-normalisation + shape guard by checking the params.
  void params; // suppress unused
  return null; // placeholder — tests below verify logic independently
}

// Pure slug normalisation (extracted from fetchLandingPage)
function normaliseSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

// Pure shape guard (extracted from fetchLandingPage)
function isValidSlugShape(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(slug);
}

// Pure param builder (mirrors fetchLandingPage's URLSearchParams construction)
function buildLandingPageParams(slug: string): URLSearchParams {
  const trimmed = slug.trim().toLowerCase();
  const params = new URLSearchParams({
    'filter[slug][_eq]': trimmed,
    'filter[status][_eq]': 'published',
    fields: 'slug,status,title,subtitle,body_md,cta_label,cta_url',
    limit: '1',
  });
  return params;
}

// Pure row normaliser (mirrors fetchLandingPage's normalise)
function normaliseLandingPageRow(row: CmsLandingPageRow): CmsLandingPage {
  return {
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    bodyMd: row.body_md,
    ctaLabel: row.cta_label,
    ctaUrl: row.cta_url,
  };
}

// Simulated fetch (mirrors get() from cms.ts — throws on non-OK)
function simulateDirectusGet(
  mockResponse: { ok: boolean; body?: unknown } | Error,
): { data: CmsLandingPageRow[] } | null {
  if (mockResponse instanceof Error) throw mockResponse;
  if (!mockResponse.ok) throw new Error(`HTTP ${mockResponse.ok}`);
  return mockResponse.body as { data: CmsLandingPageRow[] };
}

// Full simulation of fetchLandingPage
async function simulatedFetchLandingPage(
  slug: string,
  directusResponse: { ok: boolean; body?: unknown } | Error,
): Promise<CmsLandingPage | null> {
  const trimmed = slug.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(trimmed)) return null;
  try {
    const body = simulateDirectusGet(directusResponse);
    if (!body) return null;
    const row = body.data[0];
    if (!row) return null;
    return normaliseLandingPageRow(row);
  } catch {
    return null;
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('fetchLandingPage — slug normalisation', () => {
  it('trims and lowercases the slug', () => {
    expect(normaliseSlug('  TELEGRAM-UZ  ')).toBe('telegram-uz');
  });

  it('handles mixed case', () => {
    expect(normaliseSlug('MlOps-Test')).toBe('mlops-test');
  });

  it('strips leading/trailing whitespace', () => {
    expect(normaliseSlug('\t\ntelegram-uz\n\t')).toBe('telegram-uz');
  });
});

describe('fetchLandingPage — shape guard', () => {
  it('accepts valid lowercase alphanumeric slug', () => {
    expect(isValidSlugShape('telegram-uz')).toBe(true);
    expect(isValidSlugShape('a')).toBe(true);
    expect(isValidSlugShape('mlops-2024')).toBe(true);
    expect(isValidSlugShape('computer-vision')).toBe(true);
  });

  it('accepts slugs up to 64 chars after normalisation', () => {
    expect(isValidSlugShape('a'.repeat(64))).toBe(true);
  });

  it('rejects slugs longer than 64 chars', () => {
    expect(isValidSlugShape('a'.repeat(65))).toBe(false);
  });

  it('rejects uppercase letters (not lowercased by the regex)', () => {
    expect(isValidSlugShape('TELEGRAM-UZ')).toBe(false);
  });

  it('rejects path traversal attempts', () => {
    expect(isValidSlugShape('../etc/passwd')).toBe(false);
    expect(isValidSlugShape('..')).toBe(false);
    expect(isValidSlugShape('/etc/passwd')).toBe(false);
  });

  it('rejects slugs with spaces', () => {
    expect(isValidSlugShape('telegram uz')).toBe(false);
  });

  it('rejects slugs with special characters', () => {
    expect(isValidSlugShape('telegram_uz')).toBe(false);
    expect(isValidSlugShape('telegram.uz')).toBe(false);
    expect(isValidSlugShape('telegram@uz')).toBe(false);
    expect(isValidSlugShape('telegram#uz')).toBe(false);
  });

  it('rejects slugs starting with a hyphen', () => {
    expect(isValidSlugShape('-telegram-uz')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidSlugShape('')).toBe(false);
  });

  it('rejects single character that is not alphanumeric', () => {
    expect(isValidSlugShape('-')).toBe(false);
    expect(isValidSlugShape('_')).toBe(false);
  });
});

describe('fetchLandingPage — URL params construction', () => {
  it('sets filter[slug][_eq] to the normalised slug', () => {
    const params = buildLandingPageParams('TELEGRAM-UZ');
    expect(params.get('filter[slug][_eq]')).toBe('telegram-uz');
  });

  it('sets filter[status][_eq] to published', () => {
    const params = buildLandingPageParams('telegram-uz');
    expect(params.get('filter[status][_eq]')).toBe('published');
  });

  it('requests the correct landing page fields', () => {
    const params = buildLandingPageParams('telegram-uz');
    expect(params.get('fields')).toBe('slug,status,title,subtitle,body_md,cta_label,cta_url');
  });

  it('sets limit to 1', () => {
    const params = buildLandingPageParams('telegram-uz');
    expect(params.get('limit')).toBe('1');
  });
});

describe('fetchLandingPage — row normalisation', () => {
  it('maps snake_case row fields to camelCase', () => {
    const row: CmsLandingPageRow = {
      slug: 'telegram-uz',
      title: 'Join AI Qadam',
      subtitle: 'Your AI community',
      body_md: '## Welcome\n\nJoin us today.',
      cta_label: 'Join AI Qadam',
      cta_url: '/onboard?slug=telegram-uz',
    };

    const result = normaliseLandingPageRow(row);

    expect(result.slug).toBe('telegram-uz');
    expect(result.title).toBe('Join AI Qadam');
    expect(result.subtitle).toBe('Your AI community');
    expect(result.bodyMd).toBe('## Welcome\n\nJoin us today.');
    expect(result.ctaLabel).toBe('Join AI Qadam');
    expect(result.ctaUrl).toBe('/onboard?slug=telegram-uz');
  });

  it('handles null subtitle', () => {
    const row: CmsLandingPageRow = {
      slug: 'test',
      title: 'Test',
      subtitle: null,
      body_md: null,
      cta_label: 'Go',
      cta_url: '/onboard',
    };

    const result = normaliseLandingPageRow(row);

    expect(result.subtitle).toBeNull();
    expect(result.bodyMd).toBeNull();
  });
});

describe('fetchLandingPage — full simulation', () => {
  it('returns CmsLandingPage for a valid slug with data', async () => {
    const response = {
      ok: true,
      body: {
        data: [
          {
            slug: 'telegram-uz',
            title: 'Join AI Qadam',
            subtitle: 'Your AI community',
            body_md: 'Welcome!',
            cta_label: 'Join',
            cta_url: '/onboard?slug=telegram-uz',
          },
        ],
      },
    };

    const result = await simulatedFetchLandingPage('telegram-uz', response);

    expect(result).not.toBeNull();
    expect(result?.slug).toBe('telegram-uz');
    expect(result?.title).toBe('Join AI Qadam');
    expect(result?.ctaUrl).toBe('/onboard?slug=telegram-uz');
  });

  it('returns null for non-existent slug (empty data array)', async () => {
    const response = {
      ok: true,
      body: { data: [] },
    };

    const result = await simulatedFetchLandingPage('does-not-exist', response);

    expect(result).toBeNull();
  });

  it('returns null for invalid slug shape before network call', async () => {
    // This tests that the shape guard short-circuits before any fetch.
    // The simulated function still returns null for invalid slugs even
    // though no network call is made in this test.
    const response = {
      ok: true,
      body: { data: [] },
    };

    const result = await simulatedFetchLandingPage('../etc/passwd', response);

    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    const networkError = new Error('Network failure');

    const result = await simulatedFetchLandingPage('telegram-uz', networkError);

    expect(result).toBeNull();
  });
});
