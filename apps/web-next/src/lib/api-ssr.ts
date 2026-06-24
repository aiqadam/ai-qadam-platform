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

export type { PublicForm } from './types';

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

// ---------------------------------------------------------------------------
// /v1/events/:id — single-event detail (with all enrichment fields).
// ---------------------------------------------------------------------------

export async function fetchEvent(req: Request, id: string): Promise<ApiEvent | null> {
  if (!id || id.length === 0) return null;
  try {
    return await get<ApiEvent>(req, `/v1/events/${encodeURIComponent(id)}`);
  } catch (err) {
    // 404 + network failure: same return — page handles null with a
    // friendly "event not found" surface or 302 to /events.
    console.error(`[api-ssr] /v1/events/${id} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// /v1/events/checkin/active — active events for check-in operator dropdown (FR-MIG-021).
// Returns events where startsAt <= now <= endsAt + 24h. Public endpoint.
// ---------------------------------------------------------------------------

export interface CheckinActiveEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
}

export async function fetchActiveEvents(req: Request): Promise<CheckinActiveEvent[]> {
  try {
    const body = await get<{ events: CheckinActiveEvent[] }>(req, '/v1/events/checkin/active');
    return body.events;
  } catch (err) {
    console.error(
      '[api-ssr] /v1/events/checkin/active failed:',
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

// ---------------------------------------------------------------------------
// /v1/users/:handle/profile — public member profile.
// ---------------------------------------------------------------------------

import type { PublicProfile } from './types';
export type { PublicProfile } from './types';

export async function fetchPublicProfile(
  req: Request,
  handle: string,
): Promise<PublicProfile | null> {
  if (!handle || handle.length === 0) return null;
  try {
    return await get<PublicProfile>(req, `/v1/users/${encodeURIComponent(handle)}/profile`);
  } catch (err) {
    // 404 (unknown handle) + network failure: same return — page
    // 302s to /leaderboard (matches v1 behavior).
    console.error(
      `[api-ssr] /v1/users/${handle}/profile failed:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// /v1/forms/:slug — public form by slug (for /forms/[slug] renderer).
// ---------------------------------------------------------------------------

import type { PublicForm } from './types';

export async function fetchPublicForm(req: Request, slug: string): Promise<PublicForm | null> {
  if (!slug || slug.length === 0) return null;
  try {
    return await get<PublicForm>(req, `/v1/forms/${encodeURIComponent(slug)}`);
  } catch (err) {
    console.error(`[api-ssr] /v1/forms/${slug} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// /v1/leaderboard — tenant-scoped points leaderboard.
// ---------------------------------------------------------------------------

import type { LeaderboardEntry, LeaderboardWindow } from './types';
export type { LeaderboardEntry, LeaderboardWindow } from './types';

export async function fetchLeaderboard(
  req: Request,
  limit = 20,
  window: LeaderboardWindow = 'all',
): Promise<LeaderboardEntry[]> {
  try {
    const qs = new URLSearchParams({ limit: String(limit), window }).toString();
    return await get<LeaderboardEntry[]>(req, `/v1/leaderboard?${qs}`);
  } catch (err) {
    console.error('[api-ssr] /v1/leaderboard failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// /v1/me/onboarding-status — member onboarding status (FR-MIG-020).
//
// Lightweight SSR call used by /onboard page to redirect already-onboarded
// users. Requires auth token; throws on failure so the page renders the form.
// ---------------------------------------------------------------------------

export async function fetchOnboardingStatus(req: Request, accessToken: string): Promise<boolean> {
  // Reuse the same host-forwarding + auth-header pattern.
  const host = req.headers.get('host') ?? '';
  const headers: Array<[string, string]> = [
    ['accept', 'application/json'],
    ['authorization', `Bearer ${accessToken}`],
  ];
  if (host) headers.push(['host', host]);
  const res = await fetch(`${apiBase()}/v1/me/onboarding-status`, { headers });
  if (!res.ok) {
    // Non-ok means the session may have expired mid-render. Render the
    // form and let the client re-auth; don't hard-redirect.
    throw new Error(`onboarding-status → HTTP ${res.status}`);
  }
  const body = (await res.json()) as { onboarded: boolean };
  return body.onboarded;
}
