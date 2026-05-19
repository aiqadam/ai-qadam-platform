import { type ReactElement, useEffect, useState } from 'react';

// Sprint 5.5/6 — /me/preferences island.
//
// Reuses the MeDashboard bootstrap pattern:
//   1. POST /api/v1/auth/refresh — anon → CTA
//   2. GET /api/v1/me/preferences/consents → render toggles
//   3. PATCH /api/v1/me/preferences/consents on toggle change

type TopicKey = 'newsletter' | 'sponsor_offer' | 'speaker_promo';

interface ConsentSummary {
  topic: TopicKey;
  granted: boolean;
  lastChangedAt: string | null;
}

// Display labels live client-side so the UI can re-skin per locale later
// without an API round-trip. Server-side TOPICS owns the canonical
// (initiator_actor_class, intent_class) mapping.
const TOPIC_LABELS: Record<TopicKey, { title: string; description: string }> = {
  newsletter: {
    title: 'Newsletter',
    description: 'Monthly digest of events, talks, and what other members are building.',
  },
  sponsor_offer: {
    title: 'Sponsor offers',
    description: 'Relevant offers from partners — job postings, courses, infrastructure credits.',
  },
  speaker_promo: {
    title: 'Speaker promotions',
    description:
      'Updates from people who have spoken at AI Qadam events — their own talks, courses, or content.',
  },
};

const TOPIC_ORDER: TopicKey[] = ['newsletter', 'sponsor_offer', 'speaker_promo'];

type State =
  | { phase: 'loading' }
  | { phase: 'anon' }
  | { phase: 'authed'; accessToken: string; consents: Record<TopicKey, ConsentSummary> }
  | { phase: 'error'; message: string };

async function bootstrap(): Promise<State> {
  const refresh = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (!refresh.ok) return { phase: 'anon' };
  const { accessToken } = (await refresh.json()) as { accessToken: string };

  const listRes = await fetch('/api/v1/me/preferences/consents', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listRes.ok) return { phase: 'anon' };
  const { consents } = (await listRes.json()) as { consents: ConsentSummary[] };

  const byTopic = consents.reduce(
    (acc, c) => {
      acc[c.topic] = c;
      return acc;
    },
    {} as Record<TopicKey, ConsentSummary>,
  );
  return { phase: 'authed', accessToken, consents: byTopic };
}

async function patchConsent(
  accessToken: string,
  topic: TopicKey,
  granted: boolean,
): Promise<ConsentSummary> {
  const res = await fetch('/api/v1/me/preferences/consents', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ topic, granted }),
  });
  if (!res.ok) {
    throw new Error(`PATCH failed: ${res.status}`);
  }
  const { consent } = (await res.json()) as { consent: ConsentSummary };
  return consent;
}

function nextHere(): string {
  return `${window.location.pathname}${window.location.search}`;
}

function AnonView(): ReactElement {
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
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 22,
          margin: '0 0 8px',
        }}
      >
        Sign in to manage preferences
      </h2>
      <p style={{ fontSize: 14, color: 'var(--muted-foreground)', margin: '0 0 20px' }}>
        Choose what we email you about. You can change this any time.
      </p>
      <a
        className="btn btn-primary btn-lg"
        href={`/auth/sign-in?next=${encodeURIComponent(nextHere())}`}
        style={{ textDecoration: 'none' }}
      >
        Sign in with Authentik
      </a>
    </div>
  );
}

interface RowProps {
  topic: TopicKey;
  consent: ConsentSummary;
  pending: boolean;
  onToggle: (next: boolean) => void;
}

function ConsentRow({ topic, consent, pending, onToggle }: RowProps): ReactElement {
  const label = TOPIC_LABELS[topic];
  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        alignItems: 'flex-start',
        padding: '16px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{ flex: 1 }}>
        <p
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 15,
            margin: '0 0 4px',
          }}
        >
          {label.title}
        </p>
        <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>
          {label.description}
        </p>
      </div>
      <button
        type="button"
        className={consent.granted ? 'btn btn-primary' : 'btn'}
        onClick={() => onToggle(!consent.granted)}
        disabled={pending}
        aria-pressed={consent.granted}
        style={{ minWidth: 96 }}
      >
        {pending ? '…' : consent.granted ? 'Granted' : 'Revoked'}
      </button>
    </div>
  );
}

export function PreferencesForm(): ReactElement {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [pendingTopic, setPendingTopic] = useState<TopicKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    bootstrap()
      .catch(
        (err: unknown): State => ({
          phase: 'error',
          message: err instanceof Error ? err.message : 'bootstrap failed',
        }),
      )
      .then((next) => {
        if (!cancelled) setState(next);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.phase === 'loading') {
    return <p style={{ color: 'var(--muted-foreground)' }}>Loading…</p>;
  }
  if (state.phase === 'error') {
    return <p style={{ color: 'var(--destructive, #c00)' }}>{state.message}</p>;
  }
  if (state.phase === 'anon') return <AnonView />;

  const { accessToken, consents } = state;

  const onToggle = async (topic: TopicKey, granted: boolean) => {
    setPendingTopic(topic);
    try {
      const updated = await patchConsent(accessToken, topic, granted);
      setState({
        phase: 'authed',
        accessToken,
        consents: { ...consents, [topic]: updated },
      });
    } catch (err) {
      setState({
        phase: 'error',
        message: err instanceof Error ? err.message : 'toggle failed',
      });
    } finally {
      setPendingTopic(null);
    }
  };

  return (
    <div
      style={{
        padding: 32,
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--card)',
      }}
    >
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 22,
          margin: '0 0 8px',
        }}
      >
        Email preferences
      </h2>
      <p style={{ fontSize: 14, color: 'var(--muted-foreground)', margin: '0 0 24px' }}>
        Choose what we email you about. Registration confirmations and other transactional messages
        are always sent.
      </p>
      {TOPIC_ORDER.map((topic) => (
        <ConsentRow
          key={topic}
          topic={topic}
          consent={consents[topic]}
          pending={pendingTopic === topic}
          onToggle={(next) => onToggle(topic, next)}
        />
      ))}
    </div>
  );
}
