import { Injectable, Logger } from '@nestjs/common';
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

  // Single-query annotation: GET /items/registrations filtered to the
  // (tg_user_id, event ∈ ids) tuple. Excludes status='cancelled' so a
  // user who cancelled can re-register (UX matches the "going" counter).
  private async fetchRegistrationsByTgUser(
    eventIds: string[],
    tgUserId: bigint,
  ): Promise<Map<string, string>> {
    const t = encodeURIComponent(tgUserId.toString());
    const ids = eventIds.map(encodeURIComponent).join(',');
    const query = [
      `filter[telegram_user_id][_eq]=${t}`,
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
