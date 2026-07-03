// OnboardingForm.test.ts — Unit tests for the pure helper `roleGroupsText`.
//
// ISS-UAT-013-13: the helper was extracted from the inline
// `role_groups.join(', ')` expression so the empty-`role_groups`
// fallback can be tested without rendering the component. The web
// app's vitest config uses `environment: 'node'`, which means jsdom
// is NOT available — we therefore test the pure function, not the
// component, to match the existing test infrastructure footprint
// (see apps/web/src/lib/utm.test.ts for the precedent).

import { describe, expect, it } from 'vitest';
import { roleGroupsText } from './OnboardingForm.helpers';

describe('roleGroupsText', () => {
  it('returns the fallback for an empty array', () => {
    expect(roleGroupsText([])).toBe('an operator');
  });

  it('returns the fallback for undefined', () => {
    expect(roleGroupsText(undefined)).toBe('an operator');
  });

  it('returns the fallback for null (nullish-safety)', () => {
    // ISS-UAT-013-13 AC-1 covers `[]` and `undefined`; null is a
    // belt-and-braces check because the function signature accepts
    // `string[] | undefined` and `null` is a common JSON shape for
    // missing arrays.
    expect(roleGroupsText(null)).toBe('an operator');
  });

  it('returns the single role when role_groups has one element', () => {
    expect(roleGroupsText(['aiqadam-staff'])).toBe('aiqadam-staff');
  });

  it('joins multiple roles with ", "', () => {
    expect(roleGroupsText(['aiqadam-staff', 'aiqadam-editor'])).toBe(
      'aiqadam-staff, aiqadam-editor',
    );
  });
});
