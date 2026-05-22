import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { eq, isNull, sql } from 'drizzle-orm';
import type Redis from 'ioredis';
import { env } from '../../config/env';
import { DB, type Db } from '../../db';
import { outbox } from './schema';
import { TELEGRAM_REDIS } from './telegram.tokens';

// Outbox relay per ADR-0034 §"Outbox pattern (the async surface)". Loop:
//
//   1. SELECT envelope_id, stream, payload FROM outbox
//      WHERE published_at IS NULL
//      ORDER BY created_at
//      FOR UPDATE SKIP LOCKED LIMIT 100
//   2. For each row: XADD <stream> * envelope <jsonified-payload>
//   3. UPDATE outbox SET published_at = now() WHERE envelope_id = ?
//
// FOR UPDATE SKIP LOCKED makes the loop safe to run from multiple replicas
// without coordination — each replica claims a disjoint subset of rows.
// At Phase 1 we run a single API replica, so this is future-proofing.
//
// Producer guarantee: state changes write outbox rows in the SAME
// Postgres transaction as the state change. At-least-once delivery is
// the resulting property — duplicates surface to the notifier (Redis
// SET NX dedupe) and tg_send_log UNIQUE catches what Redis misses.

const POLL_INTERVAL_MS = 500;
const BATCH_SIZE = 100;
// XADD field name agreed with the Python notifier (`shared/redis_streams.py`
// in viktordrukker/aiqadam-telegram-bot). Don't rename without coordinating.
const ENVELOPE_FIELD = 'envelope';
// MAXLEN ~ approximate trim. Streams grow unbounded otherwise; 100k
// matches expected weekly throughput with headroom for backfill.
// Operators can XLEN-monitor and bump if needed.
const STREAM_MAXLEN_APPROX = 100_000;

@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private inFlight = false;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(TELEGRAM_REDIS) private readonly client: Redis,
  ) {
    this.client.on('error', (err) => {
      this.logger.error(`redis error: ${err.message}`);
    });
  }

  // ─── lifecycle ─────────────────────────────────────────────────────────────

  onModuleInit(): void {
    // Test environments boot the module to verify wiring without wanting
    // a background loop. Opt-out via env so vitest doesn't leak intervals.
    if (env.NODE_ENV === 'test') {
      this.logger.debug('NODE_ENV=test — skipping relay loop start');
      return;
    }
    this.start();
  }

  async onModuleDestroy(): Promise<void> {
    this.stop();
    // Client ownership is module-level — we don't close it here, the
    // factory provider's onDestroy hook does. Letting two services
    // share one Redis client is fine; closing it twice would crash.
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleNextTick();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private scheduleNextTick(): void {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      void this.runOnce()
        .catch((err) => {
          this.logger.error(`relay tick failed: ${err instanceof Error ? err.message : 'unknown'}`);
        })
        .finally(() => this.scheduleNextTick());
    }, POLL_INTERVAL_MS);
  }

  // ─── core ──────────────────────────────────────────────────────────────────

  // Single iteration. Exported (via `runOnce`) so tests can drive it
  // synchronously and assert post-conditions without waiting on the
  // interval. Returns the number of rows published this tick.
  async runOnce(): Promise<number> {
    if (this.inFlight) {
      // Defensive: a slow tick shouldn't overlap itself.
      return 0;
    }
    this.inFlight = true;
    try {
      return await this.publishBatch();
    } finally {
      this.inFlight = false;
    }
  }

  private async publishBatch(): Promise<number> {
    // SKIP LOCKED + serializable isolation is overkill; default read-committed
    // is fine because we hold the row lock until UPDATE published_at.
    // Drizzle's transaction API drives this for us.
    let publishedCount = 0;
    await this.db.transaction(async (tx) => {
      const rows = await tx
        .select({
          envelopeId: outbox.envelopeId,
          stream: outbox.stream,
          payload: outbox.payload,
          attempts: outbox.attempts,
        })
        .from(outbox)
        .where(isNull(outbox.publishedAt))
        .orderBy(outbox.createdAt)
        .for('update', { skipLocked: true })
        .limit(BATCH_SIZE);

      for (const row of rows) {
        const sent = await this.publishOne(tx, row);
        if (sent) publishedCount += 1;
      }
    });
    if (publishedCount > 0) {
      this.logger.debug(`relay tick: published=${publishedCount}`);
    }
    return publishedCount;
  }

  // Single-row publish. Returns true on success, false on XADD failure
  // (row stays unpublished; attempts++ + lastError set for ops review).
  // `tx` is the Drizzle transaction handle (typed via the callback's
  // parameter so the type matches what runOnce → publishBatch passes).
  private async publishOne(
    tx: Parameters<Parameters<Db['transaction']>[0]>[0],
    row: { envelopeId: string; stream: string; payload: unknown; attempts: number },
  ): Promise<boolean> {
    try {
      await this.client.xadd(
        row.stream,
        'MAXLEN',
        '~',
        String(STREAM_MAXLEN_APPROX),
        '*',
        ENVELOPE_FIELD,
        JSON.stringify(row.payload),
      );
      await tx
        .update(outbox)
        .set({ publishedAt: new Date(), attempts: row.attempts + 1, lastError: null })
        .where(eq(outbox.envelopeId, row.envelopeId));
      return true;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`XADD failed for ${row.envelopeId} → ${row.stream}: ${reason}`);
      await tx
        .update(outbox)
        .set({
          attempts: row.attempts + 1,
          lastError: reason.slice(0, 500),
        })
        .where(eq(outbox.envelopeId, row.envelopeId));
      return false;
    }
  }

  // ─── ops helpers ───────────────────────────────────────────────────────────

  // Operator-facing inspect: how many rows are stuck unpublished, oldest first.
  async pendingCount(): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(outbox)
      .where(isNull(outbox.publishedAt));
    return row?.count ?? 0;
  }
}
