// L1 — apps/api SSR fetch helpers.
//
// Pages call these from Astro frontmatter to populate L4 → L3 props at
// render time. Blocks themselves receive plain data via props and never
// import this module (ADR-0038 §Locks #1).
//
// Distinct from lib/api-client.ts (the browser-side TanStack Query
// client) and lib/cms.ts (Directus SSR fetchers). This module talks to
// `apps/api` (the Nest service) over the internal docker-network alias
// for SSR speed. Server-only — calling these from the browser would
// expose INTERNAL_API_URL which is meant to be invisible.

const DEFAULT_INTERNAL_API_URL = 'http://api:3000';

function apiBase(): string {
  if (typeof window !== 'undefined') {
    // SSR helpers should never run client-side. Failing loud here is
    // better than silently leaking the internal alias to the bundle.
    throw new Error('lib/api-ssr.ts is server-only; use lib/api-queries (TanStack) on the client.');
  }
  const { INTERNAL_API_URL } = process.env;
  return INTERNAL_API_URL ?? DEFAULT_INTERNAL_API_URL;
}

async function get<T>(req: Request, path: string): Promise<T> {
  const host = req.headers.get('host') ?? '';
  // Forwarding the Host header is the API's per-country tenant
  // resolver hook — uz.aiqadam.org returns Uzbek events, etc. We DON'T
  // forward cookies here: SSR fetch on public list endpoints is
  // explicitly anonymous so middleware-rotated refresh cookies are
  // never consumed twice on the same render.
  //
  // Tuple-array form for headers — HeadersInit accepts [name, value]
  // pairs, dodging both TS noPropertyAccessFromIndexSignature (because
  // we never key by name) and Biome useLiteralKeys (same reason).
  const headers: Array<[string, string]> = [['accept', 'application/json']];
  if (host) headers.push(['host', host]);
  const res = await fetch(`${apiBase()}${path}`, { headers });
  if (!res.ok) {
    throw new Error(`api ${path} → HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// /v1/events — public upcoming events for the current tenant.
// ---------------------------------------------------------------------------

import type { ApiEvent } from './types';

// Re-exported so consumers that already use `from '../lib/api-ssr'` can
// stay on the same import path. New consumers should `import type` from
// './types' directly (it's the canonical home; this file is the
// fetcher, not the type).
export type { ApiEvent } from './types';

interface EventsResponse {
  events: ApiEvent[];
}

export async function fetchUpcomingEvents(req: Request): Promise<ApiEvent[]> {
  try {
    const body = await get<EventsResponse>(req, '/v1/events');
    return body.events;
  } catch (err) {
    // Match cms.ts: never fail the page on API reachability. An
    // empty array renders the EmptyState block; broken backend
    // doesn't break the public page.
    console.error('[api-ssr] /v1/events failed:', err instanceof Error ? err.message : err);
    return [];
  }
}
