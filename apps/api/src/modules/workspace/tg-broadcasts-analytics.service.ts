import { Inject, Injectable } from '@nestjs/common';
import { like, sql } from 'drizzle-orm';
import { DB, type Db } from '../../db';
import { tgSendLog } from '../telegram/schema';

// #294 PR-e — send-history analytics for tg_broadcasts.
//
// delivery_key shape is `bdc:${broadcast_id}:${user_id}` (PR-d). We
// aggregate tg_send_log rows by outcome for that prefix to get per-
// broadcast delivery stats. The notifier writes to tg_send_log via
// POST /v1/telegram/audit — see telegram.service.recordSendAudit.
//
// Outcomes (from telegram.service.SEND_OUTCOMES):
//   sent | opted_out | blocked | bad_request | retry | expired | unknown_error
//
// We surface: delivered, opted_out, failed (everything else).

export interface BroadcastAnalytics {
  broadcast_id: string;
  delivered: number; // outcome=sent
  opted_out: number; // outcome=opted_out (user blocked bot or unsubscribed)
  failed: number; // bad_request | blocked | expired | unknown_error
  pending: number; // retry rows that haven't resolved yet
  total_audited: number;
}

@Injectable()
export class TgBroadcastsAnalyticsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async get(broadcastId: string): Promise<BroadcastAnalytics> {
    const prefix = `bdc:${broadcastId}:%`;
    // GROUP BY outcome with the LIKE-prefix filter. tg_send_log has an
    // index on delivery_key (UNIQUE); LIKE 'prefix%' uses the index.
    const rows = await this.db
      .select({
        outcome: tgSendLog.outcome,
        count: sql<string>`count(*)::text`,
      })
      .from(tgSendLog)
      .where(like(tgSendLog.deliveryKey, prefix))
      .groupBy(tgSendLog.outcome);

    return rowsToAnalytics(broadcastId, rows);
  }
}

// ─── Pure helper (exported for tests) ────────────────────────────────────

export function rowsToAnalytics(
  broadcastId: string,
  rows: Array<{ outcome: string; count: string | number }>,
): BroadcastAnalytics {
  let delivered = 0;
  let opted_out = 0;
  let failed = 0;
  let pending = 0;
  let total_audited = 0;
  for (const r of rows) {
    const n = Number(r.count);
    total_audited += n;
    if (r.outcome === 'sent') delivered += n;
    else if (r.outcome === 'opted_out') opted_out += n;
    else if (r.outcome === 'retry') pending += n;
    else failed += n; // bad_request, blocked, expired, unknown_error
  }
  return { broadcast_id: broadcastId, delivered, opted_out, failed, pending, total_audited };
}
