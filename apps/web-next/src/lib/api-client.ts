// L1 runtime — typed fetch wrapper. The ONLY layer that touches the
// network for the v2 web app. Pages and blocks NEVER call fetch()
// directly; they consume L1 query hooks (api-queries.ts) which call
// apiClient under the hood.
//
// ADR-0038 §Locks #2 enforces "no raw fetch('/api/...')" outside
// src/lib/ via tools/architecture-check.ts. If you find yourself
// reaching for fetch in a page, add a query hook here instead.
//
// Behavior contract (matches v1's pattern, formalized for v2):
//
//   * Base URL — browser: PUBLIC_API_URL (defaults to same-origin
//     /api so the Vite/Astro proxy can rewrite during local dev).
//     Server (SSR): INTERNAL_API_URL (the docker-network alias, see
//     middleware.ts). Calling apiClient() server-side is rare in
//     this codebase — the middleware already does the auth round-
//     trip; pages mostly use TanStack hooks which run client-side.
//
//   * Credentials — always 'include' so the aiqadam-next-refresh
//     cookie flows on every request. Required for the /auth/refresh
//     retry to work; harmless otherwise.
//
//   * Retry-on-401 — first call returns 401 ⇒ POST /v1/auth/refresh
//     ⇒ retry ONCE with the new access token. Second 401 throws
//     AuthExpiredError. Any other non-2xx throws ApiError. Network
//     failures throw the underlying TypeError.
//
//   * Access token — held in a module-scoped variable, seeded by
//     useAuth() from the SSR blob and updated on each successful
//     refresh. Lives only in memory; never in localStorage. The
//     refresh cookie itself stays HttpOnly per the API contract.

import { ApiError, AuthExpiredError } from './errors';

// ---------------------------------------------------------------------------
// Token state (module-scoped — one per JS realm; per-request on the
// server because each SSR render spins up a new module realm).
// ---------------------------------------------------------------------------

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

// ---------------------------------------------------------------------------
// Base URL resolution
// ---------------------------------------------------------------------------

function resolveBase(): string {
  // Browser side — PUBLIC_API_URL is the public origin; default is
  // same-origin /api so the local Astro proxy + the production
  // Traefik routing both Just Work.
  if (typeof window !== 'undefined') {
    // Destructuring keeps biome's useLiteralKeys + TS's
    // noPropertyAccessFromIndexSignature both happy. PUBLIC_ prefix
    // is Astro/Vite's convention for client-exposed env.
    const { PUBLIC_API_URL } = import.meta.env;
    return typeof PUBLIC_API_URL === 'string' && PUBLIC_API_URL.length > 0
      ? PUBLIC_API_URL
      : '/api';
  }
  // SSR side — docker-network alias when available, else localhost
  // (matches apps/web-next/src/middleware.ts).
  const { INTERNAL_API_URL = 'http://localhost:3000' } = process.env;
  return INTERNAL_API_URL;
}

// ---------------------------------------------------------------------------
// /auth/refresh helper — coalesces concurrent retries so a burst of
// 401s does NOT fire N refresh requests. The first failure starts
// the refresh; subsequent failures await the same promise.
// ---------------------------------------------------------------------------

let refreshInflight: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
  const base = resolveBase();
  try {
    const res = await fetch(`${base}/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { accessToken?: string };
    return body.accessToken ?? null;
  } catch {
    return null;
  }
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInflight) return refreshInflight;
  refreshInflight = performRefresh();
  try {
    const next = await refreshInflight;
    accessToken = next;
    return next;
  } finally {
    refreshInflight = null;
  }
}

// ---------------------------------------------------------------------------
// Core request fn
// ---------------------------------------------------------------------------

function buildHeaders(init: RequestInit | undefined, token: string | null): Headers {
  const headers = new Headers(init?.headers);
  if (token && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${token}`);
  }
  // Only set content-type if the caller is sending a JSON body and
  // hasn't already declared one. We don't touch it for FormData,
  // streams, or GETs.
  if (init?.body && typeof init.body === 'string' && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return headers;
}

async function readBody(res: Response): Promise<unknown> {
  const ctype = res.headers.get('content-type') ?? '';
  if (ctype.includes('application/json')) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
  try {
    return await res.text();
  } catch {
    return null;
  }
}

export interface ApiClientInit extends Omit<RequestInit, 'body'> {
  // Caller may pass a string (JSON-stringified) or a plain object we
  // serialize for them. FormData / Blob / null pass through.
  body?: BodyInit | Record<string, unknown> | null;
}

async function doFetch(path: string, init: ApiClientInit): Promise<Response> {
  const base = resolveBase();
  const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`;

  // exactOptionalPropertyTypes-friendly: only set `body` on the
  // RequestInit object when we actually have one. Same for headers.
  // The native fetch RequestInit doesn't permit `body: undefined`.
  const { body: rawBody, ...rest } = init;
  let body: BodyInit | null | undefined;
  if (rawBody === undefined || rawBody === null) {
    body = undefined;
  } else if (
    typeof rawBody === 'string' ||
    rawBody instanceof FormData ||
    rawBody instanceof Blob ||
    rawBody instanceof URLSearchParams ||
    rawBody instanceof ArrayBuffer
  ) {
    body = rawBody;
  } else {
    body = JSON.stringify(rawBody);
  }

  const headers = buildHeaders({ ...rest, ...(body !== undefined ? { body } : {}) }, accessToken);
  const requestInit: RequestInit = {
    ...rest,
    headers,
    credentials: 'include',
  };
  if (body !== undefined) requestInit.body = body;
  return fetch(url, requestInit);
}

// Typed entry point. Pages/hooks call apiClient<MyShape>('/v1/foo').
// `T = void` means "I don't care about the body" (status check only).
export async function apiClient<T = unknown>(path: string, init: ApiClientInit = {}): Promise<T> {
  let res = await doFetch(path, init);

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (!newToken) {
      throw new AuthExpiredError('refresh failed');
    }
    res = await doFetch(path, init);
    if (res.status === 401) {
      throw new AuthExpiredError('retried after refresh; still 401');
    }
  }

  if (!res.ok) {
    const body = await readBody(res);
    throw new ApiError(res.status, `${init.method ?? 'GET'} ${path} → HTTP ${res.status}`, body);
  }

  // 204 No Content — nothing to parse.
  if (res.status === 204) return undefined as T;

  return (await readBody(res)) as T;
}
