// L1 runtime — useAuth hook + AuthProvider.
//
// Wraps the SSR auth blob that apps/web-next/src/middleware.ts sets on
// Astro.locals.auth and Layout.astro injects as window.__AIQADAM_AUTH__.
// One source of truth per page load. No client-side /auth/refresh on
// mount — the middleware already did it.
//
// Contract (mirrors v1's apps/web/src/lib/auth-bootstrap.ts semantics):
//
//   * Hydrate from SSR blob on first render. blob === null means the
//     middleware ran and confirmed anon; blob === undefined means
//     middleware didn't run (prerendered page or PUBLIC_ env error).
//     We treat both as anon for v2 — apiClient retries on 401 will
//     pick up a session if a refresh cookie does turn out to be valid.
//
//   * AuthExpiredError from apiClient ⇒ clear context, push to
//     /auth/sign-in. The expired-error path is the ONLY place we
//     mutate identity from inside React; everything else is read-only.
//
//   * useAuth() is the public surface: { user, isAuthenticated, isSuper,
//     accessToken, signOut(), onAuthExpired() }. Blocks consume it
//     via prop drilling from pages (per ADR-0038 §Locks #1).
//
// The hook deliberately stays SMALL — no fetching, no cache, no
// retry. TanStack Query handles those concerns (query-client.ts).

import {
  type ReactNode,
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { setAccessToken } from './api-client';
import { AuthExpiredError } from './errors';

export interface AuthMe {
  id: string;
  email: string;
  authentikSubject: string;
  groups: string[];
}

export interface AuthSnapshot {
  accessToken: string;
  me: AuthMe;
}

interface AuthContextValue {
  user: AuthMe | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  // The "super" predicate matches v1: membership in the engineer/
  // super-admin Authentik group. The literal value comes from the
  // OIDC id_token claim; the API just forwards it via /auth/me.
  isSuper: boolean;
  // Called by callers that detect an expired session (e.g. our
  // AuthExpiredError boundary below). Clears in-memory state and
  // navigates to the sign-in page.
  handleAuthExpired: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SUPER_GROUP = 'aiqadam-engineers';

function deriveValue(snap: AuthSnapshot | null, onExpired: () => void): AuthContextValue {
  return {
    user: snap?.me ?? null,
    accessToken: snap?.accessToken ?? null,
    isAuthenticated: snap !== null,
    isSuper: snap?.me.groups.includes(SUPER_GROUP) ?? false,
    handleAuthExpired: onExpired,
  };
}

interface AuthProviderProps {
  // The SSR blob from Astro.locals.auth, threaded through
  // RuntimeProvider.tsx. `undefined` means we couldn't read the blob
  // at all (prerendered page); `null` means the middleware ran and
  // confirmed anon. Both render anon — v2 leaves re-auth to the
  // apiClient retry path.
  initial: AuthSnapshot | null | undefined;
  // Pluggable redirect — defaults to /auth/sign-in. Useful in tests.
  signInPath?: string;
  children: ReactNode;
}

export function AuthProvider({
  initial,
  signInPath = '/auth/sign-in',
  children,
}: AuthProviderProps): ReactNode {
  const initialSnap: AuthSnapshot | null = initial ?? null;
  const [snap, setSnap] = useState<AuthSnapshot | null>(initialSnap);

  // Seed apiClient's module-scoped token from the SSR blob so the
  // first authed query doesn't 401-and-retry-refresh just to land
  // where the SSR middleware already did. Only runs once per realm.
  // Done outside a useEffect on purpose — useEffect runs AFTER first
  // render, but useQuery in children may fire during that render.
  if (typeof window !== 'undefined' && snap?.accessToken) {
    setAccessToken(snap.accessToken);
  }

  const handleAuthExpired = useCallback(() => {
    setSnap(null);
    setAccessToken(null);
    if (typeof window !== 'undefined') {
      window.location.href = signInPath;
    }
  }, [signInPath]);

  const value = useMemo(() => deriveValue(snap, handleAuthExpired), [snap, handleAuthExpired]);

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error(
      'useAuth() called outside <AuthProvider>. Wrap your React island in <RuntimeProvider> (see src/layouts/Layout.astro).',
    );
  }
  return ctx;
}

// Lightweight helper for query hooks (api-queries.ts) — given a
// thrown error from apiClient, fire the expired-handler if relevant
// and re-throw so TanStack Query sees the failure too.
export function reportQueryError(err: unknown, onExpired: () => void): never {
  if (err instanceof AuthExpiredError) {
    onExpired();
  }
  throw err;
}
