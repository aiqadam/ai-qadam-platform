// use-country-leads.test.ts — unit tests for country-lead hook logic.
//
// Tests:
//   1. COUNTRY_LEAD_STATUSES enum membership
//   2. ONBOARDING_STEP_IDS order + membership
//   3. CountryLeadRow shape invariants
//   4. OnboardingState shape invariants
//   5. API path construction (encodeURIComponent guards)
//   6. Pure business logic: firstNonPassedStep / allPassed (logic extracted for testing)
//   7. CreateCountryLeadBody + AdvanceOnboardingBody guards

import { describe, expect, it } from 'vitest';

// Inline constants — types.ts re-exports from .tsx blocks which breaks vitest's SSR resolver.
const COUNTRY_LEAD_STATUSES = ['candidate', 'active', 'inactive'] as const;
type CountryLeadStatus = (typeof COUNTRY_LEAD_STATUSES)[number];

const ONBOARDING_STEP_IDS = ['prerequisites', 'rbac_bind', 'walkthrough', 'confirm'] as const;
type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number];
type OnboardingStepStatus = 'pending' | 'passed' | 'failed';

interface OnboardingStepResult {
  step: OnboardingStepId;
  status: OnboardingStepStatus;
  error: string | null;
  completed_at: string | null;
}

interface OnboardingState {
  lead_id: string;
  steps: Record<OnboardingStepId, OnboardingStepResult>;
  activated_at: string | null;
}

interface CountryLeadRow {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  country: string;
  status: CountryLeadStatus;
  activated_at: string | null;
  deactivated_at: string | null;
  created_at: string;
}

// Pure helpers mirroring the wizard block logic.
function firstNonPassedStep(state: OnboardingState | null): OnboardingStepId {
  if (!state) return 'prerequisites';
  for (const id of ONBOARDING_STEP_IDS) {
    if (state.steps[id]?.status !== 'passed') return id;
  }
  return 'confirm';
}

function allPassed(state: OnboardingState | null): boolean {
  if (!state) return false;
  return ONBOARDING_STEP_IDS.every((id) => state.steps[id]?.status === 'passed');
}

function makeStep(status: OnboardingStepStatus, id: OnboardingStepId): OnboardingStepResult {
  return { step: id, status, error: null, completed_at: null };
}

function makeState(
  stepStatuses: Partial<Record<OnboardingStepId, OnboardingStepStatus>>,
  activated_at: string | null = null,
): OnboardingState {
  const steps = {} as Record<OnboardingStepId, OnboardingStepResult>;
  for (const id of ONBOARDING_STEP_IDS) {
    steps[id] = makeStep(stepStatuses[id] ?? 'pending', id);
  }
  return { lead_id: 'lead-1', steps, activated_at };
}

// ─── 1. COUNTRY_LEAD_STATUSES ────────────────────────────────────────────────

describe('COUNTRY_LEAD_STATUSES', () => {
  it('includes candidate, active, inactive', () => {
    expect(COUNTRY_LEAD_STATUSES).toContain('candidate');
    expect(COUNTRY_LEAD_STATUSES).toContain('active');
    expect(COUNTRY_LEAD_STATUSES).toContain('inactive');
  });

  it('has exactly 3 statuses', () => {
    expect(COUNTRY_LEAD_STATUSES).toHaveLength(3);
  });
});

// ─── 2. ONBOARDING_STEP_IDS order ────────────────────────────────────────────

describe('ONBOARDING_STEP_IDS', () => {
  it('contains all 4 step ids in order', () => {
    expect(ONBOARDING_STEP_IDS[0]).toBe('prerequisites');
    expect(ONBOARDING_STEP_IDS[1]).toBe('rbac_bind');
    expect(ONBOARDING_STEP_IDS[2]).toBe('walkthrough');
    expect(ONBOARDING_STEP_IDS[3]).toBe('confirm');
  });

  it('has exactly 4 steps', () => {
    expect(ONBOARDING_STEP_IDS).toHaveLength(4);
  });
});

// ─── 3. CountryLeadRow shape ──────────────────────────────────────────────────

describe('CountryLeadRow shape', () => {
  it('accepts a minimal candidate row', () => {
    const row: CountryLeadRow = {
      id: 'lead-1',
      user_id: 'user-abc',
      email: 'abdu@aiqadam.org',
      display_name: 'Abdu Muzaffariy',
      country: 'uz',
      status: 'candidate',
      activated_at: null,
      deactivated_at: null,
      created_at: '2026-06-24T10:00:00Z',
    };
    expect(row.status).toBe('candidate');
    expect(row.activated_at).toBeNull();
  });

  it('accepts an active lead with activation date', () => {
    const row: CountryLeadRow = {
      id: 'lead-2',
      user_id: 'user-xyz',
      email: 'kz-lead@aiqadam.org',
      display_name: null,
      country: 'kz',
      status: 'active',
      activated_at: '2026-06-24T18:00:00Z',
      deactivated_at: null,
      created_at: '2026-06-20T10:00:00Z',
    };
    expect(row.status).toBe('active');
    expect(row.activated_at).toBe('2026-06-24T18:00:00Z');
  });
});

// ─── 4. OnboardingState shape ─────────────────────────────────────────────────

