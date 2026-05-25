import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { TICK_LOCK_REDIS, type TickMetadata } from './tick-lock.service';

// #392 — read sidecar metadata for in-process cron ticks. Powers the
// operator cabinet at /workspace/admin/cron + future Prometheus
// scrape.
//
// Each TickLockService.withLock call writes a `tick-meta:<name>` JSON
// row (24h sliding TTL) after the tick finishes. This service reads
// them back via MGET, returning the canonical list + status per tick.
//
// Canonical tick names live here (sync with the service decorators).
// If you add a new @Cron, add the name + display label here so it
// shows in the cabinet even before its first fire (status='never_fired').

export interface TickInventoryEntry {
  name: string;
  label: string;
  schedule_description: string;
}

export const CANONICAL_TICKS: TickInventoryEntry[] = [
  {
    name: 'tg-broadcasts-send-due',
    label: 'Telegram broadcasts scheduler',
    schedule_description: 'every minute',
  },
  {
    name: 'event-reminders',
    label: 'Event reminders (day_before / hour_before / morning_of)',
    schedule_description: 'every 10 minutes',
  },
  {
    name: 'event-matches',
    label: 'Event matches (T-7)',
    schedule_description: 'every 10 minutes',
  },
  {
    name: 'event-matches-post-reg',
    label: 'Event matches (T+3 post-registration)',
    schedule_description: 'every 10 minutes',
  },
  {
    name: 'event-speaker-briefs',
    label: 'Speaker briefs (T-7)',
    schedule_description: 'every 30 minutes',
  },
  {
    name: 'lead-nurture',
    label: 'Lead nurture (T+3 / T+7)',
    schedule_description: 'every 30 minutes',
  },
  {
    name: 'post-event-cron',
    label: 'Post-event followup (CSAT + thanks + teaser)',
    schedule_description: 'hourly',
  },
  {
    name: 'sponsor-digests',
    label: 'Sponsor quarterly digest',
    schedule_description: '04:00 UTC on day 5 of each month',
  },
  {
    name: 'rbac-sync-poll',
    label: 'Authentik RBAC nightly poll',
    schedule_description: '03:30 UTC daily',
  },
  {
    name: 'gdpr-hard-delete',
    label: 'GDPR hard-delete sweep (30-day grace)',
    schedule_description: '04:00 UTC daily',
  },
];

export interface TickHealthRow extends TickInventoryEntry {
  // Set when the tick has fired at least once in the last 24h
  // (metadata TTL). Absent rows render as "never_fired" in the cabinet.
  last_fire: TickMetadata | null;
  // Derived: minutes since last fire (null when never_fired).
  staleness_minutes: number | null;
}

@Injectable()
export class TickHealthService {
  private readonly logger = new Logger(TickHealthService.name);

  constructor(@Inject(TICK_LOCK_REDIS) private readonly redis: Redis) {}

  async listAll(now: Date = new Date()): Promise<TickHealthRow[]> {
    const keys = CANONICAL_TICKS.map((t) => `tick-meta:${t.name}`);
    let values: (string | null)[];
    try {
      values = await this.redis.mget(...keys);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`listAll mget failed: ${reason}`);
      // Degrade gracefully — return inventory with no metadata so the
      // cabinet still renders the canonical-tick list.
      values = keys.map(() => null);
    }
    return CANONICAL_TICKS.map((tick, i) => {
      const raw = values[i] ?? null;
      const last_fire = raw ? parseMetadata(raw) : null;
      const staleness_minutes =
        last_fire === null
          ? null
          : Math.floor((now.getTime() - new Date(last_fire.last_finished_at).getTime()) / 60_000);
      return { ...tick, last_fire, staleness_minutes };
    });
  }
}

// Exported for tests. Returns null when raw is malformed JSON or
// missing required fields — the cabinet renders such rows the same as
// "never fired" rather than crashing on bad data.
export function parseMetadata(raw: string): TickMetadata | null {
  try {
    const parsed = JSON.parse(raw) as Partial<TickMetadata>;
    if (
      typeof parsed.name !== 'string' ||
      typeof parsed.last_started_at !== 'string' ||
      typeof parsed.last_finished_at !== 'string' ||
      typeof parsed.last_duration_ms !== 'number' ||
      typeof parsed.last_outcome !== 'string' ||
      typeof parsed.consecutive_failures !== 'number'
    ) {
      return null;
    }
    return parsed as TickMetadata;
  } catch {
    return null;
  }
}
