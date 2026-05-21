import { type ReactElement, type ReactNode, useCallback, useEffect, useState } from 'react';

// F-S3.3 — operator announcement composer.
// Flow: pick saved cohort → write subject + body → preview → send.
// Auto-redirects anon to Authentik (matches workspace shell pattern).

interface Me {
  id: string;
  email: string;
  authentikSubject: string;
}
interface Cohort {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  member_count_cached: number;
}
interface Preview {
  cohortName: string;
  estimatedRecipients: number;
  truncated: boolean;
  subject: string;
  text: string;
}
interface SendResult {
  interactionId: string;
  recipientCount: number;
  truncated: boolean;
  deliveriesSummary: {
    sent: number;
    skipped_consent: number;
    failed: number;
    other: number;
  };
}

type State =
  | { phase: 'loading' }
  | { phase: 'anon' }
  | { phase: 'authed'; me: Me }
  | { phase: 'error'; message: string };

async function bootstrap(): Promise<State> {
  try {
    const r = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
    if (!r.ok) return { phase: 'anon' };
    const { accessToken } = (await r.json()) as { accessToken: string };
    const meRes = await fetch('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!meRes.ok) return { phase: 'anon' };
    const me = (await meRes.json()) as Me;
    return { phase: 'authed', me };
  } catch (err) {
    return { phase: 'error', message: err instanceof Error ? err.message : 'bootstrap failed' };
  }
}

function signInUrl(): string {
  const next =
    typeof window === 'undefined'
      ? '/workspace/announce'
      : window.location.pathname + window.location.search;
  return `/api/v1/auth/login?next=${encodeURIComponent(next)}`;
}

export default function AnnounceComposer(): ReactElement {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    void bootstrap().then(async (s) => {
      setState(s);
      if (s.phase === 'authed') {
        const r = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
        if (r.ok) {
          const { accessToken: t } = (await r.json()) as { accessToken: string };
          setAccessToken(t);
        }
      }
    });
  }, []);

  useEffect(() => {
    if (state.phase === 'anon' && typeof window !== 'undefined') {
      window.location.replace(signInUrl());
    }
  }, [state.phase]);

  if (state.phase === 'loading' || state.phase === 'anon')
    return (
      <Shell>
        <Loading />
      </Shell>
    );
  if (state.phase === 'error')
    return (
      <Shell>
        <Err message={state.message} />
      </Shell>
    );
  return (
    <Shell>
      <Composer accessToken={accessToken} email={state.me.email} />
    </Shell>
  );
}

function Shell({ children }: { children: ReactElement }): ReactElement {
  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 56px)' }}>
      <aside
        style={{
          width: 240,
          flexShrink: 0,
          borderRight: '1px solid var(--border)',
          padding: '24px 16px',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--muted-foreground)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            margin: '0 0 12px',
            padding: '0 8px',
          }}
        >
          Workspace
        </p>
        <a
          href="/workspace"
          className="app-nav-link"
          style={{ display: 'block', padding: '8px 12px' }}
        >
          Dashboard
        </a>
        <a
          href="/workspace/members"
          className="app-nav-link"
          style={{ display: 'block', padding: '8px 12px' }}
        >
          Members
        </a>
        <a
          href="/workspace/announce"
          className="app-nav-link"
          style={{
            display: 'block',
            padding: '8px 12px',
            background: 'var(--card)',
            borderRadius: 6,
          }}
        >
          Announce
        </a>
      </aside>
      <main style={{ flex: 1, padding: '32px 48px', maxWidth: 880 }}>{children}</main>
    </div>
  );
}

function Loading(): ReactElement {
  return <p style={{ color: 'var(--muted-foreground)' }}>Loading…</p>;
}
function Err({ message }: { message: string }): ReactElement {
  return <p style={{ color: 'var(--muted-foreground)' }}>Announce unavailable: {message}</p>;
}

