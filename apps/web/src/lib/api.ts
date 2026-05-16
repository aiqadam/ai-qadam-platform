// Server-side API fetch helper for SSR pages. The web container reaches
// the API at INTERNAL_API_URL (default http://localhost:3000 — matches
// `pnpm dev` running api on host). Production sets it to the Coolify
// docker-network address of the api app.
//
// Tenant resolution: we forward the incoming request's Host header so
// the API's tenant.middleware sees the public hostname (e.g.
// uz.aiqadam.org) and resolves the right country. Without this the API
// would default to 'uz' for every SSR request.
//
// Errors are caught and logged — caller decides what empty state to
// render. Never blocks the page.

export interface ApiEvent {
  id: string;
  title: string;
  description: string;
  format: 'meetup' | 'workshop' | 'hackathon' | 'conference' | 'online';
  status: 'draft' | 'published' | 'cancelled';
  startsAt: string;
  endsAt: string;
  capacity: number | null;
  registeredCount: number;
  location: string | null;
  countryCode: string;
}

const { INTERNAL_API_URL = 'http://localhost:3000' } = process.env;
const BASE = INTERNAL_API_URL;

export async function fetchUpcomingEvents(req: Request): Promise<ApiEvent[]> {
  const host = req.headers.get('host') ?? '';
  try {
    const res = await fetch(`${BASE}/v1/events`, {
      headers: host ? { host } : {},
    });
    if (!res.ok) {
      console.error(`[api] /v1/events failed: HTTP ${res.status}`);
      return [];
    }
    const body = (await res.json()) as { events: ApiEvent[] };
    return body.events;
  } catch (err) {
    console.error('[api] /v1/events threw:', err instanceof Error ? err.message : err);
    return [];
  }
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  email: string;
  displayName: string | null;
  totalPoints: number;
}

export async function fetchLeaderboard(req: Request, limit = 20): Promise<LeaderboardEntry[]> {
  const host = req.headers.get('host') ?? '';
  try {
    const res = await fetch(`${BASE}/v1/leaderboard?limit=${limit}`, {
      headers: host ? { host } : {},
    });
    if (!res.ok) {
      console.error(`[api] /v1/leaderboard failed: HTTP ${res.status}`);
      return [];
    }
    const body = (await res.json()) as { entries: LeaderboardEntry[] };
    return body.entries;
  } catch (err) {
    console.error('[api] /v1/leaderboard threw:', err instanceof Error ? err.message : err);
    return [];
  }
}

export async function fetchEvent(req: Request, id: string): Promise<ApiEvent | null> {
  const host = req.headers.get('host') ?? '';
  try {
    const res = await fetch(`${BASE}/v1/events/${id}`, {
      headers: host ? { host } : {},
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      console.error(`[api] /v1/events/${id} failed: HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as ApiEvent;
  } catch (err) {
    console.error(`[api] /v1/events/${id} threw:`, err instanceof Error ? err.message : err);
    return null;
  }
}
