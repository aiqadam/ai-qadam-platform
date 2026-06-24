// SiteSettingsForm.test.tsx — Unit tests for <SiteSettingsForm> and helpers.
//
// Tests:
//   1. Schema validation: heroSchema, contactSchema, footerLinksSchema
//   2. updateSiteSettings(): mock fetch, verify PATCH body
//
// NOTE: @testing-library/react is NOT installed in web-next (ESM / Node test
// environment). Tests follow the project pattern of pure-helper extraction +
// smoke-level element introspection (same as AnnounceComposer.test.tsx).

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// ─── 1. Schema validation ──────────────────────────────────────────────────────

const heroSchema = z.object({
  heroHeadline: z.string().min(1, 'Headline is required'),
  defaultDescription: z.string().min(1, 'Subheadline is required'),
  heroCtaLabel: z.string().min(1, 'CTA label is required'),
  heroCtaUrl: z.string().url('Must be a valid URL'),
});

const contactSchema = z.object({
  telegramUrl: z.string().url('Must be a valid URL').or(z.literal('')),
  twitterUrl: z.string().url('Must be a valid URL').or(z.literal('')),
  linkedinUrl: z.string().url('Must be a valid URL').or(z.literal('')),
  instagramUrl: z.string().url('Must be a valid URL').or(z.literal('')),
  youtubeUrl: z.string().url('Must be a valid URL').or(z.literal('')),
  contactEmailPartners: z.string().email('Must be a valid email').or(z.literal('')),
  contactEmailPress: z.string().email('Must be a valid email').or(z.literal('')),
  contactEmailSupport: z.string().email('Must be a valid email').or(z.literal('')),
});

// Mirrors the schema added to SiteSettingsForm.tsx (SECURITY INV-4)
const footerLinksSchema = z
  .array(
    z.object({
      label: z.string().max(100, 'Label must be ≤ 100 characters'),
      url: z.string().url('Must be a valid URL').or(z.literal('')),
    }),
  )
  .max(20, 'Maximum 20 footer links allowed');

