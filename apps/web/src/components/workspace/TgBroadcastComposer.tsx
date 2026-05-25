import { type FormEvent, type ReactElement, useEffect, useState } from 'react';

// #294 PR-b — broadcast composer. Save-as-draft + schedule
// (status='scheduled' + scheduled_at). Send-now lands in PR-d.
//
// Telegram inline-button limit is 8; we cap at write time. HTML body
// is restricted to Telegram's safe subset (b, i, u, s, a, code, pre) —
// the bot's send adapter strips anything else, so we don't pre-validate
// here. PR-b ships a plain textarea; PR-b-extended could swap in a
// proper rich-text editor.

type Mode = 'new' | 'edit';

interface BroadcastButton {
  label: string;
  url: string;
}

type Recurrence = 'none' | 'weekly' | 'monthly';

interface BroadcastDetail {
  id: string;
  title: string;
  country: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  html_body: string;
  inline_buttons: BroadcastButton[];
  audience_segment: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  image_asset: string | null;
  recurrence: Recurrence;
}

type State =
  | { phase: 'bootstrap' }
  | { phase: 'anon' }
  | { phase: 'forbidden' }
  | { phase: 'load_error'; httpStatus: number }
  | {
      phase: 'ready';
      accessToken: string;
      form: FormState;
      submitting: boolean;
      error: string | null;
      savedId: string | null;
    };

interface FormState {
  id: string | null;
  title: string;
  country: string;
  html_body: string;
  buttons: BroadcastButton[];
  audience_segment: string | null;
  // ISO local datetime-input value (YYYY-MM-DDTHH:mm). Convert to UTC
  // ISO before posting.
  scheduled_local: string;
  // Operator picks at submit time. PR-b mutates draft → scheduled.
  intent: 'save_draft' | 'schedule';
  recurrence: Recurrence;
}

function signInUrl(): string {
  const next =
    typeof window === 'undefined'
      ? '/workspace/integrations/telegram/broadcasts'
      : window.location.pathname + window.location.search;
  return `/api/v1/auth/login?next=${encodeURIComponent(next)}`;
}

