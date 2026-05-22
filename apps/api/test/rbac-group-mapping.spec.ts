import { describe, expect, it } from 'vitest';
import { computeExpectedState } from '../src/modules/rbac-sync/group-mapping';

// F-S2.2 — pure mapping tests. No I/O.

describe('computeExpectedState', () => {
  it('plain member: just policy.member, no filter, no sites, viewer', () => {
    const e = computeExpectedState(['aiqadam-member']);
    expect(e.directus.policies).toEqual(['policy.member']);
    expect(e.directus.filter_country).toBeNull();
    expect(e.plausible.sites).toEqual([]);
    expect(e.plausible.role).toBe('viewer');
  });

  it('country lead KZ: policy.country_lead + member, filter_country=kz, kz site only', () => {
    const e = computeExpectedState(['aiqadam-member', 'aiqadam-country-lead-kz']);
    expect(e.directus.policies).toContain('policy.country_lead');
    expect(e.directus.policies).toContain('policy.member');
    expect(e.directus.filter_country).toBe('kz');
    expect(e.plausible.sites).toEqual(['kz.aiqadam.org']);
  });

  it('organizer UZ + speaker: both policies, filter_country=uz, uz site', () => {
    const e = computeExpectedState(['aiqadam-organizer-uz', 'aiqadam-speaker', 'aiqadam-member']);
    expect(e.directus.policies).toContain('policy.organizer');
    expect(e.directus.policies).toContain('policy.speaker');
    expect(e.directus.policies).toContain('policy.member');
    expect(e.directus.filter_country).toBe('uz');
    expect(e.plausible.sites).toEqual(['uz.aiqadam.org']);
  });

  it('super-admin overrides: all 4 sites, plausible admin, no filter', () => {
    const e = computeExpectedState([
      'aiqadam-member',
      'aiqadam-country-lead-kz',
      'aiqadam-super-admin',
    ]);
    expect(e.directus.filter_country).toBeNull();
    expect(e.plausible.role).toBe('admin');
    expect(e.plausible.sites.sort()).toEqual([
      'kz.aiqadam.org',
      'tj.aiqadam.org',
      'uz.aiqadam.org',
      'xx.aiqadam.org',
    ]);
  });

  it('sponsor rep with org-scoped group: policy.sponsor_rep applied', () => {
    const e = computeExpectedState(['aiqadam-member', 'aiqadam-sponsor-rep-acme']);
    expect(e.directus.policies).toContain('policy.sponsor_rep');
  });

  it('svc-bot: policy.svc_bot, no filter, no sites', () => {
    const e = computeExpectedState(['aiqadam-svc-bot']);
    expect(e.directus.policies).toContain('policy.svc_bot');
    expect(e.directus.filter_country).toBeNull();
    expect(e.plausible.sites).toEqual([]);
  });

  it('unknown country suffix is ignored (e.g. aiqadam-organizer-ru)', () => {
    const e = computeExpectedState(['aiqadam-member', 'aiqadam-organizer-ru']);
    // policy.organizer should NOT be added since 'ru' isn't a known country
    expect(e.directus.policies).not.toContain('policy.organizer');
    expect(e.directus.filter_country).toBeNull();
  });

  it('empty group list: still gets policy.member baseline', () => {
    const e = computeExpectedState([]);
    expect(e.directus.policies).toEqual(['policy.member']);
  });

  it('policies are deduplicated + sorted (deterministic for diff)', () => {
    const e = computeExpectedState([
      'aiqadam-member',
      'aiqadam-speaker',
      'aiqadam-organizer-kz',
      'aiqadam-organizer-kz', // dup
    ]);
    const expected = ['policy.member', 'policy.organizer', 'policy.speaker'].sort();
    expect(e.directus.policies).toEqual(expected);
  });
});
