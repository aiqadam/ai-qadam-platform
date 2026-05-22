import { Inject, Injectable, Logger } from '@nestjs/common';
import { count, desc, gt, isNull, sql } from 'drizzle-orm';
import { DB, type Db } from '../../db';
import {
  type HeartbeatRead,
  HeartbeatReaderService,
  type StreamMetrics,
} from './heartbeat-reader.service';
import { outbox, tgSendLog } from './schema';
import { type GetMeFn, TG_GET_ME, TgConfigService } from './tg-config.service';

// R2 PR-2 — aggregator for GET /v1/telegram/admin/status. Pulls from:
//   - tg_config (DB) — configured? bot identity?
//   - bot:heartbeat / notifier:heartbeat (Redis) — process liveness
//   - outbox (DB) — pending count + oldest age + dlq stub
//   - tg_send_log (DB) — last-24h sent/failed/opted-out counts
//   - tg.dispatch.v1 (Redis Streams) — length + XPENDING
//   - Telegram getMe (cached) — does the configured token still work?
//
// getMe cache: 60s. Cheap (the cabinet UI polls every few seconds in
// R3), avoids hammering Telegram's /bot<token>/getMe.
//
// All Redis/Telegram reads degrade gracefully — a Redis timeout or a
// Telegram outage returns stale=true / last_getMe_ok=null rather than
// failing the whole status payload.

const DISPATCH_STREAM = 'tg.dispatch.v1';
const DISPATCH_DLQ_STREAM = 'tg.dispatch.dlq';
const GETME_CACHE_TTL_MS = 60_000;
const SEND_LOG_WINDOW_SEC = 24 * 60 * 60;

// Outcomes the notifier reports. Mirror of telegram.service.ts
// SEND_OUTCOMES (not re-imported to keep status surface free of the
// existing service's deps).
const FAILED_OUTCOMES = new Set(['blocked', 'bad_request', 'unknown_error', 'expired']);

export interface RecentDeliveryRow {
  delivery_key: string;
  outcome: string;
  detail: string | null;
  created_at: string; // ISO-8601
}

// 10 most-recent rows is the cabinet's "is this working?" window —
// big enough to spot a streak of failures, small enough to render
// without paging.
export const RECENT_DELIVERIES_LIMIT = 10;
// Cap on `detail` length in the response. Stored details are bounded
// at 1024 (see telegram.controller audit schema) but the UI truncates
// to keep the table scannable; full detail is in the audit log for
// the operator who needs to dig deeper.
const DETAIL_TRUNCATE_AT = 200;

export interface StatusResponse {
  configured: boolean;
  bot: {
    id: string; // bigint as string
    username: string;
    last_getMe_ok: string | null;
  } | null;
  api_heartbeat: { service: 'api'; last_seen_at: string };
  bot_heartbeat: HeartbeatRead;
  notifier_heartbeat: HeartbeatRead;
  outbox: {
    pending: number;
    oldest_unpublished_age_sec: number | null;
    dlq_count: number;
  };
  send_log: {
    last_24h_sent: number;
    last_24h_failed: number;
    last_24h_opted_out: number;
  };
  streams: Record<string, StreamMetrics>;
}

interface GetMeCacheEntry {
  result: 'ok' | 'fail';
  at: number; // epoch ms
}

