import { type ReactElement, useEffect, useState } from 'react';
import { getAuthState } from '../lib/auth-bootstrap';

// F-S3.9 — /me/referrals island. Issues + shows the member's referral
// code with the share URL. Idempotent: re-clicking "Get my code" returns
// the existing active code (no duplicates accumulate).

interface ReferralCodeView {
  id: string;
  code: string;
  shareUrl: string;
  validUntil: string | null;
  createdAt: string;
}

// F-S5.3 — "brought a friend" stats. Best-effort; stats panel is hidden
// when fetch fails so it never blocks the rest of the page.
interface MyReferralStats {
  attendedReferreesCount: number;
  broughtAFriendBadge: { firstAwardedAt: string; count: number } | null;
}

type State =
  | { phase: 'loading' }
  | { phase: 'anon' }
  | {
      phase: 'authed';
      accessToken: string;
      codes: ReferralCodeView[];
      stats: MyReferralStats | null;
    }
  | { phase: 'error'; message: string };

async function bootstrap(): Promise<State> {
  try {
    const auth = await getAuthState();
    if (!auth) return { phase: 'anon' };
    const { accessToken } = auth;
    const [mine, statsRes] = await Promise.all([
      fetch('/api/v1/referrals/mine', { headers: { Authorization: `Bearer ${accessToken}` } }),
      fetch('/api/v1/referrals/mine/stats', {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ]);
    if (!mine.ok) return { phase: 'error', message: `list referrals: ${mine.status}` };
    const { codes } = (await mine.json()) as { codes: ReferralCodeView[] };
    const stats = statsRes.ok ? ((await statsRes.json()) as MyReferralStats) : null;
    return { phase: 'authed', accessToken, codes, stats };
  } catch (err) {
    return { phase: 'error', message: err instanceof Error ? err.message : 'bootstrap failed' };
  }
}

function signInUrl(): string {
  const next =
    typeof window === 'undefined'
      ? '/me/referrals'
      : window.location.pathname + window.location.search;
  return `/api/v1/auth/login?next=${encodeURIComponent(next)}`;
}

async function issueOne(accessToken: string): Promise<ReferralCodeView> {
  const r = await fetch('/api/v1/referrals/issue', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error(`issue failed: ${r.status}`);
  const { code } = (await r.json()) as { code: ReferralCodeView };
  return code;
}

export default function MyReferrals(): ReactElement {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void bootstrap().then(setState);
  }, []);

  useEffect(() => {
    if (state.phase === 'anon' && typeof window !== 'undefined') {
      window.location.replace(signInUrl());
    }
  }, [state.phase]);

  const onIssue = async (): Promise<void> => {
    if (state.phase !== 'authed') return;
    setBusy(true);
    setErr(null);
    try {
      const code = await issueOne(state.accessToken);
      const exists = state.codes.find((c) => c.id === code.id);
      const codes = exists ? state.codes : [code, ...state.codes];
      setState({ ...state, codes });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'issue failed');
    } finally {
      setBusy(false);
    }
  };

  if (state.phase === 'loading' || state.phase === 'anon') {
    return <p style={{ color: 'var(--muted-foreground)' }}>Loading…</p>;
  }
  if (state.phase === 'error') {
    return (
      <p style={{ color: 'var(--muted-foreground)' }}>Referrals unavailable: {state.message}</p>
    );
  }

  return (
    <div>
      <Header />
      {state.codes.length === 0 ? (
        <EmptyPanel busy={busy} err={err} onIssue={() => void onIssue()} />
      ) : (
        <ActiveCodePanel code={state.codes[0]} />
      )}
      {state.stats && <StatsPanel stats={state.stats} />}
      <FootnoteHowItWorks />
    </div>
  );
}

