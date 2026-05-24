import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { env } from '../../config/env';
import { DirectusClient } from '../directus/directus.client';

// Anonymous browsing surface for the Telegram bot. Returns the same
// events that uz/kz/tj/xx.aiqadam.org/events renders — published,
// public, future — so a TG user who chats with @aiqadameventbot before
// linking can browse + register (Telegram-as-IdP per Phase Bot-B PR-5).
//
// "Telegram is an ACQUISITION channel, NOT engagement"
//   — Viktor 2026-05-23. Don't gate browsing behind /link.

export interface EventSummary {
  id: string;
  slug: string; // never null in the wire shape; falls back to id when CMS slug is missing
  title: string;
  starts_at: string;
  location: string | null;
  country: string;
  registration_open: boolean;
  // aiqadam#287 — present only when the caller passed ?tg_user_id=.
  // Absent (omitted from JSON) for anonymous browse → backward compatible.
  is_registered?: boolean;
  registration_id?: string;
  // aiqadam#323 — operator-tagged topic slugs from the curated taxonomy
  // (GET /v1/telegram/event-topics). Empty/absent = untagged. Bot uses
  // these to render chips + the ?topic= filter chip selection.
  topics?: string[];
  // aiqadam#326 PR-b — locale the response was served in. Present when
  // the request carried Accept-Language and we substituted from
  // events.translations. Always 'en' for the base path (no
  // substitution). Absent on listOpenEvents results when no
  // Accept-Language was passed (backwards compatibility).
  locale?: string;
}

// Directus row shape — narrow to the fields we read.
// registration_open is optional because PR-1.2a added the column with
// default=true; rows that pre-date the field appear as undefined.
export interface EventRow {
  id: string;
  slug: string | null;
  title: string;
  starts_at: string;
  location: string | null;
  country: string;
  status: string;
  visibility_scope: string | null;
  capacity: number | null;
  registration_open?: boolean | null;
  // aiqadam#323 — JSON array of topic slugs from the curated taxonomy.
  topic_tags?: string[] | null;
  // aiqadam#326 — per-locale subobject map. Operator-set via Directus.
  // Read path picks the requested locale's subobject + substitutes
  // matching keys into the top-level wire shape.
  translations?: Record<string, EventTranslation> | null;
}

// aiqadam#326 — per-locale translation shape on events.translations.
// Every key is optional; missing keys fall back to the base row.
export interface EventTranslation {
  title?: string;
  description?: string;
  short_description?: string;
}

// aiqadam#290 — bot-side filter chips. All optional; combinable (AND).
// `format` matches the existing events.format column (FK to event_types.key,
// e.g. "meetup", "workshop", "conference"). The bot pulls the live list
// of formats from the result set rather than hardcoding values — same
// approach as for any future `topic` field (currently deferred to a
// separate PR that adds the schema column + cabinet support).
export interface ListEventsFilters {
  tenant: string | null;
  tgUserId: bigint | null;
  from: string | null; // ISO date, inclusive lower bound on starts_at
  to: string | null; // ISO date, inclusive upper bound on starts_at (end-of-day)
  format: string | null; // event_types.key
  openOnly: boolean; // when true, filter to registration_open=true
  limit: number; // 1..50, default 50
  // aiqadam#288 — substring match across title/description/short_description
  // (Directus _icontains). Combinable with all other filters. Speaker name
  // matching deferred to #291.
  q: string | null;
  // aiqadam#323 — filter to events whose `topic_tags` jsonb array
  // contains this slug. Single slug only (not multi-select); operators
  // tag with the curated taxonomy (see TelegramEventTopicsService).
  topic: string | null;
  // aiqadam#326 PR-b — requested locale from Accept-Language. If the
  // event's translations[locale] has matching keys, top-level fields
  // get substituted. null = no substitution (base 'en' served).
  locale: string | null;
}

