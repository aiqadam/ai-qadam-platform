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

import type { ApiEvent, EventSpeaker } from './api';

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
  // F-S3.10-a additions
  short_description?: string | null;
  slug?: string | null;
  venue?: string | null;
  address?: string | null;
  map_url?: string | null;
  hero_image?: string | null;
  agenda_md?: string | null;
  visibility_scope?: ApiEvent['visibilityScope'];
  // F-S5.4 — used as the OG-card cache buster on /events/[id]
  date_updated?: string | null;
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
  const heroImageUrl = row.hero_image ? `${BASE}/assets/${row.hero_image}` : null;
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
    shortDescription: row.short_description ?? null,
    slug: row.slug ?? null,
    venue: row.venue ?? null,
    address: row.address ?? null,
    mapUrl: row.map_url ?? null,
    heroImageUrl,
    agendaMd: row.agenda_md ?? null,
    visibilityScope: row.visibility_scope ?? 'public',
    updatedAt: row.date_updated ?? null,
  };
}

const EVENT_FIELDS =
  'id,title,description,status,format,starts_at,ends_at,capacity,location,country,short_description,slug,venue,address,map_url,hero_image,agenda_md,visibility_scope,date_updated';

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
      fields: EVENT_FIELDS,
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
      fields: EVENT_FIELDS,
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

// F-S3.10-b — public speaker lineup for an event. Returns only
// accepted+confirmed speakers (invited / declined / cancelled hidden
// from the public page). Joins event_speakers → speakers →
// directus_users for display name. Handle (for /u/{handle} link) is
// resolved via the F-S3.10-c API bridge.
interface CmsEventSpeakerRow {
  id: string;
  status: EventSpeaker['status'];
  talk_title: string | null;
  order_index: number;
  speaker: {
    bio_md?: string | null;
    user?: {
      id?: string | null;
      first_name?: string | null;
      last_name?: string | null;
      job_title?: string | null;
    } | null;
  } | null;
}

// F-S3.10-c — resolve a batch of directus_user_id values to local
// handles via the API. `handle` lives on the Postgres `users` table,
// not on `directus_users`, so we round-trip through the API. Empty
// object on any failure — speaker just renders without a link.
const { INTERNAL_API_URL = 'http://localhost:3000' } = process.env;

async function fetchHandlesByDirectusIds(directusIds: string[]): Promise<Record<string, string>> {
  const ids = directusIds.filter(Boolean);
  if (ids.length === 0) return {};
  try {
    const res = await fetch(`${INTERNAL_API_URL}/v1/users/handles?directusIds=${ids.join(',')}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error(`[cms] /v1/users/handles failed: HTTP ${res.status}`);
      return {};
    }
    const body = (await res.json()) as { handles?: Record<string, string> };
    return body.handles ?? {};
  } catch (err) {
    console.error(
      '[cms] fetchHandlesByDirectusIds threw:',
      err instanceof Error ? err.message : err,
    );
    return {};
  }
}

export async function fetchEventSpeakers(eventId: string): Promise<EventSpeaker[]> {
  try {
    const filter = encodeURIComponent(
      JSON.stringify({
        event: { _eq: eventId },
        status: { _in: ['accepted', 'confirmed'] },
      }),
    );
    const fields =
      'id,status,talk_title,order_index,speaker.bio_md,speaker.user.id,speaker.user.first_name,speaker.user.last_name,speaker.user.job_title';
    const body = await get<{ data: CmsEventSpeakerRow[] }>(
      `/items/event_speakers?filter=${filter}&fields=${fields}&sort=order_index&limit=50`,
    );

    const directusIds = body.data
      .map((row) => row.speaker?.user?.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const handles = await fetchHandlesByDirectusIds(directusIds);

    return body.data.map((row): EventSpeaker => {
      const u = row.speaker?.user ?? null;
      const first = u?.first_name?.trim() ?? '';
      const last = u?.last_name?.trim() ?? '';
      const displayName = `${first} ${last}`.trim() || null;
      const handle = u?.id ? (handles[u.id] ?? null) : null;
      return {
        id: row.id,
        displayName,
        handle,
        jobTitle: u?.job_title ?? null,
        talkTitle: row.talk_title,
        bioMd: row.speaker?.bio_md ?? null,
        status: row.status,
        orderIndex: row.order_index,
      };
    });
  } catch (err) {
    console.error('[cms] fetchEventSpeakers failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ──────────── F-S5.9 — campaign landing pages ────────────────────────
//
// /welcome/{slug} consumes one row per page. status=published is the
// only public state; drafts + archives 404.

export interface CmsLandingPage {
  slug: string;
  title: string;
  subtitle: string | null;
  bodyMd: string | null;
  ctaLabel: string;
  ctaUrl: string;
}

interface CmsLandingPageRow {
  slug: string;
  status: 'draft' | 'published' | 'archived';
  title: string;
  subtitle: string | null;
  body_md: string | null;
  cta_label: string;
  cta_url: string;
}

const LANDING_FIELDS = 'slug,status,title,subtitle,body_md,cta_label,cta_url';

export async function fetchLandingPage(slug: string): Promise<CmsLandingPage | null> {
  const trimmed = slug.trim().toLowerCase();
  // Defensive — slug shape is loose in the schema (operator-managed) but
  // we only want bare URL fragments here. Reject anything that smells like
  // a path traversal or query string injection.
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(trimmed)) return null;
  try {
    const params = new URLSearchParams({
      'filter[slug][_eq]': trimmed,
      'filter[status][_eq]': 'published',
      fields: LANDING_FIELDS,
      limit: '1',
    });
    const body = await get<{ data: CmsLandingPageRow[] }>(
      `/items/landing_pages?${params.toString()}`,
    );
    const row = body.data[0];
    if (!row) return null;
    return {
      slug: row.slug,
      title: row.title,
      subtitle: row.subtitle,
      bodyMd: row.body_md,
      ctaLabel: row.cta_label,
      ctaUrl: row.cta_url,
    };
  } catch (err) {
    console.error('[cms] fetchLandingPage failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
