import { describe, expect, it, vi } from 'vitest';
import {
  CANONICAL_TICKS,
  TickHealthService,
  parseMetadata,
} from '../src/modules/internal-cron/tick-health.service';

// #392 — reads back sidecar metadata from TickLockService.withLock.

function fakeRedis(mgetResult: (string | null)[]): { mget: ReturnType<typeof vi.fn> } {
  return { mget: vi.fn().mockResolvedValue(mgetResult) };
}

describe('parseMetadata', () => {
  const valid = JSON.stringify({
    name: 'event-reminders',
    last_started_at: '2026-05-26T09:00:00.000Z',
    last_finished_at: '2026-05-26T09:00:02.000Z',
    last_duration_ms: 2000,
    last_outcome: 'success',
    last_error: null,
    last_holder: 'aiqadam-api:1:123',
    consecutive_failures: 0,
  });

  it('parses a valid metadata blob', () => {
    const out = parseMetadata(valid);
    expect(out?.name).toBe('event-reminders');
    expect(out?.last_duration_ms).toBe(2000);
  });

  it('returns null for malformed JSON', () => {
    expect(parseMetadata('not-json')).toBeNull();
  });

  it('returns null when required fields missing', () => {
    expect(parseMetadata(JSON.stringify({ name: 'x' }))).toBeNull();
  });

  it('returns null when last_duration_ms is wrong type', () => {
    const bad = JSON.stringify({
      name: 'x',
      last_started_at: '2026-05-26T09:00:00Z',
      last_finished_at: '2026-05-26T09:00:02Z',
      last_duration_ms: 'two seconds',
      last_outcome: 'success',
      last_error: null,
      last_holder: 'h',
      consecutive_failures: 0,
    });
    expect(parseMetadata(bad)).toBeNull();
  });
});

describe('TickHealthService.listAll', () => {
  const now = new Date('2026-05-26T10:00:00.000Z');

  it('returns one row per canonical tick (10 ticks)', async () => {
    const redis = fakeRedis(CANONICAL_TICKS.map(() => null));
    const svc = new TickHealthService(redis as never);
    const out = await svc.listAll(now);
    expect(out).toHaveLength(CANONICAL_TICKS.length);
    expect(out.map((t) => t.name).sort()).toEqual(CANONICAL_TICKS.map((t) => t.name).sort());
  });

  it('null metadata → last_fire null + staleness_minutes null (never_fired)', async () => {
    const redis = fakeRedis(CANONICAL_TICKS.map(() => null));
    const svc = new TickHealthService(redis as never);
    const out = await svc.listAll(now);
    expect(out.every((r) => r.last_fire === null && r.staleness_minutes === null)).toBe(true);
  });

  it('computes staleness_minutes from last_finished_at when metadata present', async () => {
    const meta = JSON.stringify({
      name: 'event-reminders',
      last_started_at: '2026-05-26T09:00:00.000Z',
      last_finished_at: '2026-05-26T09:30:00.000Z', // 30 min before now
      last_duration_ms: 1500,
      last_outcome: 'success',
      last_error: null,
      last_holder: 'aiqadam-api:1:123',
      consecutive_failures: 0,
    });
    const erIndex = CANONICAL_TICKS.findIndex((t) => t.name === 'event-reminders');
    const values = CANONICAL_TICKS.map(() => null);
    values[erIndex] = meta;
    const redis = fakeRedis(values);
    const svc = new TickHealthService(redis as never);
    const out = await svc.listAll(now);
    const er = out.find((t) => t.name === 'event-reminders');
    expect(er?.staleness_minutes).toBe(30);
    expect(er?.last_fire?.last_outcome).toBe('success');
  });

  it('degrades gracefully when Redis mget throws (returns inventory with no metadata)', async () => {
    const redis = { mget: vi.fn().mockRejectedValue(new Error('redis down')) };
    const svc = new TickHealthService(redis as never);
    const out = await svc.listAll(now);
    expect(out).toHaveLength(CANONICAL_TICKS.length);
    expect(out.every((r) => r.last_fire === null)).toBe(true);
  });

  it('treats malformed metadata blob the same as never_fired', async () => {
    const values = CANONICAL_TICKS.map(() => null);
    values[0] = 'not-valid-json';
    const redis = fakeRedis(values);
    const svc = new TickHealthService(redis as never);
    const out = await svc.listAll(now);
    expect(out[0]?.last_fire).toBeNull();
    expect(out[0]?.staleness_minutes).toBeNull();
  });
});
