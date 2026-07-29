// roles.test.ts — Unit tests for role predicates + FR-ADM-011's
// plain-language label mapping.
//
// Per standards.md §IV: AAA pattern, one describe per function.

import { describe, expect, it } from 'vitest';
import { isOperator, isSuperAdmin, roleLabel, roleLabels, satisfiesRole } from './roles';

describe('isSuperAdmin', () => {
  it('returns true for aiqadam-super-admin', () => {
    expect(isSuperAdmin(['aiqadam-member', 'aiqadam-super-admin'])).toBe(true);
  });

  it('returns false when the group is absent', () => {
    expect(isSuperAdmin(['aiqadam-member'])).toBe(false);
  });
});

describe('isOperator', () => {
  it('returns true for a country-lead group via prefix match', () => {
    expect(isOperator(['aiqadam-country-lead-uz'])).toBe(true);
  });

  it('returns false for a plain member', () => {
    expect(isOperator(['aiqadam-member'])).toBe(false);
  });
});

describe('satisfiesRole', () => {
  it('expands the operator semantic token', () => {
    expect(satisfiesRole('aiqadam-operators', ['aiqadam-organizer-kz'])).toBe(true);
  });

  it('matches a literal group for any other token', () => {
    expect(satisfiesRole('aiqadam-speaker', ['aiqadam-speaker'])).toBe(true);
  });
});

describe('roleLabel', () => {
  it('maps every fixed ADR-0021 role to its plain-language label', () => {
    expect(roleLabel('aiqadam-member')).toBe('Member');
    expect(roleLabel('aiqadam-speaker')).toBe('Speaker');
    expect(roleLabel('aiqadam-sponsor-rep')).toBe('Sponsor Rep');
    expect(roleLabel('aiqadam-super-admin')).toBe('Super Admin');
    expect(roleLabel('aiqadam-svc-bot')).toBe('Bot Service');
    expect(roleLabel('aiqadam-svc-worker')).toBe('Worker Service');
  });

  it('resolves a per-country organizer group to "Organizer — <Country>"', () => {
    expect(roleLabel('aiqadam-organizer-uz')).toBe('Organizer — Uzbekistan');
    expect(roleLabel('aiqadam-organizer-kz')).toBe('Organizer — Kazakhstan');
  });

  it('resolves a per-country country-lead group to "Country Lead — <Country>"', () => {
    expect(roleLabel('aiqadam-country-lead-tj')).toBe('Country Lead — Tajikistan');
  });

  it('falls back to the uppercased code for an unknown country suffix', () => {
    expect(roleLabel('aiqadam-organizer-xy')).toBe('Organizer — XY');
  });

  it('resolves a per-org sponsor-rep group to "Sponsor Rep — <org>"', () => {
    expect(roleLabel('aiqadam-sponsor-rep-acme')).toBe('Sponsor Rep — acme');
  });

  it('falls back to the raw slug for a completely unknown group (never throws)', () => {
    expect(roleLabel('some-unmapped-group')).toBe('some-unmapped-group');
  });
});

describe('roleLabels', () => {
  it('maps an array of groups, preserving order', () => {
    expect(roleLabels(['aiqadam-member', 'aiqadam-country-lead-uz'])).toEqual([
      'Member',
      'Country Lead — Uzbekistan',
    ]);
  });

  it('returns an empty array for an empty input', () => {
    expect(roleLabels([])).toEqual([]);
  });
});
