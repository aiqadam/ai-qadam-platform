// L3 workspace block — <CountryProvisioningWizard>.
//
// Super-admin cabinet at /workspace/admin/countries/[code]/provisioning.
// M2.5-i ships the read surface: fetch GET /v1/admin/countries/:code/
// provisioning, render the wizard atom with per-step pills + a per-
// step detail strip (status + last attempt + error). Run / retry /
// activate / manual-complete mutations land with M2.5-ii + M2.5-iii.
//
// Step labels + hints mirror v1's CountryProvisioningWizard.tsx — the
// state-machine vocabulary is identical so the operator UX is too.

import { Button, Wizard, WizardBody, WizardFooter, type WizardStep } from '@/kit';
import { IslandRoot } from '@/lib/island-root';
import type { ProvisioningState, ProvisioningStepState } from '@/lib/types';
import {
  useActivateCountry,
  useProvisioningState,
  useRunProvisioning,
} from '@/lib/use-provisioning';
import type { ReactElement } from 'react';

const STEP_DEFS: ReadonlyArray<{ id: string; label: string; hint: string }> = [
  {
    id: 'authentik_oidc',
    label: 'Authentik OIDC',
    hint: 'Adds https://<country>.aiqadam.org/api/v1/auth/callback to the provider.',
  },
  {
    id: 'directus_policy',
    label: 'Directus policy',
    hint: 'Creates policy.country_lead.<cc> so the RBAC manifest sync has a target.',
  },
  {
    id: 'plausible_site',
    label: 'Plausible site',
    hint:
      'Creates <country>.aiqadam.org in the self-hosted Plausible instance. ' +
      'Manual on Plausible CE (no Sites API).',
  },
  {
    id: 'coolify_fqdn',
    label: 'Coolify FQDN',
    hint: "Appends https://<country>.aiqadam.org to the web app's domain list.",
  },
];

function findCurrentStepId(
  stepStates: Record<string, ProvisioningStepState>,
  fallback: string,
): string {
  // Current step = first non-`succeeded` step in order; if everything
  // is succeeded, point at the last step (so it stays highlighted).
  for (const def of STEP_DEFS) {
    const s = stepStates[def.id];
    if (!s || s.status !== 'succeeded') return def.id;
  }
  return fallback;
}

function allSucceeded(state: ProvisioningState): boolean {
  return STEP_DEFS.every((d) => state.steps[d.id]?.status === 'succeeded');
}

function hasAwaitingManual(state: ProvisioningState): boolean {
  return STEP_DEFS.some((d) => state.steps[d.id]?.status === 'awaiting_manual');
}

interface ActionsFooterProps {
  hasState: boolean;
  canActivate: boolean;
  isAlreadyActive: boolean;
  awaitingManual: boolean;
  isRunning: boolean;
  isActivating: boolean;
  onRun: () => void;
  onActivate: () => void;
}
function ActionsFooter({
  hasState,
  canActivate,
  isAlreadyActive,
  awaitingManual,
  isRunning,
  isActivating,
  onRun,
  onActivate,
}: ActionsFooterProps): ReactElement | null {
  if (isAlreadyActive) {
    return (
      <WizardFooter>
        <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-500">
          Active · ready
        </span>
      </WizardFooter>
    );
  }
  return (
    <WizardFooter>
      {awaitingManual ? (
        <span className="font-mono text-[10px] uppercase tracking-wider text-amber-500">
          Manual step pending · M2.5-iii adds the confirm button
        </span>
      ) : null}
      <Button type="button" variant="outline" onClick={onRun} disabled={isRunning || isActivating}>
        {isRunning ? 'Running…' : hasState ? 'Re-run' : 'Start provisioning'}
      </Button>
      <Button
        type="button"
        onClick={onActivate}
        disabled={!canActivate || isActivating || isRunning}
      >
        {isActivating ? 'Activating…' : 'Activate'}
      </Button>
    </WizardFooter>
  );
}

function StepDetail({ step, label }: { step: ProvisioningStepState; label: string }): ReactElement {
  return (
    <li className="space-y-1 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {step.status}
        </span>
      </div>
      {step.attempted_at ? (
        <div className="font-mono text-[10px] text-muted-foreground">
          last attempt: <time dateTime={step.attempted_at}>{step.attempted_at}</time>
        </div>
      ) : null}
      {step.error ? (
        <div className="font-mono text-[10px] text-destructive" role="alert">
          {step.error}
        </div>
      ) : null}
    </li>
  );
}

