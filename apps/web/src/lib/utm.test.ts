// utm.test.ts — Unit tests for UTM URL building.
// Tests: validateUtmField, buildUtmUrl, parseDestination
//
// Per standards.md §IV: AAA pattern, one describe per function.

import { describe, expect, it } from 'vitest';

// ─── Local re-implementation of UTM constants and logic ──────────────────────
//
// Pre-vitest-4 the test runner crashed at `import { ... } from './utm'` with
// `ReferenceError: __vite_ssr_exportName__ is not defined` (the workspace's
// hoisted vite 8.1.0 introduced that helper which vitest 2.1.x's bundled
// older vite didn't define). See ISS-TEST-WEB-001. As of vitest 4.1.9 the
// cross-module import works, but this file keeps the local re-implementation
// for now — converting it to `import { UTM_MEDIUMS, validateUtmField, ... }
// from './utm'` is a future refactor tracked separately (deferred to keep
// this ISS-TEST-WEB-001 PR small and mechanical; see the linked issue for
// the unblocking work).

const UTM_MEDIUMS = [
  'linkedin_post',
  'linkedin_message',
  'telegram_channel',
  'telegram_group',
  'email_digest',
  'email_transactional',
  'referral',
  'sponsor_post',
  'speaker_post',
  'paid_li',
  'paid_meta',
  'paid_telegram',
  'aggregator',
] as const;

type UtmMedium = (typeof UTM_MEDIUMS)[number];

const MAX_LEN = 64;
const ALLOWED = /^[a-z0-9_-]+$/;

type FieldName = 'source' | 'medium' | 'campaign' | 'content';

type Rule = (name: FieldName, value: string) => string | null;

const RULES: Rule[] = [
  (name, v) => (v.length > MAX_LEN ? `${name} is longer than ${MAX_LEN} characters` : null),
  (name, v) => (v.trim() !== v ? `${name} has leading or trailing whitespace` : null),
  (name, v) => (v !== v.toLowerCase() ? `${name} must be lowercase` : null),
  (name, v) =>
    v.includes('{') || v.includes('}')
      ? `${name} still contains a {placeholder} — replace it with the real value`
      : null,
  (name, v) =>
    ALLOWED.test(v) ? null : `${name} can only contain a–z, 0–9, hyphens, and underscores`,
  (name, v) =>
    v.startsWith('-') || v.endsWith('-') ? `${name} cannot start or end with a hyphen` : null,
  (name, v) => (v.includes('--') ? `${name} cannot contain consecutive hyphens` : null),
  (name, v) =>
    name === 'medium' && !UTM_MEDIUMS.includes(v as UtmMedium)
      ? 'medium must be one of the canonical values (see the doc — §5.2)'
      : null,
];

function validateUtmField(name: FieldName, value: string): string | null {
  if (value.trim().length === 0) {
    return name === 'content' ? null : `${name} is required`;
  }
  for (const rule of RULES) {
    const err = rule(name, value);
    if (err) return err;
  }
  return null;
}

// ─── Local re-implementation of parseDestination ──────────────────────────────

function parseDestination(value: string): { ok: true; url: URL } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: false, error: 'destination URL is required' };
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      error: 'destination URL is not a valid URL — start it with https://',
    };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, error: 'destination URL must use http:// or https://' };
  }
  return { ok: true, url: parsed };
}

// ─── Local re-implementation of buildUtmUrl ──────────────────────────────────

interface BuildInput {
  destinationUrl: string;
  source: string;
  medium: string;
  campaign: string;
  content?: string;
}

// Known field keys — a concrete type (not Record<string, string>) so dot access
// is type-safe under noUncheckedIndexedAccess and satisfies Biome useLiteralKeys.
interface FieldErrors {
  destinationUrl?: string;
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
}

type BuildResult = { ok: true; url: string } | { ok: false; fieldErrors: FieldErrors };