// aiqadam#326 PR-b — supported display locales for substitution.
// Subset of the bot's SUPPORTED_LANGUAGES (en/ru/uz) — operators
// can populate any of these in events.translations and the bot
// can request via Accept-Language. Unrecognised values silently
// fall through to 'en' (base).
export const I18N_SUPPORTED_LOCALES = ['en', 'ru', 'uz'] as const;
export type I18nLocale = (typeof I18N_SUPPORTED_LOCALES)[number];

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 50;

// aiqadam#279 — rich event detail surface (Telegram bot "📖 Details" tap).
// Adds the editorial/CMS fields on top of EventSummary; everything past
// description is OPTIONAL so the bot's pydantic model tolerates partial
// data (events with no hero image / no confirmed speakers / no online URL).
export interface EventDetailSpeaker {
  name: string;
  title: string | null;
}

// aiqadam#293 — multi-item media gallery. Drives sendMediaGroup on the
// bot (Telegram albums, 2-10 items per group) and the public event
// page gallery. Operators supply URLs (Directus assets or allow-listed
// CDN); validation runs at upload time, this layer trusts the column.
export type EventMediaKind = 'photo' | 'video' | 'animation' | 'document';
export interface EventMediaItem {
  kind: EventMediaKind;
  url: string;
  caption?: string;
  thumbnail_url?: string;
  order: number;
}

export interface EventDetail extends EventSummary {
  description: string;
  short_description?: string;
  venue?: string;
  hero_image_url?: string;
  online_meeting_url?: string;
  capacity_total?: number;
  capacity_taken: number;
  speakers?: EventDetailSpeaker[];
  media?: EventMediaItem[];
  web_url: string;
  // #322 — operator-set post-event feedback survey. Bot renders an
  // inline button labelled `feedback_survey_label` (default
  // "📝 Leave feedback") pointing at `feedback_survey_url` when both
  // are set + the event has ended. Cron-fired post-event push that
  // carries this button is deferred to #294.
  feedback_survey_url?: string;
  feedback_survey_label?: string;
}

// Extended Directus row — wraps EventRow with the editorial columns
// needed for the detail surface. hero_image is a UUID FK to
// directus_files; we synthesize the public URL via DIRECTUS_URL/assets/.
interface EventDetailRow extends EventRow {
  description: string;
  short_description: string | null;
  venue: string | null;
  hero_image: string | null;
  online_meeting_url: string | null;
  // aiqadam#293 — raw jsonb. We narrow + filter the array before
  // exposing on the wire (sanitizeMediaItems) so a malformed operator
  // entry doesn't break the bot's pydantic parsing.
  media: unknown;
  // #322
  feedback_survey_url: string | null;
  feedback_survey_label: string | null;
}

// Directus speaker join shape — the deep-fetch reaches across the
// event_speakers junction into the speaker's directus_users row for
// the display name. headline is the operator-curated one-liner shown
// next to the name in the bot (falls back to talk_title when null).
interface DirectusSpeakerJoinRow {
  talk_title: string | null;
  speaker: {
    headline: string | null;
    user: {
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    } | null;
  } | null;
}

@Injectable()
export class TelegramEventsService {
  private readonly logger = new Logger(TelegramEventsService.name);

  constructor(private readonly directus: DirectusClient) {}