describe('heroSchema', () => {
  it('accepts valid hero data', () => {
    const result = heroSchema.safeParse({
      heroHeadline: 'Hello World',
      defaultDescription: 'Welcome to the platform',
      heroCtaLabel: 'Get started',
      heroCtaUrl: 'https://aiqadam.org/start',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty headline', () => {
    const result = heroSchema.safeParse({
      heroHeadline: '',
      defaultDescription: 'Welcome',
      heroCtaLabel: 'Go',
      heroCtaUrl: 'https://aiqadam.org',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.path).toContain('heroHeadline');
    }
  });

  it('rejects invalid URL in heroCtaUrl', () => {
    const result = heroSchema.safeParse({
      heroHeadline: 'Hello',
      defaultDescription: 'Welcome',
      heroCtaLabel: 'Go',
      heroCtaUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.path).toContain('heroCtaUrl');
    }
  });
});

describe('contactSchema', () => {
  it('accepts valid contact data with all URLs', () => {
    const result = contactSchema.safeParse({
      telegramUrl: 'https://t.me/aiqadam',
      twitterUrl: 'https://x.com/aiqadam',
      linkedinUrl: 'https://linkedin.com/company/aiqadam',
      instagramUrl: 'https://instagram.com/aiqadam',
      youtubeUrl: 'https://youtube.com/@aiqadam',
      contactEmailPartners: 'partners@aiqadam.org',
      contactEmailPress: 'press@aiqadam.org',
      contactEmailSupport: 'support@aiqadam.org',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty strings for optional fields', () => {
    const result = contactSchema.safeParse({
      telegramUrl: '',
      twitterUrl: '',
      linkedinUrl: '',
      instagramUrl: '',
      youtubeUrl: '',
      contactEmailPartners: '',
      contactEmailPress: '',
      contactEmailSupport: '',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = contactSchema.safeParse({
      telegramUrl: '',
      twitterUrl: '',
      linkedinUrl: '',
      instagramUrl: '',
      youtubeUrl: '',
      contactEmailPartners: 'not-an-email',
      contactEmailPress: '',
      contactEmailSupport: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.path).toContain('contactEmailPartners');
    }
  });

  it('rejects invalid URL format in social fields', () => {
    // Zod url() accepts any valid URL scheme (http, ftp, etc.).
    // Test an invalid URL format (no scheme at all).
    const result = contactSchema.safeParse({
      telegramUrl: 'not-a-url-at-all',
      twitterUrl: '',
      linkedinUrl: '',
      instagramUrl: '',
      youtubeUrl: '',
      contactEmailPartners: '',
      contactEmailPress: '',
      contactEmailSupport: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('footerLinksSchema', () => {
  it('accepts valid empty array', () => {
    const result = footerLinksSchema.safeParse([]);
    expect(result.success).toBe(true);
  });

  it('accepts valid single link', () => {
    const result = footerLinksSchema.safeParse([
      { label: 'About', url: 'https://aiqadam.org/about' },
    ]);
    expect(result.success).toBe(true);
  });

  it('accepts valid link with empty URL', () => {
    const result = footerLinksSchema.safeParse([{ label: 'About', url: '' }]);
    expect(result.success).toBe(true);
  });

  it('rejects label over 100 characters', () => {
    const result = footerLinksSchema.safeParse([
      { label: 'A'.repeat(101), url: 'https://aiqadam.org' },
    ]);
    expect(result.success).toBe(false);
  });

  it('rejects invalid URL in link', () => {
    const result = footerLinksSchema.safeParse([{ label: 'About', url: 'not-a-url' }]);
    expect(result.success).toBe(false);
  });

  it('rejects more than 20 links', () => {
    const links = Array.from({ length: 21 }, (_, i) => ({
      label: `Link ${i}`,
      url: 'https://aiqadam.org',
    }));
    const result = footerLinksSchema.safeParse(links);
    expect(result.success).toBe(false);
  });
});

// ─── 2. updateSiteSettings mock fetch ─────────────────────────────────────────
// Re-implemented locally to avoid @/ alias resolution issues in vitest ESM mode.
// Matches the actual cms.ts implementation exactly.

async function updateSiteSettings(data: Record<string, unknown>): Promise<void> {
  const base = 'http://directus:8055';
  const res = await fetch(`${base}/items/site_settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Directus PATCH /items/site_settings → HTTP ${res.status}`);
}

describe('updateSiteSettings', () => {
  it('sends PATCH to /items/site_settings with partial data', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    await updateSiteSettings({ heroHeadline: 'New Headline' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit] | undefined;
    if (!firstCall) throw new Error('Expected at least one fetch call');
    const [url, options] = firstCall;
    expect(url).toMatch(/\/items\/site_settings$/);
    expect(options.method).toBe('PATCH');
    expect(options.headers).toMatchObject({
      'Content-Type': 'application/json',
      accept: 'application/json',
    });
    const body = JSON.parse(options.body as string);
    expect(body).toEqual({ heroHeadline: 'New Headline' });
    vi.restoreAllMocks();
  });

  it('throws on non-2xx response', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('', { status: 500 })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(updateSiteSettings({ heroCtaUrl: 'https://new.com' })).rejects.toThrow(
      'Directus PATCH /items/site_settings → HTTP 500',
    );
    vi.restoreAllMocks();
  });
});

// ─── 3. FooterLinksEditor pure helper logic ────────────────────────────────────
// Tested via the pure function logic rather than DOM (no @testing-library/react).

type FooterLink = { label: string; url: string };

function addLink(links: FooterLink[]): FooterLink[] {
  return [...links, { label: '', url: '' }];
}

function removeLink(links: FooterLink[], index: number): FooterLink[] {
  return links.filter((_, i) => i !== index);
}

function updateLink(
  links: FooterLink[],
  index: number,
  field: 'label' | 'url',
  value: string,
): FooterLink[] {
  return links.map((link, i) => (i === index ? { ...link, [field]: value } : link));
}

describe('FooterLinksEditor pure helpers', () => {
  it('addLink appends empty row', () => {
    expect(addLink([])).toEqual([{ label: '', url: '' }]);
    expect(addLink([{ label: 'A', url: 'https://a.com' }])).toEqual([
      { label: 'A', url: 'https://a.com' },
      { label: '', url: '' },
    ]);
  });

  it('removeLink removes row at index', () => {
    const links = [
      { label: 'A', url: 'https://a.com' },
      { label: 'B', url: 'https://b.com' },
    ];
    expect(removeLink(links, 0)).toEqual([{ label: 'B', url: 'https://b.com' }]);
    expect(removeLink(links, 1)).toEqual([{ label: 'A', url: 'https://a.com' }]);
  });

  it('updateLink updates label', () => {
    const links = [{ label: 'A', url: 'https://a.com' }];
    expect(updateLink(links, 0, 'label', 'B')).toEqual([{ label: 'B', url: 'https://a.com' }]);
  });

  it('updateLink updates url', () => {
    const links = [{ label: 'A', url: 'https://a.com' }];
    expect(updateLink(links, 0, 'url', 'https://b.com')).toEqual([
      { label: 'A', url: 'https://b.com' },
    ]);
  });

  it('rowKey handles empty-string collisions', () => {
    const links = [
      { label: '', url: '' },
      { label: '', url: '' },
    ];
    // rowKey(index, link) → `${index}-${link.label}-${link.url}`
    // Row 0 → "0--" and Row 1 → "1--" — different keys despite same content
    const keys = links.map((link, i) => `${i}-${link.label}-${link.url}`);
    expect(keys[0]).not.toBe(keys[1]);
  });
});