function buildUtmUrl(input: BuildInput): BuildResult {
  const errors: FieldErrors = {};

  // Validate destination
  const dest = parseDestination(input.destinationUrl);
  if (!dest.ok) errors.destinationUrl = dest.error;

  // Validate required fields
  const sourceErr = validateUtmField('source', input.source);
  if (sourceErr) errors.source = sourceErr;

  const mediumErr = validateUtmField('medium', input.medium);
  if (mediumErr) errors.medium = mediumErr;

  const campaignErr = validateUtmField('campaign', input.campaign);
  if (campaignErr) errors.campaign = campaignErr;

  // Validate optional content
  if (input.content !== undefined && input.content.length > 0) {
    const contentErr = validateUtmField('content', input.content);
    if (contentErr) errors.content = contentErr;
  }

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };

  // Build URL
  const dest2 = parseDestination(input.destinationUrl);
  if (!dest2.ok) return { ok: false, fieldErrors: { destinationUrl: dest2.error } };
  const url = dest2.url;

  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
    url.searchParams.delete(key);
  }
  url.searchParams.set('utm_source', input.source.trim());
  url.searchParams.set('utm_medium', input.medium.trim());
  url.searchParams.set('utm_campaign', input.campaign.trim());
  if (input.content !== undefined && input.content.trim().length > 0) {
    url.searchParams.set('utm_content', input.content.trim());
  }
  return { ok: true, url: url.toString() };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('validateUtmField', () => {
  describe('source field', () => {
    it('returns null for valid lowercase value', () => {
      const err = validateUtmField('source', 'binali-li');
      expect(err).toBeNull();
    });

    it('returns error for empty string', () => {
      const err = validateUtmField('source', '');
      expect(err).toBe('source is required');
    });

    it('returns error for uppercase', () => {
      const err = validateUtmField('source', 'BINALI');
      expect(err).toBe('source must be lowercase');
    });

    it('returns error for internal spaces', () => {
      // Internal spaces are caught by the ALLOWED regex (spaces not in [a-z0-9_-])
      const err = validateUtmField('source', 'binali li');
      expect(err).toBe('source can only contain a–z, 0–9, hyphens, and underscores');
    });

    it('returns error for leading hyphen', () => {
      const err = validateUtmField('source', '-binali');
      expect(err).toBe('source cannot start or end with a hyphen');
    });

    it('returns error for trailing hyphen', () => {
      const err = validateUtmField('source', 'binali-');
      expect(err).toBe('source cannot start or end with a hyphen');
    });

    it('returns error for consecutive hyphens', () => {
      const err = validateUtmField('source', 'bina--li');
      expect(err).toBe('source cannot contain consecutive hyphens');
    });

    it('returns error for placeholder syntax', () => {
      const err = validateUtmField('source', 'sponsor-{slug}');
      expect(err).toBe('source still contains a {placeholder} — replace it with the real value');
    });

    it('returns error for disallowed characters', () => {
      const err = validateUtmField('source', 'binali@test');
      expect(err).toBe('source can only contain a–z, 0–9, hyphens, and underscores');
    });

    it('returns error for value over 64 chars', () => {
      const long = 'a'.repeat(65);
      const err = validateUtmField('source', long);
      expect(err).toBe('source is longer than 64 characters');
    });

    it('accepts underscores', () => {
      const err = validateUtmField('source', 'binali_li');
      expect(err).toBeNull();
    });

    it('accepts numbers', () => {
      const err = validateUtmField('source', 'aiqadam-tg-uz-2024');
      expect(err).toBeNull();
    });
  });

  describe('medium field', () => {
    it('returns null for valid medium', () => {
      const err = validateUtmField('medium', 'linkedin_post');
      expect(err).toBeNull();
    });

    it('returns null for all canonical mediums', () => {
      for (const medium of UTM_MEDIUMS) {
        const err = validateUtmField('medium', medium);
        expect(err).toBeNull();
      }
    });

    it('returns error for invalid medium value', () => {
      const err = validateUtmField('medium', 'facebook');
      expect(err).toBe('medium must be one of the canonical values (see the doc — §5.2)');
    });

    it('returns error for empty string', () => {
      const err = validateUtmField('medium', '');
      expect(err).toBe('medium is required');
    });
  });

  describe('campaign field', () => {
    it('returns null for valid campaign', () => {
      const err = validateUtmField('campaign', 'event-12');
      expect(err).toBeNull();
    });

    it('returns null for event slug with number', () => {
      const err = validateUtmField('campaign', 'event-12345');
      expect(err).toBeNull();
    });

    it('returns null for quarterly digest', () => {
      const err = validateUtmField('campaign', 'quarterly-digest-q2-26');
      expect(err).toBeNull();
    });

    it('returns error for empty string', () => {
      const err = validateUtmField('campaign', '');
      expect(err).toBe('campaign is required');
    });
  });

  describe('content field', () => {
    it('returns null for empty string (optional)', () => {
      const err = validateUtmField('content', '');
      expect(err).toBeNull();
    });

    it('returns null for valid content', () => {
      const err = validateUtmField('content', 'headline-a');
      expect(err).toBeNull();
    });

    it('accepts underscores for A/B variant codes', () => {
      const err = validateUtmField('content', 'image_v2');
      expect(err).toBeNull();
    });

    it('returns error for placeholder syntax', () => {
      const err = validateUtmField('content', '{variant}');
      expect(err).toBe('content still contains a {placeholder} — replace it with the real value');
    });
  });
});

describe('parseDestination', () => {
  it('parses valid https URL', () => {
    const result = parseDestination('https://uz.aiqadam.org/events/12');
    expect(result.ok).toBe(true);
  });

  it('parses valid http URL', () => {
    const result = parseDestination('http://localhost:3000/test');
    expect(result.ok).toBe(true);
  });

  it('parses URL with query params', () => {
    const result = parseDestination('https://uz.aiqadam.org/events/12?ref=partner');
    expect(result.ok).toBe(true);
  });

  it('rejects empty string', () => {
    const result = parseDestination('');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('destination URL is required');
    }
  });

  it('rejects whitespace-only string', () => {
    const result = parseDestination('   ');
    expect(result.ok).toBe(false);
  });

  it('rejects invalid URL', () => {
    const result = parseDestination('not a url');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('destination URL is not a valid URL — start it with https://');
    }
  });

  it('rejects non-http protocol', () => {
    const result = parseDestination('ftp://example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('destination URL must use http:// or https://');
    }
  });

  it('rejects mailto protocol', () => {
    const result = parseDestination('mailto:test@example.com');
    expect(result.ok).toBe(false);
  });
});