  // Returns events with status=published, visibility_scope=public, and
  // starts_at in the future. All other filters optional (per
  // aiqadam#290 contract). Ordered by starts_at ASC so the bot can
  // render upcoming-soonest first.
  //
  // aiqadam#287 — when tgUserId is provided, each event is annotated with
  // is_registered + (when registered) registration_id so the bot can render
  // a ✅ Registered badge inline + short-circuit the Register tap before the
  // user fills the form again. One extra Directus query per call regardless
  // of how many events; no N+1.
  async listOpenEvents(filters: Partial<ListEventsFilters> = {}): Promise<EventSummary[]> {
    const {
      tenant = null,
      tgUserId = null,
      from = null,
      to = null,
      format = null,
      openOnly = false,
      limit = DEFAULT_LIMIT,
      q = null,
      topic = null,
      locale = null,
    } = filters;

    const filterParts: string[] = [
      'filter[status][_eq]=published',
      'filter[visibility_scope][_eq]=public',
      `filter[starts_at][_gt]=${encodeURIComponent(new Date().toISOString())}`,
    ];
    if (tenant) {
      filterParts.push(`filter[country][_eq]=${encodeURIComponent(tenant)}`);
    }
    // aiqadam#290 — `from` is interpreted as ≥ midnight UTC of that date.
    // Operators who want tz-aware filtering can stick to the default
    // (server-now lower bound). Bot UX typically passes "today" anyway.
    if (from) {
      filterParts.push(`filter[starts_at][_gte]=${encodeURIComponent(`${from}T00:00:00.000Z`)}`);
    }
    if (to) {
      // Inclusive upper bound — end-of-day UTC. Matches Directus's
      // _lte semantics + the documented behavior in the issue.
      filterParts.push(`filter[starts_at][_lte]=${encodeURIComponent(`${to}T23:59:59.999Z`)}`);
    }
    if (format) {
      filterParts.push(`filter[format][_eq]=${encodeURIComponent(format)}`);
    }
    if (openOnly) {
      filterParts.push('filter[registration_open][_eq]=true');
    }
    // aiqadam#288 — substring match across title/description/short_description.
    // Directus collapses these into an OR group; combined with the other
    // top-level filters with AND semantics (status=published etc. still apply).
    // Whitespace-trimmed; empty / null = no-op.
    const qTrimmed = q?.trim() ?? '';
    if (qTrimmed.length > 0) {
      const encQ = encodeURIComponent(qTrimmed);
      filterParts.push(`filter[_or][0][title][_icontains]=${encQ}`);
      filterParts.push(`filter[_or][1][description][_icontains]=${encQ}`);
      filterParts.push(`filter[_or][2][short_description][_icontains]=${encQ}`);
    }
    // aiqadam#323 — JSON array contains. Directus's _contains on a
    // jsonb column compares as substring of the JSON text, which is
    // close enough for slug-shaped tokens (no embedded JSON syntax in
    // operator-curated slugs from KNOWN_EVENT_TOPICS).
    const topicTrimmed = topic?.trim() ?? '';
    if (topicTrimmed.length > 0) {
      filterParts.push(`filter[topic_tags][_contains]=${encodeURIComponent(topicTrimmed)}`);
    }
    const cappedLimit = Math.min(Math.max(limit, 1), MAX_LIMIT);
    const query = [
      ...filterParts,
      'fields=id,slug,title,starts_at,location,country,status,visibility_scope,capacity,registration_open,topic_tags,translations',
      'sort=starts_at',
      `limit=${cappedLimit}`,
    ].join('&');

    const res = await this.directus.get<{ data: EventRow[] }>(`/items/events?${query}`);
    // aiqadam#326 PR-b — Pick locale once, apply per-row. resolvedLocale
    // is what we picked (requested if matches available, else 'en').
    const resolvedLocale = pickLocale(locale);
    const items = res.data.map((r) => applySummaryI18n(rowToSummary(r), r, resolvedLocale));
    if (tgUserId === null || items.length === 0) {
      return items;
    }

    const regByEvent = await this.fetchRegistrationsByTgUser(
      items.map((e) => e.id),
      tgUserId,
    );
    return items.map((e) => {
      const reg = regByEvent.get(e.id);
      if (reg) {
        e.is_registered = true;
        e.registration_id = reg;
      } else {
        e.is_registered = false;
      }
      return e;
    });
  }

