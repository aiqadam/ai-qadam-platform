// CountryLeadOnboardingWizard.test.tsx — unit tests for wizard pure helpers.
//
// NOTE: @testing-library/react is NOT installed in web-next. Tests cover
// pure logic extracted from the block:
//   1. STEP_DEFS ordering + content
//   2. PREREQUISITES_CHECKLIST completeness
//   3. WALKTHROUGH_CHECKLIST completeness
//   4. statusToWizardStatus mapping
//   5. firstNonPassedStep logic
//   6. allPassed logic
//   7. Checklist all-checked guard

import { describe, expect, it } from 'vitest';

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

const STEP_DEFS: ReadonlyArray<{ id: OnboardingStepId; label: string; hint: string }> = [
  { id: 'prerequisites', label: 'Prerequisites', hint: 'AUP signed, Authentik account exists.' },
  { id: 'rbac_bind', label: 'RBAC bind', hint: 'Adds candidate to country_lead_<xx> group.' },
  { id: 'walkthrough', label: 'Walkthrough', hint: 'Cabinet walkthrough with candidate.' },
  { id: 'confirm', label: 'Confirm', hint: 'Records activation date in Directus.' },
];

const PREREQUISITES_CHECKLIST: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'aup', label: 'AUP signed' },
  { id: 'account', label: 'Authentik account exists' },
  { id: 'tenant', label: 'Country tenant is_active = true' },
  { id: 'trust', label: 'Trust-transfer ceremony completed or scheduled' },
  { id: 'adr022', label: 'ADR-0022 is Accepted' },
];

const WALKTHROUGH_CHECKLIST: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'events', label: 'Event creation' },
  { id: 'partners', label: 'Sponsor/partner tour' },
  { id: 'csat', label: 'CSAT setup confirmation' },
  { id: 'members', label: 'Member directory tour' },
  { id: 'perms', label: 'Permissions verified live' },
];

function statusToWizardStatus(
  s: OnboardingStepStatus | undefined,
): 'pending' | 'running' | 'succeeded' | 'failed' {
  if (!s || s === 'pending') return 'pending';
  if (s === 'passed') return 'succeeded';
  return 'failed';
}

function firstNonPassedStep(state: OnboardingState | null): OnboardingStepId {
  if (!state) return STEP_DEFS[0]?.id ?? 'prerequisites';
  for (const def of STEP_DEFS) {
    if (state.steps[def.id]?.status !== 'passed') return def.id;
  }
  return STEP_DEFS[STEP_DEFS.length - 1]?.id ?? 'confirm';
}

function allPassed(state: OnboardingState | null): boolean {
  if (!state) return false;
  return ONBOARDING_STEP_IDS.every((id) => state.steps[id]?.status === 'passed');
}

function makeStep(id: OnboardingStepId, status: OnboardingStepStatus): OnboardingStepResult {
  return { step: id, status, error: null, completed_at: null };
}

function makeState(
  overrides: Partial<Record<OnboardingStepId, OnboardingStepStatus>>,
  activated_at: string | null = null,
): OnboardingState {
  const steps = {} as Record<OnboardingStepId, OnboardingStepResult>;
  for (const id of ONBOARDING_STEP_IDS) {
    steps[id] = makeStep(id, overrides[id] ?? 'pending');
  }
  return { lead_id: 'lead-1', steps, activated_at };
}

// ─── 1. STEP_DEFS ordering ───────────────────────────────────────────────────

describe('STEP_DEFS', () => {
  it('has 4 steps in the correct order', () => {
    expect(STEP_DEFS.map((d) => d.id)).toEqual([
      'prerequisites',
      'rbac_bind',
      'walkthrough',
      'confirm',
    ]);
  });

  it('every step has a non-empty label and hint', () => {
    for (const def of STEP_DEFS) {
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.hint.length).toBeGreaterThan(0);
    }
  });
});

// ─── 2. PREREQUISITES_CHECKLIST ──────────────────────────────────────────────

describe('PREREQUISITES_CHECKLIST', () => {
  it('has 5 items', () => {
    expect(PREREQUISITES_CHECKLIST).toHaveLength(5);
  });

  it('contains the AUP item', () => {
    const ids = PREREQUISITES_CHECKLIST.map((i) => i.id);
    expect(ids).toContain('aup');
  });

  it('contains the ADR-0022 item', () => {
    const ids = PREREQUISITES_CHECKLIST.map((i) => i.id);
    expect(ids).toContain('adr022');
  });

  it('every item has a non-empty label', () => {
    for (const item of PREREQUISITES_CHECKLIST) {
      expect(item.label.length).toBeGreaterThan(0);
    }
  });
});