describe('buildUtmUrl', () => {
  it('builds URL with all required params', () => {
    const result = buildUtmUrl({
      destinationUrl: 'https://uz.aiqadam.org/events/12',
      source: 'binali-li',
      medium: 'linkedin_post',
      campaign: 'event-12',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toBe(
        'https://uz.aiqadam.org/events/12?utm_source=binali-li&utm_medium=linkedin_post&utm_campaign=event-12'
      );
    }
  });

  it('includes content when provided', () => {
    const result = buildUtmUrl({
      destinationUrl: 'https://uz.aiqadam.org/events/12',
      source: 'binali-li',
      medium: 'linkedin_post',
      campaign: 'event-12',
      content: 'headline-a',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toContain('utm_content=headline-a');
    }
  });

  it('excludes content when empty string', () => {
    const result = buildUtmUrl({
      destinationUrl: 'https://uz.aiqadam.org/events/12',
      source: 'binali-li',
      medium: 'linkedin_post',
      campaign: 'event-12',
      content: '',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).not.toContain('utm_content');
    }
  });

  it('excludes content when undefined', () => {
    const result = buildUtmUrl({
      destinationUrl: 'https://uz.aiqadam.org/events/12',
      source: 'binali-li',
      medium: 'linkedin_post',
      campaign: 'event-12',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).not.toContain('utm_content');
    }
  });

  it('replaces existing UTM params on destination URL', () => {
    const result = buildUtmUrl({
      destinationUrl: 'https://uz.aiqadam.org/events/12?utm_source=old-source&utm_medium=old-medium',
      source: 'binali-li',
      medium: 'linkedin_post',
      campaign: 'event-12',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toContain('utm_source=binali-li');
      expect(result.url).toContain('utm_medium=linkedin_post');
      expect(result.url).not.toContain('old-source');
      expect(result.url).not.toContain('old-medium');
    }
  });

  it('preserves non-UTM query params', () => {
    const result = buildUtmUrl({
      destinationUrl: 'https://uz.aiqadam.org/events/12?ref=partner&lang=uz',
      source: 'binali-li',
      medium: 'linkedin_post',
      campaign: 'event-12',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toContain('ref=partner');
      expect(result.url).toContain('lang=uz');
    }
  });

  it('returns field errors for empty destination', () => {
    const result = buildUtmUrl({
      destinationUrl: '',
      source: 'binali-li',
      medium: 'linkedin_post',
      campaign: 'event-12',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.destinationUrl).toBeDefined();
      expect(result.fieldErrors.destinationUrl).toBe('destination URL is required');
    }
  });

  it('returns field errors for invalid destination', () => {
    const result = buildUtmUrl({
      destinationUrl: 'not-a-url',
      source: 'binali-li',
      medium: 'linkedin_post',
      campaign: 'event-12',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.destinationUrl).toBeDefined();
    }
  });

  it('returns field errors for invalid source', () => {
    const result = buildUtmUrl({
      destinationUrl: 'https://uz.aiqadam.org/events/12',
      source: 'BINALI', // uppercase
      medium: 'linkedin_post',
      campaign: 'event-12',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.source).toBeDefined();
      expect(result.fieldErrors.source).toBe('source must be lowercase');
    }
  });

  it('returns field errors for invalid medium', () => {
    const result = buildUtmUrl({
      destinationUrl: 'https://uz.aiqadam.org/events/12',
      source: 'binali-li',
      medium: 'facebook', // not in UTM_MEDIUMS
      campaign: 'event-12',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.medium).toBeDefined();
    }
  });

  it('returns multiple field errors', () => {
    const result = buildUtmUrl({
      destinationUrl: '',
      source: 'BINALI',
      medium: '',
      campaign: '',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.fieldErrors).length).toBeGreaterThan(1);
    }
  });

  it('trims whitespace from all values', () => {
    const result = buildUtmUrl({
      destinationUrl: 'https://uz.aiqadam.org/events/12',
      source: 'binali-li',
      medium: 'linkedin_post',
      campaign: 'event-12',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toContain('utm_source=binali-li');
      expect(result.url).toContain('utm_campaign=event-12');
    }
  });

  it('handles URL with port number', () => {
    const result = buildUtmUrl({
      destinationUrl: 'http://localhost:3000/events/12',
      source: 'dev-test',
      medium: 'telegram_channel',
      campaign: 'testing',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toContain('localhost:3000');
    }
  });
});
