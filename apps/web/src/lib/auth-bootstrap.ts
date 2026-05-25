// Shared auth-bootstrap for client-side React islands.
//
// Two-layer cache:
//
// 1) `window.__AIQADAM_AUTH__` — server-injected by Layout.astro from
//    `Astro.locals.auth` (populated by `middleware.ts` via a single
//    server-side `/auth/refresh` + `/auth/me`). This is the FAST PATH
//    for SSR pages: every island reads the same blob with zero network
//    round-trips on first mount. Eliminates the parallel-island
//    /refresh race that used to revoke refresh families on every page
//    load and produced cross-user RBAC leaks. See middleware.ts header
//    for the full security rationale.
//
// 2) Module-level in-flight Promise — fallback for prerendered pages
//    (middleware doesn't run for static output, no SSR blob), explicit
//    re-fetches after `resetAuthState()`, and 60s TTL refreshes. The
//    first caller does the network round-trip; everyone else awaits
//    the same Promise so we never make two parallel /refresh calls
//    from the same page.

declare global {
  interface Window {
    __AIQADAM_AUTH__?: AuthState | null | undefined;
  }
}

const TTL_MS = 60_000;

export interface AuthMe {
  id: string;
  email: string;
  authentikSubject: string;
  groups: string[];
}

export interface AuthState {
  accessToken: string;
  me: AuthMe;
}

let inflight: Promise<AuthState | null> | null = null;
let resolvedAt = 0;
let cached: AuthState | null = null;
let consumedSsr = false;

// One-shot reader for the SSR-injected blob. The blob is the result of
// the middleware's server-side /auth/refresh + /auth/me, so on the very
// first call after page load we use it directly with no network. We
// consume it once and clear the window pointer so a subsequent
// `resetAuthState()` (e.g. after sign-out) doesn't re-hydrate from a
// stale snapshot.
function consumeSsrBlob(): AuthState | null | undefined {
  if (consumedSsr || typeof window === 'undefined') return undefined;
  consumedSsr = true;
  const blob = window.__AIQADAM_AUTH__;
  // `undefined` = SSR didn't run (prerendered page). `null` = SSR ran
  // and confirmed anonymous. We need to distinguish the two: only
  // `null` is a definitive "no session" we can return immediately.
  if (blob === undefined) return undefined;
  window.__AIQADAM_AUTH__ = undefined;
  return blob;
}

async function performBootstrap(): Promise<AuthState | null> {
  try {
    const refresh = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (!refresh.ok) return null;
    const { accessToken } = (await refresh.json()) as { accessToken: string };
    const me = await fetch('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!me.ok) return null;
    const body = (await me.json()) as AuthMe;
    return { accessToken, me: body };
  } catch {
    return null;
  }
}

// Returns the current auth state (cached if fresh, fetched otherwise).
// `null` means anonymous / refresh failed. Concurrent callers share the
// in-flight Promise — only one network round-trip runs.
export async function getAuthState(): Promise<AuthState | null> {
  const now = Date.now();
  if (cached && now - resolvedAt < TTL_MS) {
    return cached;
  }
  // First call after page load: prefer the SSR-injected blob. Skips the
  // network entirely on SSR pages where the middleware already did the
  // work. Definitive `null` (= middleware ran + confirmed anon) is also
  // honoured to avoid a wasted /refresh attempt that would just fail.
  const ssr = consumeSsrBlob();
  if (ssr !== undefined) {
    cached = ssr;
    resolvedAt = now;
    return cached;
  }
  if (inflight) {
    return inflight;
  }
  inflight = performBootstrap();
  try {
    cached = await inflight;
    resolvedAt = Date.now();
    return cached;
  } finally {
    inflight = null;
  }
}

// Force-reset the cache. Call after sign-out / sign-in so the next
// island that mounts re-fetches instead of seeing stale "authed".
// Mark the SSR blob as consumed so the post-reset call goes to the
// network — relying on a stale SSR snapshot after sign-out would
// resurrect the just-killed identity.
export function resetAuthState(): void {
  cached = null;
  resolvedAt = 0;
  inflight = null;
  consumedSsr = true;
  if (typeof window !== 'undefined') window.__AIQADAM_AUTH__ = undefined;
}

// Sign-out flow: terminates the API session AND navigates to the IdP's
// end_session endpoint so the upstream session dies too (SSO ⇒ SLO).
// Resolves a bearer from cache first, falls back to a fresh refresh
// if needed. The function navigates `window.location` itself once it
// has a logout URL (or `/auth/signed-out` as the fallback when the
// API couldn't produce a hint-bearing logout URL).
export async function signOut(): Promise<void> {
  let bearer = cached?.accessToken ?? '';
  if (!bearer) {
    const fresh = await getAuthState();
    bearer = fresh?.accessToken ?? '';
  }
  // Clear in-memory cache before the round-trip so any island that
  // re-mounts mid-flight gets the post-signout state.
  resetAuthState();
  let logoutUrl: string | null = null;
  try {
    const res = await fetch('/api/v1/auth/sign-out', {
      method: 'POST',
      credentials: 'include',
      headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
    });
    if (res.ok) {
      logoutUrl = ((await res.json()) as { logoutUrl: string | null }).logoutUrl;
    }
  } catch {
    // Server-side cookie clear may still have happened via the request.
    // The fallback hard-redirect below kicks in regardless.
  }
  window.location.href = logoutUrl ?? '/auth/signed-out';
}
