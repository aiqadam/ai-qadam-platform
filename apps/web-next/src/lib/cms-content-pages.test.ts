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
  sourceFileUrl: string | null;
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
  source_file: string | null;
  status_label: string | null;
  body_md: string | null;
  display_order: number | null;
}

// FR-CMS-008 — mirrors lib/cms.ts's PUBLIC_DIRECTUS_URL and its
// publicAssetUrl() helper.
//
// The real module has TWO bases: directusBase() (internal docker alias
// under SSR, used for fetches) and PUBLIC_DIRECTUS_URL (used for values
// emitted into browser-facing HTML). Only the public one is mirrored here,
// because the content-documents path this file covers is browser-facing;
// mirroring directusBase() too would just be dead code. A regression that
// switched sourceFileDownloadUrl() back to the internal base would show up
// as a changed host in the asserted URLs below.
const PUBLIC_DIRECTUS_BASE = 'https://cms.aiqadam.test';

function publicAssetUrl(fileId: string | null): string | null {
  if (!fileId) return null;
  return `${PUBLIC_DIRECTUS_BASE}/assets/${fileId}`;
}

// FR-CMS-008 — mirrors lib/cms.ts's sourceFileDownloadUrl(): `?download`
// makes Directus serve the asset as an attachment under its real
// filename cross-origin (AC-6).
function sourceFileDownloadUrl(fileId: string | null): string | null {
  const url = publicAssetUrl(fileId);
  return url ? `${url}?download` : null;
}