@Injectable()
export class TelegramAdminService {
  private readonly logger = new Logger(TelegramAdminService.name);
  private getMeCache: GetMeCacheEntry | undefined;
  // Cached by tenant + token hash so a re-configure invalidates
  // automatically — the new token has a different hash, so the old
  // cache entry doesn't apply to it. Token hash, not token, so the
  // cache key is never the secret itself.
  private getMeCacheKey: string | undefined;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly config: TgConfigService,
    private readonly heartbeats: HeartbeatReaderService,
    @Inject(TG_GET_ME) private readonly getMe: GetMeFn,
  ) {}

  async buildStatus(tenant: string | null): Promise<StatusResponse> {
    // Run the independent reads in parallel — DB queries, Redis, and
    // optional getMe call don't depend on each other for the status
    // payload's contents.
    const cfg = await this.config.load(tenant);
    const [botHb, notifierHb, outboxStats, sendLogStats, streamMetrics, dlqMetrics, lastGetMeOk] =
      await Promise.all([
        this.heartbeats.readBot(),
        this.heartbeats.readNotifier(),
        this.outboxStats(),
        this.sendLogStats(),
        this.heartbeats.readStream(DISPATCH_STREAM),
        this.heartbeats.readStream(DISPATCH_DLQ_STREAM),
        this.lastGetMeOk(tenant, cfg !== null),
      ]);

    return {
      configured: cfg !== null,
      bot:
        cfg === null
          ? null
          : {
              id: cfg.botId.toString(),
              username: cfg.botUsername,
              last_getMe_ok: lastGetMeOk,
            },
      api_heartbeat: { service: 'api', last_seen_at: new Date().toISOString() },
      bot_heartbeat: botHb,
      notifier_heartbeat: notifierHb,
      outbox: {
        pending: outboxStats.pending,
        oldest_unpublished_age_sec: outboxStats.oldestAgeSec,
        // DLQ length lives on the Redis side (tg.dispatch.dlq stream)
        // — there's no DB-side DLQ table in R2. Surface XLEN of the
        // DLQ stream here so operators can spot growth without
        // jumping to redis-cli.
        dlq_count: dlqMetrics.length,
      },
      send_log: sendLogStats,
      streams: {
        [DISPATCH_STREAM]: streamMetrics,
        [DISPATCH_DLQ_STREAM]: dlqMetrics,
      },
    };
  }

  // 10 most-recent rows from tg_send_log for the cabinet's delivery
  // health panel. Order is DESC on created_at so the operator sees the
  // newest activity first. `detail` is truncated server-side so we
  // don't ship a 1KB blob the UI just clips anyway.
  //
  // Tenancy: tg_send_log has no tenant column — sends are global per
  // §Q4 of ADR-0034. The `tenant` argument is reserved for future
  // per-tenant scoping (which would require a schema migration) and is
  // currently a no-op; we keep it on the signature so the
  // controller's tenant query plumbing matches the other admin
  // endpoints.
  async recentDeliveries(_tenant: string | null): Promise<RecentDeliveryRow[]> {
    const rows = await this.db
      .select({
        deliveryKey: tgSendLog.deliveryKey,
        outcome: tgSendLog.outcome,
        detail: tgSendLog.detail,
        createdAt: tgSendLog.createdAt,
      })
      .from(tgSendLog)
      .orderBy(desc(tgSendLog.createdAt))
      .limit(RECENT_DELIVERIES_LIMIT);

    return rows.map((r) => ({
      delivery_key: r.deliveryKey,
      outcome: r.outcome,
      detail:
        r.detail !== null && r.detail.length > DETAIL_TRUNCATE_AT
          ? `${r.detail.slice(0, DETAIL_TRUNCATE_AT)}…`
          : r.detail,
      created_at: r.createdAt.toISOString(),
    }));
  }

  // ─── Internal aggregators ────────────────────────────────────────────────

  private async outboxStats(): Promise<{ pending: number; oldestAgeSec: number | null }> {
    // Single query returns both pending count and oldest created_at
    // (NULL when pending=0). Driver-level int cast keeps the return
    // shape number-typed.
    const [row] = await this.db
      .select({
        pending: sql<number>`count(*)::int`,
        // EXTRACT(EPOCH FROM (now() - min(created_at))) → seconds since
        // the oldest pending row was inserted; null when no pending rows.
        oldestAgeSec: sql<
          number | null
        >`extract(epoch from (now() - min(${outbox.createdAt})))::int`,
      })
      .from(outbox)
      .where(isNull(outbox.publishedAt));
    return {
      pending: row?.pending ?? 0,
      oldestAgeSec: row?.oldestAgeSec ?? null,
    };
  }

  private async sendLogStats(): Promise<{
    last_24h_sent: number;
    last_24h_failed: number;
    last_24h_opted_out: number;
  }> {
    // Last-24h window. Group by outcome bucket inline rather than
    // running three queries — Postgres handles the conditional
    // aggregation in one scan.
    const cutoff = new Date(Date.now() - SEND_LOG_WINDOW_SEC * 1000);
    const rows = await this.db
      .select({
        outcome: tgSendLog.outcome,
        n: count(),
      })
      .from(tgSendLog)
      .where(gt(tgSendLog.createdAt, cutoff))
      .groupBy(tgSendLog.outcome);

    let sent = 0;
    let failed = 0;
    let optedOut = 0;
    for (const r of rows) {
      if (r.outcome === 'sent') sent = Number(r.n);
      else if (r.outcome === 'opted_out') optedOut = Number(r.n);
      else if (FAILED_OUTCOMES.has(r.outcome)) failed += Number(r.n);
    }
    return {
      last_24h_sent: sent,
      last_24h_failed: failed,
      last_24h_opted_out: optedOut,
    };
  }

  // Cached getMe — returns the timestamp of the last successful call,
  // or null when never-succeeded or token is unavailable. The cache
  // entry stores ok/fail so a failing token returns null promptly
  // (rather than re-trying every poll), but we still re-check after
  // GETME_CACHE_TTL_MS so a transient Telegram outage self-heals.
  private async lastGetMeOk(tenant: string | null, configured: boolean): Promise<string | null> {
    if (!configured) return null;

    const token = await this.config.readPlaintextToken(tenant);
    if (token === null) return null;

    // Compose key from tenant + length+first/last 4 chars as a cheap
    // change-detector. Don't store the token itself.
    const fingerprint = `${tenant ?? '*'}|${token.length}|${token.slice(0, 4)}|${token.slice(-4)}`;
    const now = Date.now();

    if (
      this.getMeCacheKey === fingerprint &&
      this.getMeCache &&
      now - this.getMeCache.at < GETME_CACHE_TTL_MS
    ) {
      if (this.getMeCache.result === 'ok') {
        return new Date(this.getMeCache.at).toISOString();
      }
      return null;
    }

    try {
      await this.getMe(token);
      this.getMeCache = { result: 'ok', at: now };
      this.getMeCacheKey = fingerprint;
      return new Date(now).toISOString();
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`status getMe failed: ${reason}`);
      this.getMeCache = { result: 'fail', at: now };
      this.getMeCacheKey = fingerprint;
      return null;
    }
  }
}