interface CountryProvisioningWizardProps {
  code: string;
}

function NoRunView({ code, footer }: { code: string; footer: ReactElement }): ReactElement {
  const steps: WizardStep[] = STEP_DEFS.map((d) => ({
    id: d.id,
    label: d.label,
    hint: d.hint,
    status: 'pending',
  }));
  return (
    <Wizard steps={steps} currentStepId={STEP_DEFS[0]?.id ?? ''}>
      <WizardBody>
        <p className="text-sm text-muted-foreground">
          No provisioning run yet for <span className="font-mono text-foreground">{code}</span>.
          Click "Start provisioning" to kick off the state machine.
        </p>
      </WizardBody>
      {footer}
    </Wizard>
  );
}

function LoadedView({
  code,
  state,
  isActive,
  footer,
}: {
  code: string;
  state: ProvisioningState;
  isActive: boolean;
  footer: ReactElement;
}): ReactElement {
  const lastStepId = STEP_DEFS[STEP_DEFS.length - 1]?.id ?? '';
  const currentStepId = findCurrentStepId(state.steps, lastStepId);
  const steps: WizardStep[] = STEP_DEFS.map((d) => ({
    id: d.id,
    label: d.label,
    hint: d.hint,
    status: state.steps[d.id]?.status ?? 'pending',
  }));
  return (
    <Wizard steps={steps} currentStepId={currentStepId}>
      <WizardBody>
        <div className="space-y-3">
          <header className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-base font-semibold text-foreground m-0">
              Provisioning · {code}
            </h2>
            <div className="space-x-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <span>
                started: <time dateTime={state.started_at}>{state.started_at}</time>
              </span>
              {state.completed_at ? (
                <span>
                  completed: <time dateTime={state.completed_at}>{state.completed_at}</time>
                </span>
              ) : (
                <span>in progress</span>
              )}
              <span>
                active: <span className="text-foreground">{isActive ? 'yes' : 'no'}</span>
              </span>
            </div>
          </header>
          <ul className="space-y-2">
            {STEP_DEFS.map((d) => {
              const stepState = state.steps[d.id];
              if (!stepState) return null;
              return <StepDetail key={d.id} step={stepState} label={d.label} />;
            })}
          </ul>
        </div>
      </WizardBody>
      {footer}
    </Wizard>
  );
}

function Inner({ code }: CountryProvisioningWizardProps): ReactElement {
  const query = useProvisioningState(code);
  const runMutation = useRunProvisioning(code);
  const activateMutation = useActivateCountry(code);

  if (query.isPending) {
    return <p className="text-sm text-muted-foreground">Loading provisioning state…</p>;
  }
  if (query.error) {
    return (
      <p className="text-sm text-destructive">
        Provisioning state unavailable: {query.error.message}
      </p>
    );
  }

  const envelope = query.data;
  const state = envelope?.state ?? null;
  const isActive = envelope?.is_active === true;
  const completed = state ? allSucceeded(state) : false;
  const awaitingManual = state ? hasAwaitingManual(state) : false;

  const footer = (
    <>
      <ActionsFooter
        hasState={state !== null}
        canActivate={completed && !isActive}
        isAlreadyActive={isActive}
        awaitingManual={awaitingManual}
        isRunning={runMutation.isPending}
        isActivating={activateMutation.isPending}
        onRun={() => runMutation.mutate()}
        onActivate={() => activateMutation.mutate()}
      />
      {runMutation.error ? (
        <p className="text-xs text-destructive" role="alert">
          Couldn't run: {runMutation.error.message}
        </p>
      ) : null}
      {activateMutation.error ? (
        <p className="text-xs text-destructive" role="alert">
          Couldn't activate: {activateMutation.error.message}
        </p>
      ) : null}
    </>
  );

  return state ? (
    <LoadedView code={code} state={state} isActive={isActive} footer={footer} />
  ) : (
    <NoRunView code={code} footer={footer} />
  );
}

export function CountryProvisioningWizard(props: CountryProvisioningWizardProps): ReactElement {
  return (
    <IslandRoot>
      <Inner {...props} />
    </IslandRoot>
  );
}
