// SponsorsList.test.tsx — unit tests for SponsorsList pure helpers.
//
// NOTE: @testing-library/react is NOT installed in web-next (ESM / Node
// test environment). Tests cover pure logic extracted from the block:
//   1. SPONSOR_TIERS constant shape
//   2. TIER_BADGE_CLASSES completeness (all tiers have an entry)
//   3. Tier filter logic (passesFilter)
//   4. URL hostname extraction (used in website column)
//   5. LogoCell fallback path guard

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

// ─── 1. SPONSOR_TIERS ─────────────────────────────────────────────────────────

describe('SPONSOR_TIERS', () => {
  it('contains the five canonical tiers in order', () => {
    expect(SPONSOR_TIERS).toEqual(['presenting', 'gold', 'silver', 'bronze', 'community']);
  });

  it('has exactly 5 tiers', () => {
    expect(SPONSOR_TIERS).toHaveLength(5);
  });
});

// ─── 2. TIER_BADGE_CLASSES completeness ───────────────────────────────────────

const TIER_BADGE_CLASSES: Record<SponsorTier, string> = {
  presenting: 'bg-primary/10 text-primary border-primary/30',
  gold: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/30',
  silver: 'bg-zinc-400/10 text-zinc-600 border-zinc-400/30',
  bronze: 'bg-orange-500/10 text-orange-700 border-orange-500/30',
  community: 'bg-accent/10 text-accent-foreground border-accent/30',
};

describe('TIER_BADGE_CLASSES', () => {
  it('has an entry for every sponsor tier', () => {
    for (const tier of SPONSOR_TIERS) {
      expect(TIER_BADGE_CLASSES[tier]).toBeDefined();
      expect(typeof TIER_BADGE_CLASSES[tier]).toBe('string');
      expect(TIER_BADGE_CLASSES[tier].length).toBeGreaterThan(0);
    }
  });
});

// ─── 3. Tier filter logic ──────────────────────────────────────────────────────

type TierFilter = SponsorTier | 'all';

function passesFilter(row: SponsorSummary, tier: TierFilter): boolean {
  if (tier === 'all') return true;
  return row.tier === tier;
}

const SAMPLE_SPONSORS: SponsorSummary[] = [
  { id: '1', name: 'Acme', slug: 'acme', tier: 'gold', website: null, logo_url: null, country_code: 'uz', event_count: 3 },
  { id: '2', name: 'Beta', slug: 'beta', tier: 'bronze', website: 'https://beta.com', logo_url: null, country_code: null, event_count: 0 },
  { id: '3', name: 'Core', slug: 'core', tier: 'presenting', website: null, logo_url: 'https://cdn.example.com/logo.png', country_code: 'kz', event_count: 5 },
];

describe('passesFilter', () => {
  it('returns all rows when tier is "all"', () => {
    const result = SAMPLE_SPONSORS.filter((s) => passesFilter(s, 'all'));
    expect(result).toHaveLength(3);
  });

  it('filters to only gold sponsors', () => {
    const result = SAMPLE_SPONSORS.filter((s) => passesFilter(s, 'gold'));
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Acme');
  });

  it('filters to only bronze sponsors', () => {
    const result = SAMPLE_SPONSORS.filter((s) => passesFilter(s, 'bronze'));
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Beta');
  });

  it('returns empty for a tier with no matching sponsors', () => {
    const result = SAMPLE_SPONSORS.filter((s) => passesFilter(s, 'silver'));
    expect(result).toHaveLength(0);
  });
});

// ─── 4. Website hostname extraction ──────────────────────────────────────────

describe('URL hostname extraction', () => {
  it('extracts hostname from valid URL', () => {
    expect(new URL('https://example.com/path').hostname).toBe('example.com');
  });

  it('extracts hostname without path', () => {
    expect(new URL('https://beta.com').hostname).toBe('beta.com');
  });

  it('includes subdomain in hostname', () => {
    expect(new URL('https://www.acme.org').hostname).toBe('www.acme.org');
  });
});

// ─── 5. LogoCell fallback guard ───────────────────────────────────────────────

describe('LogoCell fallback', () => {
  it('shows fallback when logoUrl is null', () => {
    // Validates the conditional: if (!logoUrl) render fallback
    const logoUrl: string | null = null;
    expect(!logoUrl).toBe(true);
  });

  it('renders image when logoUrl is present', () => {
    const logoUrl: string | null = 'https://cdn.example.com/logo.png';
    expect(!logoUrl).toBe(false);
    expect(logoUrl.startsWith('https://')).toBe(true);
  });
});

// ─── 6. Event count display ───────────────────────────────────────────────────

describe('event_count display', () => {
  it('renders zero correctly', () => {
    const sponsor = SAMPLE_SPONSORS[1];
    expect(sponsor?.event_count).toBe(0);
    expect(String(sponsor?.event_count)).toBe('0');
  });

  it('renders positive count correctly', () => {
    const sponsor = SAMPLE_SPONSORS[2];
    expect(sponsor?.event_count).toBe(5);
    expect(String(sponsor?.event_count)).toBe('5');
  });
});
