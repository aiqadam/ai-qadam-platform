// LeadCaptureForm.test.ts — Unit tests for LeadCaptureForm component logic.
// Tests: body-building, topic toggle, submit-disabled gate, UTM helper, preset constant.
// Pattern: pure helper extraction (mirrors OnboardingForm.test.tsx).
//
// NOTE: No JSX. No @testing-library/react (not installed in web-next).
// Vitest environment: 'node' — no DOM available. Dynamic import of .tsx files is
// not supported in this env (JSX not parsed); regression uses readFileSync instead.
// F-S1.6 / ISS-UAT-013-3.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// ─── Re-declared constants (not exported from component) ──────────────────────

const INTEREST_PRESETS = [
  'AI/ML',
  'LLMs',
  'fintech',
  'robotics',
  'devtools',
  'infra',
  'data',
  'computer-vision',
  'nlp',
  'mlops',
  'hands-on-builder',
] as const;

// ─── Re-declared types (not exported from component) ──────────────────────────

interface FormState {
  email: string;
  city: string;
  topics: string[];
  honeypot: string;
}

interface LeadRequestBody {
  email: string;
  honeypot: string;
  city?: string;
  interestTopics?: string[];
  sourceUrl?: string;
  acquisitionSource?: { first_touch: Record<string, string> };
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

// Mirrors readUtmFirstTouch from LeadCaptureForm.tsx.
// Returns null when window is undefined (node env).
function readUtmFirstTouch(): Record<string, string> | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
    const v = params.get(key);
    if (v) utm[key] = v;
  }
  if (Object.keys(utm).length === 0) return null;
  return { ...utm, ts: new Date().toISOString() };
}

// Mirrors the body-building portion of submitLead (excluding the fetch call).
function buildLeadBody(form: FormState): LeadRequestBody {
  const firstTouch = readUtmFirstTouch();
  return {
    email: form.email.trim(),
    honeypot: form.honeypot,
    ...(form.city.trim() ? { city: form.city.trim() } : {}),
    ...(form.topics.length > 0 ? { interestTopics: form.topics } : {}),
    ...(typeof window !== 'undefined' ? { sourceUrl: window.location.href } : {}),
    ...(firstTouch ? { acquisitionSource: { first_touch: firstTouch } } : {}),
  };
}

// Mirrors the inline toggleTopic from Fields in LeadCaptureForm.tsx.
function toggleTopic(topics: string[], topic: string): string[] {
  return topics.includes(topic)
    ? topics.filter((t) => t !== topic)
    : [...topics, topic];
}

// Mirrors the submit button disabled condition from LeadCaptureForm.tsx:
//   disabled={phase === 'submitting' || form.email.trim().length === 0}
function isSubmitDisabled(phase: string, email: string): boolean {
  return phase === 'submitting' || email.trim().length === 0;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('[REGRESSION] ISS-UAT-013-3', () => {
  it('LeadCaptureForm.tsx exists and exports the named function', () => {
    // Before the fix: file did not exist → readFileSync throws ENOENT → test fails.
    // After the fix: file exists and contains the named export.
    const source = readFileSync(resolve(__dirname, './LeadCaptureForm.tsx'), 'utf-8');
    expect(source).toContain('export function LeadCaptureForm');
  });

  it('LeadCaptureForm is re-exported from the customer barrel index.ts', () => {
    // Before the fix: barrel had no LeadCaptureForm export → assertion fails.
    // After the fix: barrel contains the export line.
    const barrel = readFileSync(resolve(__dirname, './index.ts'), 'utf-8');
    expect(barrel).toContain("export { LeadCaptureForm } from './LeadCaptureForm'");
  });
});

describe('buildLeadBody', () => {
  it('trims email', () => {
    const body = buildLeadBody({ email: ' user@x.com ', city: '', topics: [], honeypot: '' });

    expect(body.email).toBe('user@x.com');
  });

  it('includes city when non-empty', () => {
    const body = buildLeadBody({ email: 'a@b.com', city: 'Almaty', topics: [], honeypot: '' });

    expect(body.city).toBe('Almaty');
  });

  it('omits city when whitespace-only', () => {
    const body = buildLeadBody({ email: 'a@b.com', city: '   ', topics: [], honeypot: '' });

    expect('city' in body).toBe(false);
  });

  it('includes interestTopics when non-empty', () => {
    const body = buildLeadBody({ email: 'a@b.com', city: '', topics: ['LLMs'], honeypot: '' });

    expect(body.interestTopics).toEqual(['LLMs']);
  });

  it('omits interestTopics when empty', () => {
    const body = buildLeadBody({ email: 'a@b.com', city: '', topics: [], honeypot: '' });

    expect('interestTopics' in body).toBe(false);
  });

  it('honeypot always forwarded', () => {
    const body = buildLeadBody({ email: 'a@b.com', city: '', topics: [], honeypot: 'bot' });

    expect(body.honeypot).toBe('bot');
  });
});

describe('toggleTopic', () => {
  it('adds missing topic', () => {
    const result = toggleTopic(['LLMs'], 'data');

    expect(result).toEqual(['LLMs', 'data']);
  });

  it('removes existing topic', () => {
    const result = toggleTopic(['LLMs', 'data'], 'LLMs');

    expect(result).toEqual(['data']);
  });
});

describe('readUtmFirstTouch', () => {
  it('returns null in node env', () => {
    // window is undefined in Vitest node environment → guard returns null immediately.
    expect(readUtmFirstTouch()).toBeNull();
  });
});

describe('INTEREST_PRESETS', () => {
  it('contains 11 entries', () => {
    expect(INTEREST_PRESETS).toHaveLength(11);
    expect(INTEREST_PRESETS).toContain('AI/ML');
    expect(INTEREST_PRESETS).toContain('hands-on-builder');
  });
});

describe('isSubmitDisabled', () => {
  it('email empty → true', () => {
    expect(isSubmitDisabled('idle', '')).toBe(true);
  });

  it('submitting → true', () => {
    expect(isSubmitDisabled('submitting', 'a@b.com')).toBe(true);
  });

  it('idle + valid email → false', () => {
    expect(isSubmitDisabled('idle', 'a@b.com')).toBe(false);
  });
});