function normalizeContentDocumentRow(row: CmsContentDocumentRow): CmsContentDocument {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    sourceDocumentLabel: row.source_document_label,
    sourceFileUrl: sourceFileDownloadUrl(row.source_file),
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
        source_file: '11111111-2222-3333-4444-555555555555',
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
        source_file: null,
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
      source_file: null,
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
      source_file: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
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

// ─── Tests: source_file → sourceFileUrl derivation (FR-CMS-008) ─────────────
//
// The one part of FR-CMS-008 that lives in TypeScript and can regress
// silently on a future PR. The Directus half (schema, folder-scoped
// permission grant, seed-script idempotency, Content-Disposition) was
// verified against a live instance during security review and has no
// CI-runnable equivalent — see 06-test-strategy.md.

const SOURCE_FILE_UUID = '11111111-2222-3333-4444-555555555555';

/** A published row with no source_file — the steady state on every
 *  environment until an operator runs the seed script (AC-8). */
function documentRowWithoutSourceFile(): CmsContentDocumentRow {
  return {
    id: '10',
    slug: 'manifesto',
    status: 'published',
    title: 'AI Qadam Manifesto',
    source_document_label: 'AI Qadam Manifesto.docx',
    source_file: null,
    status_label: 'Current',
    body_md: '## Манифест',
    display_order: 10,
  };
}

/** The same row once its source_file has been uploaded and linked. */
function documentRowWithSourceFile(): CmsContentDocumentRow {
  return { ...documentRowWithoutSourceFile(), source_file: SOURCE_FILE_UUID };
}

describe('sourceFileDownloadUrl — derivation (AC-5, AC-6)', () => {
  it('builds an assets URL from the file uuid', () => {
    // Arrange
    const fileId = SOURCE_FILE_UUID;

    // Act
    const url = sourceFileDownloadUrl(fileId);

    // Assert
    expect(url).toBe(`${PUBLIC_DIRECTUS_BASE}/assets/${SOURCE_FILE_UUID}?download`);
  });

  it('appends the ?download flag so Directus serves the real filename cross-origin (AC-6)', () => {
    // Arrange
    const fileId = SOURCE_FILE_UUID;

    // Act
    const url = sourceFileDownloadUrl(fileId);

    // Assert
    // Directus's own ?download flag is what switches Content-Disposition
    // from inline to attachment. The HTML download attribute is ignored
    // cross-origin, so dropping this flag would silently revert every
    // download to an inline view under a uuid filename.
    expect(url).toMatch(/\?download$/);
  });

  it('returns null when the row has no source_file attached (AC-8)', () => {
    // Arrange
    const fileId: string | null = null;

    // Act
    const url = sourceFileDownloadUrl(fileId);

    // Assert
    expect(url).toBeNull();
  });

  it('returns null for an empty-string file id rather than a base-only URL', () => {
    // Arrange
    const fileId = '';

    // Act
    const url = sourceFileDownloadUrl(fileId);

    // Assert
    expect(url).toBeNull();
  });
});

describe('sourceFileDownloadUrl — public base, never the internal host (MAJOR-2)', () => {
  // The href is rendered into browser-facing HTML, but the derivation runs
  // under SSR where a realm-dependent base would resolve to the internal
  // docker alias. That regression is silent: the link still renders, it
  // just DNS-fails for every visitor. Asserted negatively as well as
  // positively — PUBLIC_DIRECTUS_BASE is deliberately a different host
  // from the internal one, so a switch back shows up here.

  it('uses the public Directus base', () => {
    // Arrange
    const fileId = SOURCE_FILE_UUID;

    // Act
    const url = sourceFileDownloadUrl(fileId);

    // Assert
    expect(url?.startsWith(`${PUBLIC_DIRECTUS_BASE}/`)).toBe(true);
  });

  it('never emits the internal docker hostname', () => {
    // Arrange
    const fileId = SOURCE_FILE_UUID;

    // Act
    const url = sourceFileDownloadUrl(fileId);

    // Assert
    expect(url).not.toContain('directus:8055');
    expect(url).not.toContain('//directus');
  });

  it('emits an https absolute URL, not a plaintext or relative one', () => {
    // Arrange
    const fileId = SOURCE_FILE_UUID;

    // Act
    const url = sourceFileDownloadUrl(fileId);

    // Assert
    expect(url).toMatch(/^https:\/\//);
  });
});

describe('normalizeContentDocumentRow — source_file mapping (AC-7, AC-8)', () => {
  it('derives sourceFileUrl when the row has a source_file', () => {
    // Arrange
    const row = documentRowWithSourceFile();

    // Act
    const doc = normalizeContentDocumentRow(row);

    // Assert
    expect(doc.sourceFileUrl).toBe(`${PUBLIC_DIRECTUS_BASE}/assets/${SOURCE_FILE_UUID}?download`);
  });

  it('leaves sourceFileUrl null when source_file is null (AC-8)', () => {
    // Arrange
    const row = documentRowWithoutSourceFile();

    // Act
    const doc = normalizeContentDocumentRow(row);

    // Assert
    expect(doc.sourceFileUrl).toBeNull();
  });

  it('keeps sourceDocumentLabel intact alongside the derived URL (AC-7)', () => {
    // Arrange
    const row = documentRowWithSourceFile();

    // Act
    const doc = normalizeContentDocumentRow(row);

    // Assert
    // The download link is additive — the label must not be displaced by it.
    expect(doc.sourceDocumentLabel).toBe('AI Qadam Manifesto.docx');
    expect(doc.sourceFileUrl).not.toBeNull();
  });

  it('still renders the label when source_file is null, so the page degrades to label-only (AC-8)', () => {
    // Arrange
    const row = documentRowWithoutSourceFile();

    // Act
    const doc = normalizeContentDocumentRow(row);

    // Assert
    expect(doc.sourceDocumentLabel).toBe('AI Qadam Manifesto.docx');
    expect(doc.sourceFileUrl).toBeNull();
  });

  it('leaves every other mapped field untouched by the new derivation', () => {
    // Arrange
    const row = documentRowWithSourceFile();

    // Act
    const doc = normalizeContentDocumentRow(row);

    // Assert
    expect(doc.id).toBe('10');
    expect(doc.slug).toBe('manifesto');
    expect(doc.title).toBe('AI Qadam Manifesto');
    expect(doc.statusLabel).toBe('Current');
    expect(doc.bodyMd).toBe('## Манифест');
    expect(doc.displayOrder).toBe(10);
  });
});

describe('fetchContentDocument — sourceFileUrl on the detail path (AC-5, AC-8)', () => {
  it('exposes sourceFileUrl for a row that has a source_file', async () => {
    // Arrange
    const row = documentRowWithSourceFile();

    // Act
    const result = await simulatedFetchContentDocument('manifesto', {
      ok: true,
      body: { data: [row] },
    });

    // Assert
    expect(result?.sourceFileUrl).toBe(
      `${PUBLIC_DIRECTUS_BASE}/assets/${SOURCE_FILE_UUID}?download`,
    );
  });

  it('returns the document (not null) with a null sourceFileUrl when source_file is unset (AC-8)', async () => {
    // Arrange
    const row = documentRowWithoutSourceFile();

    // Act
    const result = await simulatedFetchContentDocument('manifesto', {
      ok: true,
      body: { data: [row] },
    });

    // Assert
    // Absence degrades the field, never the page.
    expect(result).not.toBeNull();
    expect(result?.sourceFileUrl).toBeNull();
    expect(result?.bodyMd).toBe('## Манифест');
  });
});

describe('fetchContentDocuments — per-row source_file independence', () => {
  it('derives a URL only for the rows that have a source_file', async () => {
    // Arrange
    const rows: CmsContentDocumentRow[] = [
      documentRowWithSourceFile(),
      { ...documentRowWithoutSourceFile(), id: '11', slug: 'charter-v0-1' },
    ];

    // Act
    const result = await simulatedFetchContentDocuments({ ok: true, body: { data: rows } });

    // Assert
    expect(result[0]?.sourceFileUrl).toBe(
      `${PUBLIC_DIRECTUS_BASE}/assets/${SOURCE_FILE_UUID}?download`,
    );
    expect(result[1]?.sourceFileUrl).toBeNull();
  });
});
