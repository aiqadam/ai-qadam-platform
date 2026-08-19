// cms-content-pages.test.ts — Unit tests for fetchContentPage,
// fetchContentDocuments, fetchContentDocument (FR-CMS-007).
//
// Pattern: local re-implementation of the fetcher logic, mirroring
// lib/cms.ts exactly — same convention as cms-landing-page.test.ts and
// cms.test.ts in this directory (avoids mocking process.env / global
// fetch; the re-implementation is a line-for-line mirror).

import { describe, expect, it } from 'vitest';

// ─── Local re-implementation: content_pages ────────────────────────────────

interface CmsContentPage {
  slug: string;
  title: string;
  subtitle: string | null;
  bodyMd: string | null;
}

interface CmsContentPageTranslation {
  title?: string;
  subtitle?: string;
  body_md?: string;
}

interface CmsContentPageRow {
  slug: string;
  status: string;
  title: string;
  subtitle: string | null;
  body_md: string | null;
  translations: Record<string, CmsContentPageTranslation> | null;
}

const CONTENT_PAGE_FIELDS = 'slug,status,title,subtitle,body_md,translations';

function isValidContentSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(slug);
}

function normalizeContentPageRow(row: CmsContentPageRow, locale: string): CmsContentPage {
  const localized = row.translations?.[locale];
  return {
    slug: row.slug,
    title: localized?.title ?? row.title,
    subtitle: localized?.subtitle ?? row.subtitle,
    bodyMd: localized?.body_md ?? row.body_md,
  };
}

function buildContentPageParams(slug: string): URLSearchParams {
  const trimmed = slug.trim().toLowerCase();
  return new URLSearchParams({
    'filter[slug][_eq]': trimmed,
    'filter[status][_eq]': 'published',
    fields: CONTENT_PAGE_FIELDS,
    limit: '1',
  });
}

async function simulatedFetchContentPage(
  slug: string,
  locale: string,
  directusResponse: { ok: boolean; body?: unknown } | Error,
): Promise<CmsContentPage | null> {
  const trimmed = slug.trim().toLowerCase();
  if (!isValidContentSlug(trimmed)) return null;
  try {
    if (directusResponse instanceof Error) throw directusResponse;
    if (!directusResponse.ok) throw new Error('HTTP error');
    const body = directusResponse.body as { data: CmsContentPageRow[] };
    const row = body.data[0];
    if (!row) return null;
    return normalizeContentPageRow(row, locale);
  } catch {
    return null;
  }
}

// ─── Tests: content_pages ──────────────────────────────────────────────────

describe('fetchContentPage — slug shape guard', () => {
  it('accepts a valid lowercase slug', () => {
    expect(isValidContentSlug('about')).toBe(true);
    expect(isValidContentSlug('history')).toBe(true);
  });

  it('rejects path traversal attempts', () => {
    expect(isValidContentSlug('../etc/passwd')).toBe(false);
  });

  it('rejects uppercase', () => {
    expect(isValidContentSlug('About')).toBe(false);
  });

  it('rejects filter-injection-shaped input', () => {
    expect(isValidContentSlug("x' OR 1=1")).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidContentSlug('')).toBe(false);
  });

  it('rejects slugs longer than 64 characters', () => {
    expect(isValidContentSlug(`a${'b'.repeat(64)}`)).toBe(false);
  });

  it('accepts a slug at exactly the 64-character boundary', () => {
    expect(isValidContentSlug(`a${'b'.repeat(63)}`)).toBe(true);
  });
});

describe('fetchContentPage — URL params construction', () => {
  it('filters by slug and published status, requesting translations field', () => {
    const params = buildContentPageParams('ABOUT');
    expect(params.get('filter[slug][_eq]')).toBe('about');
    expect(params.get('filter[status][_eq]')).toBe('published');
    expect(params.get('fields')).toContain('translations');
  });
});

describe('fetchContentPage — locale resolution', () => {
  const row: CmsContentPageRow = {
    slug: 'about',
    status: 'published',
    title: 'About Us',
    subtitle: 'Our mission',
    body_md: '# Mission\n\nEnglish body.',
    translations: {
      ru: {
        title: 'О нас',
        subtitle: 'Наша миссия',
        body_md: '# Миссия\n\nРусский текст.',
      },
    },
  };

  it('returns top-level (en default) fields when locale is en', async () => {
    const result = await simulatedFetchContentPage('about', 'en', {
      ok: true,
      body: { data: [row] },
    });
    expect(result?.title).toBe('About Us');
    expect(result?.bodyMd).toBe('# Mission\n\nEnglish body.');
  });

  it('returns the ru translation when locale is ru and present', async () => {
    const result = await simulatedFetchContentPage('about', 'ru', {
      ok: true,
      body: { data: [row] },
    });
    expect(result?.title).toBe('О нас');
    expect(result?.bodyMd).toBe('# Миссия\n\nРусский текст.');
  });

  it('falls back to top-level fields when the requested locale has no translation entry', async () => {
    const result = await simulatedFetchContentPage('about', 'fr', {
      ok: true,
      body: { data: [row] },
    });
    expect(result?.title).toBe('About Us');
  });

  it('falls back to top-level fields when translations is null', async () => {
    const noTranslations: CmsContentPageRow = { ...row, translations: null };
    const result = await simulatedFetchContentPage('about', 'ru', {
      ok: true,
      body: { data: [noTranslations] },
    });
    expect(result?.title).toBe('About Us');
  });
});

