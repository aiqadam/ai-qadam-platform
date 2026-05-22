import Redis from 'ioredis';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import {
  HEARTBEAT_KEY_BOT,
  HEARTBEAT_KEY_NOTIFIER,
  HEARTBEAT_TTL_SEC,
  HeartbeatReaderService,
} from '../src/modules/telegram/heartbeat-reader.service';

const redisUrl = inject('TEST_REDIS_URL');

const redis = new Redis(redisUrl, { lazyConnect: false, maxRetriesPerRequest: 3 });

afterAll(async () => {
  await redis.quit();
});

const STREAM = 'tg.dispatch.v1';
const DLQ = 'tg.dispatch.dlq';

beforeEach(async () => {
  await Promise.all([
    redis.del(HEARTBEAT_KEY_BOT),
    redis.del(HEARTBEAT_KEY_NOTIFIER),
    redis.del(STREAM),
    redis.del(DLQ),
  ]);
  // Best-effort destroy of consumer groups so XPENDING returns NOGROUP
  // until tests explicitly create them.
  for (const stream of [STREAM, DLQ]) {
    try {
      await redis.xgroup('DESTROY', stream, 'notifier');
    } catch {
      // group / stream may not exist; that's fine.
    }
  }
});

describe('HeartbeatReaderService — heartbeat keys', () => {
  it('reports stale=true when no key exists', async () => {
    const svc = new HeartbeatReaderService(redis);
    const bot = await svc.readBot();
    const notifier = await svc.readNotifier();
    expect(bot).toMatchObject({ service: 'bot', stale: true, last_seen_at: null });
    expect(notifier).toMatchObject({ service: 'notifier', stale: true, last_seen_at: null });
  });

  it('reports stale=false with a recent last_seen when key is fresh', async () => {
    await redis.set(HEARTBEAT_KEY_BOT, '1', 'EX', HEARTBEAT_TTL_SEC);

    const svc = new HeartbeatReaderService(redis);
    const bot = await svc.readBot();

    expect(bot.stale).toBe(false);
    expect(bot.ttl_seconds).toBeGreaterThan(HEARTBEAT_TTL_SEC - 5);
    expect(bot.ttl_seconds).toBeLessThanOrEqual(HEARTBEAT_TTL_SEC);
    // last_seen_at should be within the last second.
    const lastSeen = bot.last_seen_at ? new Date(bot.last_seen_at).getTime() : 0;
    expect(Date.now() - lastSeen).toBeLessThan(2000);
  });

  it('flags as stale when key has no TTL (misconfigured writer)', async () => {
    await redis.set(HEARTBEAT_KEY_NOTIFIER, '1');

    const svc = new HeartbeatReaderService(redis);
    const notifier = await svc.readNotifier();

    expect(notifier.stale).toBe(true);
    expect(notifier.ttl_seconds).toBe(-1);
  });
});

describe('HeartbeatReaderService — stream metrics', () => {
  it('returns length=0 + pending=0 for an empty stream + no group', async () => {
    const svc = new HeartbeatReaderService(redis);
    const metrics = await svc.readStream(STREAM);
    expect(metrics).toEqual({ stream: STREAM, length: 0, pending_ack: 0 });
  });

  it('reports correct XLEN after entries are XADDed', async () => {
    await redis.xadd(STREAM, '*', 'envelope', '{"id":"e1"}');
    await redis.xadd(STREAM, '*', 'envelope', '{"id":"e2"}');

    const svc = new HeartbeatReaderService(redis);
    const metrics = await svc.readStream(STREAM);
    expect(metrics.length).toBe(2);
    expect(metrics.pending_ack).toBe(0); // no group yet
  });

  it('reports pending_ack > 0 after consumer reads but does not ack', async () => {
    await redis.xadd(STREAM, '*', 'envelope', '{"id":"pending"}');
    await redis.xgroup('CREATE', STREAM, 'notifier', '0', 'MKSTREAM');
    // Read but don't ack — entry stays in PEL.
    await redis.xreadgroup(
      'GROUP',
      'notifier',
      'test-consumer',
      'COUNT',
      1,
      'STREAMS',
      STREAM,
      '>',
    );

    const svc = new HeartbeatReaderService(redis);
    const metrics = await svc.readStream(STREAM);
    expect(metrics.length).toBe(1);
    expect(metrics.pending_ack).toBe(1);
  });
});
