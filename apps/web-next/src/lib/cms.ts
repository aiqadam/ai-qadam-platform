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
const PUBLIC_DIRECTUS_URL = 'https://cms.aiqadam.org';

function directusBase(): string {
  // Server side: prefer the internal docker-network alias so SSR
  // doesn't bounce through public DNS + TLS for every request.
  // Client side: the public URL (cms.aiqadam.org). Pages should only
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
  return PUBLIC_DIRECTUS_URL;
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
// event_speakers, event_materials, event_sponsors (Directus joins).
//
// PR 1.3 — these back the <SpeakerGrid>, <MaterialsList>, <SponsorWall>
// blocks on /events/[id]. Each returns [] on failure so the page still
// renders the rest of the surface.
// ---------------------------------------------------------------------------

import type { EventMaterial, EventQuestion, EventSpeaker, EventSponsor } from './types';

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
