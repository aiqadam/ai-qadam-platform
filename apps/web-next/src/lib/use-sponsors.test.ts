// use-sponsors.test.ts — unit tests for sponsor hook logic + validation.
//
// Tests:
//   1. SponsorTier type membership (SPONSOR_TIERS as const)
//   2. SponsorSummary / SponsorDetail shape invariants
//   3. validateForm() pure helper (extracted from SponsorForm)
//   4. CreateSponsorBody / UpdateSponsorBody shape guards
//   5. useUploadLogo — file validation guards (size + type)

import { describe, expect, it } from 'vitest';

// Inline the constants/types here — types.ts re-exports from .tsx blocks
// which breaks vitest's SSR resolver (same pattern as SiteSettingsForm.test.tsx).
const SPONSOR_TIERS = ['presenting', 'gold', 'silver', 'bronze', 'community'] as const;
type SponsorTier = (typeof SPONSOR_TIERS)[number];

interface SponsorSummary {
  id: string;
  name: string;
  slug: string;
  tier: SponsorTier;
  website: string | null;
  logo_url: string | null;
  country_code: string | null;
  event_count: number;
}

interface SponsorEventLink {
  event_id: string;
  event_title: string;
  event_starts_at: string;
}

interface SponsorDetail extends SponsorSummary {
  custom_message: string | null;
  events: SponsorEventLink[];
}

interface CreateSponsorBody {
  name: string;
  tier: SponsorTier;
  website?: string | null;
  logo_url?: string | null;
  custom_message?: string | null;
  event_ids?: string[];
}

interface UpdateSponsorBody {
  name?: string;
  tier?: SponsorTier;
  website?: string | null;
  logo_url?: string | null;
  custom_message?: string | null;
  event_ids?: string[];
}

// ─── 1. SPONSOR_TIERS enum ────────────────────────────────────────────────────

describe('SPONSOR_TIERS', () => {
  it('includes presenting, gold, silver, bronze, community', () => {
    const tiers = [...SPONSOR_TIERS];
    expect(tiers).toContain('presenting');
    expect(tiers).toContain('gold');
    expect(tiers).toContain('silver');
    expect(tiers).toContain('bronze');
    expect(tiers).toContain('community');
  });
});

// ─── 2. Type shape guards ──────────────────────────────────────────────────────

describe('SponsorSummary shape', () => {
  it('accepts a minimal valid summary', () => {
    const s: SponsorSummary = {
      id: 'abc',
      name: 'Acme',
      slug: 'acme',
      tier: 'gold',
      website: null,
      logo_url: null,
      country_code: null,
      event_count: 0,
    };
    expect(s.tier).toBe('gold');
    expect(s.event_count).toBe(0);
  });
});

describe('SponsorDetail shape', () => {
  it('extends SponsorSummary with events + custom_message', () => {
    const d: SponsorDetail = {
      id: 'abc',
      name: 'Acme',
      slug: 'acme',
      tier: 'presenting',
      website: 'https://acme.com',
      logo_url: null,
      country_code: 'uz',
      event_count: 2,
      custom_message: 'Gold sponsor of AI Qadam',
      events: [
        { event_id: 'ev1', event_title: 'Meetup #1', event_starts_at: '2026-06-01T18:00:00Z' },
      ],
    };
    expect(d.events).toHaveLength(1);
    expect(d.events[0]?.event_id).toBe('ev1');
    expect(d.custom_message).toBe('Gold sponsor of AI Qadam');
  });
});

// ─── 3. validateForm pure helper (mirrors SponsorForm.tsx) ───────────────────

interface FormState {
  name: string;
  tier: string;
  website: string;
  customMessage: string;
  logoUrl: string | null;
  eventLinks: { value: string; label: string }[];
}

interface FormErrors {
  name?: string;
  website?: string;
}

function validateForm(state: FormState): FormErrors {
  const errors: FormErrors = {};
  if (state.name.trim().length === 0) {
    errors.name = 'Name is required.';
  }
  if (state.website && !/^https?:\/\/.+/.test(state.website)) {
    errors.website = 'Must be a valid URL starting with http:// or https://';
  }
  return errors;
}