  // aiqadam#279 — rich event detail. Same anonymous-browse posture as
  // listOpenEvents (no /link required); the bot calls this on the
  // "📖 Details" inline button. tgUserId is optional and only used to
  // annotate is_registered + registration_id (same pattern as #287).
  //
  // 404 with { error: 'event_not_found' } when the slug/id doesn't
  // match anything published. Draft / cancelled / private events 404
  // too — we don't leak existence by status.
  async getEventDetail(
    slugOrId: string,
    tgUserId?: bigint | null,
    locale?: string | null,
  ): Promise<EventDetail> {
    const row = await this.findPublishedEventBySlugOrId(slugOrId);
    if (!row) {
      throw new NotFoundException({ error: 'event_not_found' });
    }

    // Fire enrichment fetches in parallel — speakers + taken-count are
    // independent of the registration lookup. Failures degrade
    // gracefully (empty speakers, taken=0) rather than 500ing the
    // whole detail call; the bot's UX matters more than a perfect count.
    const [speakers, capacityTaken, tgReg] = await Promise.all([
      this.fetchConfirmedSpeakers(row.id),
      this.fetchTakenCount(row.id),
      tgUserId == null ? Promise.resolve(null) : this.fetchOneRegistration(row.id, tgUserId),
    ]);

    // aiqadam#326 PR-b — substitute translated fields when requested.
    const resolvedLocale = pickLocale(locale ?? null);
    const baseDetail = assembleEventDetail(row, {
      speakers,
      capacityTaken,
      tgUserId: tgUserId ?? null,
      tgReg,
    });
    return applyDetailI18n(baseDetail, row, resolvedLocale);
  }

  // Slug-or-id resolver with the published/public/non-cancelled guard
  // pre-applied so the detail view doesn't leak unpublished rows. Mirrors
  // the slug-then-id fallback in telegram-registration-schema.service.ts.
  private async findPublishedEventBySlugOrId(slugOrId: string): Promise<EventDetailRow | null> {
    const fields =
      'fields=id,slug,title,starts_at,location,country,status,visibility_scope,capacity,registration_open,description,short_description,venue,hero_image,online_meeting_url,media,feedback_survey_url,feedback_survey_label,topic_tags,translations';
    const guards = 'filter[status][_eq]=published&filter[visibility_scope][_eq]=public';
    const encoded = encodeURIComponent(slugOrId);

    const bySlug = await this.directus.get<{ data: EventDetailRow[] }>(
      `/items/events?${guards}&filter[slug][_eq]=${encoded}&${fields}&limit=1`,
    );
    if (bySlug.data[0]) return bySlug.data[0];

    // UUID fallback — only attempt when the input matches uuid shape
    // (Directus 400s on filter[id][_eq] with a non-uuid string).
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId)) {
      return null;
    }
    const byId = await this.directus.get<{ data: EventDetailRow[] }>(
      `/items/events?${guards}&filter[id][_eq]=${encoded}&${fields}&limit=1`,
    );
    return byId.data[0] ?? null;
  }

  // event_speakers JOIN — only confirmed speakers (operators move through
  // invited→accepted→confirmed; surfacing pre-confirmed names would leak
  // operator-internal state). Sort by order_index so the operator's curated
  // display order survives. Failures fall back to an empty list.
  private async fetchConfirmedSpeakers(eventId: string): Promise<EventDetailSpeaker[]> {
    const query = [
      `filter[event][_eq]=${encodeURIComponent(eventId)}`,
      'filter[status][_eq]=confirmed',
      'fields=talk_title,speaker.headline,speaker.user.first_name,speaker.user.last_name,speaker.user.email',
      'sort=order_index',
      'limit=50',
    ].join('&');
    try {
      const res = await this.directus.get<{ data: DirectusSpeakerJoinRow[] }>(
        `/items/event_speakers?${query}`,
      );
      const out: EventDetailSpeaker[] = [];
      for (const row of res.data) {
        const name = speakerDisplayName(row);
        if (!name) continue;
        out.push({ name, title: speakerTitle(row) });
      }
      return out;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`fetchConfirmedSpeakers failed for event=${eventId}: ${reason}`);
      return [];
    }
  }

  // Directus aggregate query — `aggregate[count]=*` returns a single
  // row with the count under .count. Excludes cancelled so the bot's
  // "going" surface matches the website's counter (per #274 convention).
  private async fetchTakenCount(eventId: string): Promise<number> {
    const query = [
      `filter[event][_eq]=${encodeURIComponent(eventId)}`,
      'filter[status][_neq]=cancelled',
      'aggregate[count]=*',
    ].join('&');
    try {
      const res = await this.directus.get<{ data: Array<{ count: string | number }> }>(
        `/items/registrations?${query}`,
      );
      const raw = res.data[0]?.count;
      const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : (raw ?? 0);
      return Number.isFinite(n) ? n : 0;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`fetchTakenCount failed for event=${eventId}: ${reason}`);
      return 0;
    }
  }

  // Single-event variant of fetchRegistrationsByTgUser. Returns the
  // registration id or null. Used by detail to annotate is_registered.
  //
  // #328 — DON'T filter on registrations.telegram_user_id (drifts on
  // silent-email-match path; see telegram-me.service.ts comment).
  // Deep-filter through user.telegram_user_id instead.
  private async fetchOneRegistration(eventId: string, tgUserId: bigint): Promise<string | null> {
    const query = [
      `filter[user][telegram_user_id][_eq]=${encodeURIComponent(tgUserId.toString())}`,
      `filter[event][_eq]=${encodeURIComponent(eventId)}`,
      'filter[status][_neq]=cancelled',
      'fields=id',
      'limit=1',
    ].join('&');
    try {
      const res = await this.directus.get<{ data: Array<{ id: string }> }>(
        `/items/registrations?${query}`,
      );
      return res.data[0]?.id ?? null;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(
        `fetchOneRegistration failed for event=${eventId} tg=${tgUserId}: ${reason}`,
      );
      return null;
    }
  }

  // Single-query annotation: GET /items/registrations filtered to the
  // (tg_user_id, event ∈ ids) tuple. Excludes status='cancelled' so a
  // user who cancelled can re-register (UX matches the "going" counter).
  //
  // #328 — Deep-filter via user.telegram_user_id (canonical) rather
  // than the denormalized registrations.telegram_user_id column.
  private async fetchRegistrationsByTgUser(
    eventIds: string[],
    tgUserId: bigint,
  ): Promise<Map<string, string>> {
    const t = encodeURIComponent(tgUserId.toString());
    const ids = eventIds.map(encodeURIComponent).join(',');
    const query = [
      `filter[user][telegram_user_id][_eq]=${t}`,
      `filter[event][_in]=${ids}`,
      'filter[status][_neq]=cancelled',
      'fields=id,event',
      'limit=50',
    ].join('&');
    try {
      const res = await this.directus.get<{ data: Array<{ id: string; event: string }> }>(
        `/items/registrations?${query}`,
      );
      const m = new Map<string, string>();
      for (const row of res.data) {
        m.set(row.event, row.id);
      }
      return m;
    } catch (err) {
      // Best-effort enrichment — a failure here returns the events
      // un-annotated rather than breaking the whole browse. Bot's UX
      // gracefully degrades to the conflict-on-POST flow.
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`fetchRegistrationsByTgUser failed for tg_uid=${tgUserId}: ${reason}`);
      return new Map();
    }
  }
}

