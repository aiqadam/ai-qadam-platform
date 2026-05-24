import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { env } from '../../config/env';
import { DirectusClient, DirectusError } from '../directus/directus.client';
import { type I18nLocale, pickLocale } from './telegram-events.service';

// aiqadam#291 — speakers as a first-class entity for the bot's
// /speakers command + speaker deep-links from event detail. Reads
// from the existing `speakers` collection + the event_speakers
// junction to expose the speaker's confirmed upcoming sessions.
//
// UNGATED via TelegramPublicController (same posture as events): TG
// users browse speakers before /link per the acquisition-channel rule.
//
// ADR-0037 layer triage:
//   - Customer (bot /speakers + tap-through from event detail)
//   - Operational (reads operator-curated speakers + event_speakers)
//   - No engineering touch

// ─── Wire shape (matches bot's pydantic exactly) ─────────────────────────────

export interface SpeakerSummary {
  id: string;
  slug: string; // never null in the wire shape; falls back to id when CMS slug is missing
  name: string;
  title: string | null;
  avatar_url: string | null;
  // aiqadam#326 PR-c — locale the response was served in. Always present
  // when Accept-Language reached the handler (the bot always sends one);
  // absent on unauthenticated callers that omit the header. Substitutes
  // title from speakers.translations[locale].headline when present.
  locale?: string;
}

export interface SpeakerSocialLink {
  label: string;
  url: string;
}

export interface SpeakerEventSummary {
  id: string;
  slug: string;
  title: string;
  starts_at: string;
  registration_open: boolean;
}

export interface SpeakerDetail extends SpeakerSummary {
  bio: string | null; // markdown — bot converts to its narrow HTML subset
  social_links: SpeakerSocialLink[];
  events: SpeakerEventSummary[];
}

// ─── Internal Directus shapes ────────────────────────────────────────────────

// Narrow read of the speakers row + nested user (Directus deep-join on
// the M2O FK). user.email is included for the email-local fallback on
// placeholder speakers whose names haven't been filled in yet.
interface SpeakerRow {
  id: string;
  slug: string | null;
  headline: string | null;
  bio: string | null;
  photo: string | null;
  linkedin_url: string | null;
  twitter_handle: string | null;
  status: string;
  country: string;
  user: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
  // aiqadam#326 PR-c — per-locale subobject map. {ru:{headline,bio},uz:{...}}
  translations?: Record<string, SpeakerTranslation> | null;
}

// aiqadam#326 PR-c — per-locale translation shape on speakers.translations.
export interface SpeakerTranslation {
  headline?: string;
  bio?: string;
}

interface UpcomingEventJoinRow {
  talk_title: string | null;
  event: {
    id: string;
    slug: string | null;
    title: string;
    starts_at: string;
    status: string;
    visibility_scope: string | null;
    registration_open: boolean | null;
  } | null;
}

export const DEFAULT_SPEAKERS_LIMIT = 20;
export const MAX_SPEAKERS_LIMIT = 50;

@Injectable()
export class TelegramSpeakersService {
  private readonly logger = new Logger(TelegramSpeakersService.name);

  constructor(private readonly directus: DirectusClient) {}

  async listSpeakers(
    opts: { country?: string | null; limit?: number; locale?: string | null } = {},
  ): Promise<{
    items: SpeakerSummary[];
  }> {
    const { country = null, limit = DEFAULT_SPEAKERS_LIMIT, locale = null } = opts;
    const cappedLimit = Math.min(Math.max(limit, 1), MAX_SPEAKERS_LIMIT);
    const parts: string[] = [
      'filter[status][_eq]=active',
      'fields=id,slug,headline,bio,photo,linkedin_url,twitter_handle,status,country,user.first_name,user.last_name,user.email,translations',
      'sort=user.last_name',
      `limit=${cappedLimit}`,
    ];
    if (country) {
      parts.push(`filter[country][_eq]=${encodeURIComponent(country)}`);
    }
    const res = await this.directus.get<{ data: SpeakerRow[] }>(
      `/items/speakers?${parts.join('&')}`,
    );
    const resolvedLocale = pickLocale(locale);
    const items: SpeakerSummary[] = [];
    for (const row of res.data) {
      const summary = rowToSpeakerSummary(row);
      // Silently drop speakers we can't name — operator placeholder rows
      // without any usable identifier (first/last/email all null) are not
      // worth rendering as a blank chip.
      if (summary) items.push(applySummaryI18n(summary, row, resolvedLocale));
    }
    return { items };
  }

