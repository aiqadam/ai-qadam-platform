import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import {
  SponsorDigestsService,
  priorQuarter,
} from '../src/modules/workspace/sponsor-digests.service';

// F-S3.8 (ADR-0036) — SponsorDigestsService unit tests.
// Mocks Directus client; pdfkit runs for real so we can assert the
// PDF binary contains zero PII strings.

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

let dx: FakeDirectus;
let svc: SponsorDigestsService;

beforeEach(() => {
  dx = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  svc = new SponsorDigestsService(dx as unknown as DirectusClient);
});

const ACME = {
  id: 'company-acme',
  name: 'Acme AI',
  country: 'uz',
};

const ACME_COHORT = {
  id: 'cohort-uz-seniors',
  name: 'UZ senior ML engineers',
  memberCount: 47,
  purpose: 'sponsor-talent-slice',
};

describe('priorQuarter', () => {
  it('returns Q1 of same year when now is in Q2 (April)', () => {
    const q = priorQuarter(new Date('2026-04-05T00:00:00Z'));
    expect(q.tag).toBe('2026Q1');
    expect(q.year).toBe(2026);
    expect(q.q).toBe(1);
    expect(q.startsAt).toBe('2026-01-01T00:00:00.000Z');
    expect(q.endsAt).toBe('2026-04-01T00:00:00.000Z');
  });

  it('wraps to Q4 of previous year when now is in Q1 (January)', () => {
    const q = priorQuarter(new Date('2026-01-05T00:00:00Z'));
    expect(q.tag).toBe('2025Q4');
    expect(q.year).toBe(2025);
    expect(q.q).toBe(4);
    expect(q.startsAt).toBe('2025-10-01T00:00:00.000Z');
    expect(q.endsAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('returns Q3 when now is in Q4 (October)', () => {
    const q = priorQuarter(new Date('2026-10-05T00:00:00Z'));
    expect(q.tag).toBe('2026Q3');
    expect(q.startsAt).toBe('2026-07-01T00:00:00.000Z');
    expect(q.endsAt).toBe('2026-10-01T00:00:00.000Z');
  });
});

describe('SponsorDigestsService.tick — skip paths', () => {
  it('skips a sponsor that already has a digest for the quarter', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [ACME] }) // activeSponsors
      .mockResolvedValueOnce({ data: [{ id: 'digest-existing' }] }); // findExistingDigest

    const result = await svc.tick(new Date('2026-04-05T00:00:00Z'));

    expect(result.evaluated).toBe(1);
    expect(result.generated).toHaveLength(0);
    expect(result.skipped).toEqual([{ sponsorId: ACME.id, reason: 'already_generated' }]);
    // No insert calls when skipping.
    expect(dx.post).not.toHaveBeenCalled();
  });

  it('skips a sponsor with zero entitled cohorts (no_audiences)', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [ACME] }) // sponsors
      .mockResolvedValueOnce({ data: [] }) // no existing digest
      .mockResolvedValueOnce({ data: [] }); // no audiences

    const result = await svc.tick(new Date('2026-04-05T00:00:00Z'));

    expect(result.skipped).toEqual([{ sponsorId: ACME.id, reason: 'no_audiences' }]);
    expect(dx.post).not.toHaveBeenCalled();
  });
});

// Extract all visible text strings from a pdfkit-rendered PDF buffer.
// pdfkit writes text as hex-encoded glyph codes in `<...>` blocks inside
// content streams (e.g. `[<41636d65> 0] TJ`). We decode each hex blob
// back to its source string and concatenate without separators (pdfkit
// emits one block per word run plus kerning adjustments, so empty-joining
// reconstructs the original strings).
function extractPdfText(pdf: Buffer): string {
  const src = pdf.toString('latin1');
  const matches = src.matchAll(/<([0-9A-Fa-f]{2,})>/g);
  let out = '';
  for (const m of matches) {
    const hex = m[1] ?? '';
    if (hex.length % 2 !== 0) continue;
    for (let i = 0; i < hex.length; i += 2) {
      const code = Number.parseInt(hex.slice(i, i + 2), 16);
      if (code >= 0x20 && code < 0x7f) out += String.fromCharCode(code);
    }
  }
  return out;
}

describe('SponsorDigestsService.renderPdf — PII boundary', () => {
  it('rendered PDF contains zero member emails / names — aggregates only', async () => {
    // Realistic rollup with non-trivial numbers so we know the PDF
    // body actually got written before we check for absent strings.
    const pdf = await svc.renderPdf(
      ACME,
      priorQuarter(new Date('2026-04-05T00:00:00Z')),
      {
        eventCount: 4,
        registrationCount: 312,
        attendedCount: 218,
        avgCsat: 4.32,
        speakerCount: 9,
      },
      [ACME_COHORT],
    );
    expect(pdf.byteLength).toBeGreaterThan(1000);

    const text = extractPdfText(pdf);

    // The visible rollup content IS written (smoke check on the
    // decoder itself — fails loud if the extractor breaks).
    expect(text).toContain('Acme AI');
    expect(text).toContain('Q1 2026');
    expect(text).toContain('UZ senior ML engineers');

    // Member-PII shapes that must NEVER appear. Our own org footer
    // email (hello@aiqadam.org) is intentional boilerplate — strip it
    // before checking for stray addresses.
    const withoutOrgEmail = text.replace(/hello@aiqadam\.org/g, '');
    expect(withoutOrgEmail).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    // Phone-shape: international (+digits) or ≥10 sequential digits.
    // Tight enough to skip date strings (2026-01-01 has only 4 then 2 then 2 digits).
    expect(text).not.toMatch(/\+\d{7,}/);
    expect(text).not.toMatch(/\b\d{10,}\b/);
    expect(text).not.toMatch(/\bMember:\s/);
    expect(text).not.toMatch(/\bUser:\s/);
  });

  it('handles empty-audiences case without throwing', async () => {
    const pdf = await svc.renderPdf(
      ACME,
      priorQuarter(new Date('2026-04-05T00:00:00Z')),
      {
        eventCount: 0,
        registrationCount: 0,
        attendedCount: 0,
        avgCsat: null,
        speakerCount: 0,
      },
      [],
    );
    expect(pdf.byteLength).toBeGreaterThan(500);
    const text = extractPdfText(pdf);
    expect(text).toContain('no cohort entitlements');
  });
});
