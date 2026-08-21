// L1 — Directus SSR fetch helpers.
//
// Pages call these from Astro frontmatter to populate L4 → L3 props at
// render time. Blocks themselves receive plain data via props and never
// import this module (ADR-0038 §Locks #1).
//
// We mirror v1's apps/web/src/lib/cms.ts pattern but only port the
// endpoints Phase-1 pages actually need; each subsequent Phase-1 PR
// adds the fetchers its block requires. The `data` envelope unwrap +
// graceful default-on-failure shape stays — homepage MUST render even
// if Directus is unreachable.

const DEFAULT_INTERNAL_DIRECTUS_URL = 'http://directus:8055';

/**
 * FR-CMS-009 — production default for the public, browser-facing Directus
 * origin. Kept as the fallback so an environment that sets nothing behaves
 * byte-identically to the pre-FR-CMS-009 hardcoded constant, and no prod
 * deploy config change is required by this feature.
 */
const DEFAULT_PUBLIC_DIRECTUS_URL = 'https://cms.aiqadam.org';

/**
 * FR-CMS-009 — resolves the public Directus origin used for values emitted
 * into browser-facing HTML.
 *
 * MECHANISM IS LOAD-BEARING: this reads `process.env` at call time, NOT
 * `import.meta.env`. `import.meta.env.PUBLIC_*` looks like the right pattern
 * — `api-client.ts`'s `resolveBase()` appears to use it — but Vite inlines
 * `import.meta.env` into a frozen literal object at `astro build` time, and
 * this app's Dockerfile declares no build ARG, so no `PUBLIC_*` key is ever
 * present in that literal. The compiled bundle proves it: in
 * `dist/server/chunks/Layout_*.mjs`, `PUBLIC_API_URL` is destructured from an
 * object containing only ASSETS_PREFIX/BASE_URL/DEV/MODE/PROD/SITE/SSR — i.e.
 * that precedent is permanently `undefined` dead code, not a working pattern.
 * `process.env` is read live in the SSR realm and is already how every other
 * URL knob here is configured (INTERNAL_API_URL, INTERNAL_DIRECTUS_URL, HOST,
 * PORT), so the value is changeable with one compose line and a restart — no
 * image rebuild. The `PUBLIC_` NAME prefix is retained deliberately: Astro's
 * prefix rule governs client-bundle exposure via `import.meta.env` and places
 * no constraint on `process.env` key names, while the prefix still signals
 * "this origin is emitted into browser-facing HTML".
 *
 * Pure and injectable so it is unit-testable without mutating the real
 * environment (see cms-content-pages.test.ts).
 *
 * `process` is accessed defensively: `directusBase()`'s client branch calls
 * this where `window` is defined, and `process` may be undefined if this
 * module is ever pulled into a client bundle. The default must stay reachable
 * without touching `process`.
 *
 * Empty / whitespace-only is treated as unset, mirroring `resolveBase()`'s
 * `.length > 0` guard. Trailing slashes are NOT stripped — no existing helper
 * in this app does, and the `INTERNAL_DIRECTUS_URL` values in the deploy
 * compose files carry none.
 */
export function resolvePublicDirectusUrl(
  env: { PUBLIC_DIRECTUS_URL?: string | undefined } | undefined = typeof process === 'undefined'
    ? undefined
    : process.env,
): string {
  const configured = env?.PUBLIC_DIRECTUS_URL;
  if (typeof configured !== 'string') return DEFAULT_PUBLIC_DIRECTUS_URL;
  const trimmed = configured.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_PUBLIC_DIRECTUS_URL;
}

function directusBase(): string {
  // Server side: prefer the internal docker-network alias so SSR
  // doesn't bounce through public DNS + TLS for every request.
  // Client side: the public URL (PUBLIC_DIRECTUS_URL, default
  // cms.aiqadam.org). Pages should only
  // call these from frontmatter, but the dual-base keeps the module
  // usable from either realm just in case.
  //
  // Destructuring keeps biome's useLiteralKeys + TS's
  // noPropertyAccessFromIndexSignature both happy — same pattern as
  // apps/web-next/src/lib/api-client.ts → resolveBase().
  if (typeof window === 'undefined') {
    const { INTERNAL_DIRECTUS_URL } = process.env;
    return INTERNAL_DIRECTUS_URL ?? DEFAULT_INTERNAL_DIRECTUS_URL;
  }
  // FR-CMS-009 — same resolved public origin publicAssetUrl() uses, so one
  // module can never hold two divergent public bases.
  return resolvePublicDirectusUrl();
}

