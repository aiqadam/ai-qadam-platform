import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import Redis from 'ioredis';
import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import {
  HEARTBEAT_KEY_BOT,
  HEARTBEAT_KEY_NOTIFIER,
  HEARTBEAT_TTL_SEC,
  HeartbeatReaderService,
} from '../src/modules/telegram/heartbeat-reader.service';
import { outbox, tgConfig, tgSendLog } from '../src/modules/telegram/schema';
import { TelegramAdminService } from '../src/modules/telegram/telegram-admin.service';
import { type GetMeFn, TgConfigService } from '../src/modules/telegram/tg-config.service';

const dbUrl = inject('TEST_DATABASE_URL');
const redisUrl = inject('TEST_REDIS_URL');

const client = postgres(dbUrl, { max: 4 });
const db = drizzle(client);
const redis = new Redis(redisUrl, { lazyConnect: false, maxRetriesPerRequest: 3 });

afterAll(async () => {
  await client.end();
  await redis.quit();
});

const STREAM = 'tg.dispatch.v1';
const DLQ = 'tg.dispatch.dlq';

beforeEach(async () => {
  await db.delete(tgConfig);
  await db.delete(outbox);
  await db.delete(tgSendLog);
  await Promise.all([
    redis.del(HEARTBEAT_KEY_BOT),
    redis.del(HEARTBEAT_KEY_NOTIFIER),
    redis.del(STREAM),
    redis.del(DLQ),
  ]);
  for (const stream of [STREAM, DLQ]) {
    try {
      await redis.xgroup('DESTROY', stream, 'notifier');
    } catch {
      // group/stream may not exist
    }
  }
});

const SAMPLE_TOKEN = '987654321:AABBCCDDeeFFggHHiiJJkkLLmmNNooPPqqRRssTTuu';

const makeGetMe = (impl: GetMeFn): GetMeFn => vi.fn(impl);

function makeAdmin(getMeImpl?: GetMeFn): {
  admin: TelegramAdminService;
  config: TgConfigService;
  getMe: GetMeFn;
} {
  const getMe = makeGetMe(
    getMeImpl ?? (async () => ({ botId: 12345n, botUsername: 'aiqadam_bot' })),
  );
  const config = new TgConfigService(db, getMe);
  const hb = new HeartbeatReaderService(redis);
  const admin = new TelegramAdminService(db, config, hb, getMe);
  return { admin, config, getMe };
}