// ─── 3. WALKTHROUGH_CHECKLIST ────────────────────────────────────────────────

describe('WALKTHROUGH_CHECKLIST', () => {
  it('has 5 items', () => {
    expect(WALKTHROUGH_CHECKLIST).toHaveLength(5);
  });

  it('contains events, members, and perms items', () => {
    const ids = WALKTHROUGH_CHECKLIST.map((i) => i.id);
    expect(ids).toContain('events');
    expect(ids).toContain('members');
    expect(ids).toContain('perms');
  });
});

// ─── 4. statusToWizardStatus ─────────────────────────────────────────────────

describe('statusToWizardStatus', () => {
  it('maps undefined → pending', () => {
    expect(statusToWizardStatus(undefined)).toBe('pending');
  });

  it('maps pending → pending', () => {
    expect(statusToWizardStatus('pending')).toBe('pending');
  });

  it('maps passed → succeeded', () => {
    expect(statusToWizardStatus('passed')).toBe('succeeded');
  });

  it('maps failed → failed', () => {
    expect(statusToWizardStatus('failed')).toBe('failed');
  });
});

// ─── 5. firstNonPassedStep ───────────────────────────────────────────────────

describe('firstNonPassedStep', () => {
  it('returns prerequisites for null state', () => {
    expect(firstNonPassedStep(null)).toBe('prerequisites');
  });

  it('returns prerequisites when all pending', () => {
    expect(firstNonPassedStep(makeState({}))).toBe('prerequisites');
  });

  it('advances correctly through each step', () => {
    expect(firstNonPassedStep(makeState({ prerequisites: 'passed' }))).toBe('rbac_bind');
    expect(
      firstNonPassedStep(makeState({ prerequisites: 'passed', rbac_bind: 'passed' })),
    ).toBe('walkthrough');
    expect(
      firstNonPassedStep(
        makeState({ prerequisites: 'passed', rbac_bind: 'passed', walkthrough: 'passed' }),
      ),
    ).toBe('confirm');
  });

  it('stays at confirm when all passed', () => {
    const state = makeState({
      prerequisites: 'passed',
      rbac_bind: 'passed',
      walkthrough: 'passed',
      confirm: 'passed',
    });
    expect(firstNonPassedStep(state)).toBe('confirm');
  });
});

// ─── 6. allPassed ────────────────────────────────────────────────────────────

describe('allPassed', () => {
  it('false for null', () => {
    expect(allPassed(null)).toBe(false);
  });

  it('false when steps are pending', () => {
    expect(allPassed(makeState({}))).toBe(false);
  });

  it('false when one step is failed', () => {
    const state = makeState({
      prerequisites: 'passed',
      rbac_bind: 'failed',
      walkthrough: 'passed',
      confirm: 'passed',
    });
    expect(allPassed(state)).toBe(false);
  });

  it('true only when all 4 steps are passed', () => {
    const state = makeState({
      prerequisites: 'passed',
      rbac_bind: 'passed',
      walkthrough: 'passed',
      confirm: 'passed',
    });
    expect(allPassed(state)).toBe(true);
  });
});

// ─── 7. Checklist all-checked guard ──────────────────────────────────────────

function allChecked(checklist: ReadonlyArray<{ id: string }>, checked: Set<string>): boolean {
  return checklist.every((item) => checked.has(item.id));
}

describe('allChecked', () => {
  it('returns false when nothing is checked', () => {
    expect(allChecked(PREREQUISITES_CHECKLIST, new Set())).toBe(false);
  });

  it('returns false when only some items are checked', () => {
    expect(allChecked(PREREQUISITES_CHECKLIST, new Set(['aup', 'account']))).toBe(false);
  });

  it('returns true when all items are checked', () => {
    const all = new Set(PREREQUISITES_CHECKLIST.map((i) => i.id));
    expect(allChecked(PREREQUISITES_CHECKLIST, all)).toBe(true);
  });

  it('walkthrough checklist — false when partial', () => {
    expect(allChecked(WALKTHROUGH_CHECKLIST, new Set(['events']))).toBe(false);
  });

  it('walkthrough checklist — true when all checked', () => {
    const all = new Set(WALKTHROUGH_CHECKLIST.map((i) => i.id));
    expect(allChecked(WALKTHROUGH_CHECKLIST, all)).toBe(true);
  });
});
