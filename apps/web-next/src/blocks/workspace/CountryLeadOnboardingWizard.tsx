// L3 workspace block — <CountryLeadOnboardingWizard>.
//
// Super-admin cabinet at /workspace/country-leads/new. A 4-step wizard
// that automates the country-lead activation runbook:
//   A (prerequisites)  — operator confirms pre-conditions before proceeding
//   B (rbac_bind)      — API adds candidate to country_lead_<xx> Authentik group;
//                        polls /v1/admin/rbac-sync/status until propagated
//   C (walkthrough)    — operator confirms the cabinet walkthrough checklist
//   D (confirm)        — records activation date in Directus; flips status=active
//
// FR-MIG-028. See docs/02-business-processes/operations/country-lead-activation.md.

import { Button, Wizard, WizardBody, WizardFooter, type WizardStep } from '@/kit';
import { IslandRoot } from '@/lib/island-root';
import type {
  AdvanceOnboardingBody,
  OnboardingState,
  OnboardingStepId,
  OnboardingStepStatus,
} from '@/lib/types';
import { ONBOARDING_STEP_IDS } from '@/lib/types';
import { useAdvanceOnboardingStep, useOnboardingState } from '@/lib/use-country-leads';
import { type ReactElement, useState } from 'react';

// Step labels + descriptions mirror the runbook sections.
const STEP_DEFS: ReadonlyArray<{
  id: OnboardingStepId;
  label: string;
  hint: string;
}> = [
  {
    id: 'prerequisites',
    label: 'Prerequisites',
    hint: 'AUP signed, Authentik account exists, country tenant is active, candidate contacted.',
  },
  {
    id: 'rbac_bind',
    label: 'RBAC bind',
    hint: 'Adds candidate to country_lead_<xx> Authentik group + waits for RBAC sync propagation.',
  },
  {
    id: 'walkthrough',
    label: 'Walkthrough',
    hint: 'Operator confirms the 5-point cabinet walkthrough with the candidate.',
  },
  {
    id: 'confirm',
    label: 'Confirm',
    hint: 'Records activation date in Directus; flips lead status to active.',
  },
];

const PREREQUISITES_CHECKLIST: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'aup', label: 'Candidate has signed the Acceptable Use Policy (AUP)' },
  { id: 'account', label: "Candidate's Authentik account exists at auth.aiqadam.org" },
  { id: 'tenant', label: "Country tenant exists in Directus and is_active = true" },
  { id: 'trust', label: 'Trust-transfer ceremony with in-country community completed or scheduled' },
  { id: 'adr022', label: 'ADR-0022 (country-lead compensation) is Accepted' },
];

const WALKTHROUGH_CHECKLIST: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'events', label: 'Event creation in /workspace/events (Cabinet #3)' },
  { id: 'partners', label: 'Sponsor/partner pipeline tour in /workspace/partners (read-only)' },
  { id: 'csat', label: 'CSAT setup confirmation' },
  { id: 'members', label: 'Member directory tour in /workspace/members (Cabinet #1)' },
  { id: 'perms', label: 'Permissions verified live: country-scoped read + write, cross-country blocked' },
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

// ---------------------------------------------------------------------------
// Step A — Prerequisites
// ---------------------------------------------------------------------------