// aiqadam#279 — pure assembly of the rich EventDetail wire shape.
// Extracted from getEventDetail so the orchestration method stays under
// the cognitive-complexity budget; this function does no I/O, just maps
// the row + enrichment results into the bot's pydantic shape (optional
// fields omitted when null/empty so the bot doesn't render blank chips).
interface DetailEnrichment {
  speakers: EventDetailSpeaker[];
  capacityTaken: number;
  tgUserId: bigint | null;
  tgReg: string | null;
}
export function assembleEventDetail(
  row: EventDetailRow,
  enrichment: DetailEnrichment,
): EventDetail {
  const summary = rowToSummary(row);
  const slugForUrl = row.slug && row.slug.length > 0 ? row.slug : row.id;
  const detail: EventDetail = {
    ...summary,
    description: row.description,
    capacity_taken: enrichment.capacityTaken,
    web_url: `${env.WEB_BASE_URL.replace(/\/$/, '')}/events/${encodeURIComponent(slugForUrl)}`,
  };
  Object.assign(detail, pickEditorialFields(row));
  if (enrichment.speakers.length > 0) detail.speakers = enrichment.speakers;
  if (enrichment.tgUserId != null) {
    detail.is_registered = enrichment.tgReg != null;
    if (enrichment.tgReg) detail.registration_id = enrichment.tgReg;
  }
  return detail;
}