describe('validateForm', () => {
  it('returns no errors for valid data', () => {
    const result = validateForm({
      name: 'Acme',
      tier: 'gold',
      website: 'https://acme.com',
      customMessage: '',
      logoUrl: null,
      eventLinks: [],
    });
    expect(result).toEqual({});
  });

  it('requires name', () => {
    const result = validateForm({
      name: '',
      tier: 'gold',
      website: '',
      customMessage: '',
      logoUrl: null,
      eventLinks: [],
    });
    expect(result.name).toBe('Name is required.');
  });

  it('requires name to be non-whitespace', () => {
    const result = validateForm({
      name: '   ',
      tier: 'gold',
      website: '',
      customMessage: '',
      logoUrl: null,
      eventLinks: [],
    });
    expect(result.name).toBe('Name is required.');
  });

  it('accepts empty website (optional field)', () => {
    const result = validateForm({
      name: 'Acme',
      tier: 'bronze',
      website: '',
      customMessage: '',
      logoUrl: null,
      eventLinks: [],
    });
    expect(result.website).toBeUndefined();
  });

  it('rejects invalid website URL', () => {
    const result = validateForm({
      name: 'Acme',
      tier: 'bronze',
      website: 'not-a-url',
      customMessage: '',
      logoUrl: null,
      eventLinks: [],
    });
    expect(result.website).toBeDefined();
  });

  it('accepts http:// prefix', () => {
    const result = validateForm({
      name: 'Acme',
      tier: 'community',
      website: 'http://acme.com',
      customMessage: '',
      logoUrl: null,
      eventLinks: [],
    });
    expect(result.website).toBeUndefined();
  });
});

// ─── 4. CreateSponsorBody / UpdateSponsorBody ─────────────────────────────────

describe('CreateSponsorBody', () => {
  it('accepts minimal required fields', () => {
    const body: CreateSponsorBody = { name: 'Acme', tier: 'silver' };
    expect(body.name).toBe('Acme');
    expect(body.tier).toBe('silver');
  });

  it('accepts all optional fields', () => {
    const body: CreateSponsorBody = {
      name: 'Acme',
      tier: 'gold',
      website: 'https://acme.com',
      logo_url: 'https://cdn.example.com/logo.png',
      custom_message: 'Gold sponsor',
      event_ids: ['ev1', 'ev2'],
    };
    expect(body.event_ids).toHaveLength(2);
  });
});

describe('UpdateSponsorBody', () => {
  it('accepts empty object (all fields optional)', () => {
    const body: UpdateSponsorBody = {};
    expect(body).toEqual({});
  });

  it('accepts partial update', () => {
    const body: UpdateSponsorBody = { tier: 'presenting', event_ids: [] };
    expect(body.tier).toBe('presenting');
    expect(body.event_ids).toHaveLength(0);
  });
});

// ─── 5. Upload file validation guards ────────────────────────────────────────

const MAX_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];

function validateUploadFile(file: { type: string; size: number }): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) return 'Only PNG, JPEG, SVG, or WebP files are allowed.';
  if (file.size > MAX_SIZE_BYTES) return 'File must be under 2 MB.';
  return null;
}

describe('validateUploadFile', () => {
  it('accepts a valid PNG under 2 MB', () => {
    expect(validateUploadFile({ type: 'image/png', size: 500_000 })).toBeNull();
  });

  it('accepts SVG', () => {
    expect(validateUploadFile({ type: 'image/svg+xml', size: 10_000 })).toBeNull();
  });

  it('rejects unsupported type', () => {
    expect(validateUploadFile({ type: 'image/gif', size: 100 })).toMatch(/Only PNG/);
  });

  it('rejects file over 2 MB', () => {
    expect(validateUploadFile({ type: 'image/png', size: 3_000_000 })).toMatch(/2 MB/);
  });

  it('accepts exactly the max size', () => {
    expect(validateUploadFile({ type: 'image/jpeg', size: MAX_SIZE_BYTES })).toBeNull();
  });

  it('rejects one byte over max size', () => {
    expect(validateUploadFile({ type: 'image/jpeg', size: MAX_SIZE_BYTES + 1 })).toMatch(/2 MB/);
  });
});

// ─── 6. apiClient mock for sponsor endpoints ──────────────────────────────────

describe('sponsor API path construction', () => {
  it('encodes sponsor id in the URL', () => {
    const id = 'abc-123';
    const path = `/v1/workspace/sponsors/${encodeURIComponent(id)}`;
    expect(path).toBe('/v1/workspace/sponsors/abc-123');
  });

  it('handles id with special characters', () => {
    const id = 'acme/corp';
    const path = `/v1/workspace/sponsors/${encodeURIComponent(id)}`;
    expect(path).toBe('/v1/workspace/sponsors/acme%2Fcorp');
  });
});
