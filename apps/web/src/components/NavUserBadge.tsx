import { type ReactElement, useEffect, useState } from 'react';
import { getAuthState } from '../lib/auth-bootstrap';

// Per ADR-0037 §three-tier architecture: the top nav surfaces a
// **Workspace** link to operators (operational layer) and an
// **Engineering Deck** link to engineers (engineering layer). Members
// + the public never see either entry.
//
// Bootstrap goes through the shared `getAuthState()` helper so this
// island + MeDashboard (+ future authed islands) share a single
// /auth/refresh + /auth/me round-trip per page load. Without that,
// concurrent /refresh calls race for the single-use refresh-token
// cookie and one island ends up "anon" while the other shows "authed".
// See lib/auth-bootstrap.ts for the full explanation.
//
// Groups source-of-truth lives in Authentik; the `groups` claim is
// added to id_token + access JWT (see auth.service.ts FLOW_SCOPES).
// Role changes propagate within one refresh cycle (max ~15 min).

const ENGINEERING_DECK_URL = 'https://login.aiqadam.org/if/user/#/library';

type State = { phase: 'loading' } | { phase: 'anon' } | { phase: 'authed'; groups: string[] };

async function bootstrap(): Promise<State> {
  const state = await getAuthState();
  if (!state) return { phase: 'anon' };
  return { phase: 'authed', groups: state.me.groups ?? [] };
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