// Optional editorial fields lifted out of assembleEventDetail to keep the
// cognitive-complexity budget — null/empty Directus columns get omitted
// from the wire shape entirely (the bot's pydantic model treats absent
// keys differently from explicit nulls).
function pickEditorialFields(row: EventDetailRow): Partial<EventDetail> {
  const out: Partial<EventDetail> = {};
  if (row.short_description) out.short_description = row.short_description;
  if (row.venue) out.venue = row.venue;
  if (row.hero_image) {
    out.hero_image_url = `${env.DIRECTUS_URL.replace(/\/$/, '')}/assets/${encodeURIComponent(row.hero_image)}`;
  }
  if (row.online_meeting_url) out.online_meeting_url = row.online_meeting_url;
  if (row.capacity != null) out.capacity_total = row.capacity;
  const media = sanitizeMediaItems(row.media);
  if (media.length > 0) out.media = media;
  // #322 — surface the survey only when the URL is set. Label defaults
  // to the Directus column's default ("📝 Leave feedback") OR an
  // operator override; we pass it through verbatim and let the bot
  // fall back on null.
  if (row.feedback_survey_url) {
    out.feedback_survey_url = row.feedback_survey_url;
    if (row.feedback_survey_label) out.feedback_survey_label = row.feedback_survey_label;
  }
  return out;
}

// aiqadam#293 — narrow + filter the raw jsonb. Drops items missing
// the required keys (kind, url) or with an unknown kind, and stable-sorts
// by `order` so the operator's curated sequence survives. Returns an
// empty array (rather than throwing) on any unexpected shape so a
// malformed cabinet edit can't 500 the whole detail call.
const VALID_MEDIA_KINDS: ReadonlySet<EventMediaKind> = new Set([
  'photo',
  'video',
  'animation',
  'document',
]);
export function sanitizeMediaItems(raw: unknown): EventMediaItem[] {
  if (!Array.isArray(raw)) return [];
  const out: EventMediaItem[] = [];
  for (const entry of raw) {
    const item = parseMediaItem(entry, out.length);
    if (item) out.push(item);
  }
  out.sort((a, b) => a.order - b.order);
  return out;
}

// Single-item parser — extracted from sanitizeMediaItems to keep the
// outer loop within the cognitive-complexity budget. Returns null when
// the entry fails any required-field check (drops silently — operator
// edits land in the cabinet first, the bot shouldn't 500 on a typo).
function parseMediaItem(entry: unknown, fallbackOrder: number): EventMediaItem | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const e = entry as Record<string, unknown>;
  if (!isValidKind(e.kind) || !isNonEmptyString(e.url)) return null;
  const item: EventMediaItem = {
    kind: e.kind,
    url: e.url,
    order: typeof e.order === 'number' ? e.order : fallbackOrder,
  };
  if (isNonEmptyString(e.caption)) item.caption = e.caption;
  if (isNonEmptyString(e.thumbnail_url)) item.thumbnail_url = e.thumbnail_url;
  return item;
}

function isValidKind(v: unknown): v is EventMediaKind {
  return typeof v === 'string' && VALID_MEDIA_KINDS.has(v as EventMediaKind);
}
function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

// aiqadam#279 — speaker display helpers (exported for tests). Operators
// can leave the directus_users name fields empty during invite (the
// speaker is a placeholder until they accept the calendar invite); we
// fall back through "first + last" → "first" → "last" → email-local
// rather than render a blank chip. Returns null when nothing usable
// exists, which the caller filters out.
export function speakerDisplayName(row: DirectusSpeakerJoinRow): string | null {
  const u = row.speaker?.user;
  if (!u) return null;
  const first = u.first_name?.trim() ?? '';
  const last = u.last_name?.trim() ?? '';
  const fromName = [first, last].filter((s) => s.length > 0).join(' ');
  if (fromName) return fromName;
  const local = u.email?.split('@')[0]?.trim();
  return local && local.length > 0 ? local : null;
}

