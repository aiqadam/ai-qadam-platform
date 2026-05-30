// L2 atom — Wizard (step-machine layout primitive).
//
// Pure presentation: a header strip of step pills with per-step status,
// a body slot for the current step's content, and a footer slot for
// nav actions. No state — the consumer drives `currentStepId` and
// `steps[].status`. Designed so the same atom serves:
//   * M2.5 country provisioning (server-side state machine, idempotent)
//   * M3.4 customer onboarding (linear form sequence)
//
// Composition pattern:
//
//   <Wizard
//     steps={[
//       { id: 'auth', label: 'Authentik', status: 'succeeded' },
//       { id: 'dx',   label: 'Directus',  status: 'running' },
//       { id: 'pl',   label: 'Plausible', status: 'pending' },
//     ]}
//     currentStepId="dx"
//   >
//     <WizardBody>{/* step content */}</WizardBody>
//     <WizardFooter>
//       <Button variant="outline">Back</Button>
//       <Button>Retry</Button>
//     </WizardFooter>
//   </Wizard>
//
// Status palette mirrors the F-S4.1/2 state machine vocabulary:
//   pending          — neutral, hasn't started
//   running          — accent + pulsing dot
//   succeeded        — green
//   failed           — destructive
//   awaiting_manual  — amber (operator action required)

'use client';

import { cn } from '@/lib/utils';
import { Check, CircleAlert, CircleDashed, CircleDot, Hand } from 'lucide-react';
import {
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  createContext,
  useContext,
} from 'react';

export type WizardStepStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'awaiting_manual';

export interface WizardStep {
  id: string;
  label: string;
  status: WizardStepStatus;
  hint?: string;
}

interface WizardContextValue {
  steps: ReadonlyArray<WizardStep>;
  currentStepId: string;
}
const WizardContext = createContext<WizardContextValue | null>(null);

function useWizardContext(): WizardContextValue {
  const ctx = useContext(WizardContext);
  if (!ctx) {
    throw new Error(
      'Wizard sub-components must be rendered inside <Wizard>. Wrap them in a Wizard root.',
    );
  }
  return ctx;
}

const STATUS_ICON: Record<WizardStepStatus, ReactElement> = {
  pending: <CircleDashed className="h-3.5 w-3.5" aria-hidden />,
  running: <CircleDot className="h-3.5 w-3.5 animate-pulse" aria-hidden />,
  succeeded: <Check className="h-3.5 w-3.5" aria-hidden />,
  failed: <CircleAlert className="h-3.5 w-3.5" aria-hidden />,
  awaiting_manual: <Hand className="h-3.5 w-3.5" aria-hidden />,
};

const STATUS_PILL: Record<WizardStepStatus, string> = {
  pending: 'border-border bg-card text-muted-foreground',
  running: 'border-primary bg-primary/10 text-foreground',
  succeeded: 'border-emerald-600/40 bg-emerald-600/10 text-emerald-500',
  failed: 'border-destructive/50 bg-destructive/10 text-destructive',
  awaiting_manual: 'border-amber-500/40 bg-amber-500/10 text-amber-500',
};

const STATUS_SR: Record<WizardStepStatus, string> = {
  pending: 'pending',
  running: 'in progress',
  succeeded: 'completed',
  failed: 'failed',
  awaiting_manual: 'awaiting manual action',
};

export interface WizardProps extends HTMLAttributes<HTMLDivElement> {
  steps: ReadonlyArray<WizardStep>;
  currentStepId: string;
  children?: ReactNode;
}

export function Wizard({
  steps,
  currentStepId,
  className,
  children,
  ...rest
}: WizardProps): ReactElement {
  return (
    <WizardContext.Provider value={{ steps, currentStepId }}>
      <div className={cn('space-y-4', className)} {...rest}>
        <WizardHeader />
        {children}
      </div>
    </WizardContext.Provider>
  );
}

// Visible step strip. Rendered by Wizard root by default, but exported
// so consumers can place it anywhere (e.g. above a custom layout).
export function WizardHeader({ className }: { className?: string } = {}): ReactElement {
  const { steps, currentStepId } = useWizardContext();
  return (
    <ol
      className={cn('flex flex-wrap items-center gap-2', className)}
      aria-label="Provisioning steps"
    >
      {steps.map((s, idx) => {
        const isCurrent = s.id === currentStepId;
        return (
          <li key={s.id} className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium',
                STATUS_PILL[s.status],
                isCurrent && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
              )}
              {...(isCurrent ? { 'aria-current': 'step' } : {})}
              title={s.hint ?? s.label}
            >
              {STATUS_ICON[s.status]}
              <span>{s.label}</span>
              <span className="sr-only"> — {STATUS_SR[s.status]}</span>
            </span>
            {idx < steps.length - 1 ? <span className="h-px w-4 bg-border" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function WizardBody({
  className,
  children,
}: { className?: string; children?: ReactNode } = {}): ReactElement {
  return (
    <div className={cn('rounded-md border border-border bg-card p-4', className)}>{children}</div>
  );
}

export function WizardFooter({
  className,
  children,
}: { className?: string; children?: ReactNode } = {}): ReactElement {
  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-2', className)}>{children}</div>
  );
}