async function bootstrap(mode: Mode, broadcastId?: string): Promise<State> {
  const refresh = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (refresh.status === 401) return { phase: 'anon' };
  if (!refresh.ok) return { phase: 'load_error', httpStatus: refresh.status };
  const { accessToken } = (await refresh.json()) as { accessToken: string };

  if (mode === 'edit' && broadcastId) {
    const res = await fetch(`/api/v1/workspace/tg-broadcasts/${encodeURIComponent(broadcastId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 401) return { phase: 'anon' };
    if (res.status === 403) return { phase: 'forbidden' };
    if (!res.ok) return { phase: 'load_error', httpStatus: res.status };
    const detail = (await res.json()) as BroadcastDetail;
    return {
      phase: 'ready',
      accessToken,
      form: detailToForm(detail),
      submitting: false,
      error: null,
      savedId: null,
    };
  }
  return {
    phase: 'ready',
    accessToken,
    form: blankForm(),
    submitting: false,
    error: null,
    savedId: null,
  };
}

function blankForm(): FormState {
  return {
    id: null,
    title: '',
    country: 'uz',
    html_body: '',
    buttons: [],
    audience_segment: null,
    scheduled_local: '',
    intent: 'save_draft',
    recurrence: 'none',
  };
}

function detailToForm(d: BroadcastDetail): FormState {
  return {
    id: d.id,
    title: d.title,
    country: d.country,
    html_body: d.html_body,
    buttons: d.inline_buttons,
    audience_segment: d.audience_segment,
    scheduled_local: d.scheduled_at ? isoToLocalInput(d.scheduled_at) : '',
    intent: d.status === 'scheduled' ? 'schedule' : 'save_draft',
    recurrence: d.recurrence ?? 'none',
  };
}

// "2026-07-01T12:00:00.000Z" → "2026-07-01T12:00" (in user's local tz)
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local: string): string {
  return new Date(local).toISOString();
}

interface Props {
  mode: Mode;
  broadcastId?: string;
}

export default function TgBroadcastComposer({ mode, broadcastId }: Props): ReactElement {
  const [state, setState] = useState<State>({ phase: 'bootstrap' });

  useEffect(() => {
    void bootstrap(mode, broadcastId).then(setState);
  }, [mode, broadcastId]);

  useEffect(() => {
    if (state.phase === 'anon' && typeof window !== 'undefined') {
      window.location.replace(signInUrl());
    }
  }, [state.phase]);

  if (state.phase === 'bootstrap' || state.phase === 'anon')
    return <p style={mutedStyle()}>Loading…</p>;

  if (state.phase === 'forbidden') return <p style={mutedStyle()}>Operator access only.</p>;

  if (state.phase === 'load_error')
    return <p style={mutedStyle()}>Failed to load (HTTP {state.httpStatus}).</p>;

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setState({ ...state, submitting: true, error: null });

    const form = state.form;
    const isEdit = form.id !== null;

    let scheduledIso: string | null = null;
    if (form.intent === 'schedule') {
      if (!form.scheduled_local) {
        setState({ ...state, submitting: false, error: 'Pick a schedule time.' });
        return;
      }
      scheduledIso = localInputToIso(form.scheduled_local);
      if (Date.parse(scheduledIso) < Date.now()) {
        setState({ ...state, submitting: false, error: 'Schedule time must be in the future.' });
        return;
      }
    }

    interface BroadcastPayload {
      title: string;
      html_body: string;
      inline_buttons: BroadcastButton[];
      country?: string;
      status?: 'draft' | 'scheduled';
      scheduled_at?: string | null;
      recurrence?: Recurrence;
    }
    const payload: BroadcastPayload = {
      title: form.title,
      html_body: form.html_body,
      inline_buttons: form.buttons.filter((b) => b.label.trim() && b.url.trim()),
      recurrence: form.recurrence,
    };
    if (!isEdit) {
      payload.country = form.country;
    }
    if (form.intent === 'schedule') {
      payload.status = 'scheduled';
      payload.scheduled_at = scheduledIso;
    } else if (isEdit) {
      payload.status = 'draft';
      payload.scheduled_at = null;
    }

    const url = isEdit
      ? `/api/v1/workspace/tg-broadcasts/${encodeURIComponent(form.id as string)}`
      : '/api/v1/workspace/tg-broadcasts';
    const method = isEdit ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${state.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      setState({ ...state, submitting: false, error: `HTTP ${res.status}: ${errorText}` });
      return;
    }
    const saved = (await res.json()) as BroadcastDetail;
    setState({
      ...state,
      submitting: false,
      error: null,
      savedId: saved.id,
      form: detailToForm(saved),
    });
  };

  // #294 PR-d — send-now action. Only available on edit (we need a
  // stable broadcast id) and only when the audience segment is set.
  const sendNow = async (): Promise<void> => {
    if (!state.form.id) return;
    if (
      !window.confirm('Send this broadcast NOW to all matching members? This cannot be undone.')
    ) {
      return;
    }
    setState({ ...state, submitting: true, error: null });
    const res = await fetch(
      `/api/v1/workspace/tg-broadcasts/${encodeURIComponent(state.form.id)}/send-now`,
      { method: 'POST', headers: { Authorization: `Bearer ${state.accessToken}` } },
    );
    if (!res.ok) {
      const text = await res.text();
      setState({ ...state, submitting: false, error: `Send failed: ${text}` });
      return;
    }
    const body = (await res.json()) as { sent_count: number; skipped_count: number };
    setState({
      ...state,
      submitting: false,
      error: null,
      savedId: state.form.id,
      form: { ...state.form },
    });
    window.alert(
      `Send queued: ${body.sent_count} dispatched, ${body.skipped_count} skipped. The notifier will deliver in the background.`,
    );
  };

  // #391 — send a single test envelope to the operator's own Telegram
  // chat. Doesn't touch the broadcast row; useful for visual preview
  // before going live with the real segment.
  const sendTestToMe = async (): Promise<void> => {
    if (!state.form.id) return;
    setState({ ...state, submitting: true, error: null });
    const res = await fetch(
      `/api/v1/workspace/tg-broadcasts/${encodeURIComponent(state.form.id)}/send-test`,
      { method: 'POST', headers: { Authorization: `Bearer ${state.accessToken}` } },
    );
    if (!res.ok) {
      const text = await res.text();
      setState({ ...state, submitting: false, error: `Test send failed: ${text}` });
      return;
    }
    setState({ ...state, submitting: false, error: null });
    window.alert('Test sent to your Telegram. Check your DMs (it has a [TEST] prefix).');
  };

  const f = state.form;
  const isEditMode = f.id !== null;
  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {state.savedId && (
        <div style={successBoxStyle()} data-testid="composer-saved">
          Saved. <a href="/workspace/integrations/telegram/broadcasts">Back to broadcasts</a>
        </div>
      )}
      {state.error && (
        <div style={errorBoxStyle()} data-testid="composer-error">
          {state.error}
        </div>
      )}

      <label style={labelStyle()}>
        Title (internal)
        <input
          required
          type="text"
          value={f.title}
          maxLength={200}
          onChange={(e) => setState({ ...state, form: { ...f, title: e.target.value } })}
          style={inputStyle()}
        />
      </label>

      <label style={labelStyle()}>
        Country
        <select
          value={f.country}
          disabled={mode === 'edit'}
          onChange={(e) => setState({ ...state, form: { ...f, country: e.target.value } })}
          style={inputStyle()}
        >
          <option value="uz">Uzbekistan</option>
          <option value="kz">Kazakhstan</option>
          <option value="tj">Tajikistan</option>
        </select>
      </label>

      <label style={labelStyle()}>
        Body (Telegram-safe HTML — supports {'<b>'}, {'<i>'}, {'<u>'}, {'<s>'}, {'<a>'}, {'<code>'},{' '}
        {'<pre>'})
        <textarea
          required
          value={f.html_body}
          maxLength={4096}
          rows={10}
          onChange={(e) => setState({ ...state, form: { ...f, html_body: e.target.value } })}
          style={{ ...inputStyle(), fontFamily: 'var(--font-mono)', minHeight: 200 }}
        />
      </label>

      <fieldset style={fieldsetStyle()}>
        <legend>Inline buttons ({f.buttons.length}/8)</legend>
        {f.buttons.map((b, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: button rows reorder-by-position; index IS the identity
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              placeholder="Label"
              value={b.label}
              maxLength={64}
              onChange={(e) => {
                const next = [...f.buttons];
                next[i] = { ...b, label: e.target.value };
                setState({ ...state, form: { ...f, buttons: next } });
              }}
              style={{ ...inputStyle(), flex: 1 }}
            />
            <input
              placeholder="https://..."
              type="url"
              value={b.url}
              maxLength={2048}
              onChange={(e) => {
                const next = [...f.buttons];
                next[i] = { ...b, url: e.target.value };
                setState({ ...state, form: { ...f, buttons: next } });
              }}
              style={{ ...inputStyle(), flex: 2 }}
            />
            <button
              type="button"
              onClick={() => {
                const next = f.buttons.filter((_, j) => j !== i);
                setState({ ...state, form: { ...f, buttons: next } });
              }}
              style={secondaryButtonStyle()}
            >
              Remove
            </button>
          </div>
        ))}
        {f.buttons.length < 8 && (
          <button
            type="button"
            onClick={() =>
              setState({
                ...state,
                form: { ...f, buttons: [...f.buttons, { label: '', url: '' }] },
              })
            }
            style={secondaryButtonStyle()}
          >
            + Add button
          </button>
        )}
      </fieldset>

      <fieldset style={fieldsetStyle()}>
        <legend>When</legend>
        <label style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            type="radio"
            name="intent"
            value="save_draft"
            checked={f.intent === 'save_draft'}
            onChange={() => setState({ ...state, form: { ...f, intent: 'save_draft' } })}
          />
          Save as draft (don't schedule)
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="radio"
            name="intent"
            value="schedule"
            checked={f.intent === 'schedule'}
            onChange={() => setState({ ...state, form: { ...f, intent: 'schedule' } })}
          />
          Schedule for
          <input
            type="datetime-local"
            value={f.scheduled_local}
            disabled={f.intent !== 'schedule'}
            onChange={(e) =>
              setState({ ...state, form: { ...f, scheduled_local: e.target.value } })
            }
            style={inputStyle()}
          />
        </label>
        <p style={{ ...mutedStyle(), marginTop: 8, fontSize: 12 }}>
          Scheduler cron picks up scheduled broadcasts at the chosen time. To send immediately, save
          first and then click "Send now".
        </p>
      </fieldset>

      <fieldset style={fieldsetStyle()}>
        <legend>Recurrence</legend>
        <label style={labelStyle()}>
          Repeat
          <select
            value={f.recurrence}
            onChange={(e) =>
              setState({ ...state, form: { ...f, recurrence: e.target.value as Recurrence } })
            }
            style={inputStyle()}
          >
            <option value="none">One-time (don't repeat)</option>
            <option value="weekly">Weekly (every 7 days from scheduled_at)</option>
            <option value="monthly">Monthly (every month from scheduled_at)</option>
          </select>
        </label>
        <p style={{ ...mutedStyle(), marginTop: 8, fontSize: 12 }}>
          When a recurring broadcast fires, the sender clones it for the next anchor with a snapshot
          of the current body + buttons. Already-sent rows preserve their content.
        </p>
      </fieldset>

      {isEditMode && f.audience_segment && (
        <RateLimitWarning segmentId={f.audience_segment} accessToken={state.accessToken} />
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="submit"
          disabled={state.submitting}
          style={primaryButtonStyle(state.submitting)}
        >
          {state.submitting
            ? 'Saving…'
            : f.intent === 'schedule'
              ? 'Save + schedule'
              : 'Save draft'}
        </button>
        {isEditMode && (
          <>
            <button
              type="button"
              onClick={() => void sendTestToMe()}
              disabled={state.submitting}
              style={secondaryButtonStyle()}
              data-testid="composer-send-test"
            >
              📤 Test to me
            </button>
            <button
              type="button"
              onClick={() => void sendNow()}
              disabled={state.submitting}
              style={dangerButtonStyle(state.submitting)}
              data-testid="composer-send-now"
            >
              Send now ▶
            </button>
          </>
        )}
        <a href="/workspace/integrations/telegram/broadcasts" style={secondaryButtonStyle()}>
          Cancel
        </a>
      </div>
    </form>
  );
}

// #391 — per-tenant rate-limit warning. Fetches the audience segment's
// match_count and derives an estimated drain time at the global
// 30/sec Telegram throttle (ADR-0034). Big sends get a ⚠ chip so the
// operator thinks about timing before "Send now ▶".
const TG_GLOBAL_THROTTLE_PER_SEC = 30;
const BIG_SEND_THRESHOLD = 10_000;

interface RateLimitWarningProps {
  segmentId: string;
  accessToken: string;
}

async function fetchSegmentCount(segmentId: string, accessToken: string): Promise<number | null> {
  try {
    const res = await fetch(
      `/api/v1/workspace/tg-segments/${encodeURIComponent(segmentId)}/preview`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { match_count: number };
    return body.match_count;
  } catch {
    return null;
  }
}

function RateLimitWarning({ segmentId, accessToken }: RateLimitWarningProps): ReactElement | null {
  const [count, setCount] = useState<number | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let active = true;
    setCount(null);
    setErrored(false);
    void fetchSegmentCount(segmentId, accessToken).then((n) => {
      if (!active) return;
      if (n === null) setErrored(true);
      else setCount(n);
    });
    return () => {
      active = false;
    };
  }, [segmentId, accessToken]);

  if (errored) return null;
  if (count === null) {
    return (
      <div style={rateLimitChipStyle(false)} data-testid="composer-rate-limit">
        Estimating audience…
      </div>
    );
  }

  const isBigSend = count >= BIG_SEND_THRESHOLD;
  return (
    <div style={rateLimitChipStyle(isBigSend)} data-testid="composer-rate-limit">
      {isBigSend && '⚠ '}~{count.toLocaleString()} recipients · {formatEta(count)}
      {isBigSend && ' — plan timing accordingly.'}
    </div>
  );
}

function formatEta(count: number): string {
  if (count <= 60) return 'sends in under a minute';
  const seconds = Math.ceil(count / TG_GLOBAL_THROTTLE_PER_SEC);
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `est. ~${minutes} min to drain`;
  const hours = Math.ceil(minutes / 60);
  return `est. ~${hours} h to drain`;
}

function rateLimitChipStyle(warn: boolean): React.CSSProperties {
  return {
    padding: '8px 12px',
    borderRadius: 6,
    fontSize: 13,
    border: `1px solid ${warn ? '#dc2626' : 'var(--border)'}`,
    background: warn ? 'rgba(220, 38, 38, 0.08)' : 'var(--muted)',
    color: warn ? '#dc2626' : 'var(--muted-foreground)',
  };
}

// ─── styles ──────────────────────────────────────────────────────────────

function mutedStyle(): React.CSSProperties {
  return { color: 'var(--muted-foreground)', fontSize: 14 };
}

function labelStyle(): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--muted-foreground)',
  };
}

function inputStyle(): React.CSSProperties {
  return {
    padding: '8px 12px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    fontSize: 14,
    background: 'var(--background)',
    color: 'var(--foreground)',
  };
}

function fieldsetStyle(): React.CSSProperties {
  return {
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: 12,
  };
}

function primaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '8px 16px',
    background: disabled ? 'var(--muted)' : 'var(--primary)',
    color: 'var(--primary-foreground)',
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

function secondaryButtonStyle(): React.CSSProperties {
  return {
    padding: '8px 12px',
    background: 'transparent',
    color: 'var(--foreground)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-block',
  };
}

function dangerButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '8px 16px',
    background: disabled ? 'var(--muted)' : '#dc2626',
    color: 'white',
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

function successBoxStyle(): React.CSSProperties {
  return {
    padding: 12,
    border: '1px solid #16a34a',
    background: '#dcfce7',
    color: '#15803d',
    borderRadius: 6,
    fontSize: 14,
  };
}

function errorBoxStyle(): React.CSSProperties {
  return {
    padding: 12,
    border: '1px solid #dc2626',
    background: '#fee2e2',
    color: '#991b1b',
    borderRadius: 6,
    fontSize: 14,
  };
}