function Composer({
  accessToken,
  email,
}: { accessToken: string | null; email: string }): ReactElement {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortId, setCohortId] = useState<string>('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [consentBasis, setConsentBasis] = useState<'explicit_opt_in' | 'operational_contract'>(
    'explicit_opt_in',
  );
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCohorts = useCallback(async () => {
    if (!accessToken) return;
    const r = await fetch('/api/v1/workspace/cohorts', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (r.ok) {
      const { cohorts: rows } = (await r.json()) as { cohorts: Cohort[] };
      setCohorts(rows);
      if (!cohortId && rows.length > 0 && rows[0]) setCohortId(rows[0].id);
    }
  }, [accessToken, cohortId]);

  useEffect(() => {
    if (accessToken) void loadCohorts();
  }, [accessToken, loadCohorts]);

  const onPreview = async (): Promise<void> => {
    if (!accessToken) return;
    setError(null);
    setPreviewing(true);
    setPreview(null);
    try {
      const r = await fetch('/api/v1/workspace/announce/preview', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ cohortId, subject, body }),
      });
      if (!r.ok) {
        const t = await r.text();
        setError(`Preview failed: ${t.slice(0, 200)}`);
      } else {
        setPreview((await r.json()) as Preview);
      }
    } finally {
      setPreviewing(false);
    }
  };

  const onSend = async (): Promise<void> => {
    if (!accessToken) return;
    if (!confirm(`Send to ~${preview?.estimatedRecipients ?? '?'} recipients?`)) return;
    setError(null);
    setSending(true);
    try {
      const r = await fetch('/api/v1/workspace/announce', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ cohortId, subject, body, consentBasis }),
      });
      if (!r.ok) {
        const t = await r.text();
        setError(`Send failed: ${t.slice(0, 200)}`);
      } else {
        setSent((await r.json()) as SendResult);
      }
    } finally {
      setSending(false);
    }
  };

  const selectedCohort = cohorts.find((c) => c.id === cohortId) ?? null;
  const ready = cohortId.length > 0 && subject.trim().length > 0 && body.trim().length > 0;

  const resetForNext = (): void => {
    setSent(null);
    setSubject('');
    setBody('');
    setPreview(null);
  };

  return (
    <div>
      <Header email={email} />
      {sent ? (
        <SendResultPanel sent={sent} onAnother={resetForNext} />
      ) : (
        <ComposerForm
          cohorts={cohorts}
          cohortId={cohortId}
          setCohortId={(v) => {
            setCohortId(v);
            setPreview(null);
          }}
          selectedCohort={selectedCohort}
          subject={subject}
          setSubject={(v) => {
            setSubject(v);
            setPreview(null);
          }}
          body={body}
          setBody={(v) => {
            setBody(v);
            setPreview(null);
          }}
          consentBasis={consentBasis}
          setConsentBasis={setConsentBasis}
          preview={preview}
          previewing={previewing}
          sending={sending}
          ready={ready}
          error={error}
          onPreview={() => void onPreview()}
          onSend={() => void onSend()}
        />
      )}
    </div>
  );
}

interface ComposerFormProps {
  cohorts: Cohort[];
  cohortId: string;
  setCohortId: (v: string) => void;
  selectedCohort: Cohort | null;
  subject: string;
  setSubject: (v: string) => void;
  body: string;
  setBody: (v: string) => void;
  consentBasis: 'explicit_opt_in' | 'operational_contract';
  setConsentBasis: (v: 'explicit_opt_in' | 'operational_contract') => void;
  preview: Preview | null;
  previewing: boolean;
  sending: boolean;
  ready: boolean;
  error: string | null;
  onPreview: () => void;
  onSend: () => void;
}

function ComposerForm(props: ComposerFormProps): ReactElement {
  const {
    cohorts,
    cohortId,
    setCohortId,
    selectedCohort,
    subject,
    setSubject,
    body,
    setBody,
    consentBasis,
    setConsentBasis,
    preview,
    previewing,
    sending,
    ready,
    error,
    onPreview,
    onSend,
  } = props;
  return (
    <>
      <Field label="Cohort">
        {cohorts.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>
            No cohorts yet. Build one in{' '}
            <a href="/workspace/members" style={{ color: 'var(--primary)' }}>
              /workspace/members
            </a>{' '}
            first.
          </p>
        ) : (
          <select value={cohortId} onChange={(e) => setCohortId(e.target.value)} style={inputStyle}>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.member_count_cached} members)
              </option>
            ))}
          </select>
        )}
        {selectedCohort?.description && (
          <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: '6px 0 0' }}>
            {selectedCohort.description}
          </p>
        )}
      </Field>

      <Field label="Subject">
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. 'AI Qadam Tashkent meetup — September 12'"
          style={inputStyle}
          maxLength={200}
        />
      </Field>

      <Field label="Body">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          placeholder={'Hi everyone,\n\nQuick note: …\n\nSee you there.'}
          style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
          maxLength={20000}
        />
        <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '6px 0 0' }}>
          Blank lines = paragraph breaks. Plain text only for v1 (rich formatting later).
          {body.length}/20000
        </p>
      </Field>

      <Field label="Consent basis">
        <select
          value={consentBasis}
          onChange={(e) =>
            setConsentBasis(e.target.value as 'explicit_opt_in' | 'operational_contract')
          }
          style={inputStyle}
        >
          <option value="explicit_opt_in">Marketing (members must have opted in)</option>
          <option value="operational_contract">
            Operational (transactional — registered users only; use sparingly)
          </option>
        </select>
        <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '6px 0 0' }}>
          Per-recipient consent enforced by the dispatcher; mismatched recipients are silently
          skipped (counted as <code>skipped_consent</code> in the result).
        </p>
      </Field>

      <div style={{ display: 'flex', gap: 8, marginTop: 20, alignItems: 'center' }}>
        <button
          type="button"
          onClick={onPreview}
          disabled={!ready || previewing}
          className="btn btn-ghost"
        >
          {previewing ? 'Previewing…' : 'Preview'}
        </button>
        <button
          type="button"
          onClick={onSend}
          disabled={!ready || sending || !preview}
          className="btn btn-primary"
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
        {!preview && ready && (
          <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
            Preview before sending.
          </span>
        )}
      </div>

      {error && <p style={{ color: '#dc2626', fontSize: 13, marginTop: 12 }}>{error}</p>}
      {preview && <PreviewPanel preview={preview} />}
    </>
  );
}