interface PrerequisitesStepProps {
  isPending: boolean;
  onAdvance: () => void;
  error: string | null;
}
function PrerequisitesStep({ isPending, onAdvance, error }: PrerequisitesStepProps): ReactElement {
  const [checked, setChecked] = useState<Set<string>>(new Set());

  function toggle(id: string): void {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const allChecked = PREREQUISITES_CHECKLIST.every((item) => checked.has(item.id));

  return (
    <>
      <WizardBody>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Confirm all pre-conditions are met before proceeding with the RBAC bind.
          </p>
          <ul className="space-y-2">
            {PREREQUISITES_CHECKLIST.map((item) => (
              <li key={item.id} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id={item.id}
                  checked={checked.has(item.id)}
                  onChange={() => toggle(item.id)}
                  className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                />
                <label htmlFor={item.id} className="text-sm text-foreground cursor-pointer">
                  {item.label}
                </label>
              </li>
            ))}
          </ul>
        </div>
      </WizardBody>
      <WizardFooter>
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="button" onClick={onAdvance} disabled={!allChecked || isPending}>
          {isPending ? 'Confirming…' : 'Confirm prerequisites'}
        </Button>
      </WizardFooter>
    </>
  );
}

// ---------------------------------------------------------------------------
// Step B — RBAC bind
// ---------------------------------------------------------------------------

interface RbacBindStepProps {
  state: OnboardingState | null;
  leadId: string;
  isPending: boolean;
  onAdvance: () => void;
  error: string | null;
}
function RbacBindStep({
  state,
  leadId: _leadId,
  isPending,
  onAdvance,
  error,
}: RbacBindStepProps): ReactElement {
  const stepState = state?.steps.rbac_bind;
  const isFailed = stepState?.status === 'failed';

  return (
    <>
      <WizardBody>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Adds the candidate to the <code className="font-mono text-xs">country_lead_&lt;xx&gt;</code> Authentik
            group and waits for RBAC sync to propagate (SLO: 60 s).
          </p>
          {stepState?.error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2">
              <p className="font-mono text-[10px] text-destructive" role="alert">
                Last error: {stepState.error}
              </p>
            </div>
          ) : null}
          {isFailed ? (
            <p className="text-xs text-muted-foreground">
              Fix the error above, then retry the RBAC bind.
            </p>
          ) : null}
        </div>
      </WizardBody>
      <WizardFooter>
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="button" onClick={onAdvance} disabled={isPending}>
          {isPending
            ? 'Binding…'
            : isFailed
              ? 'Retry RBAC bind'
              : 'Run RBAC bind'}
        </Button>
      </WizardFooter>
    </>
  );
}

// ---------------------------------------------------------------------------
// Step C — Cabinet walkthrough checklist
// ---------------------------------------------------------------------------

