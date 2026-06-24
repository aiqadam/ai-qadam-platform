// L2 customer block — <CsatForm>.
//
// F-S1.2 — public CSAT form. One-shot per token. No auth; the token is
// the only credential. Server enforces idempotency via the per-delivery
// responded_at lock.
//
// ADR-0038 §Locks #2: uses apiClient (not raw fetch).

'use client';

// arch-ignore: no-api-import-in-blocks — apiClient is the approved abstraction here (not raw fetch); refactor to prop-drilling tracked in ISS-CI-001
import { apiClient } from '@/lib/api-client';
import { IslandRoot } from '@/lib/island-root';
import { type ReactElement, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'submitting' | 'success' | 'already' | 'error';

interface CsatFormProps {
  token: string;
  onSuccess?: () => void;
}

// ─── Submission ───────────────────────────────────────────────────────────────

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
    };
    if (input.comment.trim()) {
      body.comment = input.comment.trim();
    }
    const res = await apiClient<{ success?: boolean }>('/v1/feedback/csat', {
      method: 'POST',
      body: body as unknown as Record<string, unknown>,
    });
    void res; // consumed by apiClient throwing on non-2xx
    return { phase: 'success', error: null };
  } catch (err) {
    // apiClient throws ApiError on non-2xx; 409 → "already" state
    if (err instanceof Error && err.message.includes('409')) {
      return { phase: 'already', error: null };
    }
    return { phase: 'error', error: err instanceof Error ? err.message : 'submit failed' };
  }
}

// ─── Constants ───────────────────────────────────────────────────────────────

const RATINGS = [1, 2, 3, 4, 5] as const;

// ─── Sub-components ──────────────────────────────────────────────────────────

function Panel({ children }: { children: React.ReactNode }): ReactElement {
  return <div className="rounded-xl border border-border bg-card p-9">{children}</div>;
}

function Heading({ children }: { children: React.ReactNode }): ReactElement {
  return <h1 className="mb-2 font-display text-2xl font-semibold">{children}</h1>;
}

// ─── Main component ──────────────────────────────────────────────────────────

export function CsatForm({ token, onSuccess }: CsatFormProps): ReactElement {
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [comment, setComment] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <IslandRoot>
        <Panel>
          <Heading>Missing token</Heading>
          <p className="text-muted-foreground">
            The link you clicked is incomplete. If you got the feedback email, open it again and tap
            the link directly.
          </p>
        </Panel>
      </IslandRoot>
    );
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (rating == null) return;
    setPhase('submitting');
    setError(null);
    const result = await postCsat({ token, rating, comment });
    setPhase(result.phase);
    setError(result.error);
    if (result.phase === 'success') {
      onSuccess?.();
    }
  };

  if (phase === 'success') {
    return (
      <IslandRoot>
        <Panel>
          <Heading>Thanks — recorded</Heading>
          <p className="text-muted-foreground">
            Your response shapes the next event. We read every comment.
          </p>
        </Panel>
      </IslandRoot>
    );
  }

  if (phase === 'already') {
    return (
      <IslandRoot>
        <Panel>
          <Heading>Already responded</Heading>
          <p className="text-muted-foreground">
            Looks like this link was already used. One response per attendee per event.
          </p>
        </Panel>
      </IslandRoot>
    );
  }

  const isSubmitting = phase === 'submitting';

  return (
    <IslandRoot>
      <form onSubmit={(e) => void handleSubmit(e)}>
        <Panel>
          <Heading>How was the event?</Heading>
          <p className="mb-6 text-muted-foreground">
            One question, 30 seconds. Pick a rating; the optional comment is what we read at the
            retro.
          </p>

          {/* Rating buttons */}
          <fieldset className="mb-4 flex gap-2 border-0 p-0">
            <legend className="sr-only">Rating</legend>
            {RATINGS.map((r) => (
              <label
                key={r}
                className={`flex h-14 w-14 cursor-pointer items-center justify-center rounded-lg border border-border bg-transparent text-xl font-semibold transition-colors hover:border-primary/40 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ${
                  rating === r ? 'border-primary bg-primary text-primary-foreground' : ''
                }`}
              >
                <input
                  type="radio"
                  name="csat-rating"
                  value={r}
                  checked={rating === r}
                  onChange={() => setRating(r)}
                  disabled={isSubmitting}
                  className="sr-only"
                  aria-disabled={isSubmitting}
                />
                {r}
              </label>
            ))}
          </fieldset>

          {/* Rating scale labels */}
          <div className="mb-5 flex justify-between font-mono text-xs text-muted-foreground">
            <span>1 — disappointed</span>
            <span>5 — would tell a friend</span>
          </div>

          {/* Comment textarea */}
          <div>
            <label htmlFor="csat-comment" className="block">
              <span className="mb-1 block text-sm text-muted-foreground">
                What worked / what didn&apos;t (optional)
              </span>
              <textarea
                id="csat-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                maxLength={4000}
                disabled={isSubmitting}
                placeholder="Skip if nothing comes to mind."
                className="mt-2 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
            </label>
          </div>

          {/* Error message */}
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

          {/* Submit button */}
          <button
            type="submit"
            disabled={rating == null || isSubmitting}
            className="mt-5 inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isSubmitting ? 'Submitting…' : 'Submit'}
          </button>
        </Panel>
      </form>
    </IslandRoot>
  );
}
