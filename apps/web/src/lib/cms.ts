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

// ──────────── marketing_assets (F-S0.9b per ADR-0025) ────────────────
//
// Tier 2 brand assets: produced photos / PDFs / videos / press kit items
// that live in Directus rather than git. Public-only consumers (e.g.
// /press) filter to status=approved + visibility=public; sponsor or
// operator surfaces use different visibility scopes.
//
// The shape returned here is intentionally narrow — title + file URL +
// description + ai_prompt + date_created. Callers that need more
// (sponsor binding, event binding) can extend the fields list.

interface CmsMarketingAssetRow {
  id: string;
  title: string;
  description: string | null;
  category: string;
  ai_prompt: string | null;
  file: string;
  thumbnail: string | null;
  date_created: string;
}

export interface CmsMarketingAsset {
  id: string;
  title: string;
  description: string | null;
  category: string;
  fileUrl: string;
  thumbnailUrl: string | null;
  aiPrompt: string | null;
  dateCreated: string;
}

// Build a public asset URL. Directus exposes the file binary at
// /assets/<file-id> on the same CMS_URL we already use; auth not needed
// since the marketing_assets read permission is bound to the Public
// policy for status=approved AND visibility=public.
function assetUrl(fileId: string | null): string | null {
  if (!fileId) return null;
  return `${BASE}/assets/${fileId}`;
}

export interface FetchMarketingAssetsOpts {
  category: string | string[];
  country?: string | null;
  limit?: number;
}

// Public-only assets. Filters status=approved AND visibility=public on
// every call so consuming pages never accidentally render a draft or an
// operators-only file. Empty array on failure so the page degrades to
// the honest "coming soon" state per UX §1.4.
export async function fetchMarketingAssets(
  opts: FetchMarketingAssetsOpts,
): Promise<CmsMarketingAsset[]> {
  const categories = Array.isArray(opts.category) ? opts.category : [opts.category];
  try {
    const params = new URLSearchParams({
      'filter[status][_eq]': 'approved',
      'filter[visibility][_eq]': 'public',
      'filter[category][_in]': categories.join(','),
      sort: '-date_created',
      limit: String(opts.limit ?? 8),
      fields: 'id,title,description,category,ai_prompt,file,thumbnail,date_created',
    });
    if (opts.country) {
      params.set('filter[_or][0][country][_eq]', opts.country);
      params.set('filter[_or][1][country][_null]', 'true');
    }
    const body = await get<{ data: CmsMarketingAssetRow[] }>(
      `/items/marketing_assets?${params.toString()}`,
    );
    return body.data.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      fileUrl: assetUrl(row.file) ?? '',
      thumbnailUrl: assetUrl(row.thumbnail),
      aiPrompt: row.ai_prompt,
      dateCreated: row.date_created,
    }));
  } catch (err) {
    console.error('[cms] fetchMarketingAssets failed:', err instanceof Error ? err.message : err);
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