describe('TelegramAdminService.buildStatus — empty/fresh install', () => {
  it('reports configured=false + bot=null + all heartbeats stale', async () => {
    const { admin } = makeAdmin();
    const status = await admin.buildStatus(null);

    expect(status.configured).toBe(false);
    expect(status.bot).toBeNull();
    expect(status.api_heartbeat.service).toBe('api');
    expect(status.api_heartbeat.last_seen_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    expect(status.bot_heartbeat).toMatchObject({ service: 'bot', stale: true });
    expect(status.notifier_heartbeat).toMatchObject({ service: 'notifier', stale: true });

    expect(status.outbox).toEqual({
      pending: 0,
      oldest_unpublished_age_sec: null,
      dlq_count: 0,
    });
    expect(status.send_log).toEqual({
      last_24h_sent: 0,
      last_24h_failed: 0,
      last_24h_opted_out: 0,
    });
    expect(status.streams[STREAM]).toEqual({ stream: STREAM, length: 0, pending_ack: 0 });
    expect(status.streams[DLQ]).toEqual({ stream: DLQ, length: 0, pending_ack: 0 });
  });
});

describe('TelegramAdminService.buildStatus — configured + healthy', () => {
  it('reports configured=true + bot identity + last_getMe_ok set after the call', async () => {
    const { admin, config, getMe } = makeAdmin();
    await config.configure({
      tenant: null,
      botToken: SAMPLE_TOKEN,
      configuredBy: randomUUID(),
    });
    // Fresh heartbeats from both processes.
    await redis.set(HEARTBEAT_KEY_BOT, '1', 'EX', HEARTBEAT_TTL_SEC);
    await redis.set(HEARTBEAT_KEY_NOTIFIER, '1', 'EX', HEARTBEAT_TTL_SEC);

    const status = await admin.buildStatus(null);

    expect(status.configured).toBe(true);
    expect(status.bot).toMatchObject({
      id: '12345',
      username: 'aiqadam_bot',
    });
    expect(status.bot?.last_getMe_ok).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(status.bot_heartbeat.stale).toBe(false);
    expect(status.notifier_heartbeat.stale).toBe(false);
    // getMe called twice: once during configure, once during status.
    expect(getMe).toHaveBeenCalledTimes(2);
  });

  it('caches getMe across consecutive status polls (one call within 60s)', async () => {
    const { admin, config, getMe } = makeAdmin();
    await config.configure({
      tenant: null,
      botToken: SAMPLE_TOKEN,
      configuredBy: randomUUID(),
    });
    // configure called getMe once.
    await admin.buildStatus(null);
    await admin.buildStatus(null);
    await admin.buildStatus(null);
    // configure + ONE status getMe (the first), then cache.
    expect(getMe).toHaveBeenCalledTimes(2);
  });

  it('last_getMe_ok=null when Telegram getMe fails on status read', async () => {
    // configure with a happy getMe; status uses a failing one.
    let callIdx = 0;
    const getMe: GetMeFn = makeGetMe(async () => {
      callIdx += 1;
      if (callIdx === 1) return { botId: 12345n, botUsername: 'aiqadam_bot' };
      throw new Error('telegram_401: Unauthorized');
    });
    const config = new TgConfigService(db, getMe);
    const hb = new HeartbeatReaderService(redis);
    const admin = new TelegramAdminService(db, config, hb, getMe);
    await config.configure({
      tenant: null,
      botToken: SAMPLE_TOKEN,
      configuredBy: randomUUID(),
    });
    const status = await admin.buildStatus(null);
    expect(status.configured).toBe(true);
    expect(status.bot?.last_getMe_ok).toBeNull();
  });
});

describe('TelegramAdminService.buildStatus — aggregations', () => {
  it('counts outbox pending + reports oldest unpublished age', async () => {
    const { admin } = makeAdmin();
    const now = Date.now();
    const oldRowAge = 30; // seconds ago
    await db.insert(outbox).values({
      envelopeId: randomUUID(),
      stream: STREAM,
      payload: { schema: 'tg.dispatch.v1', id: 'old' },
      createdAt: new Date(now - oldRowAge * 1000),
    });
    await db.insert(outbox).values({
      envelopeId: randomUUID(),
      stream: STREAM,
      payload: { schema: 'tg.dispatch.v1', id: 'new' },
    });

    const status = await admin.buildStatus(null);

    expect(status.outbox.pending).toBe(2);
    expect(status.outbox.oldest_unpublished_age_sec).toBeGreaterThanOrEqual(oldRowAge - 5);
    expect(status.outbox.oldest_unpublished_age_sec).toBeLessThan(oldRowAge + 5);
  });

  it('buckets send_log by outcome within 24h window', async () => {
    const { admin } = makeAdmin();
    await db.insert(tgSendLog).values([
      // 3 sent
      { deliveryKey: 's1', envelopeId: randomUUID(), outcome: 'sent' },
      { deliveryKey: 's2', envelopeId: randomUUID(), outcome: 'sent' },
      { deliveryKey: 's3', envelopeId: randomUUID(), outcome: 'sent' },
      // 2 failed (blocked + bad_request)
      { deliveryKey: 'f1', envelopeId: randomUUID(), outcome: 'blocked' },
      { deliveryKey: 'f2', envelopeId: randomUUID(), outcome: 'bad_request' },
      // 1 opted_out
      { deliveryKey: 'o1', envelopeId: randomUUID(), outcome: 'opted_out' },
      // 1 retry (not counted as failed)
      { deliveryKey: 'r1', envelopeId: randomUUID(), outcome: 'retry' },
    ]);

    const status = await admin.buildStatus(null);

    expect(status.send_log.last_24h_sent).toBe(3);
    expect(status.send_log.last_24h_failed).toBe(2);
    expect(status.send_log.last_24h_opted_out).toBe(1);
  });

  it('counts DLQ stream length', async () => {
    const { admin } = makeAdmin();
    await redis.xadd(DLQ, '*', 'envelope', '{"bad":"one"}');
    await redis.xadd(DLQ, '*', 'envelope', '{"bad":"two"}');

    const status = await admin.buildStatus(null);
    expect(status.outbox.dlq_count).toBe(2);
    expect(status.streams[DLQ]?.length).toBe(2);
  });
});
