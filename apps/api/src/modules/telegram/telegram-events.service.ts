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
  // + topic-tag matching deferred to a separate PR (speakers as first-class
  // is #291; topics need a new column too).
  q: string | null;
}

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
    const cappedLimit = Math.min(Math.max(limit, 1), MAX_LIMIT);
    const query = [
      ...filterParts,
      'fields=id,slug,title,starts_at,location,country,status,visibility_scope,capacity,registration_open',
      'sort=starts_at',
      `limit=${cappedLimit}`,
    ].join('&');

    const res = await this.directus.get<{ data: EventRow[] }>(`/items/events?${query}`);
    const items = res.data.map(rowToSummary);
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
  async getEventDetail(slugOrId: string, tgUserId?: bigint | null): Promise<EventDetail> {
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

    return assembleEventDetail(row, { speakers, capacityTaken, tgUserId: tgUserId ?? null, tgReg });
  }

  // Slug-or-id resolver with the published/public/non-cancelled guard
  // pre-applied so the detail view doesn't leak unpublished rows. Mirrors
  // the slug-then-id fallback in telegram-registration-schema.service.ts.
  private async findPublishedEventBySlugOrId(slugOrId: string): Promise<EventDetailRow | null> {
    const fields =
      'fields=id,slug,title,starts_at,location,country,status,visibility_scope,capacity,registration_open,description,short_description,venue,hero_image,online_meeting_url,media';
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
  return {
    id: row.id,
    slug: row.slug && row.slug.length > 0 ? row.slug : row.id,
    title: row.title,
    starts_at: row.starts_at,
    location: row.location,
    country: row.country,
    registration_open: row.registration_open ?? true,
  };
}