interface WalkthroughStepProps {
  isPending: boolean;
  onAdvance: () => void;
  error: string | null;
}
function WalkthroughStep({ isPending, onAdvance, error }: WalkthroughStepProps): ReactElement {
  const [checked, setChecked] = useState<Set<string>>(new Set());

  function toggle(id: string): void {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const allChecked = WALKTHROUGH_CHECKLIST.every((item) => checked.has(item.id));

  return (
    <>
      <WizardBody>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Walk through the following with the candidate (screen-share or in-person).
            Check each item once confirmed.
          </p>
          <ul className="space-y-2">
            {WALKTHROUGH_CHECKLIST.map((item) => (
              <li key={item.id} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id={`walk-${item.id}`}
                  checked={checked.has(item.id)}
                  onChange={() => toggle(item.id)}
                  className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                />
                <label
                  htmlFor={`walk-${item.id}`}
                  className="text-sm text-foreground cursor-pointer"
                >
                  {item.label}
                </label>
              </li>
            ))}
          </ul>
        </div>
      </WizardBody>
      <WizardFooter>
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="button" onClick={onAdvance} disabled={!allChecked || isPending}>
          {isPending ? 'Confirming…' : 'Confirm walkthrough'}
        </Button>
      </WizardFooter>
    </>
  );
}

// ---------------------------------------------------------------------------
// Step D — Confirmation
// ---------------------------------------------------------------------------

interface ConfirmStepProps {
  state: OnboardingState | null;
  isPending: boolean;
  onAdvance: () => void;
  error: string | null;
}
function ConfirmStep({ state, isPending, onAdvance, error }: ConfirmStepProps): ReactElement {
  const stepState = state?.steps.confirm;
  const isComplete = stepState?.status === 'passed';

  if (isComplete && state?.activated_at) {
    return (
      <WizardBody>
        <div className="space-y-2">
          <p className="text-sm font-medium text-emerald-500">Lead successfully activated.</p>
          <p className="font-mono text-[10px] text-muted-foreground">
            Activation date: {new Date(state.activated_at).toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground">
            The lead can now log into{' '}
            <a href="/workspace" className="text-primary underline-offset-4 hover:underline">
              /workspace
            </a>{' '}
            and see their country&apos;s data.
          </p>
        </div>
      </WizardBody>
    );
  }

  return (
    <>
      <WizardBody>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Records the activation date in Directus and flips the lead status to{' '}
            <span className="font-mono text-xs text-foreground">active</span>. This action is not
            reversible from the wizard — deactivation requires removing the Authentik group
            membership manually.
          </p>
        </div>
      </WizardBody>
      <WizardFooter>
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="button" onClick={onAdvance} disabled={isPending}>
          {isPending ? 'Activating…' : 'Activate country lead'}
        </Button>
      </WizardFooter>
    </>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

interface CountryLeadOnboardingWizardProps {
  leadId: string;
}

interface ActiveStepProps {
  stepId: OnboardingStepId;
  done: boolean;
  state: OnboardingState | null;
  leadId: string;
  isPending: boolean;
  mutError: string | null;
  advance: (stepId: OnboardingStepId, body?: AdvanceOnboardingBody) => void;
}

function ActiveStepContent({
  stepId,
  done,
  state,
  leadId: _leadId,
  isPending,
  mutError,
  advance,
}: ActiveStepProps): ReactElement | null {
  if (stepId === 'prerequisites' && !done) {
    return (
      <PrerequisitesStep
        isPending={isPending}
        onAdvance={() => advance('prerequisites')}
        error={mutError}
      />
    );
  }
  if (stepId === 'rbac_bind' && !done) {
    return (
      <RbacBindStep
        state={state}
        leadId={_leadId}
        isPending={isPending}
        onAdvance={() => advance('rbac_bind')}
        error={mutError}
      />
    );
  }
  if (stepId === 'walkthrough' && !done) {
    return (
      <WalkthroughStep
        isPending={isPending}
        onAdvance={() => advance('walkthrough', { walkthrough_confirmed: true })}
        error={mutError}
      />
    );
  }
  return (
    <ConfirmStep
      state={state}
      isPending={isPending}
      onAdvance={() => advance('confirm')}
      error={mutError}
    />
  );
}

function Inner({ leadId }: CountryLeadOnboardingWizardProps): ReactElement {
  const query = useOnboardingState(leadId);
  const advanceMutation = useAdvanceOnboardingStep();

  if (query.isPending) {
    return <p className="text-sm text-muted-foreground">Loading onboarding state…</p>;
  }
  if (query.error) {
    return (
      <p className="text-sm text-destructive">
        Could not load onboarding state: {query.error.message}
      </p>
    );
  }

  const state = query.data ?? null;
  const currentStepId = firstNonPassedStep(state);
  const done = allPassed(state);

  const steps: ReadonlyArray<WizardStep> = STEP_DEFS.map((def) => ({
    id: def.id,
    label: def.label,
    hint: def.hint,
    status: done
      ? 'succeeded'
      : state
        ? statusToWizardStatus(state.steps[def.id]?.status)
        : def.id === currentStepId
          ? 'running'
          : 'pending',
  }));

  function advance(stepId: OnboardingStepId, body?: AdvanceOnboardingBody): void {
    if (body !== undefined) {
      advanceMutation.mutate({ leadId, stepId, body });
    } else {
      advanceMutation.mutate({ leadId, stepId });
    }
  }

  return (
    <Wizard steps={steps} currentStepId={done ? 'confirm' : currentStepId}>
      <ActiveStepContent
        stepId={currentStepId}
        done={done}
        state={state}
        leadId={leadId}
        isPending={advanceMutation.isPending}
        mutError={advanceMutation.error?.message ?? null}
        advance={advance}
      />
    </Wizard>
  );
}

export function CountryLeadOnboardingWizard(
  props: CountryLeadOnboardingWizardProps,
): ReactElement {
  return (
    <IslandRoot>
      <Inner {...props} />
    </IslandRoot>
  );
}