describe('fetchContentPage — failure paths (AC-8: never throw into the page)', () => {
  it('returns null for an invalid slug without attempting a fetch', async () => {
    const result = await simulatedFetchContentPage('../etc/passwd', 'en', {
      ok: true,
      body: { data: [] },
    });
    expect(result).toBeNull();
  });

  it('returns null when no row matches', async () => {
    const result = await simulatedFetchContentPage('missing', 'en', {
      ok: true,
      body: { data: [] },
    });
    expect(result).toBeNull();
  });

  it('returns null (not a throw) on Directus-unreachable', async () => {
    const result = await simulatedFetchContentPage('about', 'en', new Error('ECONNREFUSED'));
    expect(result).toBeNull();
  });

  it('returns null (not a throw) on a non-OK response', async () => {
    const result = await simulatedFetchContentPage('about', 'en', { ok: false });
    expect(result).toBeNull();
  });
});

// ─── Local re-implementation: content_documents ────────────────────────────

interface CmsContentDocument {
  id: string;
  slug: string;
  title: string;
  sourceDocumentLabel: string | null;
  statusLabel: string | null;
  bodyMd: string | null;
  displayOrder: number;
}

interface CmsContentDocumentRow {
  id: string;
  slug: string;
  status: string;
  title: string;
  source_document_label: string | null;
  status_label: string | null;
  body_md: string | null;
  display_order: number | null;
}

function normalizeContentDocumentRow(row: CmsContentDocumentRow): CmsContentDocument {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    sourceDocumentLabel: row.source_document_label,
    statusLabel: row.status_label,
    bodyMd: row.body_md,
    displayOrder: row.display_order ?? 100,
  };
}

async function simulatedFetchContentDocuments(
  directusResponse: { ok: boolean; body?: unknown } | Error,
): Promise<CmsContentDocument[]> {
  try {
    if (directusResponse instanceof Error) throw directusResponse;
    if (!directusResponse.ok) throw new Error('HTTP error');
    const body = directusResponse.body as { data: CmsContentDocumentRow[] };
    return body.data.map(normalizeContentDocumentRow);
  } catch {
    return [];
  }
}

async function simulatedFetchContentDocument(
  slug: string,
  directusResponse: { ok: boolean; body?: unknown } | Error,
): Promise<CmsContentDocument | null> {
  const trimmed = slug.trim().toLowerCase();
  if (!isValidContentSlug(trimmed)) return null;
  try {
    if (directusResponse instanceof Error) throw directusResponse;
    if (!directusResponse.ok) throw new Error('HTTP error');
    const body = directusResponse.body as { data: CmsContentDocumentRow[] };
    const row = body.data[0];
    return row ? normalizeContentDocumentRow(row) : null;
  } catch {
    return null;
  }
}

// ─── Tests: content_documents ───────────────────────────────────────────────

describe('fetchContentDocuments — happy path', () => {
  it('maps and returns all rows (AC-2: library lists every published document)', async () => {
    const rows: CmsContentDocumentRow[] = [
      {
        id: '1',
        slug: 'manifesto',
        status: 'published',
        title: 'AI Qadam Manifesto',
        source_document_label: 'AI Qadam Manifesto.docx',
        status_label: 'Current',
        body_md: null,
        display_order: 10,
      },
      {
        id: '2',
        slug: 'global-board-polozhenie-v1',
        status: 'published',
        title: 'AI Qadam Global Board Положение v1.0',
        source_document_label: 'AI Qadam Global Board Положение (2).docx',
        status_label: 'Superseded by Charter v0.1',
        body_md: null,
        display_order: 40,
      },
    ];
    const result = await simulatedFetchContentDocuments({ ok: true, body: { data: rows } });
    expect(result).toHaveLength(2);
    expect(result[1]?.statusLabel).toBe('Superseded by Charter v0.1');
  });

  it('returns [] (never throws) on Directus-unreachable', async () => {
    const result = await simulatedFetchContentDocuments(new Error('ECONNREFUSED'));
    expect(result).toEqual([]);
  });

  it('returns [] for an empty data array', async () => {
    const result = await simulatedFetchContentDocuments({ ok: true, body: { data: [] } });
    expect(result).toEqual([]);
  });

  it('defaults displayOrder to 100 when null', () => {
    const row: CmsContentDocumentRow = {
      id: '3',
      slug: 'x',
      status: 'published',
      title: 'X',
      source_document_label: null,
      status_label: null,
      body_md: null,
      display_order: null,
    };
    expect(normalizeContentDocumentRow(row).displayOrder).toBe(100);
  });
});

describe('fetchContentDocument — single document (AC-3/AC-4)', () => {
  it('returns the row with its own status_label verbatim (AC-4: superseded label, not removed)', async () => {
    const row: CmsContentDocumentRow = {
      id: '4',
      slug: 'soglashenie-v1',
      status: 'published',
      title: 'AI Qadam Соглашение v1.0',
      source_document_label: 'AI Qadam Soglashenie v1 (2).docx',
      status_label: 'Superseded by Charter v0.1',
      body_md: '## Основатель (Founder Global)',
      display_order: 50,
    };
    const result = await simulatedFetchContentDocument('soglashenie-v1', {
      ok: true,
      body: { data: [row] },
    });
    expect(result?.statusLabel).toBe('Superseded by Charter v0.1');
    expect(result?.bodyMd).toContain('Основатель');
  });

  it('returns null for a non-existent slug', async () => {
    const result = await simulatedFetchContentDocument('missing', { ok: true, body: { data: [] } });
    expect(result).toBeNull();
  });

  it('returns null for an invalid slug shape before any fetch', async () => {
    const result = await simulatedFetchContentDocument('../etc/passwd', {
      ok: true,
      body: { data: [] },
    });
    expect(result).toBeNull();
  });
});