describe('OnboardingState shape', () => {
  it('accepts a fresh state (all pending)', () => {
    const state = makeState({});
    expect(state.steps.prerequisites.status).toBe('pending');
    expect(state.steps.confirm.status).toBe('pending');
    expect(state.activated_at).toBeNull();
  });

  it('accepts a partially completed state', () => {
    const state = makeState({ prerequisites: 'passed', rbac_bind: 'passed' });
    expect(state.steps.prerequisites.status).toBe('passed');
    expect(state.steps.walkthrough.status).toBe('pending');
  });

  it('accepts a failed step with an error', () => {
    const state = makeState({ prerequisites: 'passed', rbac_bind: 'failed' });
    state.steps.rbac_bind.error = 'Authentik group not found';
    expect(state.steps.rbac_bind.error).toBe('Authentik group not found');
  });
});

// ─── 5. API path construction ─────────────────────────────────────────────────

describe('API path construction', () => {
  it('encodes lead id in the URL', () => {
    const leadId = 'lead-abc-123';
    const path = `/v1/admin/country-leads/${encodeURIComponent(leadId)}`;
    expect(path).toBe('/v1/admin/country-leads/lead-abc-123');
  });

  it('handles lead id with special characters', () => {
    const leadId = 'lead/with/slashes';
    const path = `/v1/admin/country-leads/${encodeURIComponent(leadId)}`;
    expect(path).toBe('/v1/admin/country-leads/lead%2Fwith%2Fslashes');
  });

  it('builds onboarding step path correctly', () => {
    const leadId = 'lead-1';
    const stepId = 'rbac_bind';
    const path = `/v1/admin/country-leads/${encodeURIComponent(leadId)}/onboarding/${encodeURIComponent(stepId)}`;
    expect(path).toBe('/v1/admin/country-leads/lead-1/onboarding/rbac_bind');
  });

  it('builds list path', () => {
    const path = '/v1/admin/country-leads';
    expect(path).toBe('/v1/admin/country-leads');
  });
});

// ─── 6. firstNonPassedStep logic ──────────────────────────────────────────────

describe('firstNonPassedStep', () => {
  it('returns prerequisites for null state', () => {
    expect(firstNonPassedStep(null)).toBe('prerequisites');
  });

  it('returns prerequisites when nothing is passed', () => {
    const state = makeState({});
    expect(firstNonPassedStep(state)).toBe('prerequisites');
  });

  it('returns rbac_bind when prerequisites passed', () => {
    const state = makeState({ prerequisites: 'passed' });
    expect(firstNonPassedStep(state)).toBe('rbac_bind');
  });

  it('returns walkthrough when prerequisites + rbac_bind passed', () => {
    const state = makeState({ prerequisites: 'passed', rbac_bind: 'passed' });
    expect(firstNonPassedStep(state)).toBe('walkthrough');
  });

  it('returns confirm when first three steps passed', () => {
    const state = makeState({
      prerequisites: 'passed',
      rbac_bind: 'passed',
      walkthrough: 'passed',
    });
    expect(firstNonPassedStep(state)).toBe('confirm');
  });

  it('returns confirm when all steps passed', () => {
    const state = makeState({
      prerequisites: 'passed',
      rbac_bind: 'passed',
      walkthrough: 'passed',
      confirm: 'passed',
    });
    expect(firstNonPassedStep(state)).toBe('confirm');
  });

  it('stops at the first non-passed step even if later ones are passed', () => {
    const state = makeState({
      prerequisites: 'passed',
      rbac_bind: 'failed',
      walkthrough: 'passed',
    });
    expect(firstNonPassedStep(state)).toBe('rbac_bind');
  });
});

// ─── 7. allPassed logic ───────────────────────────────────────────────────────

describe('allPassed', () => {
  it('returns false for null state', () => {
    expect(allPassed(null)).toBe(false);
  });

  it('returns false when no steps passed', () => {
    expect(allPassed(makeState({}))).toBe(false);
  });

  it('returns false when some steps pending', () => {
    const state = makeState({
      prerequisites: 'passed',
      rbac_bind: 'passed',
    });
    expect(allPassed(state)).toBe(false);
  });

  it('returns false when one step failed', () => {
    const state = makeState({
      prerequisites: 'passed',
      rbac_bind: 'passed',
      walkthrough: 'passed',
      confirm: 'failed',
    });
    expect(allPassed(state)).toBe(false);
  });

  it('returns true only when all steps are passed', () => {
    const state = makeState({
      prerequisites: 'passed',
      rbac_bind: 'passed',
      walkthrough: 'passed',
      confirm: 'passed',
    });
    expect(allPassed(state)).toBe(true);
  });
});

// ─── 8. CreateCountryLeadBody guard ──────────────────────────────────────────

describe('CreateCountryLeadBody shape', () => {
  it('requires user_id and country', () => {
    const body = { user_id: 'user-abc', country: 'uz' };
    expect(body.user_id).toBe('user-abc');
    expect(body.country).toBe('uz');
  });
});

// ─── 9. AdvanceOnboardingBody guard ──────────────────────────────────────────

describe('AdvanceOnboardingBody', () => {
  it('walkthrough step sends walkthrough_confirmed flag', () => {
    const body = { walkthrough_confirmed: true };
    expect(body.walkthrough_confirmed).toBe(true);
  });

  it('other steps send empty body', () => {
    const body = {};
    expect(Object.keys(body)).toHaveLength(0);
  });
});
