import { type ReactElement, useEffect, useState } from 'react';

// Per ADR-0037 §three-tier architecture: the top nav surfaces a
// **Workspace** link to operators (operational layer) and an
// **Engineering Deck** link to engineers (engineering layer). Members
// + the public never see either entry.
//
// Bootstrap pattern matches MeDashboard: POST /api/v1/auth/refresh to
// mint an access token, GET /api/v1/auth/me to read groups, render
// conditionally. Anonymous viewers + bootstrap failures render
// nothing — the existing public nav (Events / Leaderboard / Account)
// stays unchanged.
//
// Groups source-of-truth lives in Authentik; the `groups` claim is
// added to id_token + access JWT (see auth.service.ts FLOW_SCOPES).
// Role changes propagate within one refresh cycle (max ~15 min).

const ENGINEERING_DECK_URL = 'https://login.aiqadam.org/if/user/#/library';

interface Me {
  id: string;
  email: string;
  authentikSubject: string;
  groups: string[];
}

type State = { phase: 'loading' } | { phase: 'anon' } | { phase: 'authed'; groups: string[] };

async function bootstrap(): Promise<State> {
  try {
    const refresh = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (!refresh.ok) return { phase: 'anon' };
    const { accessToken } = (await refresh.json()) as { accessToken: string };

    const me = await fetch('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!me.ok) return { phase: 'anon' };
    const body = (await me.json()) as Me;
    return { phase: 'authed', groups: body.groups ?? [] };
  } catch {
    return { phase: 'anon' };
  }
}

function isEngineer(groups: string[]): boolean {
  return groups.some((g) => g === 'aiqadam-super-admin' || g === 'authentik Admins');
}

function isOperator(groups: string[]): boolean {
  return groups.some(
    (g) =>
      g === 'aiqadam-super-admin' ||
      g === 'aiqadam-sponsor-rep' ||
      g.startsWith('aiqadam-country-lead-') ||
      g.startsWith('aiqadam-organizer-'),
  );
}

export function NavUserBadge(): ReactElement | null {
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    bootstrap().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.phase !== 'authed') return null;

  const showWorkspace = isOperator(state.groups);
  const showEngineering = isEngineer(state.groups);
  if (!showWorkspace && !showEngineering) return null;

  return (
    <>
      {showWorkspace && (
        <a href="/workspace" className="app-nav-link">
          Workspace
        </a>
      )}
      {showEngineering && (
        <a href={ENGINEERING_DECK_URL} className="app-nav-link">
          Engineering Deck
        </a>
      )}
    </>
  );
}
