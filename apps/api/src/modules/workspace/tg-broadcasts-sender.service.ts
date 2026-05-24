import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { DB, type Db } from '../../db';
import { DirectusClient } from '../directus/directus.client';
import { OutboxPublisher } from '../telegram/outbox-publisher.service';
import {
  type BroadcastButton,
  type BroadcastDetail,
  TgBroadcastsService,
} from './tg-broadcasts.service';
import { TgSegmentsService, buildResolverFilter } from './tg-segments.service';

// #294 PR-d — actually-fire-the-broadcast path.
//
// Read broadcast → read segment → resolve users via Directus →
// publish one tg.dispatch.v1 envelope per recipient to the outbox
// → relay loop XADDs to Redis Streams → notifier consumes + sends.
//
// Idempotency: delivery_key = `bdc:${broadcast_id}:${tg_user_id}` so
// the same broadcast can never double-send to the same user (notifier
// audit + tg_send_log UNIQUE enforces this server-side too).
//
// Status transitions:
//   draft|scheduled → sending (before enumerate)
//   sending → sent (sent_count >= 0) | failed (with failure_reason)

const TELEGRAM_STREAM = 'tg.dispatch.v1';
const MAX_RECIPIENTS = 50_000; // safety cap — bigger sends need ops chat
const USERS_PAGE_SIZE = 200;

export interface SendNowResult {
  broadcast_id: string;
  sent_count: number;
  skipped_count: number;
  sent_at: string;
}

interface RecipientRow {
  id: string; // directus_users.id
  telegram_user_id: string | number | null;
  tenant?: string | null;
  country?: string | null;
}

@Injectable()
export class TgBroadcastsSenderService {
  private readonly logger = new Logger(TgBroadcastsSenderService.name);

  constructor(
    private readonly directus: DirectusClient,
    private readonly broadcasts: TgBroadcastsService,
    private readonly segments: TgSegmentsService,
    private readonly outbox: OutboxPublisher,
    @Inject(DB) private readonly db: Db,
  ) {}

