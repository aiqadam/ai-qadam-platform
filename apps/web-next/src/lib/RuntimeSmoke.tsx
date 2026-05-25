// PR-0d L1 runtime smoke island.
//
// Lives under src/lib/ (NOT src/blocks/) on purpose: it's a one-off
// verification island for the runtime, not a reusable L3 block. Once
// the Storybook (PR-0e) hosts the same demo, this and _runtime-smoke
// .astro are deletable.
//
// What it proves on render:
//   1) useAuth() reads the SSR blob from RuntimeProvider (no network).
//   2) useMyProfile() calls /v1/auth/me through apiClient (network).
//      If the visitor is signed in (engineer behind forward-auth on
//      next.aiqadam.org), email renders. Anon: shows the loading then
//      error state without crashing — proving the runtime degrades
//      gracefully.

import { useMyProfile } from './api-queries';
import { useAuth } from './use-auth';

export default function RuntimeSmoke(): React.ReactNode {
  const auth = useAuth();
  const profileQ = useMyProfile();

  return (
    <section className="card" data-testid="runtime-smoke" aria-label="L1 runtime smoke">
      <h2>L1 runtime (client-side)</h2>
      <dl>
        <dt>useAuth().isAuthenticated</dt>
        <dd>{String(auth.isAuthenticated)}</dd>
        <dt>useAuth().user?.email</dt>
        <dd>{auth.user?.email ?? '—'}</dd>
        <dt>useMyProfile() status</dt>
        <dd>{profileQ.status}</dd>
        <dt>useMyProfile() email</dt>
        <dd>{profileQ.data?.email ?? '—'}</dd>
        <dt>useMyProfile() error</dt>
        <dd>{profileQ.error?.message ?? '—'}</dd>
      </dl>
    </section>
  );
}
