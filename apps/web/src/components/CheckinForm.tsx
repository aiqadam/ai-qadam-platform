import { type ReactElement, useEffect, useState } from 'react';

interface CheckinResponse {
  status: 'ok';
  alreadyCheckedIn: boolean;
  checkedInAt: string;
  event: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    location: string | null;
  };
}

type State =
  | { status: 'no-code' }
  | { status: 'idle'; code: string }
  | { status: 'busy'; code: string }
  | { status: 'done'; result: CheckinResponse }
  | { status: 'error'; message: string };

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

async function postCheckin(code: string): Promise<CheckinResponse> {
  const res = await fetch(`/api/v1/checkin/${code}`, { method: 'POST' });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `check-in failed: HTTP ${res.status}`);
  }
  return (await res.json()) as CheckinResponse;
}

export function CheckinForm(): ReactElement {
  const [state, setState] = useState<State>({ status: 'no-code' });

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) setState({ status: 'idle', code });
  }, []);

  if (state.status === 'no-code') {
    return (
      <div className="empty-state">
        <p className="empty-heading">Missing check-in code</p>
        <p className="empty-desc">
          This page expects a ?code=… query parameter — try scanning the QR again.
        </p>
      </div>
    );
  }
  if (state.status === 'idle') {
    const code = state.code;
    return (
      <div className="space-y-4">
        <p className="text-gray-700">Tap to confirm attendance.</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={async () => {
            setState({ status: 'busy', code });
            try {
              const result = await postCheckin(code);
              setState({ status: 'done', result });
            } catch (err) {
              setState({
                status: 'error',
                message: err instanceof Error ? err.message : 'unknown error',
              });
            }
          }}
        >
          Check in
        </button>
      </div>
    );
  }
  if (state.status === 'busy') {
    return <p className="text-gray-500">Checking in…</p>;
  }
  if (state.status === 'error') {
    return (
      <div className="empty-state">
        <p className="empty-heading">Couldn't check in</p>
        <p className="empty-desc">{state.message}</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="badge badge-success">
        {state.result.alreadyCheckedIn ? 'Already checked in' : "You're checked in"}
      </p>
      <h2 className="text-xl font-semibold">{state.result.event.title}</h2>
      <p className="text-sm text-gray-600">
        {dateFormatter.format(new Date(state.result.event.startsAt))}
        {state.result.event.location ? ` · ${state.result.event.location}` : ''}
      </p>
      <p className="text-xs text-gray-500">
        Recorded {dateFormatter.format(new Date(state.result.checkedInAt))}
      </p>
    </div>
  );
}