  async getSpeakerDetail(slugOrId: string, locale?: string | null): Promise<SpeakerDetail> {
    const row = await this.findActiveSpeakerBySlugOrId(slugOrId);
    if (!row) {
      throw new NotFoundException({ error: 'speaker_not_found' });
    }
    const summary = rowToSpeakerSummary(row);
    if (!summary) {
      // Edge case: slug exists but the speaker has no usable name —
      // surface as not-found so the bot's UX is consistent.
      throw new NotFoundException({ error: 'speaker_not_found' });
    }

    const events = await this.fetchUpcomingEventsForSpeaker(row.id);
    const resolvedLocale = pickLocale(locale ?? null);
    const baseDetail: SpeakerDetail = {
      ...summary,
      bio: row.bio,
      social_links: buildSocialLinks(row),
      events,
    };
    return applyDetailI18n(baseDetail, row, resolvedLocale);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async findActiveSpeakerBySlugOrId(slugOrId: string): Promise<SpeakerRow | null> {
    const fields =
      'fields=id,slug,headline,bio,photo,linkedin_url,twitter_handle,status,country,user.first_name,user.last_name,user.email,translations';
    const guards = 'filter[status][_eq]=active';
    const encoded = encodeURIComponent(slugOrId);

    const bySlug = await this.directus.get<{ data: SpeakerRow[] }>(
      `/items/speakers?${guards}&filter[slug][_eq]=${encoded}&${fields}&limit=1`,
    );
    if (bySlug.data[0]) return bySlug.data[0];

    // UUID fallback — only attempt when shape matches (Directus 400s on
    // a non-uuid id filter). Necessary while speakers.slug is being
    // backfilled — until then deep-links use the speaker id.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId)) {
      return null;
    }
    const byId = await this.directus.get<{ data: SpeakerRow[] }>(
      `/items/speakers?${guards}&filter[id][_eq]=${encoded}&${fields}&limit=1`,
    );
    return byId.data[0] ?? null;
  }

  // Upcoming + confirmed sessions only. Past events filtered out — the
  // bot's spec says "upcoming + recent past, sorted future-first" but
  // "recent past" is fuzzy + we don't want to surface a 6-month-old
  // talk on a speaker's page. Future-only matches the listOpenEvents
  // convention; expand to past if operators ask.
  private async fetchUpcomingEventsForSpeaker(speakerId: string): Promise<SpeakerEventSummary[]> {
    const nowIso = encodeURIComponent(new Date().toISOString());
    const query = [
      `filter[speaker][_eq]=${encodeURIComponent(speakerId)}`,
      'filter[status][_eq]=confirmed',
      'filter[event][status][_eq]=published',
      'filter[event][visibility_scope][_eq]=public',
      `filter[event][starts_at][_gt]=${nowIso}`,
      'fields=talk_title,event.id,event.slug,event.title,event.starts_at,event.status,event.visibility_scope,event.registration_open',
      'sort=event.starts_at',
      'limit=50',
    ].join('&');
    try {
      const res = await this.directus.get<{ data: UpcomingEventJoinRow[] }>(
        `/items/event_speakers?${query}`,
      );
      const out: SpeakerEventSummary[] = [];
      for (const row of res.data) {
        if (!row.event) continue;
        out.push({
          id: row.event.id,
          slug: row.event.slug && row.event.slug.length > 0 ? row.event.slug : row.event.id,
          title: row.event.title,
          starts_at: row.event.starts_at,
          registration_open: row.event.registration_open ?? true,
        });
      }
      return out;
    } catch (err) {
      // Degrade gracefully — empty events list is preferable to a 500.
      const reason = err instanceof DirectusError ? `directus_${err.status}` : 'unknown';
      this.logger.warn(`fetchUpcomingEventsForSpeaker failed for speaker=${speakerId}: ${reason}`);
      return [];
    }
  }
}

