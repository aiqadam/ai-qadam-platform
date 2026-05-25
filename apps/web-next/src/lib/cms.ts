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
  telegramUrl: 'https://t.me/aiqadam',
  twitterUrl: null,
  linkedinUrl: null,
  instagramUrl: null,
  youtubeUrl: null,
  contactEmailPartners: 'partners@aiqadam.org',
  contactEmailPress: 'press@aiqadam.org',
  contactEmailSupport: null,
};

function normalizeSiteSettings(row: CmsSiteSettingsRow): SiteSettings {
  return {
    countriesServed: row.countries_served ?? SITE_SETTINGS_DEFAULTS.countriesServed,
    defaultDescription: row.default_description ?? SITE_SETTINGS_DEFAULTS.defaultDescription,
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
    return body.data
      .map((row): EventMaterial | null => {
        const title = row.title?.trim() ?? '';
        if (title.length === 0) return null;
        const kind = ALLOWED_MATERIAL_KINDS.has(row.kind) ? row.kind : 'other';
        const fileUrl = row.file ? `${directusBase()}/assets/${row.file}` : null;
        const url = row.url ? row.url : null;
        if (!fileUrl && !url) return null;
        return { id: row.id, title, kind, fileUrl, url, orderIndex: row.order_index ?? 0 };
      })
      .filter((m): m is EventMaterial => m !== null);
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
