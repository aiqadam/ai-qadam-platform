// Shared auth-bootstrap for client-side React islands.
//
// Why this exists: every island that needs to know "who is the user" used
// to call `POST /api/v1/auth/refresh` + `GET /api/v1/auth/me` from its own
// useEffect. Two islands on the same page (e.g. NavUserBadge + MeDashboard
// on /me) would fire both calls in parallel, racing for the same refresh-
// token cookie. The API treats refresh tokens as single-use: one request
// consumes the row, the other hits `RefreshTokenReplayError` → 401 →
// cookies cleared. Whichever island lost the race rendered "anon" while
// the winner rendered "authed", producing the inconsistent UI reported on
// /me (nav showed engineer links but the body showed the sign-in CTA).
//
// Fix: a module-level in-flight Promise. The first caller does the
// network round-trip; everyone else awaits the same Promise and gets the
// same resolved state. Astro bundles shared modules once per page, so
// every island that imports from here participates in the same dedupe.
//
// Cache is cleared on:
//   - explicit `resetAuthState()` (e.g. after sign-out)
//   - 60s TTL (the access token is good for 15 min; revalidating every
//     minute keeps the page in sync with role changes without paying
//     for a network round-trip on every island mount)

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
export function resetAuthState(): void {
  cached = null;
  resolvedAt = 0;
  inflight = null;
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