function Header({ email }: { email: string }): ReactElement {
  return (
    <header style={{ marginBottom: 24 }}>
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--muted-foreground)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          margin: '0 0 6px',
        }}
      >
        Signed in as {email}
      </p>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 28,
          letterSpacing: '-0.01em',
          margin: 0,
        }}
      >
        Announce
      </h1>
      <p style={{ color: 'var(--muted-foreground)', fontSize: 14, margin: '6px 0 0' }}>
        Pick a cohort, write a message, preview, send. Goes through the dispatcher — per-recipient
        consent checks apply per the basis you pick.
      </p>
    </header>
  );
}

function PreviewPanel({ preview }: { preview: Preview }): ReactElement {
  return (
    <section
      style={{
        marginTop: 24,
        padding: 16,
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--card)',
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--muted-foreground)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          margin: '0 0 10px',
        }}
      >
        Preview
      </p>
      <p style={{ margin: '0 0 12px', fontSize: 14 }}>
        Sending to <strong>{preview.cohortName}</strong> — ~
        <strong>{preview.estimatedRecipients}</strong> recipients
        {preview.truncated ? ' (cap will apply — refine cohort)' : ''}
      </p>
      <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--muted-foreground)' }}>Subject:</p>
      <p style={{ margin: '0 0 12px', fontFamily: 'var(--font-display)', fontSize: 16 }}>
        {preview.subject}
      </p>
      <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--muted-foreground)' }}>
        Body (text):
      </p>
      <pre
        style={{
          whiteSpace: 'pre-wrap',
          fontFamily: 'inherit',
          fontSize: 13,
          margin: 0,
          padding: 12,
          border: '1px solid var(--border)',
          borderRadius: 6,
          background: 'var(--background)',
        }}
      >
        {preview.text}
      </pre>
    </section>
  );
}

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--background)',
  color: 'var(--foreground)',
  fontSize: 14,
};

// Field is a visual grouping wrapper, not a <label>. The select/input
// inside can have its own aria-label if needed; using <label> here
// without a single bound control trips biome's a11y rule when the field
// renders a conditional non-control (e.g. cohort empty state).
function Field({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div style={{ display: 'block', marginBottom: 16 }}>
      <p style={{ display: 'block', fontSize: 12, fontWeight: 500, margin: '0 0 6px' }}>{label}</p>
      {children}
    </div>
  );
}

function SendResultPanel({
  sent,
  onAnother,
}: { sent: SendResult; onAnother: () => void }): ReactElement {
  const { sent: ok, skipped_consent, failed, other } = sent.deliveriesSummary;
  return (
    <section
      style={{
        padding: 24,
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--card)',
      }}
    >
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, margin: '0 0 12px' }}>
        Dispatched ✓
      </h2>
      <p style={{ margin: '0 0 16px', fontSize: 14 }}>
        Interaction{' '}
        <code style={{ fontFamily: 'var(--font-mono)' }}>{sent.interactionId.slice(0, 8)}</code>{' '}
        reached {sent.recipientCount} recipient{sent.recipientCount === 1 ? '' : 's'}
        {sent.truncated ? ' (cohort was truncated to dispatch cap)' : ''}.
      </p>
      <ul
        style={{
          margin: '0 0 20px',
          padding: 0,
          listStyle: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <li>✅ Sent: {ok}</li>
        <li>⏭ Skipped (no consent): {skipped_consent}</li>
        <li>❌ Failed: {failed}</li>
        {other > 0 && <li>Other states: {other}</li>}
      </ul>
      <button type="button" onClick={onAnother} className="btn btn-primary">
        Send another
      </button>
    </section>
  );
}
