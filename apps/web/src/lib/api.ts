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
  // F-S3.10-a enrichment fields. Optional / nullable — events pre-
  // dating the schema upgrade have them unset.
  shortDescription?: string | null;
  slug?: string | null;
  venue?: string | null;
  address?: string | null;
  mapUrl?: string | null;
  heroImageUrl?: string | null;
  agendaMd?: string | null;
  visibilityScope?: 'public' | 'members_only' | 'invite_only' | null;
  // F-WebU1 — operator-curated related links (registration form, sponsor
  // site, livestream URL, recording, etc.). Each row gets its own pill
  // on the public event page. http(s) only; the page enforces that.
  externalLinks?: Array<{
    label: string;
    url: string;
    kind?: 'website' | 'registration' | 'sponsor' | 'livestream' | 'recording' | 'other' | null;
  }> | null;
  // F-WebU2 — venue coordinates in decimal degrees. Both must be present
  // for the public event page to render the OpenStreetMap embed; if
  // either is null the page falls back to the existing map_url link.
  latitude?: number | null;
  longitude?: number | null;
  // F-WebU9 — public post-event recap rendered on the Finished tab.
  // Distinct from `event_retrospective` which stays operator-internal.
  recapMd?: string | null;
  // F-WebU10 — public livestream URL rendered on the Live tab. YouTube
  // + Vimeo auto-embed; other providers render as a click-through
  // Join button. Distinct from `online_meeting_url` (private virtual
  // meetings sent only to registered attendees).
  livestreamUrl?: string | null;
  // F-S5.4 — Directus `date_updated`. Used as OG-card cache buster
  // (`?v=<epoch>`) so a speaker_added / metadata edit invalidates
  // every scraper's cached preview.
  updatedAt?: string | null;
}

// F-S3.10-b — confirmed speakers shown on the public event page.
// Sourced from event_speakers + speakers + directus_users join.
export interface EventSpeaker {
  id: string;
  displayName: string | null;
  handle: string | null;
  jobTitle: string | null;
  talkTitle: string | null;
  bioMd: string | null;
  status: 'invited' | 'accepted' | 'confirmed' | 'declined' | 'cancelled';
  orderIndex: number;
}

// F-WebU3 — public materials (slides, handouts, recording URLs, code
// links, etc.) attached to an event. Either `fileUrl` (Directus-hosted
// download) or `url` (external) is set per row; the other is null.
export interface EventMaterial {
  id: string;
  title: string;
  kind: 'slides' | 'handout' | 'cheatsheet' | 'recording' | 'code' | 'other';
  fileUrl: string | null;
  url: string | null;
  orderIndex: number;
}

// F-WebU9 — post-event photos shown on the Finished tab as a gallery.
// Separate collection from event_materials because the render is
// different (grid + caption + alt text vs pill row). Either `fileUrl`
// (Directus-hosted, preferred) or `url` (external CDN) resolves to an
// <img src>; the cms layer rejects rows that produce neither.
export interface EventPhoto {
  id: string;
  fileUrl: string | null;
  url: string | null;
  caption: string | null;
  altText: string | null;
  orderIndex: number;
}

// F-WebU11 — per-event sponsorship row, deep-joined to the sponsor
// org record. Surfaces in the right sidebar of /events/[id] cross-tab.
// Tier here OVERRIDES the org-level (sponsors.tier) since the same
// sponsor can be Gold at one event, Community at another.
export interface EventSponsor {
  id: string;
  tier: 'presenting' | 'gold' | 'silver' | 'bronze' | 'community';
  customMessage: string | null;
  orderIndex: number;
  sponsor: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    website: string | null;
  };
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

export interface PublicProfile {
  handle: string;
  displayName: string | null;
  attendedCount: number;
  registeredCount: number;
  totalPoints: number;
}

export async function fetchProfile(req: Request, handle: string): Promise<PublicProfile | null> {
  const host = req.headers.get('host') ?? '';
  try {
    const res = await fetch(`${BASE}/v1/users/${encodeURIComponent(handle)}/profile`, {
      headers: host ? { host } : {},
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      console.error(`[api] /v1/users/${handle}/profile failed: HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as PublicProfile;
  } catch (err) {
    console.error(
      `[api] /v1/users/${handle}/profile threw:`,
      err instanceof Error ? err.message : err,
    );
    return null;
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
