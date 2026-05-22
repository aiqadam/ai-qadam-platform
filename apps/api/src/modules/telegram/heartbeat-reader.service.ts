import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { TELEGRAM_REDIS } from './telegram.tokens';

// R2 PR-2 — reads heartbeat keys + stream metrics written by the
// Python bot/notifier (sibling repo
// viktordrukker/aiqadam-telegram-bot). The keys + TTL here MUST match
// the constants in that repo's `shared/redis_pool.py`:
//
//   HEARTBEAT_BOT       = "bot:heartbeat"
//   HEARTBEAT_NOTIFIER  = "notifier:heartbeat"
//   HEARTBEAT_TTL_SEC   = 30
//
// The bot/notifier each run a 10s loop that writes "1" with TTL 30s.
// Two missed ticks → stale=true → status panel shows red. The TTL
// gives the SET NX cleanup for free (a crashed process stops
// refreshing → key expires → stale flips).
//
// Why we don't poll Telegram from here: getMe is the bot's job (or
// the configure endpoint's at write time); per HANDOFF "the bot
// doesn't have an inbound HTTP surface" so we MUST go via Redis for
// liveness.

export const HEARTBEAT_KEY_BOT = 'bot:heartbeat';
export const HEARTBEAT_KEY_NOTIFIER = 'notifier:heartbeat';
// Aligns with the bot's HEARTBEAT_TTL_SEC. The bot's loop writes
// every 10s, so a fresh tick brings the TTL back to 30. We consider
// the heartbeat stale when the key is missing OR ttl < 0 (Redis
// returns -2 for missing key, -1 for no-expiry, ≥0 for live).
export const HEARTBEAT_TTL_SEC = 30;

export interface HeartbeatRead {
  service: 'bot' | 'notifier';
  // null = key missing entirely. Otherwise approximated from the
  // remaining TTL: now - (HEARTBEAT_TTL_SEC - ttl). The bot writes the
  // value "1" rather than a timestamp so we infer last-seen.
  last_seen_at: string | null;
  ttl_seconds: number | null; // null if key missing
  stale: boolean;
}

export interface StreamMetrics {
  stream: string;
  // Number of entries currently in the stream (XLEN).
  length: number;
  // Entries delivered to a consumer but not yet XACK'd. Reads
  // XPENDING <stream> <group> — group is hardcoded to 'notifier' to
  // match the sibling repo's settings.dispatch_consumer_group default.
  pending_ack: number;
}

const DISPATCH_GROUP = 'notifier';

@Injectable()
export class HeartbeatReaderService {
  private readonly logger = new Logger(HeartbeatReaderService.name);

  constructor(@Inject(TELEGRAM_REDIS) private readonly redis: Redis) {}

  async readBot(): Promise<HeartbeatRead> {
    return this.readOne('bot', HEARTBEAT_KEY_BOT);
  }

  async readNotifier(): Promise<HeartbeatRead> {
    return this.readOne('notifier', HEARTBEAT_KEY_NOTIFIER);
  }

  private async readOne(service: 'bot' | 'notifier', key: string): Promise<HeartbeatRead> {
    // ttl returns -2 for missing key, -1 for "no expiry set" (would
    // be a bug on the bot side), or seconds remaining (0..TTL).
    const ttl = await this.redis.ttl(key);
    if (ttl === -2) {
      return { service, last_seen_at: null, ttl_seconds: null, stale: true };
    }
    if (ttl < 0) {
      // No-expiry — surface as stale + log; the bot is misconfigured.
      this.logger.warn(`heartbeat ${key} has no TTL (ttl=${ttl}); expected ≤${HEARTBEAT_TTL_SEC}`);
      return { service, last_seen_at: null, ttl_seconds: ttl, stale: true };
    }
    // Approximate the last-seen-at by working backwards from now.
    const ageSec = Math.max(0, HEARTBEAT_TTL_SEC - ttl);
    const lastSeen = new Date(Date.now() - ageSec * 1000).toISOString();
    return {
      service,
      last_seen_at: lastSeen,
      ttl_seconds: ttl,
      stale: false,
    };
  }

  // Returns metrics for a single Redis Stream. Group is fixed at
  // 'notifier' to match the consumer group the sibling repo's
  // notifier creates (settings.dispatch_consumer_group, see
  // src/aiqadam_telegram_bot/shared/config.py).
  //
  // Pending-ack uses the summary form of XPENDING which returns
  // [count, smallest_id, largest_id, [[consumer, count], ...]]. If
  // the group doesn't exist yet (e.g. notifier never started),
  // XPENDING throws NOGROUP — we treat that as 0 pending and the
  // status surface as "configured but never consumed".
  async readStream(stream: string): Promise<StreamMetrics> {
    const length = await this.safeXlen(stream);
    const pendingAck = await this.safeXpendingCount(stream, DISPATCH_GROUP);
    return { stream, length, pending_ack: pendingAck };
  }

  private async safeXlen(stream: string): Promise<number> {
    try {
      return await this.redis.xlen(stream);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`XLEN ${stream} failed: ${reason}`);
      return 0;
    }
  }

  private async safeXpendingCount(stream: string, group: string): Promise<number> {
    try {
      // ioredis types xpending as variadic; the summary form returns
      // [count, smallest, largest, consumers]. Coerce the raw return
      // and pluck index 0 defensively.
      const res = (await this.redis.xpending(stream, group)) as unknown as
        | [number, string | null, string | null, Array<[string, string]> | null]
        | null;
      if (!res) return 0;
      const count = res[0];
      return typeof count === 'number' ? count : 0;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      // NOGROUP is expected when the notifier has never started; don't
      // log warn — surface as zero pending.
      if (reason.includes('NOGROUP')) return 0;
      this.logger.warn(`XPENDING ${stream} ${group} failed: ${reason}`);
      return 0;
    }
  }
}