function StatsPanel({ stats }: { stats: MyReferralStats }): ReactElement | null {
  // Hide the panel entirely for first-time members (no attendees brought
  // yet) — the empty zero is more noise than signal. Once at least one
  // friend has attended, the panel always renders.
  if (stats.attendedReferreesCount === 0 && !stats.broughtAFriendBadge) return null;
  return (
    <div
      style={{
        marginTop: 24,
        padding: 24,
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--card)',
        display: 'flex',
        gap: 20,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: '1 1 200px' }}>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--muted-foreground)',
            margin: '0 0 6px',
          }}
        >
          Friends attended
        </p>
        <p
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 28,
            letterSpacing: '-0.02em',
            margin: 0,
          }}
        >
          {stats.attendedReferreesCount}
        </p>
        <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: '4px 0 0' }}>
          {stats.attendedReferreesCount === 1
            ? '+25 points awarded'
            : `+${stats.attendedReferreesCount * 25} points awarded`}
        </p>
      </div>
      {stats.broughtAFriendBadge && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            border: '1px solid color-mix(in oklch, var(--primary) 30%, var(--border))',
            borderRadius: 10,
            background: 'color-mix(in oklch, var(--primary) 8%, var(--card))',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 32,
              height: 32,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              background: 'var(--primary)',
              color: 'var(--primary-foreground, white)',
              fontWeight: 700,
              fontSize: 13,
              fontFamily: 'var(--font-mono)',
              letterSpacing: 0,
            }}
          >
            BA
          </span>
          <div>
            <p style={{ fontWeight: 600, fontSize: 14, margin: 0 }}>Brought a friend</p>
            <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: '2px 0 0' }}>
              {stats.broughtAFriendBadge.count > 1
                ? `Earned ${stats.broughtAFriendBadge.count}×`
                : 'Earned'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Header(): ReactElement {
  return (
    <div style={{ marginBottom: 24 }}>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 28,
          letterSpacing: '-0.02em',
          margin: '0 0 6px',
        }}
      >
        Your referral code
      </h1>
      <p style={{ fontSize: 14, color: 'var(--muted-foreground)', margin: 0 }}>
        Share it. People who register via your link get attributed to you.
      </p>
    </div>
  );
}

interface EmptyPanelProps {
  busy: boolean;
  err: string | null;
  onIssue: () => void;
}

function EmptyPanel({ busy, err, onIssue }: EmptyPanelProps): ReactElement {
  return (
    <div
      style={{
        padding: 32,
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--card)',
        textAlign: 'center',
      }}
    >
      <p style={{ fontSize: 14, color: 'var(--muted-foreground)', margin: '0 0 16px' }}>
        You don't have a referral code yet. Mint one — it's a 6-character string you can share.
      </p>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={onIssue}>
        {busy ? 'Minting…' : 'Mint my code'}
      </button>
      {err && (
        <p style={{ fontSize: 12, color: 'var(--destructive, #c00)', margin: '12px 0 0' }}>{err}</p>
      )}
    </div>
  );
}

function ActiveCodePanel({ code }: { code: ReferralCodeView | undefined }): ReactElement {
  if (!code) return <p style={{ color: 'var(--muted-foreground)' }}>No active code.</p>;
  const onCopy = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard API blocked — older browsers; user can still triple-click
    }
  };
  return (
    <div
      style={{
        padding: 28,
        border: '1px solid color-mix(in oklch, var(--primary) 30%, var(--border))',
        borderRadius: 12,
        background: 'color-mix(in oklch, var(--primary) 5%, var(--card))',
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--muted-foreground)',
          margin: '0 0 8px',
        }}
      >
        Code
      </p>
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 32,
          fontWeight: 500,
          letterSpacing: '0.04em',
          margin: '0 0 20px',
        }}
      >
        {code.code}
      </p>
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--muted-foreground)',
          margin: '0 0 8px',
        }}
      >
        Share link
      </p>
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'stretch',
        }}
      >
        <input
          type="text"
          readOnly
          value={code.shareUrl}
          onFocus={(e) => e.target.select()}
          style={{
            flex: 1,
            padding: '10px 12px',
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: 'var(--background)',
            color: 'var(--foreground)',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
          }}
        />
        <button type="button" className="btn" onClick={() => void onCopy(code.shareUrl)}>
          Copy
        </button>
      </div>
    </div>
  );
}

function FootnoteHowItWorks(): ReactElement {
  return (
    <details
      style={{
        marginTop: 24,
        padding: 16,
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--background)',
      }}
    >
      <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--muted-foreground)' }}>
        How attribution works
      </summary>
      <div style={{ marginTop: 12, fontSize: 13, color: 'var(--muted-foreground)' }}>
        <p style={{ margin: '0 0 8px' }}>
          When someone lands at <code>aiqadam.org/?ref=&lt;your-code&gt;</code>, the code is
          resolved server-side and stashed in a long-lived cookie on that visitor's device.
        </p>
        <p style={{ margin: 0 }}>
          When that visitor later registers for an event, their{' '}
          <code>registrations.referred_by</code> row is stamped with your user id. Top-referrer +
          K-factor analytics surface that attribution as it scales (Sprint 2.6 dashboard).
        </p>
      </div>
    </details>
  );
}
