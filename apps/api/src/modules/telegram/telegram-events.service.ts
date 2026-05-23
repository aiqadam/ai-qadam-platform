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
}

// Directus row shape — narrow to the fields we read.
interface EventRow {
  id: string;
  slug: string | null;
  title: string;
  starts_at: string;
  location: string | null;
  country: string;
  status: string;
  visibility_scope: string | null;
  capacity: number | null;
}

@Injectable()
export class TelegramEventsService {
  private readonly logger = new Logger(TelegramEventsService.name);

  constructor(private readonly directus: DirectusClient) {}

  // Returns events with status=published, visibility_scope=public, and
  // starts_at in the future, optionally filtered by tenant country.
  // Ordered by starts_at ASC so the bot can render upcoming-soonest first.
  async listOpenEvents(tenant: string | null): Promise<EventSummary[]> {
    const filters: string[] = [
      'filter[status][_eq]=published',
      'filter[visibility_scope][_eq]=public',
      `filter[starts_at][_gt]=${encodeURIComponent(new Date().toISOString())}`,
    ];
    if (tenant) {
      filters.push(`filter[country][_eq]=${encodeURIComponent(tenant)}`);
    }
    const query = [
      ...filters,
      'fields=id,slug,title,starts_at,location,country,status,visibility_scope,capacity',
      'sort=starts_at',
      'limit=50',
    ].join('&');

    const res = await this.directus.get<{ data: EventRow[] }>(`/items/events?${query}`);
    return res.data.map(rowToSummary);
  }
}

// Visible for unit tests. Falls back to id when slug is null — bot
// clients require slug as non-null per their pydantic contract, and
// the schema-fetch endpoint (PR-5a) accepts both shapes.
export function rowToSummary(row: EventRow): EventSummary {
  return {
    id: row.id,
    slug: row.slug && row.slug.length > 0 ? row.slug : row.id,
    title: row.title,
    starts_at: row.starts_at,
    location: row.location,
    country: row.country,
    // No capacity gating yet — the registrations table sits in Directus
    // but a cheap count query needs its own follow-up. Until then, an
    // event with status=published is registration_open. Capacity-based
    // close lands when PR-8 (cron producers) needs the same query.
    registration_open: true,
  };
}
