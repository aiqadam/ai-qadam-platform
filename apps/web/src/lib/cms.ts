// Server-side Directus reader. Public collections (events, event_types,
// countries, partners, homepage_hero) are exposed via the Public policy
// bound to the null role — see docs/migration-to-directus-centric.md
// §"What stays / goes".
//
// We talk to Directus over the public CMS URL (https://cms.aiqadam.org)
// so the same DNS works from the web container, from local dev, and
// from third parties (the bot). No Host-header gymnastics like the
// short-lived internal /api/v1/events helper had.
//
// Output shape stays compatible with the existing ApiEvent so consuming
// components (HomeHero, EventsTimeline, EventsGrid, RegistrationSidebar)
// don't change. The snake_case → camelCase + country → countryCode
// translation happens here.

import type { ApiEvent } from './api';

interface CmsEventRow {
  id: string;
  title: string;
  description: string;
  status: ApiEvent['status'];
  format: ApiEvent['format'];
  starts_at: string;
  ends_at: string;
  capacity: number | null;
  location: string | null;
  country: string;
}

const { CMS_URL = 'https://cms.aiqadam.org' } = process.env;
const BASE = CMS_URL;

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`cms GET ${path} failed: HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

function toApiEvent(row: CmsEventRow): ApiEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    format: row.format,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    capacity: row.capacity,
    // Registration counts move to /v1/registrations once Sprint 3 wires
    // Directus flows. Showing 0 going for now — keeps the empty state
    // honest and the type stable.
    registeredCount: 0,
    location: row.location,
    countryCode: row.country,
  };
}

// Country code from a request's Host header. Mirrors the API's
// tenant.middleware logic so SSR + API agree on which country to query.
export function countryFromHost(host: string | null | undefined): string {
  if (!host) return 'uz';
  const label = host.split(':')[0]?.toLowerCase().split('.')[0] ?? '';
  if (label === 'uz' || label === 'kz' || label === 'tj') return label;
  return 'uz';
}

// Upcoming, published events for the country derived from the incoming
// Host header. Drop-in replacement for lib/api.fetchUpcomingEvents.
export async function fetchUpcomingEvents(req: Request): Promise<ApiEvent[]> {
  const country = countryFromHost(req.headers.get('host'));
  try {
    const now = new Date().toISOString();
    const params = new URLSearchParams({
      'filter[country][_eq]': country,
      'filter[status][_eq]': 'published',
      'filter[ends_at][_gt]': now,
      sort: 'starts_at',
      limit: '50',
      fields: 'id,title,description,status,format,starts_at,ends_at,capacity,location,country',
    });
    const body = await get<{ data: CmsEventRow[] }>(`/items/events?${params.toString()}`);
    return body.data.map(toApiEvent);
  } catch (err) {
    console.error('[cms] fetchUpcomingEvents failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

interface CmsPartnerRow {
  name: string;
  url: string | null;
  country: string;
}

export interface CmsPartner {
  name: string;
  url: string | null;
}

// Partners for the country derived from Host header, sorted by `sort`.
// Empty array on failure so the page never blocks on the CMS.
export async function fetchPartners(req: Request): Promise<CmsPartner[]> {
  const country = countryFromHost(req.headers.get('host'));
  try {
    const params = new URLSearchParams({
      'filter[country][_eq]': country,
      sort: 'sort',
      limit: '24',
      fields: 'name,url,country',
    });
    const body = await get<{ data: CmsPartnerRow[] }>(`/items/partners?${params.toString()}`);
    return body.data.map((row) => ({ name: row.name, url: row.url }));
  } catch (err) {
    console.error('[cms] fetchPartners failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

// Single event for /events/[id]. Returns null on miss / 403 / wrong country.
export async function fetchEvent(req: Request, id: string): Promise<ApiEvent | null> {
  const country = countryFromHost(req.headers.get('host'));
  try {
    const params = new URLSearchParams({
      fields: 'id,title,description,status,format,starts_at,ends_at,capacity,location,country',
    });
    const body = await get<{ data: CmsEventRow | null }>(
      `/items/events/${encodeURIComponent(id)}?${params.toString()}`,
    );
    if (!body.data || body.data.status !== 'published' || body.data.country !== country) {
      return null;
    }
    return toApiEvent(body.data);
  } catch {
    return null;
  }
}
