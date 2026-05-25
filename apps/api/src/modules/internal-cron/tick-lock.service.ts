import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';

// Distributed mutex for in-process cron ticks. Each Nest replica that
// runs @Cron decorators calls acquire() before doing work; only the
// replica that won the SET-NX race actually fires. TTL is the lock's
// safety net — if the holder crashes mid-tick, the next replica picks
// up after expiry.
//
// We use SET key value NX EX ttl (atomic per Redis docs) and release
// via a Lua script that only deletes when the value still matches the
// holder (so an expired-and-reacquired-elsewhere lock can't be
// stomped).
//
// Why not BullMQ: we don't need persistent jobs, retries, or queues.
// Each tick handler is already idempotent (event_announcements ledger
// + Directus filter guards + tg_send_log UNIQUE). A 5-line SET-NX
// pattern is the simplest thing that works.

export const TICK_LOCK_REDIS = Symbol('TICK_LOCK_REDIS');

const RELEASE_SCRIPT = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
  else
    return 0
  end
`;

@Injectable()
export class TickLockService {
  private readonly logger = new Logger(TickLockService.name);
  // Holder id is unique per-process-per-process-start. Lets release()
  // distinguish "I still own this lock" from "expired + someone else
  // grabbed it."
  private readonly holderId: string;

  constructor(@Inject(TICK_LOCK_REDIS) private readonly redis: Redis) {
    this.holderId = `aiqadam-api:${process.pid}:${Date.now()}`;
  }

  // Acquire returns true if this replica won the race + should run the
  // tick. ttlSec MUST be longer than the longest expected tick
  // duration; the lock will auto-expire so a crashed holder doesn't
  // block forever.
  async acquire(name: string, ttlSec: number): Promise<boolean> {
    const key = `tick-lock:${name}`;
    const result = await this.redis.set(key, this.holderId, 'EX', ttlSec, 'NX');
    return result === 'OK';
  }

  // Release the lock if WE still hold it (the Lua CAS prevents
  // accidentally releasing someone else's lock after our TTL expired).
  // Safe to call after acquire() returns false — it's a no-op.
  async release(name: string): Promise<void> {
    const key = `tick-lock:${name}`;
    try {
      await this.redis.eval(RELEASE_SCRIPT, 1, key, this.holderId);
    } catch (err) {
      // Release failure is non-fatal — the TTL will clean up. Log so
      // operators can spot a misbehaving Redis.
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`release(${name}) failed: ${reason}`);
    }
  }

  // Convenience: acquire, run, release. Returns the function result OR
  // undefined when the lock was held by another replica. Also writes a
  // sidecar metadata key (`tick-meta:<name>`) so the observability
  // surface (#392) can answer "when did this last fire, how long,
  // did it succeed."
  async withLock<T>(name: string, ttlSec: number, fn: () => Promise<T>): Promise<T | undefined> {
    const acquired = await this.acquire(name, ttlSec);
    if (!acquired) return undefined;
    const startedAt = new Date();
    let outcome: TickOutcome = 'success';
    let errorMessage: string | null = null;
    try {
      return await fn();
    } catch (err) {
      outcome = 'failed';
      errorMessage = err instanceof Error ? err.message.slice(0, 500) : 'unknown';
      throw err;
    } finally {
      // Metadata + release in parallel; both are best-effort, and
      // release should never wait on metadata I/O.
      const finishedAt = new Date();
      await Promise.allSettled([
        this.writeMetadata(name, {
          last_started_at: startedAt.toISOString(),
          last_finished_at: finishedAt.toISOString(),
          last_duration_ms: finishedAt.getTime() - startedAt.getTime(),
          last_outcome: outcome,
          last_error: errorMessage,
          last_holder: this.holderId,
        }),
        this.release(name),
      ]);
    }
  }

  // #392 — write the sidecar metadata key. 24h sliding TTL so a
  // long-silent tick eventually disappears from the cabinet (operators
  // see "never fired in last 24h" instead of stale data).
  private async writeMetadata(name: string, partial: TickMetadataPartial): Promise<void> {
    const key = `tick-meta:${name}`;
    try {
      // Read prior consecutive_failures so we can increment on failure
      // / reset on success — operators want to spot streaks.
      const prior = await this.redis.get(key);
      let consecutive_failures = 0;
      if (prior) {
        try {
          const parsed = JSON.parse(prior) as { consecutive_failures?: number };
          consecutive_failures = parsed.consecutive_failures ?? 0;
        } catch {
          // bad data, treat as fresh
        }
      }
      const meta: TickMetadata = {
        name,
        ...partial,
        consecutive_failures: partial.last_outcome === 'failed' ? consecutive_failures + 1 : 0,
      };
      await this.redis.set(key, JSON.stringify(meta), 'EX', 86_400);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`writeMetadata(${name}) failed: ${reason}`);
    }
  }
}

// #392 — tick observability shape. Sidecar key `tick-meta:<name>` lets
// operators see last-fire + outcome + duration without scraping logs.
export type TickOutcome = 'success' | 'failed';

interface TickMetadataPartial {
  last_started_at: string;
  last_finished_at: string;
  last_duration_ms: number;
  last_outcome: TickOutcome;
  last_error: string | null;
  last_holder: string;
}

export interface TickMetadata extends TickMetadataPartial {
  name: string;
  consecutive_failures: number;
}