// ─── Pure helpers (exported for tests) ───────────────────────────────────────

// Resolves a SpeakerRow into the wire summary; returns null when the
// row has no usable display name (caller filters those out).
export function rowToSpeakerSummary(row: SpeakerRow): SpeakerSummary | null {
  const name = speakerName(row);
  if (!name) return null;
  return {
    id: row.id,
    slug: row.slug && row.slug.length > 0 ? row.slug : row.id,
    name,
    title: row.headline?.trim() || null,
    avatar_url: row.photo
      ? `${env.DIRECTUS_URL.replace(/\/$/, '')}/assets/${encodeURIComponent(row.photo)}`
      : null,
  };
}

// Same fallback ladder as telegram-events.service.ts speakerDisplayName,
// but adapted for the un-junctioned `speakers` row shape (no `.speaker.`
// wrapper). "first + last" → "first" → "last" → email-local.
export function speakerName(row: SpeakerRow): string | null {
  const u = row.user;
  if (!u) return null;
  const first = u.first_name?.trim() ?? '';
  const last = u.last_name?.trim() ?? '';
  const fromName = [first, last].filter((s) => s.length > 0).join(' ');
  if (fromName) return fromName;
  const local = u.email?.split('@')[0]?.trim();
  return local && local.length > 0 ? local : null;
}

// Synthesizes the wire social_links array from the two operator columns
// on `speakers`. Twitter handles are stored as @-handles (per the
// schema's note); normalize to URL form here so the bot doesn't have to.
export function buildSocialLinks(row: SpeakerRow): SpeakerSocialLink[] {
  const out: SpeakerSocialLink[] = [];
  const li = row.linkedin_url?.trim();
  if (li) out.push({ label: 'LinkedIn', url: li });
  const tw = row.twitter_handle?.trim();
  if (tw) {
    const handle = tw.replace(/^@+/, '');
    if (handle) out.push({ label: 'Twitter', url: `https://twitter.com/${handle}` });
  }
  return out;
}

// ─── aiqadam#326 PR-c — i18n helpers (mirror of events.service shape) ─────

// Substitutes the headline → wire `title` field on the SUMMARY when
// the locale's translation is present. Always tags response with `locale`.
export function applySummaryI18n(
  summary: SpeakerSummary,
  row: SpeakerRow,
  locale: I18nLocale,
): SpeakerSummary {
  const out: SpeakerSummary = { ...summary, locale };
  const t = pickTranslation(row, locale);
  if (t?.headline) out.title = t.headline.trim() || out.title;
  return out;
}

// DETAIL variant — substitutes title (← headline) AND bio. Both keys
// are optional in the translation; missing keys leave the base value.
export function applyDetailI18n(
  detail: SpeakerDetail,
  row: SpeakerRow,
  locale: I18nLocale,
): SpeakerDetail {
  const out: SpeakerDetail = { ...detail, locale };
  const t = pickTranslation(row, locale);
  if (!t) return out;
  if (t.headline) out.title = t.headline.trim() || out.title;
  if (t.bio) out.bio = t.bio;
  return out;
}

// Defensive lookup against potentially-bad operator-supplied JSON.
function pickTranslation(row: SpeakerRow, locale: I18nLocale): SpeakerTranslation | null {
  if (locale === 'en') return null; // base row already serves 'en'
  const all = row.translations;
  if (!all || typeof all !== 'object') return null;
  const t = all[locale];
  if (!t || typeof t !== 'object') return null;
  return t;
}
