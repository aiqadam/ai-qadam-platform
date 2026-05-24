import { type ReactElement, useEffect, useState } from 'react';

// F-S4.2 — wizard wrapping the F-S4.1 country-provisioning state machine.
// Fetches current state, lets a super-admin start/resume the run, and
// shows per-step status + retry. The state machine is itself idempotent;
// the "retry" button just re-issues POST /run, which skips succeeded
// steps and re-attempts the first non-succeeded one.

const STEP_LABELS: Record<string, { label: string; hint: string }> = {
  authentik_oidc: {
    label: 'Authentik OIDC redirect URI',
    hint: 'Adds https://<country>.aiqadam.org/api/v1/auth/callback to the provider.',
  },
  directus_policy: {
    label: 'Directus per-country policy',
    hint: 'Creates policy.country_lead.<cc> so the RBAC manifest sync has a target.',
  },
  plausible_site: {
    label: 'Plausible analytics site',
    hint: 'Creates <country>.aiqadam.org in the self-hosted Plausible instance.',
  },
  coolify_fqdn: {
    label: 'Coolify FQDN',
    hint: "Appends https://<country>.aiqadam.org to the web app's domain list.",
  },
};
const STEP_ORDER = ['authentik_oidc', 'directus_policy', 'plausible_site', 'coolify_fqdn'];

interface StepState {
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'awaiting_manual';
  attempted_at: string | null;
  error: string | null;
}

// Plausible CE doesn't ship the Sites Provisioning API (per
// discussion #4329); operator creates the site manually in the
// Plausible UI. tz lookup gives the value to type into the form.
const COUNTRY_TZ: Record<string, string> = {
  uz: 'Asia/Tashkent',
  kz: 'Asia/Almaty',
  kg: 'Asia/Bishkek',
  tj: 'Asia/Dushanbe',
  tm: 'Asia/Ashgabat',
  af: 'Asia/Kabul',
};

function manualInstructions(stepId: string, code: string): { url: string; lines: string[] } | null {
  if (stepId !== 'plausible_site') return null;
  const domain = `${code}.aiqadam.org`;
  const tz = COUNTRY_TZ[code] ?? 'UTC';
  return {
    url: 'https://analytics.aiqadam.org/sites/new',
    lines: [
      `1. Open Plausible → "Add a website" (link below).`,
      `2. Enter domain: ${domain}`,
      `3. Set timezone: ${tz}`,
      `4. Click "Add snippet" → close the install screen (we use the JS snippet on the site itself).`,
      `5. Come back here and click "I've done it" to mark the step complete.`,
    ],
  };
}
interface ProvisioningState {
  started_at: string;
  completed_at: string | null;
  steps: Record<string, StepState>;
}

type State =
  | { phase: 'bootstrap' }
  | { phase: 'anon' }
  | { phase: 'probe_error'; httpStatus: number }
  | {
      phase: 'ready';
      accessToken: string;
      state: ProvisioningState | null;
      isActive: boolean;
    };

function signInUrl(): string {
  const next = typeof window === 'undefined' ? '/workspace/admin' : window.location.pathname;
  return `/api/v1/auth/login?next=${encodeURIComponent(next)}`;
}

async function bootstrap(code: string): Promise<State> {
  const refresh = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (refresh.status === 401) return { phase: 'anon' };
  if (!refresh.ok) return { phase: 'probe_error', httpStatus: refresh.status };
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const res = await fetch(`/api/v1/admin/countries/${encodeURIComponent(code)}/provisioning`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) return { phase: 'anon' };
  if (!res.ok) return { phase: 'probe_error', httpStatus: res.status };
  const body = (await res.json()) as { state: ProvisioningState | null; is_active: boolean };
  return { phase: 'ready', accessToken, state: body.state, isActive: body.is_active };
}

type ActivateOutcome =
  | { kind: 'ok'; state: ProvisioningState; is_active: boolean }
  | { kind: 'error'; message: string };