// Title prefers the operator-curated headline (speakers.headline) since
// it's tuned for "this person, this audience"; falls back to the
// per-event talk_title for placeholder speakers that don't have a
// headline filled in yet.
export function speakerTitle(row: DirectusSpeakerJoinRow): string | null {
  const headline = row.speaker?.headline?.trim();
  if (headline) return headline;
  const talk = row.talk_title?.trim();
  return talk && talk.length > 0 ? talk : null;
}

// Visible for unit tests. Falls back to id when slug is null — bot
// clients require slug as non-null per their pydantic contract, and
// the schema-fetch endpoint (PR-1.2b) accepts both shapes.
//
// registration_open reads from the new column added in PR-1.2a;
// undefined / null defaults to true (consistent with the column default
// and the PR-4 hardcoded behavior).
export function rowToSummary(row: EventRow): EventSummary {
  const out: EventSummary = {
    id: row.id,
    slug: row.slug && row.slug.length > 0 ? row.slug : row.id,
    title: row.title,
    starts_at: row.starts_at,
    location: row.location,
    country: row.country,
    registration_open: row.registration_open ?? true,
  };
  // aiqadam#323 — surface topic_tags as the cleaner wire name `topics`.
  // Omit the key entirely when the column is null/empty so the bot's
  // pydantic distinguishes "untagged" from "missing array" cleanly.
  if (Array.isArray(row.topic_tags) && row.topic_tags.length > 0) {
    out.topics = row.topic_tags.filter((t): t is string => typeof t === 'string');
  }
  return out;
}

// ─── aiqadam#326 PR-b — i18n helpers ──────────────────────────────────────

// Pick the locale we'll serve. v1: requested-or-en, no per-country
// fallback (tenant-default lookup is a small follow-up; the plan
// doc calls it out). Normalisation: 'ru,en;q=0.9' → 'ru'; unknown
// codes → 'en'. Exported for the controller's Accept-Language parser.
export function pickLocale(requested: string | null): I18nLocale {
  if (!requested) return 'en';
  // Accept-Language can be 'ru', 'ru-RU', 'ru;q=0.9', 'ru,en;q=0.9'.
  // Take the first comma-segment, strip q-suffix + region, lowercase.
  const head = requested.split(',')[0]?.split(';')[0]?.trim().toLowerCase() ?? '';
  const lang = head.split('-')[0] ?? '';
  return (I18N_SUPPORTED_LOCALES as readonly string[]).includes(lang) ? (lang as I18nLocale) : 'en';
}

// aiqadam#326 PR-b — substitute matching keys from
// events.translations[locale] into the summary's wire-level fields.
// EventSummary only carries `title` from the i18n-eligible set.
// Always sets `locale` on the result so the client knows what it got.
export function applySummaryI18n(
  summary: EventSummary,
  row: EventRow,
  locale: I18nLocale,
): EventSummary {
  const out = { ...summary, locale };
  const t = pickTranslation(row, locale);
  if (t?.title) out.title = t.title;
  return out;
}

// EventDetail variant — handles title + description + short_description.
// `row` is loosely typed (EventRow + the i18n-eligible columns) so the
// helper stays exportable without leaking the private EventDetailRow.
export function applyDetailI18n(
  detail: EventDetail,
  row: EventRow & { description?: string; short_description?: string | null },
  locale: I18nLocale,
): EventDetail {
  const out = { ...detail, locale };
  const t = pickTranslation(row, locale);
  if (!t) return out;
  if (t.title) out.title = t.title;
  if (t.description) out.description = t.description;
  if (t.short_description !== undefined) out.short_description = t.short_description;
  return out;
}

// Lookup the per-locale subobject, defensive against bad data shapes
// from the operator (the Directus column is `json` — anything goes).
function pickTranslation(
  row: { translations?: Record<string, EventTranslation> | null },
  locale: I18nLocale,
): EventTranslation | null {
  if (locale === 'en') return null; // base row already serves 'en'
  const all = row.translations;
  if (!all || typeof all !== 'object') return null;
  const t = all[locale];
  if (!t || typeof t !== 'object') return null;
  return t;
}
