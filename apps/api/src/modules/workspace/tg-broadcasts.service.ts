import { Injectable, NotFoundException } from '@nestjs/common';
import { DirectusClient } from '../directus/directus.client';

// #294 PR-a — operator-authored Telegram broadcasts (read view).
//
// Producer side of the notifier (ADR-0034). PR-a ships the cabinet
// read view so operators see the Broadcasts surface as soon as the
// collection lands. PR-b adds the composer UI, PR-c segments,
// PR-d send-now + scheduler, PR-e recurring + analytics.

export type BroadcastStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';

export interface BroadcastSummary {
  id: string;
  title: string;
  country: string;
  status: BroadcastStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  sent_count: number;
  audience_segment: string | null;
  has_image: boolean;
  inline_buttons_count: number;
  created_by: string | null;
  date_created: string;
  date_updated: string | null;
}

export interface BroadcastDetail extends BroadcastSummary {
  html_body: string;
  image_asset: string | null;
  inline_buttons: BroadcastButton[];
  failure_reason: string | null;
}

export interface BroadcastButton {
  label: string;
  url: string;
}

interface BroadcastRow {
  id: string;
  title: string;
  country: string;
  status: BroadcastStatus;
  html_body: string;
  image_asset: string | null;
  inline_buttons: unknown;
  audience_segment: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  sent_count: number | null;
  failure_reason: string | null;
  created_by: string | null;
  date_created: string;
  date_updated: string | null;
}

@Injectable()
export class TgBroadcastsService {
  constructor(private readonly directus: DirectusClient) {}

  async list(filters: { country?: string | null; status?: BroadcastStatus | null } = {}): Promise<{
    items: BroadcastSummary[];
  }> {
    const { country = null, status = null } = filters;
    const parts: string[] = [
      'fields=id,title,country,status,image_asset,inline_buttons,audience_segment,scheduled_at,sent_at,sent_count,created_by,date_created,date_updated',
      'sort=-date_created',
      'limit=200',
    ];
    if (country) parts.push(`filter[country][_eq]=${encodeURIComponent(country)}`);
    if (status) parts.push(`filter[status][_eq]=${encodeURIComponent(status)}`);
    const res = await this.directus.get<{ data: BroadcastRow[] }>(
      `/items/tg_broadcasts?${parts.join('&')}`,
    );
    return { items: res.data.map(rowToSummary) };
  }

  async get(id: string): Promise<BroadcastDetail> {
    const res = await this.directus.get<{ data: BroadcastRow | null }>(
      `/items/tg_broadcasts/${encodeURIComponent(id)}?fields=*`,
    );
    if (!res.data) {
      throw new NotFoundException({ error: 'broadcast_not_found' });
    }
    return rowToDetail(res.data);
  }
}

// ─── Pure helpers (exported for tests) ───────────────────────────────────────

export function rowToSummary(row: BroadcastRow): BroadcastSummary {
  const buttons = sanitizeButtons(row.inline_buttons);
  return {
    id: row.id,
    title: row.title,
    country: row.country,
    status: row.status,
    scheduled_at: row.scheduled_at,
    sent_at: row.sent_at,
    sent_count: row.sent_count ?? 0,
    audience_segment: row.audience_segment,
    has_image: row.image_asset !== null,
    inline_buttons_count: buttons.length,
    created_by: row.created_by,
    date_created: row.date_created,
    date_updated: row.date_updated,
  };
}

export function rowToDetail(row: BroadcastRow): BroadcastDetail {
  return {
    ...rowToSummary(row),
    html_body: row.html_body,
    image_asset: row.image_asset,
    inline_buttons: sanitizeButtons(row.inline_buttons),
    failure_reason: row.failure_reason,
  };
}

// Operator-supplied JSON column — defensive narrow. Drops malformed
// rows; preserves shape order. Max 8 per Telegram's inline keyboard
// limit; truncate silently rather than erroring (PR-b composer
// validates at write time).
const MAX_INLINE_BUTTONS = 8;

export function sanitizeButtons(raw: unknown): BroadcastButton[] {
  if (!Array.isArray(raw)) return [];
  const out: BroadcastButton[] = [];
  for (const item of raw) {
    if (out.length >= MAX_INLINE_BUTTONS) break;
    if (!item || typeof item !== 'object') continue;
    const row = item as { label?: unknown; url?: unknown };
    const label = typeof row.label === 'string' ? row.label.trim() : '';
    const url = typeof row.url === 'string' ? row.url.trim() : '';
    if (!label || !url) continue;
    out.push({ label, url });
  }
  return out;
}
