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
