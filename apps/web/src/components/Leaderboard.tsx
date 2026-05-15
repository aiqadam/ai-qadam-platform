import { type ReactElement, useEffect, useState } from 'react';

interface Entry {
  rank: number;
  userId: string;
  email: string;
  displayName: string | null;
  totalPoints: number;
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; entries: Entry[] };

async function fetchLeaderboard(): Promise<Entry[]> {
  const res = await fetch('/api/v1/leaderboard');
  if (!res.ok) throw new Error(`leaderboard fetch failed: HTTP ${res.status}`);
  const body = (await res.json()) as { entries: Entry[] };
  return body.entries;
}

function displayNameFor(entry: Entry): string {
  if (entry.displayName) return entry.displayName;
  // Fall back to the first part of the email so we don't expose the full
  // address publicly. Future PR adds proper handles.
  return entry.email.split('@')[0] ?? entry.email;
}

export function Leaderboard(): ReactElement {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetchLeaderboard()
      .then((entries) => {
        if (!cancelled) setState({ status: 'loaded', entries });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'unknown error',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return <p className="text-gray-500">Loading leaderboard…</p>;
  }
  if (state.status === 'error') {
    return (
      <div className="empty-state">
        <p className="empty-heading">Couldn't load leaderboard</p>
        <p className="empty-desc">{state.message}</p>
      </div>
    );
  }
  if (state.entries.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-heading">No points awarded yet</p>
        <p className="empty-desc">Attend an event to start earning points.</p>
      </div>
    );
  }
  return (
    <ol className="space-y-2 list-none p-0">
      {state.entries.map((entry) => (
        <li key={entry.userId} className="card flex items-center gap-4">
          <span className="text-2xl font-bold text-gray-400 w-10 text-center">{entry.rank}</span>
          <span className="flex-1">{displayNameFor(entry)}</span>
          <span className="badge badge-success">{entry.totalPoints} pts</span>
        </li>
      ))}
    </ol>
  );
}