async function activateCountry(code: string, accessToken: string): Promise<ActivateOutcome> {
  try {
    const res = await fetch(`/api/v1/admin/countries/${encodeURIComponent(code)}/activate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 403) {
      return {
        kind: 'error',
        message: 'Super-admin only — your account cannot activate countries.',
      };
    }
    if (!res.ok) {
      const text = await res.text();
      return { kind: 'error', message: `HTTP ${res.status}: ${text.slice(0, 300)}` };
    }
    const body = (await res.json()) as { state: ProvisioningState; is_active: boolean };
    return { kind: 'ok', state: body.state, is_active: body.is_active };
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : 'unknown error' };
  }
}

async function markStepManualComplete(
  code: string,
  stepId: string,
  accessToken: string,
): Promise<{ kind: 'ok'; state: ProvisioningState } | { kind: 'error'; message: string }> {
  try {
    const res = await fetch(
      `/api/v1/admin/countries/${encodeURIComponent(code)}/provisioning/steps/${encodeURIComponent(stepId)}/manual-complete`,
      { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (res.status === 403) {
      return {
        kind: 'error',
        message: 'Super-admin only — your account cannot mark steps complete.',
      };
    }
    if (!res.ok) {
      const text = await res.text();
      return { kind: 'error', message: `HTTP ${res.status}: ${text.slice(0, 300)}` };
    }
    return { kind: 'ok', state: (await res.json()) as ProvisioningState };
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : 'unknown error' };
  }
}

type RunOutcome = { kind: 'ok'; state: ProvisioningState } | { kind: 'error'; message: string };

async function runProvisioning(code: string, accessToken: string): Promise<RunOutcome> {
  try {
    const res = await fetch(
      `/api/v1/admin/countries/${encodeURIComponent(code)}/provisioning/run`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (res.status === 403) {
      return { kind: 'error', message: 'Super-admin only — your account cannot run provisioning.' };
    }
    if (!res.ok) {
      const text = await res.text();
      return { kind: 'error', message: `HTTP ${res.status}: ${text.slice(0, 300)}` };
    }
    return { kind: 'ok', state: (await res.json()) as ProvisioningState };
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : 'unknown error' };
  }
}

function runButtonLabel(state: ProvisioningState | null): string {
  if (!state) return 'Start provisioning';
  const hasFailed = STEP_ORDER.some((id) => state.steps[id]?.status === 'failed');
  if (hasFailed) return 'Retry from failure';
  const allOk = STEP_ORDER.every((id) => state.steps[id]?.status === 'succeeded');
  if (allOk) return 'Re-run (no-op)';
  return 'Resume';
}

function isAllSucceeded(state: ProvisioningState | null): boolean {
  return !!state && STEP_ORDER.every((id) => state.steps[id]?.status === 'succeeded');
}

interface Props {
  code: string;
}

export default function CountryProvisioningWizard({ code }: Props): ReactElement {
  const [state, setState] = useState<State>({ phase: 'bootstrap' });
  const [running, setRunning] = useState(false);
  const [activating, setActivating] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    bootstrap(code).then(setState);
  }, [code]);

  useEffect(() => {
    if (state.phase === 'anon') window.location.replace(signInUrl());
  }, [state.phase]);

  if (state.phase === 'bootstrap' || state.phase === 'anon')
    return <p style={mutedStyle()}>Loading…</p>;
  if (state.phase === 'probe_error')
    return <p style={mutedStyle()}>Backend error (HTTP {state.httpStatus}).</p>;

  async function onRun(): Promise<void> {
    if (state.phase !== 'ready') return;
    setRunning(true);
    setRunError(null);
    const outcome = await runProvisioning(code, state.accessToken);
    if (outcome.kind === 'ok') {
      setState({ ...state, state: outcome.state });
    } else {
      setRunError(outcome.message);
    }
    setRunning(false);
  }

  async function onActivate(): Promise<void> {
    if (state.phase !== 'ready') return;
    if (!window.confirm(`Activate ${code.toUpperCase()} — make it visible to members?`)) return;
    setActivating(true);
    setRunError(null);
    const outcome = await activateCountry(code, state.accessToken);
    if (outcome.kind === 'ok') {
      setState({ ...state, state: outcome.state, isActive: outcome.is_active });
    } else {
      setRunError(outcome.message);
    }
    setActivating(false);
  }

  async function onManualComplete(stepId: string): Promise<void> {
    if (state.phase !== 'ready') return;
    setRunError(null);
    const outcome = await markStepManualComplete(code, stepId, state.accessToken);
    if (outcome.kind === 'ok') {
      setState({ ...state, state: outcome.state });
    } else {
      setRunError(outcome.message);
    }
  }

  const ps = state.state;
  const allSucceeded = isAllSucceeded(ps);
  const runLabel = runButtonLabel(ps);
  const canActivate = allSucceeded && !state.isActive;

  return (
    <div>
      <SummaryBanner state={ps} isActive={state.isActive} />

      <div style={{ marginTop: 20 }}>
        {STEP_ORDER.map((id) => {
          const stepState = ps?.steps[id] ?? null;
          return (
            <StepCard
              key={id}
              id={id}
              step={stepState}
              code={code}
              onManualComplete={onManualComplete}
            />
          );
        })}
      </div>

      {runError && <p style={{ marginTop: 16, color: '#dc2626', fontSize: 13 }}>{runError}</p>}

      <div style={{ marginTop: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" disabled={running} onClick={onRun}>
          {running ? 'Running…' : runLabel}
        </button>
        {canActivate && (
          <button
            type="button"
            className="btn"
            disabled={activating}
            onClick={onActivate}
            style={{ background: '#16a34a', color: 'white', borderColor: '#16a34a' }}
          >
            {activating ? 'Activating…' : 'Activate (go live)'}
          </button>
        )}
        {state.isActive && (
          <span style={{ alignSelf: 'center', fontSize: 13, color: '#166534' }}>
            ● Country is live — members can sign in.
          </span>
        )}
        {allSucceeded && !state.isActive && (
          <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--muted-foreground)' }}>
            All steps complete — click "Activate" to make this country visible to members.
          </span>
        )}
      </div>
    </div>
  );
}

function SummaryBanner({
  state,
  isActive,
}: {
  state: ProvisioningState | null;
  isActive: boolean;
}): ReactElement {
  if (!state) {
    return (
      <div style={banner('var(--muted)', 'var(--muted-foreground)')}>
        <strong>Not yet provisioned.</strong> Click "Start provisioning" to run the state machine.
        Each step is idempotent and safe to retry. The Plausible step is manual (CE doesn't expose a
        site-creation API) — you'll get a checklist when the chain reaches it.
      </div>
    );
  }
  if (state.completed_at && isActive) {
    return (
      <div style={banner('#dcfce7', '#166534')}>
        <strong>Provisioned + live.</strong> Completed{' '}
        <code style={{ fontFamily: 'var(--font-mono)' }}>{state.completed_at}</code>. Country is
        visible to members.
      </div>
    );
  }
  if (state.completed_at) {
    return (
      <div style={banner('#fef9c3', '#854d0e')}>
        <strong>Provisioned, not yet live.</strong> All steps succeeded on{' '}
        <code style={{ fontFamily: 'var(--font-mono)' }}>{state.completed_at}</code>. Activate below
        to make this country visible to members.
      </div>
    );
  }
  const awaitingManual = STEP_ORDER.some((id) => state.steps[id]?.status === 'awaiting_manual');
  if (awaitingManual) {
    return (
      <div style={banner('#fef3c7', '#92400e')}>
        <strong>Manual step required.</strong> Started at{' '}
        <code style={{ fontFamily: 'var(--font-mono)' }}>{state.started_at}</code>. Follow the
        checklist on the highlighted step below, then click "I've done it" to continue.
      </div>
    );
  }
  return (
    <div style={banner('#fef3c7', '#92400e')}>
      <strong>In progress.</strong> Started at{' '}
      <code style={{ fontFamily: 'var(--font-mono)' }}>{state.started_at}</code>. Some steps have
      not yet succeeded.
    </div>
  );
}

interface StepCardProps {
  id: string;
  step: StepState | null;
  code: string;
  onManualComplete: (stepId: string) => Promise<void>;
}

function StepCard({ id, step, code, onManualComplete }: StepCardProps): ReactElement {
  const meta = STEP_LABELS[id] ?? { label: id, hint: '' };
  const status = step?.status ?? 'pending';
  const colors = statusColors(status);
  const manual = status === 'awaiting_manual' ? manualInstructions(id, code) : null;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '20px 1fr auto',
        gap: 12,
        alignItems: 'start',
        padding: '12px 14px',
        border: '1px solid var(--border)',
        borderRadius: 8,
        marginBottom: 8,
        background: 'var(--card)',
      }}
    >
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: colors.dot,
          marginTop: 5,
        }}
      />
      <div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{meta.label}</div>
        <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 2 }}>
          {meta.hint}
        </div>
        {step?.error && (
          <div
            style={{
              fontSize: 12,
              color: '#dc2626',
              marginTop: 6,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {step.error}
          </div>
        )}
        {step?.attempted_at && (
          <div
            style={{
              fontSize: 11,
              color: 'var(--muted-foreground)',
              marginTop: 4,
              fontFamily: 'var(--font-mono)',
            }}
          >
            last attempt: {step.attempted_at}
          </div>
        )}
        {manual && (
          <div
            style={{
              marginTop: 10,
              padding: 12,
              background: '#fef9c3',
              border: '1px solid #fde68a',
              borderRadius: 6,
              fontSize: 13,
              color: '#713f12',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Manual step required</div>
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              {manual.lines.map((l) => (
                <li key={l} style={{ marginBottom: 2 }}>
                  {l}
                </li>
              ))}
            </ol>
            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a
                className="btn"
                href={manual.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ padding: '6px 12px', fontSize: 12, textDecoration: 'none' }}
              >
                Open Plausible →
              </a>
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '6px 12px', fontSize: 12 }}
                onClick={() => onManualComplete(id)}
              >
                I've done it
              </button>
            </div>
          </div>
        )}
      </div>
      <span
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          padding: '4px 8px',
          borderRadius: 4,
          background: colors.bg,
          color: colors.fg,
          fontWeight: 600,
        }}
      >
        {statusLabel(status)}
      </span>
    </div>
  );
}

function statusColors(s: StepState['status']): { dot: string; bg: string; fg: string } {
  if (s === 'succeeded') return { dot: '#16a34a', bg: '#dcfce7', fg: '#166534' };
  if (s === 'failed') return { dot: '#dc2626', bg: '#fee2e2', fg: '#991b1b' };
  if (s === 'running') return { dot: '#2563eb', bg: '#dbeafe', fg: '#1e40af' };
  if (s === 'awaiting_manual') return { dot: '#d97706', bg: '#fef3c7', fg: '#92400e' };
  return { dot: 'var(--border)', bg: 'var(--muted)', fg: 'var(--muted-foreground)' };
}

function statusLabel(s: StepState['status']): string {
  return s === 'awaiting_manual' ? 'manual' : s;
}

function banner(bg: string, fg: string): Record<string, string | number> {
  return {
    padding: '12px 16px',
    background: bg,
    color: fg,
    borderRadius: 8,
    fontSize: 14,
  };
}

function mutedStyle(): Record<string, string | number> {
  return { fontSize: 14, color: 'var(--muted-foreground)' };
}