  async sendNow(broadcastId: string): Promise<SendNowResult> {
    const bdc = await this.broadcasts.get(broadcastId);
    if (bdc.status === 'sent') {
      throw new BadRequestException({ error: 'already_sent', sent_at: bdc.sent_at });
    }
    if (bdc.status === 'sending') {
      throw new BadRequestException({ error: 'in_progress' });
    }
    if (bdc.status === 'failed') {
      // PR-d v1: don't auto-retry. Operator must explicitly reset to
      // draft (edit handler clears failure_reason) and re-send.
      throw new BadRequestException({
        error: 'previous_send_failed',
        reason: bdc.failure_reason,
      });
    }
    if (!bdc.audience_segment) {
      throw new BadRequestException({ error: 'no_audience_segment' });
    }
    if (!bdc.html_body || bdc.html_body.length === 0) {
      throw new BadRequestException({ error: 'empty_body' });
    }

    // Flip status to sending FIRST so concurrent send-now attempts on
    // the same row 409 via the in_progress check above. We go direct
    // to Directus (bypassing TgBroadcastsService.update's draft|scheduled
    // editability guard, which exists to gate cabinet edits).
    await this.markSending(broadcastId);

    try {
      const result = await this.enumerateAndDispatch(bdc);
      await this.markSent(broadcastId, result.sent_count);
      return {
        broadcast_id: broadcastId,
        sent_count: result.sent_count,
        skipped_count: result.skipped_count,
        sent_at: new Date().toISOString(),
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.error(`broadcast send failed broadcast=${broadcastId}: ${reason}`);
      await this.markFailed(broadcastId, reason.slice(0, 1000));
      throw err;
    }
  }

  // sendDue() — used by the scheduler cron. Picks scheduled rows
  // where scheduled_at <= now AND status='scheduled', sends each.
  async sendDue(): Promise<{ tick_count: number; results: SendNowResult[] }> {
    const nowIso = new Date().toISOString();
    const query = [
      'filter[status][_eq]=scheduled',
      `filter[scheduled_at][_lte]=${encodeURIComponent(nowIso)}`,
      'fields=id',
      'limit=50',
    ].join('&');
    const res = await this.directus.get<{ data: Array<{ id: string }> }>(
      `/items/tg_broadcasts?${query}`,
    );
    const results: SendNowResult[] = [];
    for (const row of res.data) {
      try {
        const r = await this.sendNow(row.id);
        results.push(r);
      } catch (err) {
        // Log + continue — one broadcast's failure shouldn't block the
        // rest of the tick. sendNow already wrote failure_reason.
        const reason = err instanceof Error ? err.message : 'unknown';
        this.logger.warn(`sendDue: broadcast=${row.id} failed: ${reason}`);
      }
    }
    return { tick_count: res.data.length, results };
  }

  private async markSending(id: string): Promise<void> {
    await this.directus.patch(`/items/tg_broadcasts/${encodeURIComponent(id)}`, {
      status: 'sending',
    });
  }

  private async markSent(id: string, sent_count: number): Promise<void> {
    await this.directus.patch(`/items/tg_broadcasts/${encodeURIComponent(id)}`, {
      status: 'sent',
      sent_at: new Date().toISOString(),
      sent_count,
    });
  }

  private async markFailed(id: string, reason: string): Promise<void> {
    await this.directus.patch(`/items/tg_broadcasts/${encodeURIComponent(id)}`, {
      status: 'failed',
      failure_reason: reason,
    });
  }

  private async enumerateAndDispatch(bdc: BroadcastDetail): Promise<{
    sent_count: number;
    skipped_count: number;
  }> {
    if (!bdc.audience_segment) {
      throw new BadRequestException({ error: 'no_audience_segment' });
    }
    const segment = await this.segments.get(bdc.audience_segment);
    const filter = buildResolverFilter(segment.criteria, segment.country);
    let sent = 0;
    let skipped = 0;
    let page = 1;
    while (sent + skipped < MAX_RECIPIENTS) {
      const recipients = await this.fetchRecipientsPage(filter, page);
      if (recipients.length === 0) break;
      for (const r of recipients) {
        if (sent + skipped >= MAX_RECIPIENTS) break;
        const enqueued = await this.publishOne(bdc, r);
        if (enqueued) sent += 1;
        else skipped += 1;
      }
      if (recipients.length < USERS_PAGE_SIZE) break;
      page += 1;
    }
    return { sent_count: sent, skipped_count: skipped };
  }

  private async fetchRecipientsPage(filter: unknown, page: number): Promise<RecipientRow[]> {
    const filterParam = encodeURIComponent(JSON.stringify(filter));
    const query = `fields=id,telegram_user_id,country&page=${page}&limit=${USERS_PAGE_SIZE}&filter=${filterParam}`;
    const res = await this.directus.get<{ data: RecipientRow[] }>(`/users?${query}`);
    return res.data;
  }

  // publishOne — build one envelope + insert into outbox in a tx.
  // Returns true if enqueued, false if recipient is unusable
  // (missing tg id / opted-out — defensive, the filter already
  // excludes these but a row could race-change between resolve + send).
  private async publishOne(bdc: BroadcastDetail, r: RecipientRow): Promise<boolean> {
    const chatId = parseChatId(r.telegram_user_id);
    if (chatId === null) return false;

    const envelopeId = randomUUID();
    const deliveryKey = `bdc:${bdc.id}:${r.id}`;
    const envelope = {
      schema: TELEGRAM_STREAM,
      id: envelopeId,
      occurred_at: new Date().toISOString(),
      correlation_id: randomUUID(),
      causation_id: null,
      producer: 'aiqadam-api',
      meta: { tenant: r.country ?? r.tenant ?? null, broadcast_id: bdc.id },
      payload: {
        kind: 'dm' as const,
        target: {
          chat_id: chatId,
          member_id: r.id,
          tenant: r.country ?? r.tenant ?? null,
        },
        template: {
          text: bdc.html_body,
          parse_mode: 'HTML' as const,
          disable_web_page_preview: true,
          media_url: null,
          media_kind: null,
          inline_buttons: bdc.inline_buttons.length > 0 ? buttonsToWire(bdc.inline_buttons) : null,
        },
        delivery_key: deliveryKey,
        max_retries: 5,
        expires_at: null,
      },
    };
    try {
      await this.db.transaction(async (tx) => {
        await this.outbox.publish(tx, {
          envelopeId,
          stream: TELEGRAM_STREAM,
          payload: envelope,
        });
      });
      return true;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`publishOne failed broadcast=${bdc.id} user=${r.id}: ${reason}`);
      return false;
    }
  }
}

// ─── Helpers (exported for tests) ────────────────────────────────────────

// telegram_user_id comes back from Directus as a number (small) OR
// string (when bigint). Either way we want a finite integer for the
// chat_id field on the envelope. Returns null on garbage / missing.
export function parseChatId(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

// Map BroadcastButton[] to the notifier's expected inline_buttons shape.
// Notifier expects [[{text,url}, ...], ...] — array of rows, one button
// per row for simplicity (single column). Operators who want a grid
// later get a richer schema in PR-e.
export function buttonsToWire(
  buttons: BroadcastButton[],
): Array<Array<{ text: string; url: string }>> {
  return buttons.map((b) => [{ text: b.label, url: b.url }]);
}