async function get<T>(path: string): Promise<T> {
  const url = `${directusBase()}${path}`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Directus ${path} → HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// site_settings (singleton) — homepage hero, footer, contact info.
// ---------------------------------------------------------------------------

export interface SiteSettings {
  countriesServed: number;
  defaultDescription: string;
  heroHeadline: string | null;
  heroCtaLabel: string | null;
  heroCtaUrl: string | null;
  footerLinks: Array<{ label: string; url: string }> | null;
  telegramUrl: string | null;
  twitterUrl: string | null;
  linkedinUrl: string | null;
  instagramUrl: string | null;
  youtubeUrl: string | null;
  contactEmailPartners: string | null;
  contactEmailPress: string | null;
  contactEmailSupport: string | null;
}

interface CmsSiteSettingsRow {
  countries_served?: number | null;
  default_description?: string | null;
  hero_headline?: string | null;
  hero_cta_label?: string | null;
  hero_cta_url?: string | null;
  footer_links?: Array<{ label: string; url: string }> | null;
  telegram_url?: string | null;
  twitter_url?: string | null;
  linkedin_url?: string | null;
  instagram_url?: string | null;
  youtube_url?: string | null;
  contact_email_partners?: string | null;
  contact_email_press?: string | null;
  contact_email_support?: string | null;
}

const SITE_SETTINGS_DEFAULTS: SiteSettings = {
  countriesServed: 3,
  defaultDescription: 'Multi-tenant community platform for AI engineers across Central Asia.',
  heroHeadline: null,
  heroCtaLabel: null,
  heroCtaUrl: null,
  footerLinks: null,
  telegramUrl: 'https://t.me/aiqadam',
  twitterUrl: null,
  linkedinUrl: null,
  instagramUrl: null,
  youtubeUrl: null,
  contactEmailPartners: 'partners@aiqadam.org',
  contactEmailPress: 'press@aiqadam.org',
  contactEmailSupport: null,
};

/** Normalise the flat social / contact fields — all coalesce to null when absent. */
function socialFields(
  row: CmsSiteSettingsRow,
): Pick<
  SiteSettings,
  | 'telegramUrl'
  | 'twitterUrl'
  | 'linkedinUrl'
  | 'instagramUrl'
  | 'youtubeUrl'
  | 'contactEmailPartners'
  | 'contactEmailPress'
  | 'contactEmailSupport'
> {
  return {
    telegramUrl: row.telegram_url ?? SITE_SETTINGS_DEFAULTS.telegramUrl,
    twitterUrl: row.twitter_url ?? null,
    linkedinUrl: row.linkedin_url ?? null,
    instagramUrl: row.instagram_url ?? null,
    youtubeUrl: row.youtube_url ?? null,
    contactEmailPartners: row.contact_email_partners ?? SITE_SETTINGS_DEFAULTS.contactEmailPartners,
    contactEmailPress: row.contact_email_press ?? SITE_SETTINGS_DEFAULTS.contactEmailPress,
    contactEmailSupport: row.contact_email_support ?? null,
  };
}

function normalizeSiteSettings(row: CmsSiteSettingsRow): SiteSettings {
  return {
    countriesServed: row.countries_served ?? SITE_SETTINGS_DEFAULTS.countriesServed,
    defaultDescription: row.default_description ?? SITE_SETTINGS_DEFAULTS.defaultDescription,
    heroHeadline: row.hero_headline ?? SITE_SETTINGS_DEFAULTS.heroHeadline,
    heroCtaLabel: row.hero_cta_label ?? SITE_SETTINGS_DEFAULTS.heroCtaLabel,
    heroCtaUrl: row.hero_cta_url ?? SITE_SETTINGS_DEFAULTS.heroCtaUrl,
    footerLinks: row.footer_links ?? SITE_SETTINGS_DEFAULTS.footerLinks,
    ...socialFields(row),
  };
}

export async function fetchSiteSettings(): Promise<SiteSettings> {
  try {
    const body = await get<{ data: CmsSiteSettingsRow | CmsSiteSettingsRow[] }>(
      '/items/site_settings',
    );
    const row = Array.isArray(body.data) ? body.data[0] : body.data;
    return row ? normalizeSiteSettings(row) : SITE_SETTINGS_DEFAULTS;
  } catch (err) {
    // Never fail the page on Directus reachability — fall back to
    // defaults so the homepage still renders during an outage.
    console.error('[cms] fetchSiteSettings failed:', err instanceof Error ? err.message : err);
    return SITE_SETTINGS_DEFAULTS;
  }
}

// ---------------------------------------------------------------------------
// Site settings write path — Directus singleton PATCH.
// ---------------------------------------------------------------------------

/** Send data to a Directus items endpoint; throws on non-2xx response. */
async function send<T>(method: 'POST' | 'PATCH', path: string, data: unknown): Promise<T> {
  const url = `${directusBase()}${path}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(`Directus ${method} ${path} → HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

function patch<T>(path: string, data: unknown): Promise<T> {
  return send<T>('PATCH', path, data);
}

/** PATCH the site_settings singleton with a partial update. */
export async function updateSiteSettings(data: Partial<SiteSettings>): Promise<void> {
  // Directus singleton: PATCH /items/site_settings updates the singleton.
  // No need to know the singleton's primary key — Directus resolves it.
  await patch('/items/site_settings', data);
}

// ---------------------------------------------------------------------------
// events — single-event detail for /events/[id] (FR-EVT-004).
//
// Reads Directus directly, matching every sibling fetcher in this file
// (and V1's own `fetchEvent`) rather than the NestJS API — no public
// `GET /v1/events/:id` route exists on apps/api today. Returns
// `ApiEvent | null`, matching this file's null-on-miss convention; the
// page itself re-derives the country-mismatch case via `countryFromHost`
// (see AC-8 / R-3 in the impact analysis) since Directus has no notion
// of "wrong tenant" — it only knows whether the row exists.
// ---------------------------------------------------------------------------

import type {
  ApiEvent,
  EventMaterial,
  EventPhoto,
  EventQuestion,
  EventSpeaker,
  EventSponsor,
} from './types';

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
  short_description?: string | null;
  slug?: string | null;
  venue?: string | null;
  address?: string | null;
  map_url?: string | null;
  hero_image?: string | null;
  agenda_md?: string | null;
  visibility_scope?: ApiEvent['visibilityScope'];
  external_links?: unknown;
  // Directus decimal fields come back as strings via the REST adapter
  // when the driver uses pg's `numeric` type — accept either shape and
  // coerce in toApiEvent.
  latitude?: number | string | null;
  longitude?: number | string | null;
  recap_md?: string | null;
  livestream_url?: string | null;
  date_updated?: string | null;
}

type ExternalLinks = NonNullable<ApiEvent['externalLinks']>;
type ExternalLinkKind = NonNullable<ExternalLinks[number]['kind']>;
const ALLOWED_LINK_KINDS = new Set<ExternalLinkKind>([
  'website',
  'registration',
  'sponsor',
  'livestream',
  'recording',
  'other',
]);

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeLinkRow(item: unknown): ExternalLinks[number] | null {
  if (!item || typeof item !== 'object') return null;
  const row = item as { label?: unknown; url?: unknown; kind?: unknown };
  const label = typeof row.label === 'string' ? row.label.trim() : '';
  const url = typeof row.url === 'string' ? row.url.trim() : '';
  if (label.length === 0 || url.length === 0) return null;
  if (!isHttpUrl(url)) return null;
  const kind =
    typeof row.kind === 'string' && ALLOWED_LINK_KINDS.has(row.kind as ExternalLinkKind)
      ? (row.kind as ExternalLinkKind)
      : null;
  return { label, url, kind };
}

function normalizeExternalLinks(raw: unknown): ExternalLinks | null {
  if (!Array.isArray(raw)) return null;
  const out: ExternalLinks = [];
  for (const item of raw) {
    const row = normalizeLinkRow(item);
    if (row) out.push(row);
  }
  return out.length > 0 ? out : null;
}

// Coerce a Directus decimal (string | number) to a finite number in the
// valid range; null otherwise. Both lat and lng must resolve for the
// page's OSM embed to render.
function parseCoord(raw: unknown, min: number, max: number): number | null {
  if (raw == null) return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

function toApiEvent(row: CmsEventRow, registeredCount = 0): ApiEvent {
  const heroImageUrl = row.hero_image ? `${directusBase()}/assets/${row.hero_image}` : null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    format: row.format,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    capacity: row.capacity,
    registeredCount,
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
    externalLinks: normalizeExternalLinks(row.external_links),
    latitude: parseCoord(row.latitude, -90, 90),
    longitude: parseCoord(row.longitude, -180, 180),
    recapMd: row.recap_md ?? null,
    livestreamUrl: row.livestream_url ?? null,
    updatedAt: row.date_updated ?? null,
  };
}

const EVENT_FIELDS =
  'id,title,description,status,format,starts_at,ends_at,capacity,location,country,short_description,slug,venue,address,map_url,hero_image,agenda_md,visibility_scope,external_links,latitude,longitude,recap_md,livestream_url,date_updated';

// Country code from a request's Host header. Mirrors V1's
// countryFromHost (apps/web/src/lib/cms.ts) and the API's tenant
// middleware so SSR + API agree on which country to query. Defaults to
// 'uz' for unknown/missing hosts (e.g. local dev on localhost).
export function countryFromHost(host: string | null | undefined): string {
  if (!host) return 'uz';
  const label = host.split(':')[0]?.toLowerCase().split('.')[0] ?? '';
  if (label === 'uz' || label === 'kz' || label === 'tj') return label;
  return 'uz';
}

/**
 * Single event for /events/[id]. Returns `null` on miss, unpublished,
 * OR wrong-country (AC-8: a KZ event requested via uz.aiqadam.org must
 * 404 exactly like a nonexistent id — no differentiated response that
 * could leak which country a private event belongs to). Country is
 * resolved the same way V1's fetchEvent does: `countryFromHost` against
 * the incoming request's Host header. `null` also covers any
 * Directus-reachability failure — same convention as every sibling
 * fetcher in this file.
 *
 * `registeredCount` on the returned event is always `0` here — this
 * module only talks to Directus directly, and `registrations` has no
 * Public Directus read grant (deliberately: it holds other members'
 * registration data — see ISS-RBAC-PERMS-001/ISS-SEC-PUBLIC-UNMANAGED-001).
 * Callers needing the real count MUST separately call
 * `fetchEventRegistrationCount()` from `lib/api-ssr.ts` (apps/api's own
 * authenticated Directus client computes it server-side) and merge it in
 * — see `pages/events/[id].astro`. ISS-EVT-005-1.
 */
export async function fetchEvent(req: Request, id: string): Promise<ApiEvent | null> {
  if (!id || id.length === 0) return null;
  const country = countryFromHost(req.headers.get('host'));
  try {
    const params = new URLSearchParams({ fields: EVENT_FIELDS });
    const body = await get<{ data: CmsEventRow | null }>(
      `/items/events/${encodeURIComponent(id)}?${params.toString()}`,
    );
    if (!body.data || body.data.status !== 'published' || body.data.country !== country) {
      return null;
    }
    return toApiEvent(body.data);
  } catch (err) {
    console.error(`[cms] fetchEvent(${id}) failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// event_speakers, event_materials, event_sponsors (Directus joins).
//
// PR 1.3 — these back the <SpeakerGrid>, <MaterialsList>, <SponsorWall>
// blocks on /events/[id]. Each returns [] on failure so the page still
// renders the rest of the surface.
// ---------------------------------------------------------------------------

interface CmsEventSpeakerRow {
  id: string;
  status: EventSpeaker['status'];
  talk_title: string | null;
  order_index: number | null;
  speaker: {
    bio_md: string | null;
    user: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      job_title: string | null;
    } | null;
  } | null;
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
    return body.data.map((row): EventSpeaker => {
      const u = row.speaker?.user ?? null;
      const name = [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim();
      return {
        id: row.id,
        displayName: name.length > 0 ? name : null,
        // Handle resolution (directus_users → handles bridge) deferred
        // to Phase 1.5 when the member-profile blocks land.
        handle: null,
        jobTitle: u?.job_title ?? null,
        talkTitle: row.talk_title,
        bioMd: row.speaker?.bio_md ?? null,
        status: row.status,
        orderIndex: row.order_index ?? 0,
      };
    });
  } catch (err) {
    console.error('[cms] fetchEventSpeakers failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

interface CmsEventMaterialRow {
  id: string;
  title: string | null;
  kind: EventMaterial['kind'];
  file: string | null;
  url: string | null;
  order_index: number | null;
}

const ALLOWED_MATERIAL_KINDS = new Set<EventMaterial['kind']>([
  'slides',
  'handout',
  'cheatsheet',
  'recording',
  'code',
  'other',
]);

function rowToMaterial(row: CmsEventMaterialRow): EventMaterial | null {
  const title = row.title?.trim() ?? '';
  if (title.length === 0) return null;
  const kind = ALLOWED_MATERIAL_KINDS.has(row.kind) ? row.kind : 'other';
  const fileUrl = row.file ? `${directusBase()}/assets/${row.file}` : null;
  const url = row.url ? row.url : null;
  if (!fileUrl && !url) return null;
  return { id: row.id, title, kind, fileUrl, url, orderIndex: row.order_index ?? 0 };
}

export async function fetchEventMaterials(eventId: string): Promise<EventMaterial[]> {
  try {
    const params = new URLSearchParams({
      'filter[event][_eq]': eventId,
      fields: 'id,title,kind,file,url,order_index',
      sort: 'order_index',
      limit: '50',
    });
    const body = await get<{ data: CmsEventMaterialRow[] }>(
      `/items/event_materials?${params.toString()}`,
    );
    return body.data.map(rowToMaterial).filter((m): m is EventMaterial => m !== null);
  } catch (err) {
    console.error('[cms] fetchEventMaterials failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// event_photos — Finished-tab photo gallery (F-WebU9).
//
// Public read, sorted by order_index. Either `file` (Directus-hosted,
// preferred) or `url` (external CDN) resolves to an <img src>; rows
// producing neither are dropped. Mirrors V1's apps/web/src/lib/cms.ts
// fetchEventPhotos.
// ---------------------------------------------------------------------------

interface CmsEventPhotoRow {
  id: string;
  file: string | null;
  url: string | null;
  caption: string | null;
  alt_text: string | null;
  order_index: number | null;
}

export async function fetchEventPhotos(eventId: string): Promise<EventPhoto[]> {
  try {
    const params = new URLSearchParams({
      'filter[event][_eq]': eventId,
      fields: 'id,file,url,caption,alt_text,order_index',
      sort: 'order_index',
      limit: '60',
    });
    const body = await get<{ data: CmsEventPhotoRow[] }>(
      `/items/event_photos?${params.toString()}`,
    );
    return body.data
      .map((row): EventPhoto | null => {
        const fileUrl = row.file ? `${directusBase()}/assets/${row.file}` : null;
        const url = row.url ? row.url : null;
        if (!fileUrl && !url) return null;
        return {
          id: row.id,
          fileUrl,
          url,
          caption: row.caption?.trim() || null,
          altText: row.alt_text?.trim() || null,
          orderIndex: row.order_index ?? 0,
        };
      })
      .filter((p): p is EventPhoto => p !== null);
  } catch (err) {
    console.error('[cms] fetchEventPhotos failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

interface CmsEventSponsorRow {
  id: string;
  tier: EventSponsor['tier'];
  custom_message: string | null;
  sort_order: number | null;
  sponsor: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    website: string | null;
  } | null;
}

const ALLOWED_SPONSOR_TIERS = new Set<EventSponsor['tier']>([
  'presenting',
  'gold',
  'silver',
  'bronze',
  'community',
]);

export async function fetchEventSponsors(eventId: string): Promise<EventSponsor[]> {
  try {
    const params = new URLSearchParams({
      'filter[event][_eq]': eventId,
      fields:
        'id,tier,custom_message,sort_order,sponsor.id,sponsor.name,sponsor.slug,sponsor.logo,sponsor.website',
      sort: 'sort_order',
      limit: '40',
    });
    const body = await get<{ data: CmsEventSponsorRow[] }>(
      `/items/event_sponsors?${params.toString()}`,
    );
    return body.data
      .map((row): EventSponsor | null => {
        if (!row.sponsor) return null;
        const tier = ALLOWED_SPONSOR_TIERS.has(row.tier) ? row.tier : 'community';
        return {
          id: row.id,
          tier,
          customMessage: row.custom_message,
          orderIndex: row.sort_order ?? 0,
          sponsor: {
            id: row.sponsor.id,
            name: row.sponsor.name,
            slug: row.sponsor.slug,
            logoUrl: row.sponsor.logo ? `${directusBase()}/assets/${row.sponsor.logo}` : null,
            website: row.sponsor.website,
          },
        };
      })
      .filter((s): s is EventSponsor => s !== null);
  } catch (err) {
    console.error('[cms] fetchEventSponsors failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// event_questions — per-event Q&A thread.
//
// Directus public-policy grants read on event_questions filtered to
// status=published; anon viewers see existing questions, signed-in
// viewers POST via apps/api (/v1/events/:id/questions). Pages render
// the initial SSR list; the React island mounts on top + appends.
// ---------------------------------------------------------------------------

interface CmsEventQuestionRow {
  id: string;
  parent_question: string | null;
  question_text: string;
  is_pinned: boolean;
  is_answered: boolean;
  date_created: string;
  user: {
    id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
}

function normalizeQuestionRow(row: CmsEventQuestionRow): EventQuestion {
  const u = row.user;
  const first = u?.first_name?.trim() ?? '';
  const last = u?.last_name?.trim() ?? '';
  const displayName = `${first} ${last}`.trim() || null;
  return {
    id: row.id,
    questionText: row.question_text,
    parentQuestionId: row.parent_question,
    isPinned: row.is_pinned === true,
    isAnswered: row.is_answered === true,
    createdAt: row.date_created,
    author: {
      displayName,
      directusUserId: u?.id ?? null,
    },
  };
}

export async function fetchEventQuestions(eventId: string): Promise<EventQuestion[]> {
  try {
    const params = new URLSearchParams({
      'filter[event][_eq]': eventId,
      fields:
        'id,parent_question,question_text,is_pinned,is_answered,date_created,user.id,user.first_name,user.last_name',
      sort: '-is_pinned,date_created',
      limit: '100',
    });
    const body = await get<{ data: CmsEventQuestionRow[] }>(
      `/items/event_questions?${params.toString()}`,
    );
    return body.data.map(normalizeQuestionRow);
  } catch (err) {
    console.error('[cms] fetchEventQuestions failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// landing_pages — per-source welcome pages (FR-MIG-020).
//
// Mirrors the v1 implementation in apps/web/src/lib/cms.ts. Public collection
// — no auth needed. Returns null on miss so the page can render a 404.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// press_page (singleton) — hero, boilerplate, contact prose for /press.
// ---------------------------------------------------------------------------

export interface PressPage {
  heroTitle: string;
  companyBoilerplate: string;
  seoDescription: string;
  contactResponseSla: string;
  contactGuidance: string;
}

interface CmsPressPageRow {
  hero_title?: string | null;
  company_boilerplate?: string | null;
  seo_description?: string | null;
  contact_response_sla?: string | null;
  contact_guidance?: string | null;
}

const PRESS_PAGE_DEFAULTS: PressPage = {
  heroTitle: 'AI Qadam — for journalists, partners, and event organizers',
  companyBoilerplate:
    'Founded by Binali Rustamov in 2026, AI Qadam is run by a distributed team of country leads with a working community across all three Central Asian republics. Below: brand assets, founder bios, a fact sheet, and how to reach us.',
  seoDescription:
    'AI Qadam media kit — logo, brand assets, founder + COO bios, fact sheet, and press contact for journalists, partners, and event organizers.',
  contactResponseSla: 'Reaches Binali within one business day; faster on weekdays.',
  contactGuidance: 'Embargo requests, interview asks, and fact-checks all welcome here.',
};

function normalizePressPage(row: CmsPressPageRow): PressPage {
  return {
    heroTitle: row.hero_title || PRESS_PAGE_DEFAULTS.heroTitle,
    companyBoilerplate: row.company_boilerplate || PRESS_PAGE_DEFAULTS.companyBoilerplate,
    seoDescription: row.seo_description || PRESS_PAGE_DEFAULTS.seoDescription,
    contactResponseSla: row.contact_response_sla || PRESS_PAGE_DEFAULTS.contactResponseSla,
    contactGuidance: row.contact_guidance || PRESS_PAGE_DEFAULTS.contactGuidance,
  };
}

export async function fetchPressPage(): Promise<PressPage> {
  try {
    const body = await get<{ data: CmsPressPageRow | CmsPressPageRow[] }>('/items/press_page');
    const row = Array.isArray(body.data) ? body.data[0] : body.data;
    return row ? normalizePressPage(row) : PRESS_PAGE_DEFAULTS;
  } catch (err) {
    console.error('[cms] fetchPressPage failed:', err instanceof Error ? err.message : err);
    return PRESS_PAGE_DEFAULTS;
  }
}

// ---------------------------------------------------------------------------
// team_members — leadership bios for /press.
// ---------------------------------------------------------------------------

export type TeamMemberRole =
  | 'founder'
  | 'coo'
  | 'country_lead'
  | 'advisor'
  | 'organizer'
  | 'staff'
  | 'other';

export interface TeamMember {
  id: string;
  name: string;
  title: string;
  role: TeamMemberRole;
  bioMd: string | null;
  displayOrder: number;
}

interface CmsTeamMemberRow {
  id: string;
  name: string;
  title: string;
  role: TeamMemberRole;
  bio_md?: string | null;
  display_order?: number | null;
}

function normalizeTeamMember(row: CmsTeamMemberRow): TeamMember {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    role: row.role,
    bioMd: row.bio_md ?? null,
    displayOrder: row.display_order ?? 100,
  };
}

export async function fetchTeamMembers(opts?: {
  pressPageOnly?: boolean;
  limit?: number;
}): Promise<TeamMember[]> {
  try {
    const params = new URLSearchParams({
      'filter[active][_eq]': 'true',
      sort: 'display_order',
      limit: String(opts?.limit ?? 50),
      fields: 'id,name,title,role,bio_md,display_order',
    });
    if (opts?.pressPageOnly) {
      params.set('filter[appear_on_press_page][_eq]', 'true');
    }
    const body = await get<{ data: CmsTeamMemberRow[] }>(
      `/items/team_members?${params.toString()}`,
    );
    return body.data.map(normalizeTeamMember);
  } catch (err) {
    console.error('[cms] fetchTeamMembers failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// marketing_assets — brand assets for /press (headshots, logos, fact sheets,
// quarterly digests, press coverage). Mirrors v1 implementation.
// ---------------------------------------------------------------------------

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

function assetUrl(fileId: string | null): string | null {
  if (!fileId) return null;
  return `${directusBase()}/assets/${fileId}`;
}

/**
 * FR-CMS-008 — asset URL for values emitted directly into browser-facing
 * HTML, e.g. a user-clickable `<a href>` download link.
 *
 * Deliberately NOT `assetUrl()`. `directusBase()` is realm-dependent and
 * every page that consumes this module runs with `prerender = false`, so
 * `typeof window === 'undefined'` is always true at render time and
 * `assetUrl()` therefore always resolves to INTERNAL_DIRECTUS_URL — the
 * Docker-network alias `http://directus:8055`. That is correct for an SSR
 * `fetch()` (it stays inside the compose network), but a browser cannot
 * resolve it, and the plaintext `http://` scheme would additionally be a
 * mixed-content downgrade from the HTTPS page. A link built that way is
 * dead for every real visitor.
 *
 * The public base is unconditional here because this value's only consumer
 * is the visitor's browser, never a server-side fetch. "Unconditional" means
 * realm-unconditional — no `typeof window` branch — which is what makes the
 * internal-hostname and http:// downgrade impossible by construction.
 * FR-CMS-009 makes the origin's VALUE environment-configurable without
 * reintroducing a realm branch, so that invariant is preserved.
 *
 * `assetUrl()` is left alone on purpose: its three existing callers
 * (`marketing_assets` file/thumbnail) and the inline `${directusBase()}
 * /assets/...` sites feed paths that may legitimately want the internal
 * base. Widening the fix to those is a separate change with its own
 * blast radius — see this feature's security review.
 */
function publicAssetUrl(fileId: string | null): string | null {
  if (!fileId) return null;
  return `${resolvePublicDirectusUrl()}/assets/${fileId}`;
}

export interface FetchMarketingAssetsOpts {
  category: string | string[];
  limit?: number;
}

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

// ---------------------------------------------------------------------------
// Press page write path — PATCH singleton + team_members CRUD.
// ---------------------------------------------------------------------------

export interface PressPageInput {
  heroTitle?: string;
  companyBoilerplate?: string;
  seoDescription?: string;
  contactResponseSla?: string;
  contactGuidance?: string;
}

/** PATCH the press_page singleton with a partial update. */
export async function updatePressPage(data: PressPageInput): Promise<void> {
  await patch('/items/press_page', {
    hero_title: data.heroTitle,
    company_boilerplate: data.companyBoilerplate,
    seo_description: data.seoDescription,
    contact_response_sla: data.contactResponseSla,
    contact_guidance: data.contactGuidance,
  });
}

export interface TeamMemberInput {
  name: string;
  title: string;
  role: TeamMemberRole;
  bioMd?: string | null;
  displayOrder?: number;
}

/** POST a new team_member row; returns the created item's id. */
export async function createTeamMember(data: TeamMemberInput): Promise<string> {
  interface CreatedRow {
    data: { id: string };
  }
  const body = await send<CreatedRow>('POST', '/items/team_members', {
    name: data.name,
    title: data.title,
    role: data.role,
    bio_md: data.bioMd ?? null,
    display_order: data.displayOrder ?? 100,
    active: true,
    appear_on_press_page: true,
  });
  return body.data.id;
}

/** PATCH an existing team_member row by id. */
export async function updateTeamMember(id: string, data: Partial<TeamMemberInput>): Promise<void> {
  await patch(`/items/team_members/${encodeURIComponent(id)}`, {
    ...(data.name !== undefined && { name: data.name }),
    ...(data.title !== undefined && { title: data.title }),
    ...(data.role !== undefined && { role: data.role }),
    ...(data.bioMd !== undefined && { bio_md: data.bioMd }),
    ...(data.displayOrder !== undefined && { display_order: data.displayOrder }),
  });
}

/** Soft-delete a team_member by setting active=false. */
export async function deleteTeamMember(id: string): Promise<void> {
  await patch(`/items/team_members/${encodeURIComponent(id)}`, { active: false });
}

// ---------------------------------------------------------------------------
// fetchEventCountForCountry — past-event count per country for /global.
// ---------------------------------------------------------------------------

export async function fetchEventCountForCountry(country: string): Promise<number> {
  if (!/^[a-z]{2}$/.test(country)) return 0;
  try {
    const now = new Date().toISOString();
    const params = new URLSearchParams({
      'filter[country][_eq]': country,
      'filter[status][_eq]': 'published',
      'filter[ends_at][_lt]': now,
      'aggregate[count]': 'id',
    });
    type AggRow = Array<{ count: { id: number | string } }>;
    const body = await get<{ data: AggRow }>(`/items/events?${params.toString()}`);
    return Number(body.data[0]?.count?.id ?? 0);
  } catch (err) {
    console.error(
      `[cms] fetchEventCountForCountry(${country}) failed:`,
      err instanceof Error ? err.message : err,
    );
    return 0;
  }
}

// ---------------------------------------------------------------------------
// content_pages — About Us / Events & History / Partner With Us (FR-CMS-007).
//
// Same shape family as landing_pages, plus a `translations` flat-JSON
// field (mirrors events.translations — the proven i18n pattern in this
// codebase; landing_pages itself has no translations field, so it is
// not the precedent for the i18n *shape*, only for the body_md/status
// field shape). Top-level fields are the (en) default-locale fallback;
// `translations.ru` (etc.) overrides per-locale when present. Global,
// non-tenant-scoped content — no countryFromHost filtering.
// ---------------------------------------------------------------------------

export interface CmsContentPage {
  slug: string;
  title: string;
  subtitle: string | null;
  bodyMd: string | null;
}

interface CmsContentPageTranslation {
  title?: string;
  subtitle?: string;
  body_md?: string;
}

interface CmsContentPageRow {
  slug: string;
  status: string;
  title: string;
  subtitle: string | null;
  body_md: string | null;
  translations: Record<string, CmsContentPageTranslation> | null;
}

const CONTENT_PAGE_FIELDS = 'slug,status,title,subtitle,body_md,translations';

/** Slug shape guard — same convention as fetchLandingPage. */
function isValidContentSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(slug);
}

function normalizeContentPageRow(row: CmsContentPageRow, locale: string): CmsContentPage {
  const localized = row.translations?.[locale];
  return {
    slug: row.slug,
    title: localized?.title ?? row.title,
    subtitle: localized?.subtitle ?? row.subtitle,
    bodyMd: localized?.body_md ?? row.body_md,
  };
}

/**
 * Fetch a content_pages row by slug, resolved to the requested locale.
 * `locale` defaults to 'en' (the top-level fields' locale) when omitted
 * or unsupported. Returns null on miss, unpublished, or Directus
 * failure — never throws into the page (AC-8).
 */
export async function fetchContentPage(
  slug: string,
  locale = 'en',
): Promise<CmsContentPage | null> {
  const trimmed = slug.trim().toLowerCase();
  if (!isValidContentSlug(trimmed)) return null;
  try {
    const params = new URLSearchParams({
      'filter[slug][_eq]': trimmed,
      'filter[status][_eq]': 'published',
      fields: CONTENT_PAGE_FIELDS,
      limit: '1',
    });
    const body = await get<{ data: CmsContentPageRow[] }>(
      `/items/content_pages?${params.toString()}`,
    );
    const row = body.data[0];
    if (!row) return null;
    return normalizeContentPageRow(row, locale);
  } catch (err) {
    console.error(`[cms] fetchContentPage(${slug}) failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// content_documents — Community Rules & Documents library (FR-CMS-007).
//
// ru-only for this pass (AC-2) — no translations field, no locale param.
// fetchContentDocuments() lists all published rows (library index,
// /rules); fetchContentDocument(slug) loads one row's full body
// (/rules/[slug]). Both return empty/null on failure — never throw.
// ---------------------------------------------------------------------------

export interface CmsContentDocument {
  id: string;
  slug: string;
  title: string;
  sourceDocumentLabel: string | null;
  /**
   * FR-CMS-008 — direct download URL for the original source document,
   * or null when the row has no source_file attached yet (the upload is
   * an operator-run seed step, so null is a normal steady state and the
   * page must render label-only without it).
   */
  sourceFileUrl: string | null;
  statusLabel: string | null;
  bodyMd: string | null;
  displayOrder: number;
}

interface CmsContentDocumentRow {
  id: string;
  slug: string;
  status: string;
  title: string;
  source_document_label: string | null;
  source_file: string | null;
  status_label: string | null;
  body_md: string | null;
  display_order: number | null;
}

const CONTENT_DOCUMENT_LIST_FIELDS =
  'id,slug,status,title,source_document_label,source_file,status_label,display_order';
const CONTENT_DOCUMENT_DETAIL_FIELDS = `${CONTENT_DOCUMENT_LIST_FIELDS},body_md`;

/**
 * FR-CMS-008 AC-6 — the download must arrive under the source document's
 * real filename. `?download` is Directus's own asset flag: it switches
 * Content-Disposition from `inline` to `attachment` and names the file
 * from the asset's `filename_download`. The HTML `download` attribute
 * alone is not enough here, since Directus is a different origin from
 * web-next and browsers ignore the attribute cross-origin.
 *
 * Uses `publicAssetUrl()`, not `assetUrl()` — this string is rendered
 * straight into an `<a href>` the visitor clicks, so it must carry the
 * public HTTPS base rather than the internal Docker alias SSR would
 * otherwise produce. See `publicAssetUrl()` for the full rationale.
 */
function sourceFileDownloadUrl(fileId: string | null): string | null {
  const url = publicAssetUrl(fileId);
  return url ? `${url}?download` : null;
}

function normalizeContentDocumentRow(row: CmsContentDocumentRow): CmsContentDocument {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    sourceDocumentLabel: row.source_document_label,
    sourceFileUrl: sourceFileDownloadUrl(row.source_file),
    statusLabel: row.status_label,
    bodyMd: row.body_md,
    displayOrder: row.display_order ?? 100,
  };
}

/** List every published content_documents row, sorted by display_order (AC-2: exactly the 5 seeded rows in this pass). */
export async function fetchContentDocuments(): Promise<CmsContentDocument[]> {
  try {
    const params = new URLSearchParams({
      'filter[status][_eq]': 'published',
      fields: CONTENT_DOCUMENT_LIST_FIELDS,
      sort: 'display_order',
      limit: '50',
    });
    const body = await get<{ data: CmsContentDocumentRow[] }>(
      `/items/content_documents?${params.toString()}`,
    );
    return body.data.map(normalizeContentDocumentRow);
  } catch (err) {
    console.error('[cms] fetchContentDocuments failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

/** Fetch one content_documents row (with body_md) by slug. Returns null on miss/unpublished/failure. */
export async function fetchContentDocument(slug: string): Promise<CmsContentDocument | null> {
  const trimmed = slug.trim().toLowerCase();
  if (!isValidContentSlug(trimmed)) return null;
  try {
    const params = new URLSearchParams({
      'filter[slug][_eq]': trimmed,
      'filter[status][_eq]': 'published',
      fields: CONTENT_DOCUMENT_DETAIL_FIELDS,
      limit: '1',
    });
    const body = await get<{ data: CmsContentDocumentRow[] }>(
      `/items/content_documents?${params.toString()}`,
    );
    const row = body.data[0];
    return row ? normalizeContentDocumentRow(row) : null;
  } catch (err) {
    console.error(
      `[cms] fetchContentDocument(${slug}) failed:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
