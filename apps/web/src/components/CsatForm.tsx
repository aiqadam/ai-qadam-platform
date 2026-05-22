import { type FormEvent, type ReactElement, useState } from 'react';

// F-S1.2 — public CSAT form. One-shot per token. No auth; the token is
// the only credential. Server enforces idempotency via the per-delivery
// responded_at lock.

type Phase = 'idle' | 'submitting' | 'success' | 'already' | 'error';

const RATINGS = [1, 2, 3, 4, 5] as const;

interface PostInput {
  token: string;
  rating: number;
  comment: string;
}

async function postCsat(input: PostInput): Promise<{ phase: Phase; error: string | null }> {
  try {
    const body: { token: string; rating: number; comment?: string } = {
      token: input.token,
      rating: input.rating,
      ...(input.comment.trim() ? { comment: input.comment.trim() } : {}),
    };
    const res = await fetch('/api/v1/feedback/csat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 202) return { phase: 'success', error: null };
    if (res.status === 409) return { phase: 'already', error: null };
    const text = await res.text();
    return { phase: 'error', error: `Submission failed (${res.status}): ${text.slice(0, 200)}` };
  } catch (err) {
    return { phase: 'error', error: err instanceof Error ? err.message : 'submit failed' };
  }
}

const SR_ONLY: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  border: 0,
};

export default function CsatForm({ token }: { token: string }): ReactElement {
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [comment, setComment] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <Panel>
        <Heading>Missing token</Heading>
        <p style={{ color: 'var(--muted-foreground)', margin: 0 }}>
          The link you clicked is incomplete. If you got the feedback email, open it again and tap
          the link directly.
        </p>
      </Panel>
    );
  }

  const submit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (rating == null) return;
    setPhase('submitting');
    setError(null);
    const result = await postCsat({ token, rating, comment });
    setPhase(result.phase);
    setError(result.error);
  };

  if (phase === 'success') {
    return (
      <Panel>
        <Heading>Thanks — recorded</Heading>
        <p style={{ color: 'var(--muted-foreground)', margin: 0 }}>
          Your response shapes the next event. We read every comment.
        </p>
      </Panel>
    );
  }

  if (phase === 'already') {
    return (
      <Panel>
        <Heading>Already responded</Heading>
        <p style={{ color: 'var(--muted-foreground)', margin: 0 }}>
          Looks like this link was already used. One response per attendee per event.
        </p>
      </Panel>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)}>
      <Panel>
        <Heading>How was the event?</Heading>
        <p style={{ color: 'var(--muted-foreground)', margin: '0 0 24px' }}>
          One question, 30 seconds. Pick a rating; the optional comment is what we read at the
          retro.
        </p>
        <fieldset style={{ display: 'flex', gap: 8, marginBottom: 18, border: 'none', padding: 0 }}>
          <legend style={SR_ONLY}>Rating</legend>
          {RATINGS.map((r) => (
            <label
              key={r}
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: rating === r ? 'var(--primary)' : 'transparent',
                color: rating === r ? 'var(--primary-foreground)' : 'var(--foreground)',
                fontFamily: 'var(--font-mono)',
                fontSize: 20,
                fontWeight: 600,
                cursor: phase === 'submitting' ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <input
                type="radio"
                name="csat-rating"
                value={r}
                checked={rating === r}
                onChange={() => setRating(r)}
                disabled={phase === 'submitting'}
                style={SR_ONLY}
              />
              {r}
            </label>
          ))}
        </fieldset>
        <p
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11,
            color: 'var(--muted-foreground)',
            margin: '0 0 20px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <span>1 — disappointed</span>
          <span>5 — would tell a friend</span>
        </p>
        <label htmlFor="csat-comment" style={{ display: 'block' }}>
          <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
            What worked / what didn't (optional)
          </span>
          <textarea
            id="csat-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            maxLength={4000}
            disabled={phase === 'submitting'}
            placeholder="Skip if nothing comes to mind."
            style={{
              width: '100%',
              marginTop: 8,
              padding: '10px 12px',
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'var(--background)',
              color: 'var(--foreground)',
              fontFamily: 'inherit',
              fontSize: 14,
              resize: 'vertical',
            }}
          />
        </label>
        {error && (
          <p style={{ color: 'var(--destructive, #c00)', fontSize: 13, marginTop: 12 }}>{error}</p>
        )}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={rating == null || phase === 'submitting'}
          style={{ marginTop: 20 }}
        >
          {phase === 'submitting' ? 'Submitting…' : 'Submit'}
        </button>
      </Panel>
    </form>
  );
}

function Panel({ children }: { children: React.ReactNode }): ReactElement {
  return (
    <div
      style={{
        padding: 36,
        border: '1px solid var(--border)',
        borderRadius: 16,
        background: 'var(--card)',
      }}
    >
      {children}
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }): ReactElement {
  return (
    <h1
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 600,
        fontSize: 26,
        margin: '0 0 8px',
      }}
    >
      {children}
    </h1>
  );
}
